/**
 * Проверка договорённостей.
 *
 * Договорённость - закрытая тема с текстом решения; закрепить можно только
 * её, а не открытую тему. Записать договорённость можно сразу, без
 * обсуждения: тот же CHECK требует текст и кто закрыл.
 *
 * Всё в транзакции и откатывается.
 */
import { check, finish, inTransaction } from './harness.ts'
import { matches, type Agreement } from '../src/features/agreements/logic.ts'

const ag: Agreement = { id: '1', title: 'Деньги', resolution: 'Крупное обсуждаем заранее', closedAt: '', closedBy: '', pinnedAt: null }
check(matches(ag, 'крупн') && matches(ag, 'деньг') && !matches(ag, 'гости'), 'Поиск по названию и решению', 'без учёта регистра')

await inTransaction(async (db) => {
  const { a } = db.members
  await db.as(a)
  const open = await db.one(`insert into public.topics (title, created_by) values ('ТЕСТ открытая', $1) returning id::text`, [a])
  await db.mustFail('Открытую тему не закрепить', `update public.topics set pinned_at = now() where id = $1`, [open], 'topics_pin_closed')
  await db.mustFail(
    'Договорённость без текста решения не записать',
    `insert into public.topics (title, status, resolution, closed_at, closed_by, created_by) values ('ТЕСТ', 'closed', '  ', now(), $1, $1)`,
    [a],
    'topics_status_consistent',
  )
  const id = await db.one(
    `insert into public.topics (title, status, resolution, closed_at, closed_by, created_by)
     values ('ТЕСТ деньги', 'closed', 'Крупное обсуждаем заранее', now(), $1, $1) returning id::text`,
    [a],
  )
  const pinned = await db.q(`update public.topics set pinned_at = now() where id = $1 returning 1`, [id])
  check(pinned.length === 1, 'Договорённость записывается сразу и закрепляется', 'без обсуждения')

  // «Вернуть в обсуждение» шлёт только статус и решение, о закреплении не знает
  const reopened = await db.q<{ pinned_at: string | null }>(
    `update public.topics set status = 'open', resolution = null, closed_at = null, closed_by = null
      where id = $1 returning pinned_at`,
    [id],
  )
  check(reopened.length === 1 && reopened[0]?.pinned_at === null, 'Закреплённую договорённость можно переоткрыть', 'закрепление снимается само')
})

finish('Договорённости')
