/**
 * Заводит новую пару в чистой базе и проверяет, всё ли готово к запуску.
 *
 *   pnpm couple            - проверить, завести аккаунты и профили
 *   pnpm couple --check    - только проверить, ничего не менять
 *   pnpm couple --rename   - разрешить сменить имена уже заведённой пары
 *
 * Из .env берутся имена (VITE_PUBLIC_PARTNER_1_NAME и _2_NAME), PIN-ы (LOVE_PIN_BIKOSH
 * для первого, LOVE_PIN_AMINOSH для второго) и, если заданы, часовой пояс и язык
 * каждого (PARTNER_1_TIMEZONE, PARTNER_1_LANGUAGE и так же для второго). Пояс в
 * интерфейсе не меняется, а по нему база решает, когда слать напоминания, поэтому
 * его задают здесь. Повторный запуск снова запишет значения из .env.
 *
 * Справочники - продукты, тексты уведомлений, идеи и всё остальное общее - приезжают
 * миграциями, отдельно их заливать не нужно. Демо-записей скрипт не создаёт: дневник,
 * темы и остальное пара заведёт сама.
 *
 * Перед записью скрипт смотрит, кто уже есть в базе. Если там те же аккаунты с другими
 * именами, он останавливается: скорее всего, .env указывает на базу другой пары,
 * и запуск переписал бы им имена и PIN-ы.
 */
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import type { Database } from '../src/types/db.ts'
import {
  accountsFromVars,
  ensureAccount,
  isLanguage,
  judgeDatabase,
  LANGUAGE_VAR,
  listUsers,
  NAME_VAR,
  PIN_VAR,
  readPin,
  TIMEZONE_VAR,
  type Member,
  type ProfileStart,
  type Verdict,
} from './accounts-admin.ts'
import { loadEnv, pgConfig, readVars } from './env.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FLAGS = ['--check', '--rename']

const ok = (text: string): void => console.log(`  готово  ${text}`)
const no = (text: string): void => console.log(`  нет     ${text}`)

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const unknown = args.filter((a) => !FLAGS.includes(a))
  if (unknown.length > 0) throw new Error(`Неизвестные аргументы: ${unknown.join(' ')}. Есть ${FLAGS.join(' и ')}.`)
  const checkOnly = args.includes('--check')
  const rename = args.includes('--rename')

  const vars = readVars()
  const { supabaseUrl, secretKey, publishableKey } = loadEnv()
  const accounts = accountsFromVars(vars)
  /** Мешают завести пару. */
  const blockers: string[] = []
  /** Не мешают, но до того, как отдавать приложение паре, их надо закрыть. */
  const todos: string[] = []
  const starts = new Map<string, ProfileStart>()
  const pins = new Map<string, string>()

  console.log(checkOnly ? 'Проверка, ничего не меняется.\n' : '')
  console.log('Пара')
  for (const account of accounts) {
    const named = Boolean(vars[NAME_VAR[account.id]]?.trim())
    if (!named) blockers.push(`${NAME_VAR[account.id]}: задайте имя`)

    const pin = readPin(vars, account.id)
    if ('error' in pin) blockers.push(pin.error)
    else if (pin.pin === '000000') blockers.push(`${PIN_VAR[account.id]}: это PIN из примера, задайте свой`)
    else pins.set(account.id, pin.pin)

    const timezone = vars[TIMEZONE_VAR[account.id]]?.trim() || undefined
    const language = vars[LANGUAGE_VAR[account.id]]?.trim() || undefined
    if (language !== undefined && !isLanguage(language)) {
      blockers.push(`${LANGUAGE_VAR[account.id]}: нужен ru, kk или en`)
    }
    starts.set(account.id, {
      ...(timezone ? { timezone } : {}),
      ...(language && isLanguage(language) ? { language } : {}),
    })
    console.log(
      `  ${account.nickname}${named ? '' : ' (имя по умолчанию)'}: ` +
        `пояс ${timezone ?? 'не задан'}, язык ${language ?? 'не задан'}`,
    )
  }
  const [first, second] = accounts
  if (first && second && first.nickname === second.nickname) {
    blockers.push('Имена совпадают: на экране входа их будет не различить')
  }

  /** Что скрипт увидел в базе; null - не смотрел, потому что миграции не применены. */
  let verdictKind: Verdict['kind'] | null = null

  const db = new Client(pgConfig())
  await db.connect()
  try {
    for (const account of accounts) {
      const timezone = starts.get(account.id)?.timezone
      if (!timezone) continue
      const { rows } = await db.query<{ known: boolean }>(
        'select exists (select 1 from pg_timezone_names where name = $1) as known',
        [timezone],
      )
      if (!rows[0]?.known) blockers.push(`${TIMEZONE_VAR[account.id]}: неизвестный пояс «${timezone}», нужен вид Asia/Almaty`)
    }

    console.log('\nБаза')
    const files = readdirSync(join(ROOT, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.split('_')[0] ?? f)
    const applied = new Set(
      await db
        .query<{ version: string }>('select version from supabase_migrations.schema_migrations')
        .then((r) => r.rows.map((row) => row.version))
        // В новом проекте таблицы учёта ещё нет: это и есть «ничего не применено»
        .catch(() => [] as string[]),
    )
    const pending = files.filter((v) => !applied.has(v)).length
    if (pending === 0) ok(`миграции применены, ${files.length}`)
    else {
      no(`миграции: не применено ${pending} из ${files.length}`)
      blockers.push('Сначала pnpm db:push')
    }

    let canWrite = pending === 0
    if (pending === 0) {
      verdictKind = 'fresh'
      const { rows: members } = await db.query<Member>(
        `select u.email, p.nickname
           from public.app_members m
           left join auth.users u on u.id = m.user_id
           left join public.profiles p on p.user_id = m.user_id
          order by u.email = $1 desc, u.email`,
        // Первым - первый из пары, как на экране входа
        [first?.email ?? ''],
      )
      const verdict = judgeDatabase(members, accounts, rename)
      verdictKind = verdict.kind
      const names = accounts.map((a) => a.nickname).join(' и ')
      switch (verdict.kind) {
        case 'fresh':
          ok('пары в базе ещё нет')
          break
        case 'same':
          ok(`пара уже заведена: ${names}`)
          break
        case 'rename':
          ok(`имена сменятся: ${verdict.from.join(' и ')} → ${names}`)
          break
        case 'other-couple':
          canWrite = false
          no(`в базе уже пара ${verdict.names.join(' и ')}`)
          blockers.push(
            'Если это они же и имена меняются - запустите с --rename. Если нет - .env указывает на базу другой пары',
          )
          break
        case 'foreign':
          canWrite = false
          no('в базе участники с чужими адресами')
          blockers.push('Это не база этого приложения')
          break
      }
    }

    if (!checkOnly) {
      if (blockers.length > 0 || !canWrite) {
        console.log('\nНичего не записано:')
        for (const b of blockers) console.log(`  - ${b}`)
        process.exitCode = 1
        return
      }
      console.log('\nАккаунты')
      // service-role клиент: обходит RLS, поэтому может писать в app_members
      const admin = createClient<Database>(supabaseUrl, secretKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const existing = await listUsers(admin)
      for (const account of accounts) {
        const pin = pins.get(account.id)
        if (!pin) throw new Error(`${account.nickname}: нет PIN`)
        const action = await ensureAccount(admin, existing, account, pin, starts.get(account.id))
        ok(`${action}: ${account.nickname}`)
      }
    }

    console.log('\nОкружение')
    const { rows: extensions } = await db.query<{ extname: string }>(
      `select extname from pg_extension where extname in ('pg_cron', 'pg_net')`,
    )
    if (extensions.length === 2) ok('pg_cron и pg_net включены')
    else no('pg_cron и pg_net: появятся после pnpm db:push')

    const jobs = await db
      .query<{ n: number }>('select count(*)::int as n from cron.job')
      .then((r) => r.rows[0]?.n ?? 0)
      .catch(() => 0)
    if (jobs > 0) ok(`расписание рассылок: ${jobs} заданий`)
    else no('расписание рассылок пустое: появится после pnpm db:push')

    // Только имена: значения секретов скрипту не нужны и в вывод не попадают
    const secrets = await db
      .query<{ name: string }>(`select name from vault.secrets where name = any($1)`, [
        ['telegram_bot_token', 'push_endpoint_url', 'push_shared_secret'],
      ])
      .then((r) => r.rows)
      .catch(() => [] as { name: string }[])
    const has = new Set(secrets.map((s) => s.name))
    if (has.has('push_endpoint_url') && has.has('push_shared_secret')) ok('push: адрес функции и секрет в Vault')
    else {
      no('push не настроен')
      todos.push('Push: задайте PUSH_ENDPOINT_URL и PUSH_SHARED_SECRET в .env и запустите pnpm secrets')
    }
    if (has.has('telegram_bot_token')) ok('Telegram: токен бота в Vault')
    else no('Telegram не настроен - необязательно')

    const signup = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: publishableKey } })
      .then((r) => r.json() as Promise<{ disable_signup?: boolean }>)
      .then((s) => s.disable_signup)
      .catch(() => undefined)
    if (signup === true) ok('регистрация новых пользователей выключена')
    else if (signup === false) {
      no('регистрация новых пользователей включена')
      todos.push('Supabase → Authentication → Sign In / Providers: выключите «Allow new users to sign up»')
    } else no('регистрацию проверить не удалось')
  } finally {
    await db.end()
  }

  console.log('')
  if (blockers.length > 0) {
    console.log('Итог: не готово.')
    for (const b of blockers) console.log(`  - ${b}`)
  } else if (checkOnly && verdictKind === 'fresh') {
    console.log('Итог: пару можно заводить - pnpm couple.')
  } else {
    console.log(todos.length > 0 ? 'Итог: пара заведена. Осталось:' : 'Итог: пара заведена, всё готово.')
  }
  for (const t of todos) console.log(`  - ${t}`)
  console.log(
    '\nИмена на экране входа берутся из сборки: VITE_PUBLIC_PARTNER_1_NAME и _2_NAME должны быть' +
      '\nи в переменных Vercel, иначе там останутся имена по умолчанию.',
  )
}

main().catch((e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
