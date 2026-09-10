/**
 * Проверка писем в будущее.
 *
 *   pnpm tsx scripts/check-letters.ts
 *
 * Главное свойство раздела - НЕВИДИМОСТЬ ДО СРОКА, и не только для адресата.
 * Автор тоже не видит своё запечатанное письмо: раздел «В пути» со списком
 * портил сюрприз ему самому, а для письма «обоим» обессмысливал затею -
 * написал и тут же перечитываешь.
 *
 * Проверять это надо политикой, а не экраном: экран обходится открытием
 * консоли.
 *
 * Второе - доставка по адресатам. Отметка «отправлено» одна на письмо
 * работает ровно до тех пор, пока оба в одном поясе; стоит одному уехать,
 * и письмо «обоим» закроется после первого получателя.
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

    await client.query('delete from public.letters')

    await mustFail(
      'Пустое письмо отвергается',
      `insert into public.letters (author_id, deliver_on, body) values ($1, '2027-01-01', '   ')`,
      [a.user_id],
    )
    await mustFail(
      'Неизвестный адресат отвергается',
      `insert into public.letters (author_id, deliver_on, body, audience)
       values ($1, '2027-01-01', 'привет', 'всем')`,
      [a.user_id],
    )

    const toPartner = await one(
      `insert into public.letters (author_id, deliver_on, body, audience)
       values ($1, '2027-01-01', 'Держись, всё будет', 'partner') returning id::text as v`,
      [a.user_id],
    )
    const toBoth = await one(
      `insert into public.letters (author_id, deliver_on, body, audience)
       values ($1, '2027-01-01', 'Что мы думали в 2026-м', 'both') returning id::text as v`,
      [a.user_id],
    )

    check(
      (await one('select string_agg(r::text, \',\' order by r::text) as v from public.letter_recipients($1) r', [toPartner])) === b.user_id,
      'Письмо партнёру адресовано только ему',
      'автору своё письмо не приходит',
    )
    check(
      (await q('select 1 from public.letter_recipients($1)', [toBoth])).length === members.length,
      'Письмо «обоим» адресовано всем',
      '«через год посмотрим, что мы думали» - это и себе тоже',
    )

    // --- невидимость до срока ---------------------------------------------
    await client.query('set local role authenticated')
    const as = async (uid: string): Promise<void> => {
      await client.query(
        `select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)`,
        [uid],
      )
    }

    await as(b.user_id)
    check(
      (await q('select 1 from public.letters')).length === 0,
      'ДО доставки адресат не видит письма',
      'иначе это не письмо в будущее',
    )

    await as(a.user_id)
    check(
      (await q('select 1 from public.letters')).length === 0,
      'Автор НЕ видит своё запечатанное письмо',
      'иначе «В пути» портит сюрприз тому, кто его и готовил',
    )
    check(
      Number(await one('select public.letters_in_flight()::text as v')) === 2,
      'Но знает, сколько своих писем в пути',
      'без этого числа написанное исчезает в никуда',
    )

    await client.query('reset role')
    await client.query(
      `insert into public.letter_deliveries (letter_id, user_id) values ($1, $2)`,
      [toPartner, b.user_id],
    )
    await client.query('set local role authenticated')
    await as(b.user_id)
    check(
      (await q('select 1 from public.letters')).length === 1,
      'ПОСЛЕ доставки адресат видит своё письмо',
      'и только своё - второе ему ещё не доставлено',
    )
    check(
      Number(await one('select public.letters_in_flight()::text as v')) === 0,
      'Чужие письма в число «в пути» не попадают',
      'узнать, что партнёр что-то написал, - уже спойлер',
    )

    // --- правка после отправки --------------------------------------------
    await client.query('reset role')
    await client.query('update public.letters set delivered_at = now() where id = $1', [toPartner])
    await client.query('set local role authenticated')
    await as(a.user_id)

    const edited = await q(
      `update public.letters set body = 'подменил' where id = $1 returning id`,
      [toPartner],
    )
    check(
      edited.length === 0,
      'Отправленное письмо править нельзя',
      'менять прочитанное задним числом - переписывать чужую память',
    )
    const removed = await q(`delete from public.letters where id = $1 returning id`, [toPartner])
    check(removed.length === 0, 'Отправленное письмо удалить нельзя', 'то же правило')

    // Право на отзыв запечатанного СОХРАНЕНО, хотя через интерфейс
    // недостижимо: увидеть id негде. «Сгоряча написал» случается, и
    // запечатывание должно быть трудно обратимым, а не невозможным
    /*
     * Запечатанное письмо недостижимо и на изменение.
     *
     * Политика letters_update по-прежнему разрешает правку автору до срока,
     * но UPDATE с условием WHERE требует ещё и прав на ЧТЕНИЕ - строку надо
     * сначала найти. letters_select запечатанное не показывает, и команда
     * находит ноль строк, не сообщая об отказе.
     *
     * Проверяем без RETURNING: он сам требует чтения, и нулевой результат
     * сказал бы не о том, разрешена ли правка, а о том, видно ли строку.
     */
    await client.query(`update public.letters set body = 'попытка отзыва' where id = $1`, [toBoth])
    await client.query('reset role')
    check(
      (await one('select body as v from public.letters where id = $1', [toBoth])) !==
        'попытка отзыва',
      'Запечатанное письмо не изменить даже автору',
      'письмо в будущее, которое можно отозвать, - черновик с отложенной доставкой',
    )
    await client.query('set local role authenticated')

    await client.query('reset role')

    // --- рассылка ---------------------------------------------------------
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

    const nine = await zone(9)
    const other = await zone(15)

    if (nine && other) {
      await client.query('delete from public.letter_deliveries')
      await client.query('update public.letters set delivered_at = null, deliver_on = current_date')
      await client.query('update public.profiles set timezone = $1', [other])

      const q0 = await queued()
      await client.query('select public.deliver_letters()')
      check((await queued()) === q0, 'В неурочный час писем нет', other)

      await client.query('update public.profiles set timezone = $1', [nine])
      const q1 = await queued()
      const n1 = Number(await one('select public.deliver_letters()::text as v'))
      // Письмо партнёру - одному, письмо обоим - двоим: три доставки,
      // каждая двумя каналами
      check(
        n1 === members.length + 1,
        'В 9 утра письма уходят своим адресатам',
        `доставок ${n1}, ожидалось ${members.length + 1} (одному + обоим)`,
      )
      check(
        (await queued()) - q1 === (members.length + 1) * 2,
        'Каждое письмо идёт двумя каналами',
        `запросов ${(await queued()) - q1}`,
      )

      const q2 = await queued()
      await client.query('select public.deliver_letters()')
      check((await queued()) === q2, 'Повторный запуск молчит', 'задание идёт каждый час')

      check(
        (await one(`select count(*)::text as v from public.letters where delivered_at is null`)) === '0',
        'Письмо закрывается, когда его получили ВСЕ адресаты',
        'а не первый попавшийся',
      )

      const body = await one(
        `select convert_from(body, 'utf8') as v from net.http_request_queue
          where convert_from(body, 'utf8') like '%написано%' order by id desc limit 1`,
      )
      check(body !== '', 'В письме сказано, когда оно написано', body.slice(0, 110) || 'не найдено')
    }

    // --- снимок запечатан вместе с письмом --------------------------------
    //
    // Общая политика бакета «видят участники» тут не годится: партнёр смог бы
    // перечислить объекты и увидеть картинку до срока, обойдя запечатывание
    // с чёрного хода. Поэтому чтение проверяет доставку конкретного письма.
    const bucket = await q<{ public: boolean; limit: string }>(
      `select public, file_size_limit::text as limit
         from storage.buckets where id = 'letter-photos'`,
    )
    check(
      bucket[0]?.public === false && Number(bucket[0]?.limit ?? 0) === 262144,
      'Бакет для снимков приватный, с потолком',
      `${Math.round(Number(bucket[0]?.limit ?? 0) / 1024)} КБ`,
    )

    const readPolicy = await one(
      `select coalesce(qual, '') as v from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'letter_photos_select'`,
    )
    check(
      readPolicy.includes('letter_delivered_to_me'),
      'Чтение снимка спрашивает про доставку, а не про членство',
      'иначе партнёр увидел бы картинку, перечислив объекты бакета',
    )

    await client.query('reset role')
    await client.query('delete from public.letter_deliveries')
    await client.query('update public.letters set delivered_at = null')
    const sealedLetter = await one('select id::text as v from public.letters limit 1')
    await client.query('set local role authenticated')
    await as(b.user_id)
    check(
      (await one('select public.letter_delivered_to_me($1)::text as v', [sealedLetter])) === 'false',
      'До доставки снимок закрыт адресату',
      'запечатано - значит и картинка тоже',
    )
    await as(a.user_id)
    check(
      (await one('select public.letter_delivered_to_me($1)::text as v', [sealedLetter])) === 'false',
      'И автору тоже',
      'иначе автор перечитывал бы своё письмо снимком',
    )
    await client.query('reset role')
    await client.query(
      `insert into public.letter_deliveries (letter_id, user_id) values ($1, $2)`,
      [sealedLetter, b.user_id],
    )
    await client.query('set local role authenticated')
    await as(b.user_id)
    check(
      (await one('select public.letter_delivered_to_me($1)::text as v', [sealedLetter])) === 'true',
      'После доставки снимок открывается',
      'ровно тому, кому письмо пришло',
    )
    await client.query('reset role')

    const job = await one(`select schedule as v from cron.job where jobname = 'letters'`)
    check(job === '0 * * * *', 'Задание стоит в расписании', job || 'нет задания')
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nПисьма верны.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
