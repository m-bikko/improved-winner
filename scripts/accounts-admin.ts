/**
 * Аккаунты пары со стороны администратора: общее для `pnpm bootstrap` и `pnpm couple`.
 *
 * Здесь же решение «можно ли писать в эту базу»: оно чистое и проверяется
 * без базы в scripts/check-couple.ts.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '../src/types/db.ts'
import { makeAccounts, PIN_LENGTH, type Account, type AccountId } from '../src/lib/accounts.ts'

/** Имена переменных - старые, от первой пары: на них завязаны живой .env и сценарии qa. */
export const PIN_VAR: Record<AccountId, string> = {
  bikosh: 'LOVE_PIN_BIKOSH',
  aminosh: 'LOVE_PIN_AMINOSH',
}

export const NAME_VAR: Record<AccountId, string> = {
  bikosh: 'VITE_PUBLIC_PARTNER_1_NAME',
  aminosh: 'VITE_PUBLIC_PARTNER_2_NAME',
}

/** Часовой пояс и язык профиля: в интерфейсе пояс не меняется, а от него зависят напоминания. */
export const TIMEZONE_VAR: Record<AccountId, string> = {
  bikosh: 'PARTNER_1_TIMEZONE',
  aminosh: 'PARTNER_2_TIMEZONE',
}

export const LANGUAGE_VAR: Record<AccountId, string> = {
  bikosh: 'PARTNER_1_LANGUAGE',
  aminosh: 'PARTNER_2_LANGUAGE',
}

export const LANGUAGES = ['ru', 'kk', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value)
}

export function accountsFromVars(vars: Record<string, string>): readonly Account[] {
  return makeAccounts(vars[NAME_VAR.bikosh], vars[NAME_VAR.aminosh])
}

/** PIN из .env или текст ошибки. Значение никогда не попадает в сообщение. */
export function readPin(vars: Record<string, string>, id: AccountId): { pin: string } | { error: string } {
  const name = PIN_VAR[id]
  const pin = vars[name] ?? ''
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    return { error: `${name}: нужен PIN ровно из ${PIN_LENGTH} цифр, например ${name}="583921"` }
  }
  return { pin }
}

/** Участник пары, уже записанный в базе. */
export type Member = { email: string | null; nickname: string | null }

export type Verdict =
  /** В базе никого: новая пара. */
  | { kind: 'fresh' }
  /** Те же люди с теми же именами: повторный запуск. */
  | { kind: 'same' }
  /** Те же аккаунты, имена меняются по явной просьбе. */
  | { kind: 'rename'; from: string[] }
  /** Те же аккаунты, но другие имена: скорее всего, это база другой пары. */
  | { kind: 'other-couple'; names: string[] }
  /** Участники с чужими адресами: это вообще не раскладка этого приложения. */
  | { kind: 'foreign' }

/**
 * Можно ли заводить пару в этой базе.
 *
 * Главная опасность - .env, скопированный у другой пары: скрипт переписал бы
 * им имена и PIN-ы. Отличить это от повторного запуска можно только по именам,
 * поэтому несовпадение имён останавливает запуск, пока не попросят явно.
 * Профиля может не быть, если прошлый запуск оборвался: это не повод останавливаться.
 */
export function judgeDatabase(members: readonly Member[], accounts: readonly Account[], rename: boolean): Verdict {
  if (members.length === 0) return { kind: 'fresh' }
  const byEmail = new Map(accounts.map((a) => [a.email, a]))
  if (members.some((m) => !m.email || !byEmail.has(m.email))) return { kind: 'foreign' }
  const differ = members.filter((m) => m.nickname !== null && m.nickname !== byEmail.get(m.email ?? '')?.nickname)
  if (differ.length === 0) return { kind: 'same' }
  const names = members.flatMap((m) => (m.nickname ? [m.nickname] : []))
  return rename ? { kind: 'rename', from: names } : { kind: 'other-couple', names }
}

export type ProfileStart = { timezone?: string; language?: Language }

/**
 * Создаёт или чинит один аккаунт: пароль из .env, членство, профиль.
 *
 * Профиль создаётся здесь, а не триггером на auth.users: триггеры на этой таблице -
 * общий ресурс проекта, и один сломанный ломает создание аккаунтов целиком.
 * Пояс и язык пишутся, только если заданы: иначе повторный запуск затёр бы то,
 * что человек выбрал в приложении.
 */
export async function ensureAccount(
  admin: SupabaseClient<Database>,
  existing: readonly User[],
  account: Account,
  pin: string,
  start: ProfileStart = {},
): Promise<'создан' | 'обновлён'> {
  const found = existing.find((u) => u.email === account.email)
  let userId: string
  let action: 'создан' | 'обновлён'

  if (found) {
    // Приводим к состоянию из .env - в том числе сбрасываем PIN, если он забыт
    const { data, error } = await admin.auth.admin.updateUserById(found.id, {
      password: pin,
      user_metadata: { nickname: account.nickname },
    })
    if (error) throw new Error(`${account.nickname}: не удалось обновить - ${error.message}`)
    userId = data.user.id
    action = 'обновлён'
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
    action = 'создан'
  }

  const { error: memberError } = await admin.from('app_members').upsert({ user_id: userId }, { onConflict: 'user_id' })
  if (memberError) throw new Error(`${account.nickname}: app_members - ${memberError.message}`)

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      user_id: userId,
      nickname: account.nickname,
      ...(start.timezone ? { timezone: start.timezone } : {}),
      ...(start.language ? { language: start.language } : {}),
    },
    { onConflict: 'user_id' },
  )
  if (profileError) throw new Error(`${account.nickname}: profiles - ${profileError.message}`)

  return action
}

export async function listUsers(admin: SupabaseClient<Database>): Promise<User[]> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(`Не удалось получить список пользователей: ${error.message}`)
  return data.users
}
