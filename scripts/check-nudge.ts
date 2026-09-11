/**
 * Проверка кнопки «Думаю о тебе».
 *
 *   pnpm tsx scripts/check-nudge.ts
 *
 * Вся ценность кнопки держится на остывании. Нажатая двадцать раз подряд,
 * она перестаёт что-либо значить с третьего раза, а партнёр перестаёт
 * читать уведомления вообще.
 *
 * Поэтому проверяется не «отправляется ли», а «нельзя ли отправить снова»,
 * и держит это БАЗА: заблокированную кнопку обходят перезагрузкой страницы.
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

  try {
    await client.query('begin')
    const members = await q<{ user_id: string }>(
      'select user_id from public.app_members order by user_id',
    )
    const [a, b] = members
    if (!a || !b) throw new Error('Нужны два участника')

    await client.query('delete from public.nudges')
    const as = async (uid: string): Promise<void> => {
      await client.query(
        `select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)`,
        [uid],
      )
    }
    const queued = async (): Promise<number> =>
      Number(await one('select count(*)::text as v from net.http_request_queue'))

    await as(a.user_id)
    check((await one('select coalesce(public.last_nudge()::text, \'-\') as v')) === '-',
      'Пока не нажимали - остывания нет', 'кнопка доступна')

    const before = await queued()
    await client.query('select public.send_nudge()')
    const sent = (await queued()) - before
    check(sent >= 1, 'Нажатие уходит партнёру', `запросов ${sent} (телеграм и push)`)
    check(
      (await one('select count(*)::text as v from public.nudges')) === '1',
      'Нажатие записано',
      'иначе остывание нечем считать',
    )

    // Повтор
    await client.query('savepoint s')
    let blocked = false
    try {
      await client.query('select public.send_nudge()')
    } catch {
      blocked = true
    }
    await client.query('rollback to savepoint s')
    check(blocked, 'Повтор сразу отклонён', 'полчаса - чтобы порыв остался порывом')

    const quiet = await queued()
    await client.query('savepoint s2')
    try {
      await client.query('select public.send_nudge()')
    } catch {
      /* ожидаемо */
    }
    await client.query('rollback to savepoint s2')
    check((await queued()) === quiet, 'И ничего не отправляет', 'отказ до отправки, а не после')

    // Через полчаса можно снова
    await client.query(
      `update public.nudges set created_at = now() - interval '31 minutes'`,
    )
    const later = await queued()
    await client.query('select public.send_nudge()')
    check((await queued()) > later, 'Через полчаса можно снова', 'остывание, а не запрет')

    // Партнёр видит, что о нём подумали
    await as(b.user_id)
    await client.query('set local role authenticated')
    check(
      (await q('select 1 from public.nudges')).length > 0,
      'Партнёр видит нажатия',
      'уведомление можно пропустить, запись остаётся',
    )
    // Savepoint обязателен: упавшая команда обрывает транзакцию целиком,
    // и всё, что после неё, молча не выполнится
    await client.query('savepoint s3')
    let wrote = true
    try {
      await client.query(`insert into public.nudges (from_id) values ($1)`, [b.user_id])
    } catch {
      wrote = false
    }
    await client.query('rollback to savepoint s3')
    check(!wrote, 'Прямая вставка запрещена', 'иначе остывание обходится одним запросом')
    await client.query('reset role')

    const kinds = await one(
      `select pg_get_constraintdef(oid) as v from pg_constraint
        where conname = 'notification_settings_kind_check'`,
    )
    check(kinds.includes("'nudge'"), 'Вид уведомления можно выключить', 'как и все остальные')
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nКнопка верна.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
