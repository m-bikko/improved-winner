/**
 * Проверка логики напоминаний о приёмах пищи.
 *
 *   pnpm tsx scripts/check-reminders.ts
 *
 * Ждать 11 утра ради проверки нельзя, поэтому подбирается часовой пояс,
 * в котором прямо сейчас нужный час. Это заодно проверяет главное свойство
 * функции: решение принимается по местному времени профиля, а не по времени
 * сервера.
 *
 * Всё в транзакции и откатывается.
 */
import { Client } from 'pg'
import { pgConfig } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

/** Часовой пояс, в котором сейчас указанный час. */
async function zoneWithHour(client: Client, hour: number): Promise<string | null> {
  const { rows } = await client.query<{ name: string }>(
    `select name from pg_timezone_names
      where extract(hour from now() at time zone name)::int = $1
        and name like '%/%'
      order by name limit 1`,
    [hour],
  )
  return rows[0]?.name ?? null
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()

  try {
    await client.query('begin')

    const { rows: members } = await client.query<{ user_id: string; nickname: string }>(
      `select p.user_id, p.nickname from public.profiles p
         join public.app_members m on m.user_id = p.user_id order by p.nickname limit 1`,
    )
    const user = members[0]
    if (!user) throw new Error('Нет участников')

    // Час, когда напоминаний быть не должно
    const quietZone = await zoneWithHour(client, 3)
    if (quietZone) {
      await client.query('update public.profiles set timezone = $1 where user_id = $2', [
        quietZone,
        user.user_id,
      ])
      const { rows } = await client.query<{ n: string }>('select public.send_meal_reminders()::text as n')
      check(rows[0]?.n === '0', 'В неурочный час ничего не шлётся', `${quietZone}, отправлено: ${rows[0]?.n}`)
    }

    // Час завтрака
    const breakfastZone = await zoneWithHour(client, 11)
    if (!breakfastZone) throw new Error('Не нашёлся пояс с 11 часами')

    await client.query('update public.profiles set timezone = $1 where user_id = $2', [
      breakfastZone,
      user.user_id,
    ])
    // Убираем завтрак этого дня, чтобы напоминание было уместно
    await client.query(
      `delete from public.diary_entries
        where user_id = $1 and meal = 'breakfast'
          and date = (now() at time zone $2)::date`,
      [user.user_id, breakfastZone],
    )

    // И отметку о том, что сегодня уже напоминали.
    //
    // Без этого проверка флаки по построению: настоящий cron идёт каждый час
    // и, отправив человеку завтрак в его собственном поясе, оставляет отметку.
    // Дальше проверка подбирает пояс, где сейчас 11, - а дата там нередко
    // та же самая, - и функция законно молчит. То есть до 11:00 по месту
    // проверка проходила, после падала, и виноват был не код.
    //
    // Всё внутри транзакции, которая откатывается, так что живой отметке
    // ничего не грозит.
    await client.query(
      `delete from public.meal_reminders
        where user_id = $1 and meal = 'breakfast'
          and date = (now() at time zone $2)::date`,
      [user.user_id, breakfastZone],
    )

    const before = await client.query<{ n: string }>(
      'select count(*)::text as n from net.http_request_queue',
    )
    const first = await client.query<{ n: string }>('select public.send_meal_reminders()::text as n')
    check(
      Number(first.rows[0]?.n) >= 1,
      'Пустой завтрак в 11 часов даёт напоминание',
      `${breakfastZone}, отправлено: ${first.rows[0]?.n}`,
    )

    // Род в тексте берётся из профиля, а не один на всех.
    //
    // Раньше текст был только в мужском роде, и Аминош каждый раз получала
    // «Позавтракал?». Приложение знает пол - значит и слово должно быть
    // правильное; скобочное «(а)» тут не решение, а отказ от него.
    const { rows: sexRows } = await client.query<{ sex: string | null }>(
      'select sex from public.profiles where user_id = $1',
      [user.user_id],
    )
    const sex = sexRows[0]?.sex ?? null
    const expected =
      sex === 'female' ? 'Позавтракала' : sex === 'male' ? 'Позавтракал?' : 'Завтрак был?'
    // convert_from, а не ::text: body в очереди pg_net - bytea, и приведение
    // к тексту даёт шестнадцатеричную строку, в которой никакое слово
    // не найдётся. Кириллица тут вдвойне обязывает раскодировать честно.
    const { rows: bodyRows } = await client.query<{ body: string }>(
      `select convert_from(q.body, 'utf8') as body from net.http_request_queue q
        order by q.id desc limit 1`,
    )
    const body = bodyRows[0]?.body ?? ''
    check(
      body.includes(expected),
      'Текст напоминания в роде из профиля',
      `пол ${sex ?? 'не задан'}, ждали «${expected}», в запросе ${body.includes(expected) ? 'есть' : 'НЕТ'}`,
    )
    check(
      Number(before.rows[0]?.n) < Number(
        (await client.query<{ n: string }>('select count(*)::text as n from net.http_request_queue'))
          .rows[0]?.n,
      ),
      'Запрос на отправку действительно поставлен в очередь',
      'счётчик net.http_request_queue вырос',
    )


    const second = await client.query<{ n: string }>('select public.send_meal_reminders()::text as n')
    check(
      second.rows[0]?.n === '0',
      'Повторный запуск в тот же час НЕ шлёт второй раз',
      `отправлено: ${second.rows[0]?.n} - задача идёт каждый час, дубли недопустимы`,
    )

    // Появилась еда - напоминания больше быть не должно
    await client.query('delete from public.meal_reminders where user_id = $1', [user.user_id])
    await client.query(
      `insert into public.diary_entries
         (id, user_id, date, meal, grams, name_snapshot, kcal_100, protein_100, fat_100, carbs_100)
       values (gen_random_uuid(), $1, (now() at time zone $2)::date, 'breakfast', 100,
               'ТЕСТ завтрак', 100, 5, 5, 5)`,
      [user.user_id, breakfastZone],
    )
    const third = await client.query<{ n: string }>('select public.send_meal_reminders()::text as n')
    check(
      third.rows[0]?.n === '0',
      'Если завтрак заполнен, напоминание не приходит',
      `отправлено: ${third.rows[0]?.n}`,
    )
  } finally {
    await client.query('rollback')
    await client.end()
  }

  console.log(failed === 0 ? '\nЛогика напоминаний верна.' : `\nПровалено: ${failed}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
