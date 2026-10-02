/**
 * Проверка ежедневного опроса «Как ты сегодня».
 *
 *   pnpm tsx scripts/check-checkins.ts
 *
 * Две вещи, которые тут легко сломать молча.
 *
 * Словарь состояний продублирован в базе и в интерфейсе. Разойдись они -
 * и человек тапнет по кнопке, а база откажет; форма покажет ошибку Postgres,
 * и виноватым будет выглядеть он.
 *
 * Видимость. Раздел задуман общим: вопрос имеет смысл ровно потому, что ответ
 * увидит второй. Если политика однажды сузится, экран будет выглядеть
 * исправным - просто пустым у партнёра.
 *
 * Всё в транзакции и откатывается.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { pgConfig } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

async function mustFail(
  client: Client,
  name: string,
  sql: string,
  params: unknown[],
): Promise<void> {
  await client.query('savepoint s')
  try {
    await client.query(sql, params)
    await client.query('rollback to savepoint s')
    check(false, name, 'вставка ПРОШЛА, хотя должна была упасть')
  } catch (e) {
    await client.query('rollback to savepoint s')
    check(true, name, (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? '')
  }
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()
  try {
    await client.query('begin')
    // Настоящие настройки людей - не условие проверки: кто-то выключил
    // этот вид уведомлений или поставил тихие часы, и проверка падала,
    // хотя рассылка исправна. В транзакции сбрасываем, откат вернёт как было
    await client.query('delete from public.notification_settings')
    await client.query('update public.profiles set quiet_from = null, quiet_to = null')

    const { rows: members } = await client.query<{ user_id: string }>(
      'select user_id from public.app_members order by user_id',
    )
    const [a, b] = members
    if (!a || !b) throw new Error('Нужны два участника')

    // Словарь: интерфейс не должен предлагать то, что база отвергнет
    const src = readFileSync('src/features/checkin/states.ts', 'utf8')
    const uiIds = [...src.matchAll(/\bid: '([a-z]+)'/g)].map((m) => m[1])
    const { rows: constraint } = await client.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conname = 'checkins_states_known'`,
    )
    const dbIds = [...(constraint[0]?.def ?? '').matchAll(/'([a-z]+)'::text/g)].map((m) => m[1])
    const onlyUi = uiIds.filter((i) => !dbIds.includes(i))
    const onlyDb = dbIds.filter((i) => !uiIds.includes(i))
    check(
      onlyUi.length === 0 && onlyDb.length === 0 && uiIds.length > 0,
      'Словарь состояний в базе и в интерфейсе совпадает',
      `в интерфейсе ${uiIds.length}, в базе ${dbIds.length}` +
        (onlyUi.length ? `, только в форме: ${onlyUi.join(', ')}` : '') +
        (onlyDb.length ? `, только в базе: ${onlyDb.join(', ')}` : ''),
    )

    const ins = `insert into public.checkins (user_id, date, states, note) values ($1, $2, $3, $4)`

    await client.query(ins, [a.user_id, '2026-01-02', ['joy', 'sleepy'], null])
    await mustFail(client, 'Неизвестное состояние отвергается', ins, [
      a.user_id, '2026-01-03', ['телепатия'], null,
    ])
    await mustFail(client, 'Пустая отметка отвергается', ins, [
      a.user_id, '2026-01-04', [], null,
    ])
    await mustFail(client, 'Отметка из пробелов отвергается', ins, [
      a.user_id, '2026-01-05', [], '   ',
    ])
    await mustFail(client, 'Две отметки на один день отвергаются', ins, [
      a.user_id, '2026-01-02', ['sad'], null,
    ])

    // Заметка без состояний - можно: иногда сказать словами проще
    await client.query('savepoint ok')
    await client.query(ins, [a.user_id, '2026-01-06', [], 'просто устал'])
    check(true, 'Заметка без состояний принимается', 'словами тоже можно')
    await client.query('rollback to savepoint ok')

    // Оба участника видят один день
    await client.query(ins, [b.user_id, '2026-01-02', ['miss'], null])
    const { rows: both } = await client.query<{ n: string }>(
      `select count(*)::text as n from public.checkins where date = '2026-01-02'`,
    )
    check(both[0]?.n === '2', 'Отметки обоих живут рядом', `строк на дату: ${both[0]?.n}`)

    // Час вопроса
    const zone = async (hour: number): Promise<string | null> => {
      const { rows } = await client.query<{ name: string }>(
        `select name from pg_timezone_names
          where extract(hour from now() at time zone name)::int = $1
            and name like '%/%' order by name limit 1`,
        [hour],
      )
      return rows[0]?.name ?? null
    }
    const queued = async (): Promise<number> => {
      const { rows } = await client.query<{ n: string }>(
        'select count(*)::text as n from net.http_request_queue',
      )
      return Number(rows[0]?.n ?? 0)
    }
    const morning = await zone(11)
    const night = await zone(3)

    if (morning && night) {
      await client.query('delete from public.checkin_asks')
      await client.query('update public.profiles set timezone = $1', [night])
      const beforeNight = await queued()
      await client.query('select public.ask_checkins()')
      check(
        (await queued()) === beforeNight,
        'В неурочный час не спрашивает',
        `${night}, запросов не прибавилось`,
      )

      await client.query('update public.profiles set timezone = $1', [morning])
      await client.query(
        `delete from public.checkins where date = (now() at time zone $1)::date`,
        [morning],
      )
      const beforeAsk = await queued()
      await client.query('select public.ask_checkins()')
      const asked = (await queued()) - beforeAsk
      check(
        asked === members.length * 2,
        'В 11:00 спрашивает обоих, двумя каналами',
        `участников ${members.length}, запросов ${asked} (ожидалось ${members.length * 2})`,
      )

      const beforeRepeat = await queued()
      await client.query('select public.ask_checkins()')
      check(
        (await queued()) === beforeRepeat,
        'Повторный запуск в тот же день молчит',
        'задание идёт каждый час - дубли недопустимы',
      )

      // Уже ответившего не дёргаем
      await client.query('delete from public.checkin_asks')
      await client.query(
        `insert into public.checkins (user_id, date, states)
         values ($1, (now() at time zone $2)::date, array['joy'])`,
        [a.user_id, morning],
      )
      const beforeAnswered = await queued()
      await client.query('select public.ask_checkins()')
      const afterAnswered = (await queued()) - beforeAnswered
      check(
        afterAnswered === (members.length - 1) * 2,
        'Уже ответившего не спрашивают',
        `спросили ${afterAnswered / 2} из ${members.length}`,
      )
    }
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nЕжедневный опрос верен.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
