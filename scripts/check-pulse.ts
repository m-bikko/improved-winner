/**
 * Проверка разговора месяца.
 *
 * Слепо, как вопрос дня: оценки второго - только после своих за тот же месяц,
 * после раскрытия свои не поправить. Пять оценок 1..10, месяц - первое число.
 * Второму - «ответил(а)», при раскрытии - «открыт». Напоминание - только
 * в последний день месяца.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { average, gaps, monthOf } from '../src/features/pulse/logic.ts'
import { check, finish, inTransaction } from './harness.ts'

check(monthOf('2026-10-17') === '2026-10-01', 'Месяц - его первое число', monthOf('2026-10-17'))
check(average([7, 8, 9, 6, 10]) === 8, 'Средняя - с одним знаком', '8')
check(
  gaps({ userId: 'a', month: '', scores: [9, 5, 8, 8, 8], note: null }, { userId: 'b', month: '', scores: [9, 9, 6, 8, 4], note: null }).join() === '1,4',
  'Разошлись на три и больше - стоит поговорить',
  'поддержка и будущее',
)

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  await db.q(`update public.profiles set sex = 'male' where user_id = $1`, [a])
  const M = '2031-03-01'
  await db.mustFail('Не первое число - не месяц', `insert into public.pulse_entries (user_id, month, scores) values ($1, '2031-03-02', '{5,5,5,5,5}')`, [a], 'pulse_entries_month_check')
  await db.mustFail('Ровно пять оценок 1..10', `insert into public.pulse_entries (user_id, month, scores) values ($1, $2, '{5,5,11,5,5}')`, [a, M], 'pulse_entries_scores_check')

  await db.as(a)
  await db.q(`insert into public.pulse_entries (user_id, month, scores, note) values ($1, $2, '{8,7,6,9,8}', 'больше звонков')`, [a, M])
  const p1 = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string })
  check(p1[0]?.userId === b && p1[0]?.title === 'Аминош ответил на разговор месяца', 'Второму - «ответил»', `${p1[0]?.title}`)

  await db.as(b)
  check((await db.q('select 1 from public.pulse_entries where month = $1', [M])).length === 0, 'ДО своих оценок чужие не видны', 'вслепую')
  await db.q(`insert into public.pulse_entries (user_id, month, scores) values ($1, $2, '{9,9,7,8,8}')`, [b, M])
  const p2 = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string })
  check(p2[0]?.userId === a && p2[0]?.title === 'Разговор месяца открыт', 'Второй ответ - «открыт»', `${p2[0]?.title}`)
  check((await db.q('select 1 from public.pulse_entries where month = $1', [M])).length === 2, 'ПОСЛЕ своих - видны оба', '2')
  const edited = await db.q(`update public.pulse_entries set scores = '{1,1,1,1,1}' where user_id = $1 and month = $2 returning 1`, [b, M])
  check(edited.length === 0, 'После раскрытия свои не поправить', 'как у вопроса дня')

  await db.asOwner()
  const lastDay = await db.one(`select (extract(month from current_date + 1) <> extract(month from current_date))::text`)
  if (lastDay === 'false') {
    check(Number(await db.one('select public.send_pulse_reminders()')) === 0, 'Не последний день месяца - напоминаний нет', 'в любом поясе')
  }
})

finish('Разговор месяца')
