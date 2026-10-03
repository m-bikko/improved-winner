/**
 * Проверка брони подарка.
 *
 * Владелец желания брони не видит вовсе; забронировать своё нельзя (иначе
 * по ошибке видно, что бронь есть). Удалил владелец желание - бронировавшему
 * уведомление, подаренное - молча. В напоминании за неделю до дня рождения
 * вместо трёх идей - «ты даришь: ...», а подаренное оттуда уходит.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { check, finish, inTransaction } from './harness.ts'

type Push = { userId: string; title: string; body: string; url: string }

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  await db.q('delete from public.wishlists')
  const pushes = async (n: number): Promise<Push[]> => (await db.lastPushes(n)).map((x) => JSON.parse(x) as Push)

  const [w1, w2, w3] = (
    await db.q<{ id: string }>(
      `insert into public.wishlists (title, category, created_by, sort_order)
       values ('Шарф', 'buy', $1, 0), ('Поездка в Грузию', 'visit', $1, 1), ('Книга', 'buy', $1, 2) returning id::text`,
      [b],
    )
  ).map((r) => r.id)
  const own = await db.one(`insert into public.wishlists (title, category, created_by) values ('Своё', 'buy', $1) returning id::text`, [a])

  await db.as(a)
  await db.q('insert into public.wish_reservations (wish_id) values ($1), ($2)', [w2, w3])
  await db.mustFail('Своё желание не забронировать', 'insert into public.wish_reservations (wish_id) values ($1)', [own], 'row-level security')
  check((await db.q('select 1 from public.wish_reservations')).length === 2, 'Свои брони видны', '2')

  await db.as(b)
  check((await db.q('select 1 from public.wish_reservations')).length === 0, 'Владелец желаний брони не видит', 'сюрприз не раскрыт')
  await db.mustFail(
    'И не узнает о ней, пытаясь забронировать своё',
    'insert into public.wish_reservations (wish_id) values ($1)',
    [w2],
    'row-level security',
  )

  // Владелец удалил забронированное - бронировавшему
  const before = await db.queued()
  await db.q('delete from public.wishlists where id = $1', [w3])
  const p1 = await pushes(1)
  check(
    (await db.queued()) > before && p1[0]?.userId === a && p1[0]?.body.includes('«Книга»') === true && p1[0]?.url === '/wishlist',
    'Удалил забронированное - бронировавшему уведомление',
    `${p1[0]?.body}`,
  )
  const goneNotices = async (): Promise<number> =>
    Number(
      await db.one(
        `select count(*) from net.http_request_queue q
          where q.url like '%/api/push' and convert_from(q.body, 'utf8') like '%твой подарок%'`,
      ),
    )
  const quiet = await goneNotices()
  await db.q('delete from public.wishlists where id = $1', [w1])
  check((await goneNotices()) === quiet, 'Незабронированное удаляется без «это был твой подарок»', '0')

  // Напоминание за неделю: «ты даришь»
  await db.asOwner()
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
  await db.q(
    `insert into public.wishlists (title, category, created_by, sort_order) values ('Шапка', 'buy', $1, 5), ('Перчатки', 'buy', $1, 6)`,
    [b],
  )
  await db.q(
    `insert into public.occasions (title, date, kind, yearly, person_id, created_by)
     values ('ТЕСТ ДР', ((now() at time zone $1)::date + 7) - interval '25 years', 'birthday', true, $2, $3)`,
    [tz, b, a],
  )
  await db.q('select public.notify_occasions()')
  const forA = (await pushes(2)).find((p) => p.userId === a)
  check(
    (forA?.body ?? '').includes('Ты даришь: Поездка в Грузию') && !(forA?.body ?? '').includes('хочет'),
    'За неделю - «ты даришь» вместо идей',
    `${forA?.body.replace(/\n/g, ' / ')}`,
  )

  // Подарено - напоминание снова предлагает идеи
  await db.q('delete from public.occasion_notices')
  await db.q('update public.wish_reservations set gifted_on = (now() at time zone $1)::date where wish_id = $2', [tz, w2])
  await db.q('select public.notify_occasions()')
  const again = (await pushes(2)).find((p) => p.userId === a)
  check(
    (again?.body ?? '').includes('хочет: Шапка, Перчатки') && !(again?.body ?? '').includes('Грузию'),
    'Подаренное уходит из напоминаний - и из идей',
    `${again?.body.replace(/\n/g, ' / ')}`,
  )
  const gifted = await goneNotices()
  await db.as(b)
  await db.q('delete from public.wishlists where id = $1', [w2])
  check((await goneNotices()) === gifted, 'Удалил уже подаренное - без уведомления', 'подарок вручён')
})

finish('Бронь подарка')
