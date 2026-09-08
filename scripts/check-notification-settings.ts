/**
 * Проверка настроек уведомлений.
 *
 *   pnpm tsx scripts/check-notification-settings.ts
 *
 * Тут два разных страха.
 *
 * Первый - что выключенное всё равно придёт. Это заметят и скажут, поэтому
 * проверяется прямо: гасим канал и считаем, что ушло.
 *
 * Второй опаснее: новая рассылка, добавленная через полгода, проходит МИМО
 * настроек. Обнаружится это жалобой «я же выключил», а до тех пор всё будет
 * выглядеть исправным. Поэтому отдельно проверяется, что каждая функция,
 * которая шлёт, называет свой вид, и что список видов в базе и в интерфейсе
 * один и тот же.
 *
 * Всё в транзакции и откатывается.
 */
import { readFileSync } from 'node:fs'
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
    const [a, b] = members
    if (!a || !b) throw new Error('Нужны два участника')

    // --- ни одна рассылка не проходит мимо -------------------------------
    const silent = await q<{ proname: string }>(
      `select p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and pg_get_functiondef(p.oid) like '%public.tg_notify%'
          and p.proname not in
              ('tg_notify_self','tg_notify_partner','tg_notify_both','push_notify')
          and pg_get_functiondef(p.oid) !~
              '''(meals|tasks|topics|cycle|cycle_tips|love_notes|checkin|checkin_partner|dates|letters|wishlist)'''`,
    )
    check(
      silent.length === 0,
      'Каждая рассылка называет свой вид',
      silent.length === 0
        ? 'мимо настроек не проходит ничего'
        : `без вида: ${silent.map((s) => s.proname).join(', ')}`,
    )

    // Словарь видов в базе и в интерфейсе - один
    const def = await one(
      `select pg_get_constraintdef(oid) as v from pg_constraint
        where conname = 'notification_settings_kind_check'`,
    )
    const dbKinds = [...def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1])
    const ui = readFileSync('src/features/profile/notifications.ts', 'utf8')
    const uiKinds = [...ui.matchAll(/\bid: '([a-z_]+)'/g)].map((m) => m[1])
    const onlyDb = dbKinds.filter((k) => !uiKinds.includes(k))
    const onlyUi = uiKinds.filter((k) => !dbKinds.includes(k))
    check(
      onlyDb.length === 0 && onlyUi.length === 0 && uiKinds.length > 0,
      'Виды в базе и в интерфейсе совпадают',
      `в базе ${dbKinds.length}, в форме ${uiKinds.length}` +
        (onlyDb.length ? `, только в базе: ${onlyDb.join(', ')}` : '') +
        (onlyUi.length ? `, только в форме: ${onlyUi.join(', ')}` : ''),
    )

    const allowed = async (kind: string, channel: string, who = a.user_id): Promise<boolean> =>
      (await one('select public.notify_allowed($1, $2, $3)::text as v', [who, kind, channel])) ===
      'true'

    check(await allowed('meals', 'telegram'), 'По умолчанию всё включено', 'строки в настройках нет')

    // --- выключение по каналу --------------------------------------------
    await client.query(
      `insert into public.notification_settings (user_id, kind, telegram, push)
       values ($1, 'meals', false, true)`,
      [a.user_id],
    )
    check(!(await allowed('meals', 'telegram')), 'Выключенный канал молчит', 'телеграм по еде')
    check(await allowed('meals', 'push'), 'Второй канал продолжает работать', 'push по еде')
    check(await allowed('tasks', 'telegram'), 'Другие виды не затронуты', 'телеграм по задачам')
    check(
      await allowed('meals', 'telegram', b.user_id),
      'Настройки персональные',
      'выключение у одного не глушит второго',
    )

    // --- живая рассылка ---------------------------------------------------
    const zone = async (hour: number): Promise<string | null> =>
      (
        await q<{ name: string }>(
          `select name from pg_timezone_names
            where extract(hour from now() at time zone name)::int = $1
              and name like '%/%' order by name limit 1`,
          [hour],
        )
      )[0]?.name ?? null

    const queued = async (): Promise<number> =>
      Number(await one('select count(*)::text as v from net.http_request_queue'))

    const lunch = await zone(14)
    if (lunch) {
      await client.query('alter table public.checkins disable trigger checkin_notify')
      await client.query('delete from public.meal_reminders')
      await client.query('update public.profiles set timezone = $1', [lunch])
      await client.query(
        `delete from public.diary_entries where date = (now() at time zone $1)::date`,
        [lunch],
      )
      const q0 = await queued()
      await client.query('select public.send_meal_reminders()')
      const sent = (await queued()) - q0
      // У одного телеграм выключен: 2 участника x 2 канала минус один канал
      check(
        sent === members.length * 2 - 1,
        'Выключенный канал не уходит и в живой рассылке',
        `запросов ${sent}, ожидалось ${members.length * 2 - 1}`,
      )
    }

    // --- тихие часы -------------------------------------------------------
    await client.query('delete from public.notification_settings')

    const setQuiet = async (from: number | null, to: number | null, tz: string): Promise<void> => {
      await client.query(
        'update public.profiles set quiet_from = $1, quiet_to = $2, timezone = $3 where user_id = $4',
        [from, to, tz, a.user_id],
      )
    }

    const noon = await zone(12)
    if (noon) {
      await setQuiet(10, 14, noon)
      check(!(await allowed('tasks', 'telegram')), 'В тихие часы не приходит ничего', '10-14, сейчас 12')
      check(!(await allowed('tasks', 'push')), 'И вторым каналом тоже', 'тишина - это тишина')

      await setQuiet(14, 18, noon)
      check(await allowed('tasks', 'telegram'), 'Вне промежутка приходит', '14-18, сейчас 12')

      // Через полночь: с 8 до 13 не должно ловить полдень наоборот
      await setQuiet(22, 8, noon)
      check(await allowed('tasks', 'telegram'), 'Промежуток через полночь не ловит полдень', '22-8')

      await setQuiet(8, 22, noon)
      check(!(await allowed('tasks', 'telegram')), 'Дневной промежуток ловит полдень', '8-22')

      await setQuiet(12, 12, noon)
      check(
        await allowed('tasks', 'telegram'),
        'Вырожденный промежуток не глушит сутки',
        '«с 12 до 12» - это не заданные тихие часы, а опечатка',
      )

      await setQuiet(null, null, noon)
      check(await allowed('tasks', 'telegram'), 'Без тихих часов всё приходит', 'пусто - значит выключено')
    }

    const midnight = await zone(23)
    if (midnight) {
      await setQuiet(22, 8, midnight)
      check(
        !(await allowed('tasks', 'telegram')),
        'Промежуток через полночь ловит ночь',
        '22-8, сейчас 23',
      )
    }

    // --- чужие настройки --------------------------------------------------
    await client.query('set local role authenticated')
    await client.query(
      `select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)`,
      [b.user_id],
    )
    await client.query('reset role')
    await client.query(
      `insert into public.notification_settings (user_id, kind, telegram)
       values ($1, 'dates', false)`,
      [a.user_id],
    )
    await client.query('set local role authenticated')
    check(
      (await q('select 1 from public.notification_settings')).length === 0,
      'Партнёр не видит моих настроек',
      'что мне приходит - не его дело',
    )
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nНастройки уведомлений верны.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
