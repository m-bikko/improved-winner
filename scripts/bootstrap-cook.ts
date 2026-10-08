/**
 * Заводит аккаунт повара и привязывает его к владельцу дневника.
 *
 *   pnpm tsx scripts/bootstrap-cook.ts
 *
 * Повар - отдельный аккаунт auth, НЕ участник пары (в app_members его нет).
 * Пароль при создании - случайный и нигде не сохраняется: войти по нему
 * нельзя. Рабочую ссылку выпускает сам владелец в профиле приложения
 * (cook_link_issue ставит новый пароль и показывает ссылку один раз).
 *
 * Скрипт идемпотентный: повторный запуск ничего не ломает и ссылку не трогает.
 */
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/db.ts'
import { ACCOUNTS, COOK_EMAIL } from '../src/lib/accounts.ts'
import { loadEnv } from './env.ts'

/** Чей повар. Повар Бикоша - его дневник он и видит. */
const OWNER = 'bikosh'

async function main(): Promise<void> {
  const { supabaseUrl, secretKey } = loadEnv()
  const admin = createClient<Database>(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw new Error(`Не удалось получить пользователей: ${listError.message}`)

  const owner = list.users.find((u) => u.email === ACCOUNTS.find((a) => a.id === OWNER)?.email)
  if (!owner) throw new Error('Владелец не найден: сначала scripts/bootstrap-users.ts')

  let cook = list.users.find((u) => u.email === COOK_EMAIL)
  if (!cook) {
    const { data, error } = await admin.auth.admin.createUser({
      email: COOK_EMAIL,
      // Случайный и тут же забытый: по нему не войти. Ссылку выпускает владелец
      password: randomBytes(32).toString('hex'),
      email_confirm: true,
      user_metadata: { role: 'cook' },
    })
    if (error) throw new Error(`Не удалось создать повара: ${error.message}`)
    cook = data.user
    console.log('Повар заведён.')
  } else {
    console.log('Повар уже есть.')
  }

  const { error: bindError } = await admin
    .from('cooks')
    .upsert({ user_id: cook.id, owner_id: owner.id }, { onConflict: 'user_id', ignoreDuplicates: true })
  if (bindError) throw new Error(`Не удалось привязать повара: ${bindError.message}`)

  console.log('Готово. Ссылку для повара выпускает владелец: Профиль → Повар.')
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
