/**
 * Проверка того, что снижение веса не переписывает уже закрытые кольца.
 *
 *   pnpm tsx scripts/check-goal-history.ts
 *
 * Сценарий ровно тот, о котором спрашивают в первую очередь: норма была 2000,
 * человек похудел, норма упала - что стало с прошлыми днями.
 *
 * Всё внутри транзакции, откатывается.
 */
import { Client } from 'pg'
import { pgConfig } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()

  try {
    await client.query('begin')

    const { rows } = await client.query<{ id: string }>(
      'select user_id as id from app_members limit 1',
    )
    const userId = rows[0]?.id
    if (!userId) throw new Error('В app_members нет пользователей')

    const past = '2026-01-15'

    // Прошлый день: норма 2000, съедено 1900 - кольцо закрыто на 95%
    await client.query(
      `insert into daily_goals (user_id, date, kcal, protein, fat, carbs, goal_direction)
       values ($1, $2, 2000, 140, 70, 200, 'lose')
       on conflict (user_id, date) do update set kcal = 2000`,
      [userId, past],
    )
    await client.query(
      `insert into diary_entries
         (id, user_id, date, meal, grams, name_snapshot, kcal_100, protein_100, fat_100, carbs_100)
       values (gen_random_uuid(), $1, $2, 'lunch', 1000, 'ТЕСТ ЦЕЛЬ', 190, 10, 5, 20)`,
      [userId, past],
    )

    const before = await client.query<{ kcal: string; goal: string }>(
      `select sum(e.kcal)::text as kcal, max(g.kcal)::text as goal
         from diary_entries e join daily_goals g
           on g.user_id = e.user_id and g.date = e.date
        where e.user_id = $1 and e.date = $2`,
      [userId, past],
    )
    const eaten = Number(before.rows[0]?.kcal)
    const goal = Number(before.rows[0]?.goal)
    check(
      Math.round((eaten / goal) * 100) === 95,
      'Прошлый день закрыт на 95%',
      `${eaten} из ${goal} ккал`,
    )

    // Человек похудел - норма в профиле падает
    await client.query('update profiles set weight_kg = 70 where user_id = $1', [userId])

    const after = await client.query<{ kcal: string; goal: string }>(
      `select sum(e.kcal)::text as kcal, max(g.kcal)::text as goal
         from diary_entries e join daily_goals g
           on g.user_id = e.user_id and g.date = e.date
        where e.user_id = $1 and e.date = $2`,
      [userId, past],
    )
    const goalAfter = Number(after.rows[0]?.goal)
    check(
      goalAfter === 2000,
      'После снижения веса норма прошлого дня НЕ изменилась',
      `осталась ${goalAfter} ккал, кольцо всё ещё ${Math.round((eaten / goalAfter) * 100)}%`,
    )

    // Снимок дня уникален по (пользователь, дата) - двух норм на один день быть не может
    const dup = await client
      .query(
        `insert into daily_goals (user_id, date, kcal, protein, fat, carbs, goal_direction)
         values ($1, $2, 1500, 100, 50, 150, 'lose')`,
        [userId, past],
      )
      .then(() => null)
      .catch((e: unknown) => (e instanceof Error ? e.message : String(e)))
    check(
      dup !== null && dup.includes('daily_goals_pkey'),
      'Двух норм на один день быть не может',
      dup?.split('\n')[0] ?? 'вставка ПРОШЛА - ключ не работает',
    )
  } finally {
    await client.query('rollback')
    await client.end()
  }

  console.log(failed === 0 ? '\nЗакрытые кольца не двигаются.' : `\nПровалено: ${failed}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
