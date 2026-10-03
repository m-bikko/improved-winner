/**
 * Проверка числа на иконке.
 *
 *   pnpm tsx scripts/check-badge.ts
 *
 * Бейдж опасен ровно одним: числом, которое не гаснет. Такое перестают
 * замечать за неделю, и вместе с ним перестают замечать всё остальное
 * на иконке. Поэтому главное здесь - не «появляется ли», а «исчезает ли»:
 * каждое слагаемое обязано закрываться действием.
 *
 * Второе - повторяющиеся задачи. У них due_at двигает планировщик, и если
 * считать их просроченными, число будет мигать каждые пять минут между
 * наступлением срока и запуском рассылки.
 *
 * Всё в транзакции и откатывается.
 */
import { Client, type QueryResultRow } from 'pg'
import { pgConfig } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()

  const q = async <T extends QueryResultRow>(sql: string, p: unknown[] = []): Promise<T[]> =>
    (await client.query<T>(sql, p)).rows
  const one = async (sql: string, p: unknown[] = []): Promise<string> =>
    (await q<{ v: string }>(sql, p))[0]?.v ?? ''

  try {
    await client.query('begin')

    const members = await q<{ user_id: string }>(
      'select user_id from public.app_members order by user_id',
    )
    const [a] = members
    if (!a) throw new Error('Нужен участник')

    await client.query('alter table public.checkins disable trigger checkin_notify')
    await client.query('delete from public.checkins')
    await client.query('delete from public.tasks')

    const zone = async (hour: number): Promise<string | null> =>
      (
        await q<{ name: string }>(
          `select name from pg_timezone_names
            where extract(hour from now() at time zone name)::int = $1
              and name like '%/%' order by name limit 1`,
          [hour],
        )
      )[0]?.name ?? null

    const count = async (): Promise<number> =>
      Number(await one('select public.attention_count($1)::text as v', [a.user_id]))

    const setTz = async (tz: string): Promise<void> => {
      await client.query('update public.profiles set timezone = $1 where user_id = $2', [
        tz,
        a.user_id,
      ])
    }

    const night = await zone(3)
    const day = await zone(15)

    // --- самочувствие -----------------------------------------------------
    if (night && day) {
      await setTz(night)
      check(
        (await count()) === 0,
        'До часа опроса самочувствие не считается',
        'бейдж в 03:00 с требованием отметиться - придирка, а не напоминание',
      )

      await setTz(day)
      check(await count() === 1, 'После 11:00 неотмеченный день даёт единицу', '15:00, отметки нет')

      await client.query(
        `insert into public.checkins (user_id, date, states)
         values ($1, (now() at time zone $2)::date, array['joy'])`,
        [a.user_id, day],
      )
      check(await count() === 0, 'Отметка гасит единицу', 'слагаемое закрывается действием')

      await client.query('delete from public.checkins')
    }

    // --- задачи -----------------------------------------------------------
    const task = await one(
      `insert into public.tasks (title, due_at, created_by)
       values ('Просроченная', now() - interval '1 hour', $1) returning id::text as v`,
      [a.user_id],
    )
    const base = await count()
    check(base >= 1, 'Просроченная задача попадает в число', `сейчас ${base}`)

    await client.query(
      `insert into public.tasks (title, due_at, created_by)
       values ('Будущая', now() + interval '2 days', $1)`,
      [a.user_id],
    )
    check(await count() === base, 'Задача со сроком в будущем не считается', 'ещё не просрочена')

    await client.query(
      `insert into public.tasks (title, due_at, created_by, recurrence)
       values ('Каждый день', now() - interval '1 hour', $1, '{"freq":"daily","interval":1}'::jsonb)`,
      [a.user_id],
    )
    check(
      await count() === base,
      'Повторяющаяся задача в число НЕ попадает',
      'её due_at двигает планировщик - «просрочено» тут состояние на пять минут',
    )

    await client.query(
      `update public.tasks set done_at = now(), done_by = $2 where id = $1`,
      [task, a.user_id],
    )
    check(await count() === base - 1, 'Выполнение гасит слагаемое', 'число убывает от действия')

    // --- бейдж уезжает вместе с push --------------------------------------
    await client.query('delete from public.tasks')
    await client.query(
      `insert into public.tasks (title, due_at, created_by)
       values ('Хвост', now() - interval '1 hour', $1)`,
      [a.user_id],
    )
    // По id, а не по числу строк: воркер pg_net тем временем разгребает
    // очередь от крона, и общее число может и уменьшиться
    const before = await one('select coalesce(max(id), 0)::text as v from net.http_request_queue')
    await client.query(`select public.push_notify($1, 'Тест', 'тело', 'tasks')`, [a.user_id])
    const body = await one(
      `select coalesce(max(convert_from(body, 'utf8')), '') as v from net.http_request_queue
        where id = (select max(id) from net.http_request_queue where id > $1::bigint)`,
      [before],
    )
    const grew = body !== ''
    check(
      grew && /"badge":\s*\d+/.test(body),
      'Push несёт число с собой',
      grew ? body.slice(0, 120) : 'запрос не ушёл',
    )
    check(
      /"badge":\s*0\b/.test(body) === false,
      'И число не нулевое, когда есть чем заняться',
      'иначе воркер снял бы бейдж ровно тогда, когда он нужен',
    )

    // --- ноль означает «снять» -------------------------------------------
    await client.query('delete from public.tasks')
    if (day) await setTz(day)
    await client.query(
      `insert into public.checkins (user_id, date, states)
       values ($1, (now() at time zone $2)::date, array['joy'])`,
      [a.user_id, day ?? 'Asia/Almaty'],
    )
    check(await count() === 0, 'Когда всё закрыто - ноль', 'воркер по нулю снимает бейдж, а не рисует «0»')

    const sw = (await import('node:fs')).readFileSync('public/push-sw.js', 'utf8')
    check(
      sw.includes('clearAppBadge') && sw.includes('setAppBadge'),
      'Воркер умеет и ставить, и снимать',
      'ноль в кружке на iOS выглядит как единица',
    )
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nЧисло на иконке верно.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
