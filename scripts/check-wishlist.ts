/**
 * Проверка вишлиста.
 *
 *   pnpm tsx scripts/check-wishlist.ts
 *
 * Раздел стал плоским: одна запись - одно желание, уровня пунктов больше нет.
 * Проверяем то, что держится базой, а не формой.
 *
 * Категория - закрытый словарь, и он продублирован в интерфейсе. Разойдись
 * они - и человек нажмёт кнопку, а база откажет; ошибку Postgres покажет
 * форма, и виноватым будет выглядеть он. Та же ловушка, что у состояний
 * в «Как ты» и у видов уведомлений.
 *
 * Уведомления обязаны уходить обоим на каждое изменение - это решение
 * владельца, и проверка держит его так же, как раньше держала молчание.
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

    // --- уровня пунктов больше нет ---------------------------------------
    check(
      (await one(
        `select count(*)::text as v from information_schema.tables
          where table_schema = 'public' and table_name = 'wishlist_items'`,
      )) === '0',
      'Таблицы пунктов больше нет',
      'для «хочу съездить в Грузию» нижнего уровня не существует',
    )
    check(
      (await one(
        `select count(*)::text as v from information_schema.columns
          where table_schema = 'public' and table_name = 'wishlists'
            and column_name = 'closed_at'`,
      )) === '0',
      'Состояние «приобретено» убрано вместе с галочками',
      'оно держалось на них и без них не имеет опоры',
    )

    // --- словарь категорий -----------------------------------------------
    const def = await one(
      `select pg_get_constraintdef(oid) as v from pg_constraint
        where conname = 'wishlists_category_check'`,
    )
    const dbIds = [...def.matchAll(/'([a-z]+)'::text/g)].map((m) => m[1])
    const ui = readFileSync('src/features/wishlist/categories.ts', 'utf8')
    const uiIds = [...ui.matchAll(/\bid: '([a-z]+)'/g)].map((m) => m[1])
    const onlyDb = dbIds.filter((k) => !uiIds.includes(k))
    const onlyUi = uiIds.filter((k) => !dbIds.includes(k))
    check(
      onlyDb.length === 0 && onlyUi.length === 0 && uiIds.length > 0,
      'Категории в базе и в интерфейсе совпадают',
      `в базе ${dbIds.length}, в форме ${uiIds.length}` +
        (onlyDb.length ? `, только в базе: ${onlyDb.join(', ')}` : '') +
        (onlyUi.length ? `, только в форме: ${onlyUi.join(', ')}` : ''),
    )

    const ins = `insert into public.wishlists (title, details, category, created_by)
                 values ($1, $2, $3, $4)`

    await mustFail('Желание без названия отвергается', ins, ['   ', null, 'buy', a.user_id])
    await mustFail('Неизвестная категория отвергается', ins, ['Тур', null, 'мечта', a.user_id])

    // --- порядок ----------------------------------------------------------
    await client.query('delete from public.wishlists')
    const first = await one(
      `${ins} returning id::text as v`.replace('values', 'values'),
      ['Первое', null, 'buy', a.user_id],
    )
    const second = await one(
      `insert into public.wishlists (title, details, category, created_by)
       values ($1, $2, $3, $4) returning id::text as v`,
      ['Второе', 'подробности', 'visit', a.user_id],
    )
    check(
      (await one(`select title as v from public.wishlists order by sort_order, created_at limit 1`)) ===
        'Второе',
      'Новое желание встаёт сверху',
      'место в конце списка, расставленного руками, - худшее из возможных',
    )

    await client.query(
      `select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)`,
      [a.user_id],
    )
    await client.query('select public.reorder_wishlists($1::uuid[])', [[first, second]])
    check(
      (await one(`select title as v from public.wishlists order by sort_order, created_at limit 1`)) ===
        'Первое',
      'Перестановка применяется целиком',
      'одним вызовом, а не серией обновлений',
    )

    // --- уведомления ------------------------------------------------------
    const queued = async (): Promise<number> =>
      Number(await one('select count(*)::text as v from net.http_request_queue'))
    const perEvent = Number(
      await one(
        `select count(*)::text as v from public.profiles p
           join public.app_members m on m.user_id = p.user_id
          where p.telegram_chat_id is not null`,
      ),
    )

    const q0 = await queued()
    await client.query(ins, ['Грузия', 'весной', 'visit', a.user_id])
    check(
      (await queued()) - q0 === perEvent,
      'Новое желание уведомляет обоих',
      `сообщений ${(await queued()) - q0} при ${perEvent} настроенных телеграмах`,
    )

    const q1 = await queued()
    await client.query(`update public.wishlists set title = 'Армения' where id = $1`, [first])
    check((await queued()) - q1 === perEvent, 'Переименование уведомляет', 'обоим')

    const q2 = await queued()
    await client.query(`update public.wishlists set details = 'осенью' where id = $1`, [first])
    check((await queued()) - q2 === perEvent, 'Правка подробностей уведомляет', 'обоим')

    // Перестановка - не событие: сообщать «подвинул строку» было бы шумом
    const q3 = await queued()
    await client.query('select public.reorder_wishlists($1::uuid[])', [[second, first]])
    check((await queued()) === q3, 'Перестановка никого не будит', 'это не изменение желания')

    const q4 = await queued()
    await client.query(`delete from public.wishlists where id = $1`, [first])
    check((await queued()) - q4 === perEvent, 'Удаление уведомляет', 'обоим')

    const texts = await q<{ v: string }>(
      `select regexp_replace(convert_from(body, 'utf8'), '^.*\\"text\\": \\"([^\\"]*)\\".*$', '\\\\1') as v
         from net.http_request_queue
        where url like '%telegram%' and convert_from(body, 'utf8') like '%text%'`,
    )
    const quotes = (t: string, ch: string) => [...t].filter((c) => c === ch).length
    const bad = texts.filter((t) => quotes(t.v, '«') !== quotes(t.v, '»'))
    check(
      bad.length === 0,
      'Кавычки во всех сообщениях парные',
      bad.length === 0 ? `проверено ${texts.length}` : `кривое: ${bad[0]?.v ?? ''}`,
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
      (await q('select 1 from public.wishlists')).length > 0,
      'Партнёр видит чужие желания',
      'список на двоих',
    )
    const edited = await q(
      `update public.wishlists set details = 'поправил' where created_by = $1 returning id`,
      [a.user_id],
    )
    check(edited.length > 0, 'Партнёр может поправить чужое желание', 'доска общая')
    const removed = await q(`delete from public.wishlists where created_by = $1 returning id`, [
      a.user_id,
    ])
    check(
      removed.length === 0,
      'Партнёр НЕ удаляет чужое желание',
      'убрать хотелку может только тот, кто её захотел',
    )

    await client.query('reset role')

    // --- картинки ---------------------------------------------------------
    const bucket = await q<{ public: boolean; limit: string; mimes: string }>(
      `select public, file_size_limit::text as limit,
              array_to_string(allowed_mime_types, ', ') as mimes
         from storage.buckets where id = 'wishlist-photos'`,
    )
    const b0 = bucket[0]
    check(b0?.public === false, 'Бакет картинок приватный', 'как и всё остальное в приложении')
    check(
      Number(b0?.limit ?? 0) === 262144 && (b0?.mimes ?? '').includes('image/webp'),
      'Потолок и форматы стоят на хранилище',
      `${Math.round(Number(b0?.limit ?? 0) / 1024)} КБ, ${b0?.mimes}`,
    )
    check(
      (await one(
        `select data_type as v from information_schema.columns
          where table_schema = 'public' and table_name = 'wishlists' and column_name = 'image_path'`,
      )) === 'text',
      'Картинка привязана к самому желанию',
      'уровня пунктов, где она лежала раньше, больше нет',
    )
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nВишлист верен.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
