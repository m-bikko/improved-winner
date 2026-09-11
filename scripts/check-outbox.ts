/**
 * Проверка офлайн-очереди.
 *
 *   pnpm tsx scripts/check-outbox.ts
 *
 * Очередь опасна двумя способами, и оба тихие.
 *
 * Она может ЗАСТРЯТЬ - если запись отвергается навсегда, а мы продолжаем
 * её слать, всё остальное за ней никогда не уйдёт.
 *
 * И она может ПОТЕРЯТЬ - если после успешной отправки очистить её целиком,
 * то запись, легшая туда во время отправки, исчезнет, так и не уйдя.
 * Это худший исход: человек уверен, что записал.
 *
 * Отправка подменяется заглушкой - проверяется поведение очереди, а не сеть.
 */
import type { OutboxTable, Pending, Send } from '../src/lib/outbox.ts'
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

type Result = { error: { code?: string; message: string } | null }
let behaviour: (table: string) => Result = () => ({ error: null })
const seen: { table: string; count: number }[] = []

const outbox = await import('../src/lib/outbox.ts')

/** Отправка-заглушка: проверяется поведение очереди, а не сеть. */
const send: Send = (table, _onConflict, rows) => {
  seen.push({ table, count: rows.length })
  return Promise.resolve(behaviour(table))
}

let failed = 0
function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

const KEY = 'love-promises-outbox'
const item = (table: OutboxTable, key: string, onConflict = 'id'): Pending => ({
  table,
  onConflict,
  row: { key },
  key,
})

// --- формат прежней очереди -------------------------------------------------
store.set(KEY, JSON.stringify([{ id: 'старая-запись', grams: 100 }]))
const migrated = outbox.readQueue()
check(
  migrated.length === 1 &&
    migrated[0]?.table === 'diary_entries' &&
    migrated[0]?.key === 'старая-запись',
  'Записи прежнего формата не теряются',
  'в очереди мог лежать несохранённый обед',
)

// --- дедупликация -----------------------------------------------------------
store.clear()
outbox.enqueue(item('checkins', 'checkins:2026-09-11', 'user_id,date'))
outbox.enqueue(item('checkins', 'checkins:2026-09-11', 'user_id,date'))
check(
  outbox.queueSize() === 1,
  'Повторная правка того же заменяет прежнюю',
  'иначе за день офлайна накопится десять версий одной отметки',
)

// --- группировка ------------------------------------------------------------
store.clear()
seen.length = 0
outbox.enqueue(item('diary_entries', 'd1'))
outbox.enqueue(item('diary_entries', 'd2'))
outbox.enqueue(item('checkins', 'c1', 'user_id,date'))
behaviour = () => ({ error: null })
let sent = await outbox.flushOutbox(send)
check(sent === 3, 'Уходит всё накопленное', `отправлено ${sent}`)
check(
  seen.length === 2 && seen.some((s) => s.count === 2),
  'Записи одной таблицы уходят одним запросом',
  seen.map((s) => `${s.table}×${s.count}`).join(', '),
)
check(outbox.queueSize() === 0, 'Очередь пустеет', 'ушедшее не остаётся')

// --- застревание ------------------------------------------------------------
store.clear()
outbox.enqueue(item('diary_entries', 'битая'))
outbox.enqueue(item('checkins', 'живая', 'user_id,date'))
behaviour = (table) =>
  table === 'diary_entries'
    ? { error: { code: '42501', message: 'отказ политики' } }
    : { error: null }
sent = await outbox.flushOutbox(send)
check(sent === 1, 'Отказ одной таблицы не мешает другой', `ушло ${sent}`)
check(
  outbox.queueSize() === 0,
  'Безнадёжная запись выброшена, а не оставлена навсегда',
  'иначе всё, что за ней, не ушло бы никогда',
)

// --- сетевой сбой -----------------------------------------------------------
store.clear()
outbox.enqueue(item('diary_entries', 'подождёт'))
behaviour = () => ({ error: { message: 'сеть недоступна' } })
sent = await outbox.flushOutbox(send)
check(
  sent === 0 && outbox.queueSize() === 1,
  'Сетевой сбой оставляет запись в очереди',
  'её надо повторить, а не выбросить',
)
check(
  outbox.isRetriable({ message: 'x' } as never) &&
    !outbox.isRetriable({ code: '42501', message: 'x' } as never),
  'Сбой сети отличается от отказа политики',
  'первое лечится повтором, второе - нет',
)

// --- потеря во время отправки ----------------------------------------------
store.clear()
outbox.enqueue(item('diary_entries', 'первая'))
behaviour = () => {
  // Пока шла отправка, человек записал ещё одну
  outbox.enqueue(item('checkins', 'легла во время отправки', 'user_id,date'))
  return { error: null }
}
sent = await outbox.flushOutbox(send)
check(
  outbox.queueSize() === 1 && outbox.readQueue()[0]?.key === 'легла во время отправки',
  'Запись, легшая во время отправки, не теряется',
  'очистка очереди целиком стёрла бы её, так и не отправив',
)

console.log(failed === 0 ? '\nОчередь верна.' : `\nПровалено: ${failed}`)
if (failed > 0) process.exit(1)
