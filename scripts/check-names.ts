/**
 * Проверка «Имени малышу».
 *
 * Главное - чужие голоса не видны вовсе: ни «да», ни «нет». Известно только
 * совпадение - имя, которое понравилось обоим, - и о нём второму приходит
 * уведомление с самим именем. Свои имена - только своими, без дублей.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { check, finish, inTransaction } from './harness.ts'

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  await db.q('delete from public.name_votes')
  const count = Number(await db.one('select count(*) from public.baby_names where origin <> \'custom\''))
  check(count === 320, 'Список - 320 имён', `${count}`)
  const [n1, n2] = (await db.q<{ key: string; name: string }>(`select key, name from public.baby_names where origin = 'kazakh' order by rank limit 2`))

  await db.as(a)
  await db.mustFail(
    'Имя из общего списка участник не добавит',
    `insert into public.baby_names (key, name, gender, origin, created_by) values ('fake', 'Фейк', 'm', 'kazakh', $1)`,
    [a],
    'row-level security',
  )
  await db.q(`insert into public.name_votes (user_id, name_key, liked) values ($1, $2, true), ($1, $3, false)`, [a, n1?.key, n2?.key])

  await db.as(b)
  check((await db.q('select 1 from public.name_votes where user_id = $1', [a])).length === 0, 'Голоса второго не видны вовсе', 'ни «да», ни «нет»')
  check((await db.q('select 1 from public.name_matches()')).length === 0, 'Пока не совпало - совпадений нет', '0')
  const before = await db.queued()
  await db.q(`insert into public.name_votes (user_id, name_key, liked) values ($1, $2, true)`, [b, n1?.key])
  const m = await db.q<{ name_key: string }>('select name_key from public.name_matches()')
  const p = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; body: string })
  check(m.length === 1 && m[0]?.name_key === n1?.key, 'Понравилось обоим - совпадение', `${n1?.name}`)
  check(
    (await db.queued()) > before && p[0]?.userId === a && p[0]?.body === `${n1?.name} - нравится вам обоим.`,
    'Второму - уведомление с самим именем',
    `${p[0]?.body}`,
  )
  await db.q(`insert into public.name_votes (user_id, name_key, liked) values ($1, $2, true)`, [b, n2?.key])
  check((await db.q('select 1 from public.name_matches()')).length === 1, '«Нет» второго не становится совпадением', 'и не раскрывается')

  await db.q(`insert into public.baby_names (key, name, gender, origin, created_by) values ('c-test', 'Тестимя', 'f', 'custom', $1)`, [b])
  await db.mustFail(
    'Своё имя - без дублей',
    `insert into public.baby_names (key, name, gender, origin, created_by) values ('c-test2', ' тестимя ', 'f', 'custom', $1)`,
    [b],
    'baby_names_unique_name',
  )
})

finish('Имя малышу')
