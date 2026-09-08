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
 * Уведомления, наоборот, обязаны уходить на КАЖДОЕ действие и обоим - это
 * разворот прежнего решения, принятый владельцем. Проверка держит его так же,
 * как раньше держала молчание.
 *
 * И главное: «Приобретено» - не статус, который кто-то выставляет, а следствие
 * галочек. closed_at хранится ради уведомления о переходе, поэтому отдельно
 * проверяется, что хранимое совпадает с вычисляемым: разъехавшись, они дадут
 * карточку, висящую не в той вкладке, и починить это будет нечем.
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
      `insert into public.wishlist_items (wishlist_id, title, created_by, wanted_by)
       values ($1, '', $2, $2)`,
      [listId, a.user_id],
    )
    await mustFail(
      'Отметка без автора отвергается',
      `insert into public.wishlist_items (wishlist_id, title, created_by, wanted_by, done_at)
       values ($1, 'Дюна', $2, $2, now())`,
      [listId, a.user_id],
    )
    await mustFail(
      'Автор отметки без времени отвергается',
      `insert into public.wishlist_items (wishlist_id, title, created_by, wanted_by, done_by)
       values ($1, 'Дюна', $2, $2, $2)`,
      [listId, a.user_id],
    )

    const itemId = await one(
      `insert into public.wishlist_items (wishlist_id, title, created_by, wanted_by)
       values ($1, 'Дюна', $2, $2) returning id::text as v`,
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
      `insert into public.wishlist_items (wishlist_id, title, created_by, wanted_by)
       values ($1, 'Оппенгеймер', $2, $2)`,
      [listId, a.user_id],
    )
    const mine = await q(`delete from public.wishlists where id = $1 returning id`, [listId])
    check(mine.length === 1, 'Автор удаляет свой вишлист', 'вместе с пунктами')

    await client.query('reset role')
    // Считаем пункты УДАЛЁННОГО вишлиста, а не все подряд: в живой базе
    // лежат чужие карточки, и проверка, зависящая от их количества,
    // проходит или падает по причинам, к ней не относящимся
    const leftover = await q<{ title: string }>(
      `select title from public.wishlist_items where wishlist_id = $1`,
      [listId],
    )
    check(
      leftover.length === 0,
      'Пункты уходят каскадом за вишлистом',
      leftover.length === 0
        ? 'осиротевших пунктов не остаётся'
        : `осталось: ${leftover.map((l) => l.title).join(', ')}`,
    )

    // --- уведомления ------------------------------------------------------
    const queued = async (): Promise<number> =>
      Number(await one('select count(*)::text as v from net.http_request_queue'))

    // Сколько сообщений даёт одно событие: по одному на участника
    // с настроенным телеграмом
    const perEvent = Number(
      await one(
        `select count(*)::text as v from public.profiles p
           join public.app_members m on m.user_id = p.user_id
          where p.telegram_chat_id is not null`,
      ),
    )

    const l2 = await one(
      `insert into public.wishlists (title, created_by) values ('Посуда', $1) returning id::text as v`,
      [a.user_id],
    )
    const q0 = await queued()
    const i1 = await one(
      `insert into public.wishlist_items (wishlist_id, title, created_by, wanted_by)
       values ($1, 'Тарелки', $2, $2) returning id::text as v`,
      [l2, a.user_id],
    )
    check(
      (await queued()) - q0 === perEvent,
      'Добавленный пункт уведомляет обоих',
      `сообщений ${(await queued()) - q0} при ${perEvent} настроенных телеграмах`,
    )

    const i2 = await one(
      `insert into public.wishlist_items (wishlist_id, title, created_by, wanted_by)
       values ($1, 'Вилки', $2, $2) returning id::text as v`,
      [l2, a.user_id],
    )

    // --- закрытие карточки ------------------------------------------------
    const closedAt = async (): Promise<string> =>
      one('select coalesce(closed_at::text, \'-\') as v from public.wishlists where id = $1', [l2])

    check(await closedAt() === '-', 'Пока не все галочки - карточка в «Хотим»', 'closed_at пуст')

    await client.query(
      `update public.wishlist_items set done_at = now(), done_by = $2 where id = $1`,
      [i1, a.user_id],
    )
    check(await closedAt() === '-', 'Половина галочек ещё не закрывает', 'closed_at пуст')

    const q1 = await queued()
    await client.query(
      `update public.wishlist_items set done_at = now(), done_by = $2 where id = $1`,
      [i2, a.user_id],
    )
    check(await closedAt() !== '-', 'Последняя галочка закрывает карточку', await closedAt())
    check(
      (await queued()) - q1 === perEvent * 2,
      'О переходе в «Приобретено» сообщают отдельно',
      `сообщений ${(await queued()) - q1}: про пункт и про карточку`,
    )

    const q2 = await queued()
    await client.query(
      `update public.wishlist_items set done_at = null, done_by = null where id = $1`,
      [i2],
    )
    check(await closedAt() === '-', 'Снятая галочка возвращает карточку в «Хотим»', 'closed_at пуст')
    check(
      (await queued()) - q2 === perEvent * 2,
      'О возврате тоже сообщают',
      `сообщений ${(await queued()) - q2}`,
    )

    // Пустая карточка закрытой быть не может
    const empty = await one(
      `insert into public.wishlists (title, created_by) values ('Пустая', $1) returning id::text as v`,
      [a.user_id],
    )
    check(
      (await one('select coalesce(public.wishlist_closed_value($1)::text, \'-\') as v', [empty])) === '-',
      'Карточка без пунктов не считается приобретённой',
      '«все ноль пунктов выполнены» - формально правда, но человек ничего не купил',
    )

    // Хранимое обязано совпадать с вычисляемым - иначе карточка повиснет
    // не в той вкладке
    const drift = await one(
      `select count(*)::text as v from public.wishlists w
        where w.closed_at is distinct from public.wishlist_closed_value(w.id)`,
    )
    check(drift === '0', 'Хранимое closed_at совпадает с вычисляемым', `расхождений ${drift}`)

    // --- текст уведомления ------------------------------------------------
    //
    // Проверяем не «что-то ушло», а КАК оно написано: кавычки склеиваются
    // руками, и лишняя закрывающая («приобрёл Вилки» — «Посуда») видна
    // только в готовом сообщении, а не в коде.
    const lastText = async (like: string): Promise<string> =>
      one(
        `select regexp_replace(convert_from(body, 'utf8'), '^.*\"text\": \"([^\"]*)\".*$', '\\1') as v
           from net.http_request_queue
          where convert_from(body, 'utf8') like $1
          order by id desc limit 1`,
        [like],
      )

    await client.query(
      `update public.wishlist_items set done_at = now(), done_by = $2 where id = $1`,
      [i2, a.user_id],
    )
    const bought = await lastText('%приобр%')
    check(
      bought.includes('«Вилки» — «Посуда»'),
      'Пункт и карточка закавычены правильно',
      bought || 'сообщение не найдено',
    )

    const quotes = (t: string, ch: string) => [...t].filter((c) => c === ch).length
    const texts = await q<{ v: string }>(
      `select regexp_replace(convert_from(body, 'utf8'), '^.*\"text\": \"([^\"]*)\".*$', '\\1') as v
         from net.http_request_queue
        where url like '%telegram%' and convert_from(body, 'utf8') like '%text%'`,
    )
    const unbalanced = texts.filter((t) => quotes(t.v, '«') !== quotes(t.v, '»'))
    check(
      unbalanced.length === 0,
      'Кавычки во всех сообщениях парные',
      unbalanced.length === 0
        ? `проверено ${texts.length} сообщений`
        : `кривые: ${unbalanced[0]?.v ?? ''}`,
    )

    // --- порядок ----------------------------------------------------------
    const top = await one(
      `select title as v from public.wishlists order by sort_order, created_at limit 1`,
    )
    check(top === 'Пустая', 'Новая карточка встаёт сверху', `первая: ${top}`)

    // Перестановка одним вызовом: серия обновлений могла бы оборваться
    // на середине и оставить доску переставленной наполовину
    await client.query(
      `select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)`,
      [a.user_id],
    )
    const before = await q<{ id: string }>(
      `select id::text from public.wishlists order by sort_order, created_at`,
    )
    const reversed = before.map((r) => r.id).reverse()
    await client.query('select public.reorder_wishlists($1::uuid[])', [reversed])
    const after = await q<{ id: string }>(
      `select id::text from public.wishlists order by sort_order, created_at`,
    )
    check(
      after.map((r) => r.id).join(',') === reversed.join(','),
      'Перестановка применяется целиком',
      `карточек ${after.length}, порядок совпал с заданным`,
    )

    // --- кто хочет --------------------------------------------------------
    const wanted = await one(
      `select wanted_by::text as v from public.wishlist_items where id = $1`,
      [i1],
    )
    check(wanted === a.user_id, 'У пункта записан тот, кто хочет', 'ради этого поля вишлист и заводят')

    await mustFail(
      'Пункт без хотящего не пройдёт',
      `insert into public.wishlist_items (wishlist_id, title, created_by, wanted_by)
       values ($1, 'Ножи', $2, null)`,
      [l2, a.user_id],
    )

    // --- картинка на карточке, а не на пункте -----------------------------
    const onItem = await one(
      `select count(*)::text as v from information_schema.columns
        where table_schema = 'public' and table_name = 'wishlist_items'
          and column_name = 'image_path'`,
    )
    check(onItem === '0', 'У пункта картинки больше нет', 'облик есть у желания целиком, не у строки чеклиста')

    // --- картинки ---------------------------------------------------------
    const bucket = await q<{ public: boolean; limit: string; mimes: string }>(
      `select public, file_size_limit::text as limit,
              array_to_string(allowed_mime_types, ', ') as mimes
         from storage.buckets where id = 'wishlist-photos'`,
    )
    const b0 = bucket[0]
    check(b0 !== undefined, 'Бакет для картинок заведён', b0 ? 'wishlist-photos' : 'НЕТ')
    check(
      b0?.public === false,
      'Бакет приватный',
      'в приложении всё закрыто политиками, картинки не исключение',
    )
    check(
      Number(b0?.limit ?? 0) === 262144,
      'Потолок размера стоит на самом хранилище',
      `${Math.round(Number(b0?.limit ?? 0) / 1024)} КБ - клиент можно обойти, бакет нельзя`,
    )
    check(
      (b0?.mimes ?? '').includes('image/webp') && !(b0?.mimes ?? '').includes('image/png'),
      'Разрешены только сжатые форматы',
      `${b0?.mimes} - PNG для фотографии это мегабайты`,
    )

    const pol = await one(
      `select string_agg(policyname, ', ' order by policyname) as v
         from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname like 'wishlist_photos_%'`,
    )
    check(
      ['select', 'insert', 'update', 'delete'].every((op) => pol.includes(`wishlist_photos_${op}`)),
      'Политики есть на все четыре действия',
      pol || 'политик нет',
    )

    const scoped = await one(
      `select count(*)::text as v from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname like 'wishlist_photos_%'
          and coalesce(qual, '') || coalesce(with_check, '') not like '%wishlist-photos%'`,
    )
    check(
      scoped === '0',
      'Каждая политика привязана к своему бакету',
      'без bucket_id политика пустила бы к фотографиям продуктов',
    )

    const col = await one(
      `select data_type as v from information_schema.columns
        where table_schema = 'public' and table_name = 'wishlists'
          and column_name = 'image_path'`,
    )
    check(col === 'text', 'У карточки есть путь картинки', `тип ${col || 'колонки нет'}`)
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
