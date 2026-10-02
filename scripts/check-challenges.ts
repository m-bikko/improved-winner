/**
 * Проверка челленджей на двоих.
 *
 *   pnpm tsx scripts/check-challenges.ts
 *
 * Счёт «день 12 из 30» держится на одном правиле: отметка бывает только
 * внутри срока. База проверяет его с обеих сторон - и новую отметку, и
 * правку срока, после которой старые отметки оказались бы снаружи.
 * Дальше - что отмечается каждый только за себя и что второму приходит
 * «твой ход» или «сегодня вы оба». Плюс арифметика серии и статусов.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { canMark, dayNumber, jointStreak, statusOf, togetherCount, type Challenge } from '../src/features/challenges/logic.ts'
import { check, finish, inTransaction } from './harness.ts'

// --- арифметика --------------------------------------------------------------

const base: Challenge = {
  id: 'c',
  title: 't',
  icon: 'steps',
  days: 10,
  startedOn: '2026-10-01',
  stoppedOn: null,
  createdBy: 'a',
  createdAt: '',
  marks: [],
}
const marks = (who: string, dates: string[]) => dates.map((date) => ({ userId: who, date }))

check(
  statusOf(base, '2026-09-30') === 'upcoming' && statusOf(base, '2026-10-05') === 'active' && statusOf(base, '2026-10-11') === 'done',
  'Статус по дате: ещё не начался, идёт, закончился',
  'до начала, в середине и на следующий день после последнего',
)
check(statusOf({ ...base, stoppedOn: '2026-10-03' }, '2026-10-03') === 'done', 'Остановленный в тот же день - закончен', 'stopped_on')
check(dayNumber(base, '2026-10-05') === 5 && dayNumber(base, '2026-12-01') === 10, 'День N из M не выходит за срок', 'после конца - последний день')
check(
  canMark(base, '2026-10-03', '2026-10-05') && !canMark(base, '2026-10-06', '2026-10-05') && !canMark(base, '2026-09-30', '2026-10-05'),
  'Отметиться можно за прошлый день, но не за будущий и не до начала',
  'забыть вечером не повод терять день, но «за завтра» - это обещание',
)
const c = {
  ...base,
  marks: [...marks('a', ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']), ...marks('b', ['2026-10-03', '2026-10-04'])],
}
check(togetherCount(c, 'a', 'b') === 2, 'Вместе - дни, когда отметились оба', '2')
check(jointStreak(c, 'a', 'b', '2026-10-05') === 2, 'Серия не обрывается сегодняшним днём, пока он идёт', 'вчера и позавчера - оба')
check(jointStreak(c, 'a', 'b', '2026-10-07') === 0, 'Пропуск обрывает серию', '0')

// --- база --------------------------------------------------------------------

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  await db.q(`update public.profiles set sex = 'male' where user_id = $1`, [a])

  await db.mustFail(
    'Меньше трёх дней - не челлендж',
    `insert into public.challenges (title, icon, days, started_on, created_by) values ('x', 'steps', 2, '2031-01-01', $1)`,
    [a],
    'challenges_days_check',
  )
  await db.mustFail(
    'Значок - только ключ из букв',
    `insert into public.challenges (title, icon, days, started_on, created_by) values ('x', '<svg>', 7, '2031-01-01', $1)`,
    [a],
    'challenges_icon_check',
  )

  await db.as(a)
  const before = await db.queued()
  const id = await db.one(
    `insert into public.challenges (title, icon, days, started_on, created_by)
     values ('Без сладкого', 'sugar', 10, '2031-01-01', $1) returning id::text`,
    [a],
  )
  const invite = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string; body: string })
  check(
    (await db.queued()) > before && invite[0]?.userId === b && (invite[0]?.body ?? '').includes('10 дней'),
    'Второго зовут в челлендж - со сроком словами',
    `${invite[0]?.title} / ${invite[0]?.body}`,
  )

  await db.mustFail(
    'Отметка до начала отвергается',
    `insert into public.challenge_marks (challenge_id, user_id, date) values ($1, $2, '2030-12-31')`,
    [id, a],
    'challenge_marks_in_range',
  )
  await db.mustFail(
    'Отметка после конца отвергается',
    `insert into public.challenge_marks (challenge_id, user_id, date) values ($1, $2, '2031-01-11')`,
    [id, a],
    'challenge_marks_in_range',
  )
  await db.mustFail(
    'Отметиться за другого нельзя',
    `insert into public.challenge_marks (challenge_id, user_id, date) values ($1, $2, '2031-01-02')`,
    [id, b],
    'row-level security',
  )

  const beforeMark = await db.queued()
  await db.q(`insert into public.challenge_marks (challenge_id, user_id, date) values ($1, $2, '2031-01-05')`, [id, a])
  const first = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string; body: string })
  check(
    (await db.queued()) > beforeMark && first[0]?.userId === b && (first[0]?.title ?? '').includes('отметился') && (first[0]?.body ?? '').includes('Твой ход'),
    'Отметка первого - второму «твой ход», с родом того, кто отметился',
    `${first[0]?.title} / ${first[0]?.body}`,
  )

  await db.as(b)
  await db.q(`insert into public.challenge_marks (challenge_id, user_id, date) values ($1, $2, '2031-01-05')`, [id, b])
  const second = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; body: string })
  check(
    second[0]?.userId === a && (second[0]?.body ?? '').includes('вы оба'),
    'Второй закрыл день - первому «сегодня вы оба»',
    `${second[0]?.body}`,
  )
  const removedOther = await db.q(`delete from public.challenge_marks where challenge_id = $1 and user_id = $2 returning 1`, [id, a])
  check(removedOther.length === 0, 'Снять чужую отметку нельзя', 'RLS молча не находит строку')

  await db.mustFail(
    'Сократить срок так, что отметки окажутся снаружи, нельзя',
    `update public.challenges set days = 4 where id = $1`,
    [id],
    'challenges_keep_marks',
  )
  await db.mustFail(
    'Сдвинуть начало за уже поставленные отметки нельзя',
    `update public.challenges set started_on = '2031-01-06' where id = $1`,
    [id],
    'challenges_keep_marks',
  )
  await db.mustFail(
    'Остановить раньше уже отмеченного дня нельзя',
    `update public.challenges set stopped_on = '2031-01-03' where id = $1`,
    [id],
    'challenges_keep_marks',
  )
  const stopped = await db.q(`update public.challenges set stopped_on = '2031-01-06' where id = $1 returning 1`, [id])
  check(stopped.length === 1, 'Остановить челлендж может любой из двоих', 'общая договорённость')
  await db.mustFail(
    'После остановки отметки не принимаются',
    `insert into public.challenge_marks (challenge_id, user_id, date) values ($1, $2, '2031-01-07')`,
    [id, b],
    'challenge_marks_in_range',
  )
})

finish('Челленджи')
