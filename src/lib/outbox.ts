import type { Database } from '@/types/db'
import { supabase } from './supabase'

type DiaryInsert = Database['public']['Tables']['diary_entries']['Insert']

const KEY = 'love-promises-outbox'

/**
 * Очередь неотправленных записей дневника.
 *
 * Еду вносят сразу после еды - в кафе, в зале, в дороге, то есть ровно там,
 * где связь хуже всего. Потерять уже набранную запись из-за таймаута обиднее
 * всего, потому что повторить её по памяти к вечеру уже не получится.
 *
 * Очередь только на вставку записей дневника и только вперёд. Полноценная
 * двусторонняя синхронизация - совсем другая задача, и она здесь не нужна:
 * id генерирует клиент, поэтому повторная отправка идемпотентна, а конфликтов
 * между двумя людьми в личном дневнике не бывает по определению.
 */
export function readQueue(): DiaryInsert[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DiaryInsert[]) : []
  } catch {
    // Приватный режим, забитое хранилище, битый JSON - очередь это удобство,
    // а не то, ради чего стоит ронять приложение
    return []
  }
}

function writeQueue(entries: DiaryInsert[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    /* см. выше */
  }
}

export function enqueue(entry: DiaryInsert): void {
  const queue = readQueue().filter((e) => e.id !== entry.id)
  queue.push(entry)
  writeQueue(queue)
}

export function queueSize(): number {
  return readQueue().length
}

/**
 * Пробует отправить всё накопленное.
 *
 * upsert по id, а не insert: если запись на самом деле долетела, а ответ
 * потерялся, повтор не должен давать ни дубля, ни ошибки.
 */
export async function flushOutbox(): Promise<number> {
  const queue = readQueue()
  if (queue.length === 0) return 0

  const { error } = await supabase
    .from('diary_entries')
    .upsert(queue, { onConflict: 'id', ignoreDuplicates: true })

  if (error) {
    // Отказ политики или битые данные лечить повтором бессмысленно - такие
    // записи надо выбросить, иначе очередь застрянет навсегда
    const permanent = typeof error.code === 'string' && error.code.startsWith('42')
    if (permanent) {
      console.error('Очередь отброшена, запись невалидна:', error.message)
      writeQueue([])
    }
    return 0
  }

  writeQueue([])
  return queue.length
}
