/**
 * Проверка режима беременности.
 *
 *   pnpm tsx scripts/check-pregnancy.ts
 *
 * Самое важное - рассылки цикла молчат, пока режим включён: «задержка
 * 14 дней» на шестой неделе была бы хуже, чем ничего. Дальше - срок
 * от первого дня последней менструации, дата родов, и уведомление о новой
 * неделе в её первый день, с размером малыша, без дублей.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { shiftDays } from '../src/lib/date.ts'
import { CONTRACTIONS_FROM, KICKS_FROM, checkpointState, gestation, weekInfo } from '../src/features/pregnancy/logic.ts'
import { WEEKS } from '../src/features/pregnancy/weeks.ts'
import { check, finish, inTransaction } from './harness.ts'

const g = gestation('2026-08-01', '2026-10-03')
check(g.week === 9 && g.day === 0 && g.trimester === 1, 'Срок: недели и дни от первого дня последней менструации', JSON.stringify({ w: g.week, d: g.day }))
check(g.dueDate === shiftDays('2026-08-01', 280), 'Дата родов - плюс 280 дней', g.dueDate)
check(gestation('2026-01-01', '2026-05-01').trimester === 2 && gestation('2026-01-01', '2026-08-01').trimester === 3, 'Триместры по неделям 14 и 28', '2, 3')
check(weekInfo(3) === null && weekInfo(45)?.week === 40, 'До 4 недели показывать нечего, после 40-й - как 40-я', '')
check(WEEKS.length === 37 && WEEKS.every((w, i) => i === 0 || (WEEKS[i - 1]?.weightG ?? 0) <= (w.weightG ?? Infinity)), 'Недели 4-40, вес не убывает', `${WEEKS.length}`)
check(checkpointState(12, 11, 13) === 'now' && checkpointState(8, 11, 13) === 'soon' && checkpointState(20, 11, 13) === 'done', 'Вехи: идёт, скоро, прошла', '')
check(KICKS_FROM < CONTRACTIONS_FROM, 'Шевеления раньше схваток', `${KICKS_FROM} < ${CONTRACTIONS_FROM}`)

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  await db.q('delete from public.pregnancy')

  // Цикл A с задержкой: последняя менструация 50 дней назад
  await db.q(
    `insert into public.cycle_settings (user_id, tracking_enabled, share_with_partner, luteal_days)
     values ($1, true, true, 14)
     on conflict (user_id) do update set tracking_enabled = true`,
    [a],
  )
  await db.q('delete from public.periods where user_id = $1', [a])
  const day = await db.one(`select current_date::text`)
  await db.q(`insert into public.periods (user_id, started_on, ended_on) values ($1, $2::date - 78, $2::date - 74), ($1, $2::date - 50, $2::date - 46)`, [a, day])
  const delayed = await db.q('select 1 from public.cycle_delay($1, $2::date)', [a, day])
  check(delayed.length === 1, 'Без режима - задержка есть', 'так и должно быть')

  await db.as(a)
  await db.q(`insert into public.pregnancy (mother_id, lmp, started_by) values ($1, $2::date - 50, $1)`, [a, day])
  await db.mustFail(
    'Режим у пары один',
    `insert into public.pregnancy (id, mother_id, lmp, started_by) values (false, $1, current_date, $1)`,
    [a],
    'pregnancy_id_check',
  )
  await db.asOwner()
  check((await db.q('select 1 from public.cycle_delay($1, $2::date)', [a, day])).length === 0, 'В режиме беременности задержки нет', 'рассылка «задержка» не уйдёт')
  const src = await db.one(`select pg_get_functiondef('public.send_cycle_notices()'::regprocedure)`)
  check(src.includes('pregnancy_active'), 'Рассылки цикла пропускают беременную', 'фазы и «скоро менструация» молчат')

  await db.mustFail(
    'Сессия шевелений не длиннее 12 часов',
    `insert into public.kick_sessions (user_id, started_at, ended_at, kicks) values ($1, now() - interval '13 hours', now(), 10)`,
    [a],
    'kick_sessions_order',
  )

  // Неделя: пояс, где сейчас 10:00, и первый день недели
  const tz = await db.one(
    `select z from (select 'Etc/GMT' || case when o > 0 then '-' || o else '+' || (-o) end as z
                      from generate_series(-12, 14) o) zones
      where extract(hour from now() at time zone z) = 10 limit 1`,
  )
  check(tz !== '', 'Нашёлся пояс, где сейчас 10:00', tz)
  if (tz !== '') {
    await db.q('update public.profiles set timezone = $1', [tz])
    await db.q(`update public.pregnancy set lmp = (now() at time zone $1)::date - 84`, [tz])
    await db.q('delete from public.pregnancy_notices')
    const sent = Number(await db.one('select public.send_pregnancy_weeks()'))
    const p = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { title: string; body: string })
    check(sent === 2 && p[0]?.title === 'Неделя 12' && (p[0]?.body ?? '').includes('размером с лайм'), 'В первый день 12-й недели - обоим, с размером малыша', `${p[0]?.title} / ${p[0]?.body}`)
    check(Number(await db.one('select public.send_pregnancy_weeks()')) === 0, 'Повторно - молчит', 'без дублей')
    await db.q(`update public.pregnancy set lmp = (now() at time zone $1)::date - 85`, [tz])
    await db.q('delete from public.pregnancy_notices')
    check(Number(await db.one('select public.send_pregnancy_weeks()')) === 0, 'Не первый день недели - молчит', 'неделя началась вчера')
  }

  // Отмена: как будто режим не включали. Сессии шевелений A удаляет и B -
  // напрямую RLS дал бы ему стереть только свои
  await db.asOwner()
  await db.q(`insert into public.pregnancy_visits (date, title, created_by) values (current_date, 'УЗИ', $1)`, [a])
  await db.q(
    `insert into public.kick_sessions (user_id, started_at, ended_at, kicks) values ($1, now() - interval '1 hour', now() - interval '50 minutes', 10)`,
    [a],
  )
  await db.q(`insert into public.pregnancy_notices (user_id, week, lmp) select $1, 12, lmp from public.pregnancy`, [a])
  await db.q(`select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true)`)
  await db.q('set local role authenticated')
  await db.mustFail('Посторонний режим не отменит', 'select public.cancel_pregnancy()', [], 'cancel_pregnancy')
  await db.as(b)
  await db.q('select public.cancel_pregnancy()')
  await db.asOwner()
  const left = await db.q<{ g: number; v: number; k: number; n: number }>(
    `select (select count(*) from public.pregnancy)::int as g, (select count(*) from public.pregnancy_visits)::int as v,
            (select count(*) from public.kick_sessions)::int as k, (select count(*) from public.pregnancy_notices)::int as n`,
  )
  const l = left[0]
  check(l?.g === 0 && l.v === 0 && l.k === 0 && l.n === 0, 'Отмена убирает всё: режим, визиты, шевеления, отметки', JSON.stringify(l))
  check((await db.q('select 1 from public.cycle_delay($1, $2::date)', [a, day])).length === 1, 'После отмены цикл снова считает задержку', 'как до режима')
})

finish('Беременность')
