/**
 * Проверка уведомления «вышло обновление».
 *
 *   pnpm tsx scripts/check-release.ts
 *
 * Главное здесь - не «уходит ли», а «не уходит ли лишнего»: приложение
 * выкатывается по нескольку раз в день, и уведомление о версии, которую
 * уже объявляли, или о «первой» версии, которую никто не выкатывал,
 * отучило бы читать все уведомления разом.
 *
 * Настройки и тихие часы задаются внутри проверки, а не берутся живыми:
 * иначе выключенное кем-то уведомление роняло бы проверку, которая
 * не про настройки. Всё в транзакции и откатывается.
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
  const queued = async (): Promise<number> =>
    Number(await one('select count(*)::text as v from net.http_request_queue'))

  try {
    await client.query('begin')

    const members = Number(await one('select count(*)::text as v from public.app_members'))
    // Уведомления включены, тихих часов нет - проверяем рассылку, а не настройки
    await client.query(`delete from public.notification_settings where kind = 'updates'`)
    await client.query('update public.profiles set quiet_from = null, quiet_to = null')
    await client.query('delete from public.app_releases')

    let before = await queued()
    const first = Number(await one(`select public.release_seen('v-first', 'Тандем')::text as v`))
    check(
      first === 0 && (await queued()) === before,
      'Первая увиденная версия только запоминается',
      `оповещено ${first}: включение рассылки не должно объявлять обновление, которого не было`,
    )

    before = await queued()
    const second = Number(await one(`select public.release_seen('v-second', 'Тандем')::text as v`))
    const requests = (await queued()) - before
    check(
      second === members && requests >= members,
      'Новая версия уходит обоим',
      `оповещено ${second} из ${members}, запросов ${requests} (push и телеграм)`,
    )

    before = await queued()
    const again = Number(await one(`select public.release_seen('v-second', 'Тандем')::text as v`))
    check(
      again === 0 && (await queued()) === before,
      'Та же версия второй раз молчит',
      'повторный деплой того же коммита или повторный ответ сайта',
    )

    const rollback = Number(await one(`select public.release_seen('v-first', 'Тандем')::text as v`))
    check(rollback === 0, 'Откат на уже виденную версию молчит', `оповещено ${rollback}`)

    const empty = Number(await one(`select public.release_seen('', 'Тандем')::text as v`))
    check(empty === 0, 'Пустая версия отбрасывается', 'битый version.json не создаёт «версию»')

    const user = await one('select user_id::text as v from public.app_members limit 1')
    const title = await one(`select public.tx($1::uuid, 'n.release.title', 'Тандем') as v`, [user])
    check(title.includes('Тандем'), 'Название приложения попадает в заголовок', title)

    for (const lang of ['ru', 'kk', 'en']) {
      const n = Number(
        await one(
          `select count(*)::text as v from public.texts
            where key in ('n.release.title', 'n.release.body') and lang = $1`,
          [lang],
        ),
      )
      check(n === 2, `Тексты на ${lang}`, `${n} из 2`)
    }

    await client.query(`insert into public.notification_settings (user_id, kind, push, telegram)
                        select user_id, 'updates', false, false from public.app_members`)
    before = await queued()
    await one(`select public.release_seen('v-third', 'Тандем')::text as v`)
    check(
      (await queued()) === before,
      'Выключенное в настройках не приходит',
      'вид updates уважает notification_settings',
    )

    const job = await one(`select schedule as v from cron.job where jobname = 'release-check'`)
    check(job === '*/5 * * * *', 'Проверка версии стоит в расписании', `release-check ${job || 'нет'}`)
  } finally {
    await client.query('rollback')
    await client.end()
  }

  console.log(failed === 0 ? '\nУведомление об обновлении верно.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
