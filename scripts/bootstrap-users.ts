/**
 * Создаёт (или чинит) два аккаунта приложения.
 *
 *   pnpm bootstrap
 *
 * ЭТО ЕДИНСТВЕННЫЙ ПУТЬ ВОССТАНОВЛЕНИЯ ДОСТУПА. Адреса аккаунтов синтетические,
 * почты за ними нет, письмо «сбросить пароль» отправить некуда. Если PIN забыт
 * или сессия окончательно сломалась - правится только отсюда, с секретным ключом.
 *
 * Скрипт идемпотентен: повторный запуск не создаёт дублей, а приводит уже
 * существующие аккаунты к состоянию из .env (в том числе перезаписывает PIN).
 *
 * PIN-ы читаются из .env - LOVE_PIN_BIKOSH (первый из пары) и LOVE_PIN_AMINOSH
 * (второй), имена - из VITE_PUBLIC_PARTNER_1_NAME и VITE_PUBLIC_PARTNER_2_NAME.
 * В репозитории их нет намеренно.
 *
 * Новую пару заводит `pnpm couple`: он делает то же самое, но сначала проверяет,
 * что база действительно новая, и задаёт часовой пояс и язык.
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/db.ts'
import { accountsFromVars, ensureAccount, listUsers, readPin } from './accounts-admin.ts'
import { loadEnv, readVars } from './env.ts'

async function main(): Promise<void> {
  const { supabaseUrl, secretKey } = loadEnv()
  const vars = readVars()

  // service-role клиент: обходит RLS, поэтому может писать в app_members,
  // куда обычным пользователям писать запрещено
  const admin = createClient<Database>(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const existing = await listUsers(admin)

  for (const account of accountsFromVars(vars)) {
    const read = readPin(vars, account.id)
    if ('error' in read) throw new Error(`В .env нет корректного PIN. ${read.error}`)
    const action = await ensureAccount(admin, existing, account, read.pin)
    console.log(`  ${action.padEnd(9)} ${account.nickname} <${account.email}>`)
  }

  console.log('\nГотово. Оба аккаунта на месте, членство и профили проставлены.')
}

main().catch((e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
