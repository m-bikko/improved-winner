import type { Database } from '@/types/db'

type DiaryInsert = Database['public']['Tables']['diary_entries']['Insert']

const KEY = 'love-promises-outbox'

/** Таблицы, в которые очередь умеет досылать. */
export type OutboxTable = 'diary_entries' | 'checkins' | 'weight_log'

export type Pending = {
  table: OutboxTable
  /** Колонки, по которым идёт upsert. */
  onConflict: string
  row: Record<string, unknown>
  /** Ключ внутри очереди: повторная правка того же заменяет прежнюю. */
  key: string
}

/**
 * Очередь неотправленного.
 *
 * Записи вносят там, где связь хуже всего: еду - в кафе и в зале,
 * самочувствие - в дороге, вес - утром в ванной, куда вайфай не добивает.
 * Потерять уже набранное из-за таймаута обиднее всего, потому что повторить
 * по памяти к вечеру уже не получится.
 *
 * ТОЛЬКО ИДЕМПОТЕНТНЫЕ ОПЕРАЦИИ - upsert по известному ключу, и только
 * вперёд. Это не «офлайн везде», и притворяться им нельзя: общая очередь
 * «повторить любую правку» ломается на порядке, на конфликтах и на вставках
 * без ключа, которые при повторе дают дубль. Здесь у каждой записи есть
 * ключ - id у дневника, пара (человек, дата) у самочувствия и веса, -
 * поэтому повтор безопасен по построению.
 *
 * Удаления в очередь не идут: «удалить то, чего на сервере ещё нет»
 * не имеет смысла, а «удалить то, что партнёр успел поправить» имеет,
 * но не тот.
 */
export function readQueue(): Pending[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Записи прежнего формата - голые строки дневника. Приводим их к общему
    // виду, а не выбрасываем: в очереди может лежать несохранённый обед
    return parsed.map((item) => {
      const value = item as Partial<Pending> & DiaryInsert
      if (value.table) return value as Pending
      return {
        table: 'diary_entries' as const,
        onConflict: 'id',
        row: value as Record<string, unknown>,
        key: String(value.id),
      }
    })
  } catch {
    // Приватный режим, забитое хранилище, битый JSON - очередь это удобство,
    // а не то, ради чего стоит ронять приложение
    return []
  }
}

function writeQueue(items: Pending[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* см. выше */
  }
}

export function enqueue(item: Pending): void {
  const queue = readQueue().filter((e) => e.key !== item.key)
  queue.push(item)
  writeQueue(queue)
}

export function queueSize(): number {
  return readQueue().length
}

/** Сетевой сбой стоит повторить, отказ политики или битые данные - нет. */
export function isRetriable(error: { code?: string | undefined } | null): boolean {
  if (!error) return false
  return !error.code || error.code === 'PGRST000'
}

/** Отправка наружу. Внедряется, чтобы очередь можно было проверить без сети. */
export type Send = (
  table: OutboxTable,
  onConflict: string,
  rows: unknown[],
) => Promise<{ error: { code?: string | undefined; message: string } | null }>

/**
 * Настоящая отправка.
 *
 * Импорт динамический: модуль очереди не должен тянуть за собой клиент
 * Supabase просто фактом загрузки - иначе его нельзя запустить вне сборки,
 * а значит нечем проверить.
 */
async function supabaseSend(): Promise<Send> {
  const { supabase } = await import('./supabase')
  // await, а не возврат построителя: supabase-js отдаёт thenable-объект,
  // а не промис, и типу Send он не подходит
  return async (table, onConflict, rows) => {
    const { error } = await supabase.from(table).upsert(rows as never, { onConflict })
    return { error }
  }
}

/**
 * Пробует отправить всё накопленное.
 *
 * Группируем по таблице и шлём upsert: если запись на самом деле долетела,
 * а ответ потерялся, повтор не должен давать ни дубля, ни ошибки.
 *
 * Успешно ушедшее убираем поимённо, а не очищаем очередь целиком: пока шла
 * отправка, в неё могла лечь новая запись, и `writeQueue([])` стёр бы её,
 * так и не отправив.
 */
export async function flushOutbox(send?: Send): Promise<number> {
  const queue = readQueue()
  if (queue.length === 0) return 0
  const sender = send ?? (await supabaseSend())

  const sent = new Set<string>()
  const dropped = new Set<string>()

  const groups = new Map<string, Pending[]>()
  for (const item of queue) {
    const id = `${item.table}|${item.onConflict}`
    const bucket = groups.get(id)
    if (bucket) bucket.push(item)
    else groups.set(id, [item])
  }

  for (const [id, items] of groups) {
    const [table, onConflict] = id.split('|') as [OutboxTable, string]
    const { error } = await sender(
      table,
      onConflict,
      items.map((i) => i.row),
    )

    if (!error) {
      for (const i of items) sent.add(i.key)
      continue
    }
    // Лечить повтором отказ политики или битые данные бессмысленно - такие
    // записи надо выбросить, иначе очередь застрянет навсегда
    if (!isRetriable(error)) {
      console.error(`Outbox for ${table} dropped:`, error.message)
      for (const i of items) dropped.add(i.key)
    }
  }

  const done = new Set([...sent, ...dropped])
  writeQueue(readQueue().filter((i) => !done.has(i.key)))
  return sent.size
}
