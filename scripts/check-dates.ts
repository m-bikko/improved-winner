/**
 * Проверка важных дат.
 *
 *   pnpm tsx scripts/check-dates.ts
 *
 * Здесь легко ошибиться дважды.
 *
 * Календарная арифметика. «Через год» - не «плюс 365 дней», и 29 февраля
 * существует раз в четыре года. Ошибка в этом месте не видна до того самого
 * года, когда она сработает, а сработает она на дне рождения.
 *
 * Дедупликация. Задание идёт каждый час, а напоминание должно прийти дважды
 * за год - за неделю и в день. Ключ отметки обязан включать год: иначе
 * дата, о которой напомнили в 2026-м, промолчит навсегда.
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

    const members = await q<{ user_id: string }>('select user_id from public.app_members')
    const [a] = members
    if (!a) throw new Error('Нужен участник')

    const ins = `insert into public.occasions (title, date, kind, yearly, created_by)
                 values ($1, $2, $3, $4, $5)`

    await mustFail('Пустое название отвергается', ins, ['   ', '2000-09-14', 'birthday', true, a.user_id])
    await mustFail('Дата до 1900 отвергается', ins, ['Древность', '1899-01-01', 'other', true, a.user_id])
    await mustFail('Неизвестный вид отвергается', ins, ['Что-то', '2000-09-14', 'праздник', true, a.user_id])

    // --- арифметика ------------------------------------------------------
    const nextOn = async (src: string, yearly: boolean, today: string): Promise<string> =>
      one('select public.occasion_next($1, $2, $3)::text as v', [src, yearly, today])

    const cases: [string, boolean, string, string, string][] = [
      ['2000-09-14', true, '2026-09-08', '2026-09-14', 'дата ещё впереди в этом году'],
      ['2000-09-14', true, '2026-09-14', '2026-09-14', 'сегодня - это сегодня, а не через год'],
      ['2000-09-14', true, '2026-09-15', '2027-09-14', 'прошла - уезжает на следующий год'],
      ['2004-02-29', true, '2026-01-01', '2026-02-28', '29 февраля в невисокосный год'],
      ['2004-02-29', true, '2028-01-01', '2028-02-29', '29 февраля в високосный год'],
      ['2000-12-31', true, '2026-01-01', '2026-12-31', 'канун Нового года не уезжает на 11 месяцев назад'],
      ['2027-06-12', false, '2026-09-08', '2027-06-12', 'однократная дата остаётся собой'],
    ]
    for (const [src, yearly, today, want, why] of cases) {
      const got = await nextOn(src, yearly, today)
      check(got === want, why, `${src} + ${yearly ? 'ежегодно' : 'однократно'} от ${today} → ${got}`)
    }

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

    const ten = await zone(10)
    const other = await zone(16)

    if (ten && other) {
      await client.query('delete from public.occasions')
      await client.query('update public.profiles set timezone = $1', [ten])

      const today = await one(`select (now() at time zone $1)::date::text as v`, [ten])
      const inWeek = await one(`select ($1::date + 7)::text as v`, [today])
      const later = await one(`select ($1::date + 30)::text as v`, [today])

      // Годовщина заводится пятью годами раньше: иначе считать нечего
      // и в тексте не будет её номера - того самого, ради которого год
      // и хранится вместе с датой
      const weekFiveYearsAgo = await one(
        `select ($1::date - interval '5 years')::date::text as v`, [inWeek])

      // Дата ровно через неделю и дата сегодня - обе должны выстрелить,
      // дальняя молчать
      await client.query(ins, ['Годовщина', weekFiveYearsAgo, 'anniversary', true, a.user_id])
      await client.query(ins, ['Сегодняшняя', today, 'birthday', true, a.user_id])
      await client.query(ins, ['Далёкая', later, 'other', true, a.user_id])

      await client.query('update public.profiles set timezone = $1', [other])
      const q0 = await queued()
      await client.query('select public.notify_occasions()')
      check((await queued()) === q0, 'В неурочный час молчит', other)

      await client.query('update public.profiles set timezone = $1', [ten])
      const q1 = await queued()
      const n1 = Number(await one('select public.notify_occasions()::text as v'))
      const grew = (await queued()) - q1
      check(
        n1 === members.length * 2 && grew === members.length * 4,
        'В 10:00 уходят обе даты обоим, двумя каналами',
        `отправок ${n1}, запросов ${grew} (участников ${members.length})`,
      )

      const q2 = await queued()
      await client.query('select public.notify_occasions()')
      check((await queued()) === q2, 'Повтор в тот же день молчит', 'задание идёт каждый час')

      // Дальняя дата действительно промолчала
      const sentTitles = await one(
        `select string_agg(distinct o.title, ', ') as v
           from public.occasion_notices n join public.occasions o on o.id = n.occasion_id`,
      )
      check(
        !sentTitles.includes('Далёкая') && sentTitles.includes('Годовщина'),
        'Шлём только за неделю и в день',
        `разослано про: ${sentTitles}`,
      )

      // Ключ отметки включает год - иначе на следующий год тишина
      const leads = await one(
        `select string_agg(distinct lead::text, ',' order by lead::text) as v
           from public.occasion_notices`,
      )
      check(leads === '0,7', 'Отметки стоят и на «за неделю», и на «в день»', `lead: ${leads}`)

      await client.query('update public.occasion_notices set year = year - 1')
      const q3 = await queued()
      const n3 = Number(await one('select public.notify_occasions()::text as v'))
      check(
        n3 === members.length * 2 && (await queued()) - q3 === members.length * 4,
        'На следующий год напомнит снова',
        `отправок ${n3} - отметка прошлого года не глушит нынешний`,
      )

      // Текст называет, которая это годовщина
      const body = await one(
        `select convert_from(body, 'utf8') as v from net.http_request_queue
          where convert_from(body, 'utf8') like '%годовщина%' order by id desc limit 1`,
      )
      check(
        body.includes('5-я годовщина'),
        'В тексте есть номер годовщины',
        body.slice(0, 140) || 'не найден',
      )
    }

    await mustFail(
      'Чужое значение lead в отметку не пролезет',
      `insert into public.occasion_notices (occasion_id, user_id, year, lead)
       select id, $1, 2026, 3 from public.occasions limit 1`,
      [a.user_id],
    )

    const job = await one(
      `select schedule as v from cron.job where jobname = 'occasions'`,
    )
    check(job === '0 * * * *', 'Задание стоит в расписании', job || 'нет задания')
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nВажные даты верны.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
