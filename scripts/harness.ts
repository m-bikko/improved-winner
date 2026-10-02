/**
 * Общее для проверок разделов «на двоих»: транзакция с откатом, вход
 * под конкретным человеком, «обязано упасть» и очередь уведомлений.
 *
 * Всё выполняется в ОДНОЙ транзакции и откатывается в конце. Уведомления
 * внутри неё только встают в очередь pg_net и вместе с откатом исчезают -
 * проверки на настоящей базе ничего никому не отправляют.
 */
import { Client, type QueryResultRow } from 'pg'
import { pgConfig } from './env.ts'

let failed = 0

export function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

export function finish(what: string): void {
  console.log(failed === 0 ? `\n${what} верно.` : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

export type Db = {
  q: <T extends QueryResultRow>(sql: string, p?: unknown[]) => Promise<T[]>
  one: (sql: string, p?: unknown[]) => Promise<string>
  /** Запрос обязан упасть; если задана подстрока - с ней в тексте ошибки. */
  mustFail: (name: string, sql: string, p?: unknown[], expect?: string) => Promise<void>
  /** Дальше - под этим человеком, через RLS, как из приложения. */
  as: (uid: string) => Promise<void>
  /** Обратно под владельца базы (RLS не действует). */
  asOwner: () => Promise<void>
  /** Сколько запросов pg_net в очереди - уведомления считаются по ним. */
  queued: () => Promise<number>
  /** Тела последних n push-уведомлений. */
  lastPushes: (n: number) => Promise<string[]>
  members: { a: string; b: string }
}

/**
 * Транзакция с двумя участниками. Тихие часы и настройки уведомлений
 * в ней сброшены: иначе проверка «уведомление ушло» зависела бы от того,
 * в котором часу её запустили.
 */
export async function inTransaction(body: (db: Db) => Promise<void>): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()
  const q = async <T extends QueryResultRow>(sql: string, p: unknown[] = []): Promise<T[]> =>
    (await client.query<T>(sql, p)).rows
  const one = async (sql: string, p: unknown[] = []): Promise<string> =>
    String(Object.values((await q(sql, p))[0] ?? {})[0] ?? '')

  try {
    await client.query('begin')
    const rows = await q<{ user_id: string }>('select user_id from public.app_members order by user_id')
    const [ra, rb] = rows
    if (!ra || !rb) throw new Error('Нужны два участника')
    await client.query('update public.profiles set quiet_from = null, quiet_to = null')
    await client.query('delete from public.notification_settings')

    const db: Db = {
      q,
      one,
      members: { a: ra.user_id, b: rb.user_id },
      mustFail: async (name, sql, p = [], expect) => {
        await client.query('savepoint must_fail')
        try {
          await client.query(sql, p)
          await client.query('rollback to savepoint must_fail')
          check(false, name, 'прошло, хотя должно было упасть')
        } catch (e) {
          await client.query('rollback to savepoint must_fail')
          const message = (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? ''
          check(expect === undefined || message.includes(expect), name, message)
        }
      },
      as: async (uid) => {
        await client.query('reset role')
        await client.query(
          `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
          [uid],
        )
        await client.query('set local role authenticated')
      },
      asOwner: async () => {
        await client.query('reset role')
      },
      queued: async () => Number(await one('select count(*) from net.http_request_queue')),
      lastPushes: async (n) =>
        (
          await q<{ body: string }>(
            `select convert_from(q.body, 'utf8') as body from net.http_request_queue q
              where q.url like '%/api/push' order by q.id desc limit $1`,
            [n],
          )
        ).map((r) => r.body),
    }
    await body(db)
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }
}
