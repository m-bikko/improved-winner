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
 * PIN-ы читаются из .env - LOVE_PIN_BIKOSH и LOVE_PIN_AMINOSH. В репозитории
 * их нет намеренно.
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/db.ts'
import { ACCOUNTS, PIN_LENGTH, type AccountId } from '../src/lib/accounts.ts'
import { loadEnv, readVars } from './env.ts'

const PIN_ENV_VAR: Record<AccountId, string> = {
  bikosh: 'LOVE_PIN_BIKOSH',
  aminosh: 'LOVE_PIN_AMINOSH',
}

async function main(): Promise<void> {
  const { supabaseUrl, secretKey } = loadEnv()
  const vars = readVars()

  // service-role клиент: обходит RLS, поэтому может писать в app_members,
  // куда обычным пользователям писать запрещено
  const admin = createClient<Database>(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: existing, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw new Error(`Не удалось получить список пользователей: ${listError.message}`)

  for (const account of ACCOUNTS) {
    const envVar = PIN_ENV_VAR[account.id]
    const pin = vars[envVar]

    if (!pin || !new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
      throw new Error(
        `В .env нет корректного ${envVar}: нужен PIN ровно из ${PIN_LENGTH} цифр. ` +
          `Пример строки: ${envVar}="123456"`,
      )
    }

    const found = existing.users.find((u) => u.email === account.email)
    let userId: string

    if (found) {
      // Приводим к состоянию из .env - в том числе сбрасываем PIN, если он забыт
      const { data, error } = await admin.auth.admin.updateUserById(found.id, {
        password: pin,
        user_metadata: { nickname: account.nickname },
      })
      if (error) throw new Error(`${account.nickname}: не удалось обновить - ${error.message}`)
      userId = data.user.id
      console.log(`  обновлён   ${account.nickname} <${account.email}>`)
    } else {
      // email_confirm: true обязателен - подтверждать адрес, которого не существует,
      // пользователю будет нечем, а без подтверждения вход заблокирован
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password: pin,
        email_confirm: true,
        user_metadata: { nickname: account.nickname },
      })
      if (error) throw new Error(`${account.nickname}: не удалось создать - ${error.message}`)
      userId = data.user.id
      console.log(`  создан     ${account.nickname} <${account.email}>`)
    }

    const { error: memberError } = await admin
      .from('app_members')
      .upsert({ user_id: userId }, { onConflict: 'user_id' })
    if (memberError) throw new Error(`${account.nickname}: app_members - ${memberError.message}`)

    // Профиль создаётся здесь, а не триггером на auth.users: триггеры на этой
    // таблице - общий ресурс проекта, и один сломанный ломает создание аккаунтов
    // целиком. Остальные поля профиля пользователь заполнит сам на экране профиля.
    const { error: profileError } = await admin
      .from('profiles')
      .upsert({ user_id: userId, nickname: account.nickname }, { onConflict: 'user_id' })
    if (profileError) throw new Error(`${account.nickname}: profiles - ${profileError.message}`)
  }

  console.log('\nГотово. Оба аккаунта на месте, членство и профили проставлены.')
}

main().catch((e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
