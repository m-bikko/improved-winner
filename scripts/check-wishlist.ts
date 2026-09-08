/**
 * Проверка вишлистов.
 *
 *   pnpm tsx scripts/check-wishlist.ts
 *
 * Проверяем ровно то, что отличает вишлисты от задач и держится не формой,
 * а базой.
 *
 * Права разные на двух уровнях. Пункт общий целиком - второй должен мочь
 * вычеркнуть и стереть чужой, иначе вишлист на двоих превращается в две
 * личные записки. А сам вишлист удаляет только заводивший: вместе с ним
 * каскадом уходят и чужие пункты.
 *
 * Уведомлений нет намеренно. Проверка на молчание выглядит странно ровно
 * до того дня, когда кто-нибудь добавит триггер «для симметрии с задачами»
 * и вечернее накидывание десяти фильмов превратится в десять пушей.
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

  const mustFail = async (name: string, sql: string, p: unknown[] = []): Promise<void> => {
    await client.query('savepoint s')
    try {
      await client.query(sql, p)
      await client.query('rollback to savepoint s')
      check(false, name, 'прошло, хотя должно было упасть')
    } catch (e) {
      await client.query('rollback to savepoint s')
      check(true, name, (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? '')
    }
  }

  try {
    await client.query('begin')

    const members = await q<{ user_id: string }>(
      'select user_id from public.app_members order by user_id',
    )
    const [a, b] = members
    if (!a || !b) throw new Error('Нужны два участника')

    await mustFail(
      'Вишлист без названия отвергается',
      `insert into public.wishlists (title, created_by) values ('  ', $1)`,
      [a.user_id],
    )

    const listId = await one(
      `insert into public.wishlists (title, created_by) values ('Что посмотреть', $1) returning id::text as v`,
      [a.user_id],
    )

    await mustFail(
      'Пункт без названия отвергается',
      `insert into public.wishlist_items (wishlist_id, title, created_by) values ($1, '', $2)`,
      [listId, a.user_id],
    )
    await mustFail(
      'Отметка без автора отвергается',
      `insert into public.wishlist_items (wishlist_id, title, created_by, done_at)
       values ($1, 'Дюна', $2, now())`,
      [listId, a.user_id],
    )
    await mustFail(
      'Автор отметки без времени отвергается',
      `insert into public.wishlist_items (wishlist_id, title, created_by, done_by)
       values ($1, 'Дюна', $2, $2)`,
      [listId, a.user_id],
    )

    const itemId = await one(
      `insert into public.wishlist_items (wishlist_id, title, created_by)
       values ($1, 'Дюна', $2) returning id::text as v`,
      [listId, a.user_id],
    )

    // --- права ------------------------------------------------------------
    await client.query('set local role authenticated')
    const as = async (uid: string): Promise<void> => {
      await client.query(
        `select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)`,
        [uid],
      )
    }

    await as(b.user_id)
    check(
      (await q(`select 1 from public.wishlists where id = $1`, [listId])).length === 1,
      'Партнёр видит чужой вишлист',
      'вишлист на двоих',
    )

    await client.query(
      `update public.wishlist_items set done_at = now(), done_by = $2 where id = $1`,
      [itemId, b.user_id],
    )
    check(
      (await one(`select done_by::text as v from public.wishlist_items where id = $1`, [itemId])) ===
        b.user_id,
      'Партнёр вычёркивает чужой пункт',
      'иначе вишлист на двоих - это две личные записки',
    )

    const gone = await q(`delete from public.wishlist_items where id = $1 returning id`, [itemId])
    check(gone.length === 1, 'Партнёр удаляет чужой пункт', 'неактуальное вычёркивает любой')

    const notMine = await q(`delete from public.wishlists where id = $1 returning id`, [listId])
    check(
      notMine.length === 0,
      'Партнёр НЕ удаляет чужой вишлист',
      'вместе с вишлистом каскадом ушли бы и чужие пункты',
    )

    await as(a.user_id)
    await client.query(
      `insert into public.wishlist_items (wishlist_id, title, created_by) values ($1, 'Оппенгеймер', $2)`,
      [listId, a.user_id],
    )
    const mine = await q(`delete from public.wishlists where id = $1 returning id`, [listId])
    check(mine.length === 1, 'Автор удаляет свой вишлист', 'вместе с пунктами')

    await client.query('reset role')
    check(
      Number(await one('select count(*)::text as v from public.wishlist_items')) === 0,
      'Пункты уходят каскадом за вишлистом',
      'осиротевших пунктов не остаётся',
    )

    // --- молчание ---------------------------------------------------------
    const queued = async (): Promise<number> =>
      Number(await one('select count(*)::text as v from net.http_request_queue'))

    const l2 = await one(
      `insert into public.wishlists (title, created_by) values ('Куда сходить', $1) returning id::text as v`,
      [a.user_id],
    )
    const before = await queued()
    for (const title of ['Кофейня', 'Выставка', 'Горы']) {
      await client.query(
        `insert into public.wishlist_items (wishlist_id, title, created_by) values ($1, $2, $3)`,
        [l2, title, a.user_id],
      )
    }
    check(
      (await queued()) === before,
      'Пополнение вишлиста никого не будит',
      'три пункта подряд - ноль уведомлений, и это решение, а не упущение',
    )
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nВишлисты верны.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
