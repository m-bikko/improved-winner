/**
 * Проверка огоньков: серия дней, восстановление пропуска, вечернее
 * напоминание и уведомление партнёру об отметке.
 *
 *   pnpm tsx scripts/check-checkin-streak.ts
 *
 * Почему это отдельная проверка, а не «и так видно».
 *
 * Огонёк - число, которое человек видит каждый день и которому верит.
 * Он не хранится, а считается из отметок, и вся его правдивость держится
 * на одном запросе с gaps-and-islands. Ошибись он на день - интерфейс
 * покажет уверенное неправильное число, и заметить это будет нечем.
 *
 * Восстановление - единственное место в приложении, где человек получает
 * ограниченный ресурс: два раза в месяц. Ограничение выражено уникальным
 * индексом по (месяц, номер), а не счётчиком, и проверять надо именно то,
 * что третья попытка ПАДАЕТ.
 *
 * Всё идёт в транзакции и откатывается.
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

  const q = async <T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> =>
    (await client.query<T>(sql, params)).rows

  const one = async (sql: string, params: unknown[] = []): Promise<string> =>
    (await q<{ v: string }>(sql, params))[0]?.v ?? ''

  const mustFail = async (name: string, sql: string, params: unknown[] = []): Promise<void> => {
    await client.query('savepoint s')
    try {
      await client.query(sql, params)
      await client.query('rollback to savepoint s')
      check(false, name, 'прошло, хотя должно было упасть')
    } catch (e) {
      await client.query('rollback to savepoint s')
      check(true, name, (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? '')
    }
  }

  try {
    await client.query('begin')
    // Настоящие настройки людей - не условие проверки: кто-то выключил
    // этот вид уведомлений или поставил тихие часы, и проверка падала,
    // хотя рассылка исправна. В транзакции сбрасываем, откат вернёт как было
    await client.query('delete from public.notification_settings')
    await client.query('update public.profiles set quiet_from = null, quiet_to = null')

    const members = await q<{ user_id: string }>(
      'select user_id from public.app_members order by user_id',
    )
    const [a, b] = members
    if (!a || !b) throw new Error('Нужны два участника')

    // Чистый мир: серия считается по всем отметкам человека, поэтому живые
    // данные исказили бы любую арифметику
    await client.query('delete from public.checkins')
    await client.query('delete from public.checkin_restores')

    const TODAY = '2026-05-20'
    const mark = async (date: string, who = a.user_id): Promise<void> => {
      await client.query(
        `insert into public.checkins (user_id, date, states) values ($1, $2, array['joy'])`,
        [who, date],
      )
    }
    // checkin_streak - внутренняя функция: клиент зовёт checkin_streaks, а саму
    // её роль authenticated не вызывает. Поэтому считаем под владельцем базы,
    // а потом возвращаемся в роль, в которой шла проверка
    let asUser = false
    const streak = async (date = TODAY, who = a.user_id): Promise<number> => {
      if (asUser) await client.query('reset role')
      const v = Number(await one('select public.checkin_streak($1, $2)::text as v', [who, date]))
      if (asUser) await client.query('set local role authenticated')
      return v
    }

    // --- Арифметика серии -------------------------------------------------

    check(await streak() === 0, 'Пустая история - огонька нет', 'отметок нет, серия 0')

    for (const d of ['16', '17', '18', '19', '20']) await mark(`2026-05-${d}`)
    check(await streak() === 5, 'Пять дней подряд дают пятёрку', 'серия 5')

    await client.query(`delete from public.checkins where user_id = $1 and date = '2026-05-18'`, [
      a.user_id,
    ])
    check(await streak() === 2, 'Пропуск обрывает серию', '19 и 20 остались - серия 2')

    // Сегодня ещё не отмечен - серия не должна гаснуть до полуночи
    await client.query(`delete from public.checkins where user_id = $1 and date = '2026-05-20'`, [
      a.user_id,
    ])
    check(await streak() === 1, 'Днём серия не гаснет', 'якорь уезжает на вчера, серия 1')

    await client.query(`delete from public.checkins where user_id = $1 and date = '2026-05-19'`, [
      a.user_id,
    ])
    check(await streak() === 0, 'Два пустых дня подряд гасят огонёк', 'серия 0')

    // Серии раздельные: чужие отметки в свою не попадают
    await mark('2026-05-20', b.user_id)
    check(await streak() === 0, 'Огонёк партнёра не греет мой', 'у меня по-прежнему 0')
    check(await streak(TODAY, b.user_id) === 1, 'У партнёра свой огонёк', 'серия 1')

    // --- Восстановление ---------------------------------------------------

    await client.query('delete from public.checkins')
    for (const d of ['16', '17', '19', '20']) await mark(`2026-05-${d}`)
    check(await streak() === 2, 'Дыра 18-го обрывает серию', 'серия 2 до восстановления')

    await client.query('set local role authenticated')
    asUser = true
    const as = async (uid: string): Promise<void> => {
      await client.query(
        `select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)`,
        [uid],
      )
    }
    await as(a.user_id)

    const restorable = await q<{ date: Date; month_left: number }>(
      'select date, month_left from public.checkin_restorable($1)',
      [TODAY],
    )
    const gaps = restorable.map((r) => String(r.date.getDate()))
    check(
      gaps.includes('18') && !gaps.includes('20') && !gaps.includes('19'),
      'Восстановить предлагают только дыры',
      `предложено: ${gaps.join(', ') || 'ничего'} (окно - неделя)`,
    )
    check(
      restorable[0]?.month_left === 2,
      'В начале месяца две попытки',
      `осталось ${restorable[0]?.month_left}`,
    )

    await client.query('select public.restore_checkin_day($1, $2)', ['2026-05-18', TODAY])
    check(await streak() === 5, 'Восстановление лечит серию', 'серия снова 5')

    const slots = await one(
      `select string_agg(slot::text, ',' order by slot) as v from public.checkin_restores
        where user_id = $1`,
      [a.user_id],
    )
    check(slots === '1', 'Занят первый слот месяца', `слоты: ${slots}`)

    await mustFail('Сегодня восстановить нельзя', 'select public.restore_checkin_day($1, $2)', [
      TODAY,
      TODAY,
    ])
    await mustFail('Будущее восстановить нельзя', 'select public.restore_checkin_day($1, $2)', [
      '2026-05-21',
      TODAY,
    ])
    await mustFail(
      'Старше недели восстановить нельзя',
      'select public.restore_checkin_day($1, $2)',
      ['2026-05-01', TODAY],
    )
    await mustFail(
      'День с отметкой восстановить нельзя',
      'select public.restore_checkin_day($1, $2)',
      ['2026-05-19', TODAY],
    )
    await mustFail(
      'Дважды один день восстановить нельзя',
      'select public.restore_checkin_day($1, $2)',
      ['2026-05-18', TODAY],
    )

    // Второй раз можно, третий - нет
    await client.query(`delete from public.checkins where user_id = $1 and date = '2026-05-17'`, [
      a.user_id,
    ])
    await client.query('select public.restore_checkin_day($1, $2)', ['2026-05-17', TODAY])
    check(true, 'Вторая попытка в месяце проходит', 'слоты 1 и 2 заняты')

    await client.query(`delete from public.checkins where user_id = $1 and date = '2026-05-16'`, [
      a.user_id,
    ])
    await mustFail(
      'Третья попытка в месяце отвергается',
      'select public.restore_checkin_day($1, $2)',
      ['2026-05-16', TODAY],
    )

    // Лимит месячный, а не вечный: в соседнем месяце счётчик свой
    const left = await q<{ month_left: number }>(
      'select month_left from public.checkin_restorable($1)',
      [TODAY],
    )
    check(
      left.every((r) => r.month_left === 0),
      'Счётчик показывает, что попыток не осталось',
      `осталось: ${[...new Set(left.map((r) => r.month_left))].join(', ')}`,
    )

    await mustFail(
      'Прямая вставка восстановления запрещена',
      `insert into public.checkin_restores (user_id, date, slot) values ($1, '2026-04-10', 1)`,
      [a.user_id],
    )
    // Лимит персональный: у партнёра свои две попытки
    await as(b.user_id)
    const leftB = await q<{ month_left: number }>(
      'select month_left from public.checkin_restorable($1)',
      [TODAY],
    )
    check(
      leftB.every((r) => r.month_left === 2),
      'Попытки считаются каждому свои',
      `у партнёра осталось ${[...new Set(leftB.map((r) => r.month_left))].join(', ')}`,
    )

    await client.query('reset role')

    // --- Уведомление партнёру об отметке ----------------------------------

    const queued = async (): Promise<number> =>
      Number(await one('select count(*)::text as v from net.http_request_queue'))

    const tgReady = Number(
      await one(
        `select count(*)::text as v from public.profiles p
           join public.app_members m on m.user_id = p.user_id
          where p.user_id <> $1 and p.telegram_chat_id is not null`,
        [a.user_id],
      ),
    )
      ? 1
      : 0
    const pushReady = Number(
      await one(
        `select count(*)::text as v from vault.decrypted_secrets
          where name in ('push_endpoint_url', 'push_shared_secret')`,
      ),
    ) === 2
      ? 1
      : 0
    const expect = tgReady + pushReady

    await client.query('delete from public.checkin_notices')
    const before = await q<{ n: string }>('select 1 as n')
    void before
    const b0 = await queued()
    await mark('2026-05-14')
    const sent = (await queued()) - b0
    check(
      sent === expect,
      'Отметка уходит партнёру',
      `запросов ${sent}, ожидалось ${expect} (телеграм ${tgReady}, push ${pushReady})`,
    )

    const b1 = await queued()
    await client.query(
      `update public.checkins set states = array['sad'] where user_id = $1 and date = '2026-05-14'`,
      [a.user_id],
    )
    check(
      (await queued()) === b1,
      'Правка в течение получаса не будит второй раз',
      'порог 30 минут держит поток редактирований',
    )

    await client.query(
      `update public.checkin_notices set notified_at = now() - interval '2 hours'
        where user_id = $1`,
      [a.user_id],
    )
    const b2 = await queued()
    await client.query(
      `update public.checkins set states = array['joy'] where user_id = $1 and date = '2026-05-14'`,
      [a.user_id],
    )
    check(
      (await queued()) - b2 === expect,
      'Правка через два часа приходит',
      'изменение самочувствия за день - тоже событие',
    )

    await client.query(
      `update public.checkin_notices set notified_at = now() - interval '2 hours'
        where user_id = $1`,
      [a.user_id],
    )
    const b3 = await queued()
    await client.query(
      `update public.checkins set states = array['joy'] where user_id = $1 and date = '2026-05-14'`,
      [a.user_id],
    )
    check(
      (await queued()) === b3,
      'Правка без изменений молчит',
      'сохранение того же самого - не событие',
    )

    // Текст зовёт в приложение, а не пересказывает его
    const body = await one(
      `select convert_from(body, 'utf8') as v from net.http_request_queue
        where convert_from(body, 'utf8') like '%чувствует%' order by id desc limit 1`,
    )
    check(
      body.includes('приложении'),
      'Уведомление зовёт в приложение',
      body ? body.slice(0, 120) : 'сообщение не найдено',
    )

    // --- Вечернее напоминание --------------------------------------------

    const zone = async (hour: number): Promise<string | null> =>
      (
        await q<{ name: string }>(
          `select name from pg_timezone_names
            where extract(hour from now() at time zone name)::int = $1
              and name like '%/%' order by name limit 1`,
          [hour],
        )
      )[0]?.name ?? null

    const evening = await zone(22)
    const other = await zone(15)

    if (evening && other) {
      await client.query('delete from public.checkin_asks')
      await client.query('update public.profiles set timezone = $1', [other])
      const q0 = await queued()
      await client.query('select public.ask_checkins_evening()')
      check((await queued()) === q0, 'В неурочный час вечером молчит', `${other}`)

      await client.query('update public.profiles set timezone = $1', [evening])
      await client.query(`delete from public.checkins where date = (now() at time zone $1)::date`, [
        evening,
      ])
      const q1 = await queued()
      const n1 = Number(await one('select public.ask_checkins_evening()::text as v'))
      check(
        n1 === members.length && (await queued()) - q1 === members.length * 2,
        'В 22:00 напоминает не отметившимся',
        `разослано ${n1}, запросов ${(await queued()) - q1}`,
      )

      const q2 = await queued()
      await client.query('select public.ask_checkins_evening()')
      check((await queued()) === q2, 'Повтор в тот же вечер молчит', 'задание идёт каждый час')

      await client.query('delete from public.checkin_asks')
      await client.query(
        `insert into public.checkins (user_id, date, states)
         values ($1, (now() at time zone $2)::date, array['joy'])`,
        [a.user_id, evening],
      )
      const q3 = await queued()
      const n2 = Number(await one('select public.ask_checkins_evening()::text as v'))
      check(
        n2 === members.length - 1,
        'Отметившемуся вечером не пишут',
        `напомнили ${n2} из ${members.length}`,
      )
      void q3

      // В тексте должен быть огонёк, которым человек рискует
      const evBody = await one(
        `select convert_from(body, 'utf8') as v from net.http_request_queue
          where convert_from(body, 'utf8') like '%гонёк%' order by id desc limit 1`,
      )
      check(evBody !== '', 'Вечерний текст говорит про огонёк', evBody.slice(0, 140) || 'не найден')
    }

    // Расписание
    const jobs = await one(
      `select string_agg(jobname || ' ' || schedule, '; ' order by jobname) as v
         from cron.job where jobname like 'checkin%'`,
    )
    check(
      jobs.includes('checkin-asks 0 * * * *') && jobs.includes('checkin-asks-evening 0 * * * *'),
      'Оба задания стоят в расписании',
      jobs,
    )
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nОгоньки верны.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
