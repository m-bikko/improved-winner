/**
 * Проверка «Нашей недели».
 *
 * Сводка считает из уже записанного: дни дневника, тренировки, вес,
 * отметки, «спасибо» (по поясу автора), вопросы дня - и у второго тоже
 * в те дни, когда ты не отвечал (слепота вопроса дня не должна занижать
 * чужой счёт). Неучастнику - ничего. Рассылка - в воскресенье в 20:00,
 * один раз на неделю.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { weekStart } from '../src/features/week/logic.ts'
import { check, finish, inTransaction } from './harness.ts'

type Person = {
  userId: string
  diaryDays: number
  workouts: number
  workoutMinutes: number
  weightFrom: number | null
  weightTo: number | null
  gratitudes: number
  questions: number
}
type Summary = { from: string; to: string; people: Person[]; together: { questions: number; meetingDays: number } }

check(weekStart('2026-10-03') === '2026-09-28', 'Неделя начинается с понедельника', 'суббота → понедельник')
check(weekStart('2026-09-28') === '2026-09-28', 'Понедельник - сам себе начало', '2026-09-28')
check(weekStart('2026-10-04') === '2026-09-28', 'Воскресенье - конец той же недели', 'а не начало следующей')

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru', timezone = 'Asia/Almaty'`)
  const W = '2031-03-03' // понедельник
  await db.q(
    `insert into public.diary_entries (id, user_id, date, meal, name_snapshot, grams, kcal_100, protein_100, fat_100, carbs_100)
     select gen_random_uuid(), $1, d::date, 'lunch', 'Тест', 100, 500, 1, 1, 1 from generate_series('2031-03-03'::date, '2031-03-07', '1 day') d`,
    [a],
  )
  await db.q(
    `insert into public.workouts (user_id, date, kind, minutes, kcal)
     values ($1, '2031-03-04', 'run', 30, 300), ($1, '2031-03-09', 'walk', 40, 150), ($1, '2031-03-10', 'walk', 99, 300)`,
    [a],
  )
  await db.q(`insert into public.weight_log (user_id, date, weight_kg) values ($1, '2031-03-03', 95.2), ($1, '2031-03-09', 94.6)`, [a])
  // «Спасибо» в 23:30 воскресенья по Алматы - это ещё эта неделя, хотя в UTC уже 18:30
  await db.q(`insert into public.gratitudes (author_id, body, created_at) values ($1, 'т', '2031-03-09 23:30:00+05'), ($1, 'т', '2031-03-10 00:30:00+05')`, [a])
  // Вопрос дня: B отвечал дважды, A - ни разу
  await db.q(
    `insert into public.question_answers (user_id, date, question_id, body) values ($1, '2031-03-05', 'q_test', 'да'), ($1, '2031-03-06', 'q_test', 'да')`,
    [b],
  )
  await db.q(`insert into public.meetings (starts_on, ends_on, created_by) values ('2031-03-08', '2031-03-12', $1)`, [a])

  await db.as(a)
  const s = JSON.parse(await db.one('select public.week_summary($1)::text', [W])) as Summary
  const me = s.people.find((p) => p.userId === a)
  const them = s.people.find((p) => p.userId === b)
  check(s.from === W && s.to === '2031-03-09', 'Неделя - с понедельника по воскресенье', `${s.from} - ${s.to}`)
  check(me?.diaryDays === 5, 'Дни дневника', `${me?.diaryDays}`)
  check(me?.workouts === 2 && me?.workoutMinutes === 70, 'Тренировки - только этой недели', `${me?.workouts}, ${me?.workoutMinutes} мин`)
  check(me?.weightFrom === 95.2 && me?.weightTo === 94.6, 'Вес - первый и последний за неделю', `${me?.weightFrom} → ${me?.weightTo}`)
  check(me?.gratitudes === 1, '«Спасибо» - по поясу автора', `${me?.gratitudes}`)
  check(them?.questions === 2, 'Ответы второго считаются и без твоих', `${them?.questions}`)
  check(s.together.meetingDays === 2, 'Встреча - дни внутри недели', `${s.together.meetingDays}`)

  await db.asOwner()
  await db.q(`select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true)`)
  await db.q('set local role authenticated')
  check((await db.one('select coalesce(public.week_summary($1)::text, \'\')', [W])) === '', 'Неучастнику - ничего', 'null')
  await db.asOwner()

  // Рассылка: воскресенье 20:00 по месту, один раз за неделю
  await db.q(`update public.profiles set timezone = 'Asia/Almaty'`)
  check(Number(await db.one(`select public.send_week_summaries('2031-03-09 19:00:00+05')`)) === 0, 'Воскресенье 19:00 - ещё рано', '0')
  check(Number(await db.one(`select public.send_week_summaries('2031-03-08 20:00:00+05')`)) === 0, 'Суббота 20:00 - не тот день', '0')
  const sent = Number(await db.one(`select public.send_week_summaries('2031-03-09 20:05:00+05')`))
  const p = (await db.lastPushes(2)).map((x) => JSON.parse(x) as { userId: string; title: string; body: string; url: string })
  const forA = p.find((x) => x.userId === a)
  check(
    sent === 2 && forA?.title === 'Ваша неделя' && forA?.url === '/week' && forA?.body === 'Дневник: 5 из 7 дней · тренировок: 2 · «спасибо»: 1',
    'Воскресенье 20:00 - своя строка каждому',
    `${forA?.body}`,
  )
  check(Number(await db.one(`select public.send_week_summaries('2031-03-09 20:35:00+05')`)) === 0, 'И один раз за неделю', '0')
})

finish('Наша неделя')
