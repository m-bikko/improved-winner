/**
 * Проверка «До встречи».
 *
 *   pnpm tsx scripts/check-meetings.ts
 *
 * Встречи не пересекаются - иначе счётчик на главной не знал бы, какой верить;
 * второму приходит «отметил(а) встречу» со сроком словами, а накануне в 19:00 -
 * обоим «завтра вы вместе», без дублей. Плюс счёт «через N дней / день 2 из 5».
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { memoryCaption, nextMeeting, stateOf, type Meeting } from '../src/features/meetings/logic.ts'
import { check, finish, inTransaction } from './harness.ts'

const m = (id: string, startsOn: string, endsOn: string): Meeting => ({
  id, startsOn, endsOn, place: null, note: null, memoryId: null, createdBy: 'a', items: [],
})
const s1 = stateOf(m('x', '2026-10-10', '2026-10-14'), '2026-10-03')
const s2 = stateOf(m('x', '2026-10-10', '2026-10-14'), '2026-10-12')
check(s1.kind === 'upcoming' && s1.days === 7, 'До встречи - дни до начала', JSON.stringify(s1))
check(s2.kind === 'now' && s2.day === 3 && s2.of === 5, 'Во время встречи - день N из M', JSON.stringify(s2))
check(
  nextMeeting([m('old', '2026-09-01', '2026-09-03'), m('far', '2026-12-01', '2026-12-03'), m('near', '2026-10-10', '2026-10-12')], '2026-10-03')?.id === 'near',
  'Ближайшая - первая из будущих, прошедшие не в счёт',
  'near',
)
check(
  memoryCaption({ ...m('x', '2026-10-10', '2026-10-12'), items: [
    { id: '1', title: 'Каток', done: true, source: null, createdAt: '' },
    { id: '2', title: 'Музей', done: false, source: null, createdAt: '' },
  ] }, 'Встреча') === 'Встреча: Каток',
  'В воспоминание уходит то, что из плана успели',
  'только отмеченное',
)

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  await db.q(`update public.profiles set sex = 'female' where user_id = $1`, [a])
  await db.q('delete from public.meetings')

  await db.mustFail(
    'Конец раньше начала отвергается',
    `insert into public.meetings (starts_on, ends_on, created_by) values ('2031-01-10', '2031-01-09', $1)`,
    [a],
    'meetings_dates',
  )

  await db.as(a)
  const before = await db.queued()
  const id = await db.one(
    `insert into public.meetings (starts_on, ends_on, place, created_by) values ('2031-01-10', '2031-01-14', 'Алматы', $1) returning id::text`,
    [a],
  )
  const p = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string; body: string })
  check(
    (await db.queued()) > before && p[0]?.userId === b && p[0]?.title === 'Аминош отметила встречу' && (p[0]?.body ?? '').startsWith('С 10.01 по 14.01'),
    'Второму - кто отметил встречу и когда',
    `${p[0]?.title} / ${p[0]?.body}`,
  )
  await db.mustFail(
    'Встречи не пересекаются',
    `insert into public.meetings (starts_on, ends_on, created_by) values ('2031-01-14', '2031-01-16', $1)`,
    [a],
    'meetings_no_overlap',
  )

  await db.as(b)
  await db.q(`insert into public.meeting_items (meeting_id, title, created_by) values ($1, 'Каток', $2)`, [id, b])
  const toggled = await db.q(`update public.meeting_items set done = true where meeting_id = $1 returning 1`, [id])
  check(toggled.length === 1, 'План общий: пункт добавляет и отмечает любой из двоих', 'встреча одна на двоих')

  await db.asOwner()
  const tz = await db.one(
    `select z from (select 'Etc/GMT' || case when o > 0 then '-' || o else '+' || (-o) end as z
                      from generate_series(-12, 14) o) zones
      where extract(hour from now() at time zone z) = 19 limit 1`,
  )
  check(tz !== '', 'Нашёлся пояс, где сейчас 19:00', tz)
  if (tz !== '') {
    await db.q('update public.profiles set timezone = $1', [tz])
    const tomorrow = await db.one(`select ((now() at time zone $1)::date + 1)::text`, [tz])
    await db.q('delete from public.meetings')
    await db.q(`insert into public.meetings (starts_on, ends_on, created_by) values ($1::date, $1::date + 2, $2)`, [tomorrow, a])
    const sent = Number(await db.one('select public.send_meeting_reminders()'))
    check(sent === 2, 'Накануне в 19:00 - обоим «завтра вы вместе»', `отправлено ${sent}`)
    check(Number(await db.one('select public.send_meeting_reminders()')) === 0, 'Повторно - молчит', 'без дублей')
  }
})

finish('До встречи')
