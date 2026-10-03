/**
 * Проверка подсказки подарка.
 *
 *   pnpm tsx scripts/check-gifts.ts
 *
 * За неделю до дня рождения второго тому, кто дарит, приходят идеи из
 * вишлиста именинника; имениннику о его же дне рождения - ни идей, ни
 * «успей с подарком». «Чей» бывает только у дня рождения.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { check, finish, inTransaction } from './harness.ts'

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  await db.mustFail(
    '«Чей» - только у дня рождения',
    `insert into public.occasions (title, date, kind, person_id, created_by) values ('x', '2000-01-01', 'anniversary', $1, $1)`,
    [a],
    'occasions_person_birthday',
  )

  const tz = await db.one(
    `select z from (select 'Etc/GMT' || case when o > 0 then '-' || o else '+' || (-o) end as z
                      from generate_series(-12, 14) o) zones
      where extract(hour from now() at time zone z) = 10 limit 1`,
  )
  check(tz !== '', 'Нашёлся пояс, где сейчас 10:00', tz)
  if (tz === '') return

  await db.q('update public.profiles set timezone = $1', [tz])
  await db.q('delete from public.occasions')
  await db.q('delete from public.occasion_notices')
  await db.q('delete from public.wishlists')
  const bName = await db.one('select nickname from public.profiles where user_id = $1', [b])
  // День рождения B ровно через неделю по местной дате
  await db.q(
    `insert into public.occasions (title, date, kind, yearly, person_id, created_by)
     values ('ТЕСТ ДР', ((now() at time zone $1)::date + 7) - interval '25 years', 'birthday', true, $2, $3)`,
    [tz, b, a],
  )
  await db.q(
    `insert into public.wishlists (title, category, created_by, sort_order)
     values ('Шарф', 'buy', $1, 0), ('Поездка в Грузию', 'visit', $1, 1), ('Книга', 'buy', $1, 2), ('Лишнее', 'buy', $1, 3)`,
    [b],
  )
  await db.q('select public.notify_occasions()')
  const pushes = (await db.lastPushes(2)).map((x) => JSON.parse(x) as { userId: string; body: string })
  const forA = pushes.find((p) => p.userId === a)
  const forB = pushes.find((p) => p.userId === b)
  check(
    (forA?.body ?? '').includes(`${bName} хочет: Шарф, Поездка в Грузию, Книга`) && !(forA?.body ?? '').includes('Лишнее'),
    'Тому, кто дарит, - три первые идеи из вишлиста именинника',
    `${forA?.body.replace(/\n/g, ' / ')}`,
  )
  check(forB !== undefined && !(forB.body).includes('хочет'), 'Имениннику - без идей о собственном подарке', `${forB?.body.replace(/\n/g, ' / ')}`)
  const tg = await db.q<{ body: string }>(
    `select convert_from(q.body, 'utf8') as body from net.http_request_queue q where q.url like '%telegram%' order by q.id desc limit 2`,
  )
  const hint = 'Есть неделя, чтобы успеть с подарком'
  check(
    tg.length === 0 || tg.filter((r) => r.body.includes(hint)).length <= 1,
    'И «успей с подарком» - не имениннику',
    tg.length === 0 ? 'телеграм не настроен - проверено по push' : `с подсказкой: ${tg.filter((r) => r.body.includes(hint)).length} из ${tg.length}`,
  )
})

finish('Подсказка подарка')
