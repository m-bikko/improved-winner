/**
 * Аккаунты приложения.
 *
 * Их ровно два, и экран входа показывает их без запроса к базе: PIN вводится до того,
 * как появится хоть какая-то сессия. Поэтому имена задаются сборкой, как и название
 * приложения: VITE_PUBLIC_PARTNER_1_NAME и VITE_PUBLIC_PARTNER_2_NAME. Пусто - имена
 * пары, для которой приложение писалось.
 *
 * Адреса служебные и одинаковые в любой установке: у каждой пары свой проект Supabase,
 * а на экране адрес нигде не виден. Менять их нельзя - это опознаватели живых аккаунтов,
 * и смена разлогинила бы обоих. Почты за ними нет, письма туда не уходят, поэтому
 * восстановления пароля по email нет: при забытом PIN единственный путь -
 * scripts/bootstrap-users.ts с секретным ключом.
 *
 * PIN-ов здесь нет и быть не должно: они живут в .env, который не в репозитории.
 */
export type AccountId = 'bikosh' | 'aminosh'

export type Account = {
  id: AccountId
  nickname: string
  email: string
}

/**
 * Аккаунты с именами из переменных. Отдельной функцией, потому что скриптам
 * имена нужны тоже, а `import.meta.env` под `tsx` нет: они передают имена из .env сами.
 */
export function makeAccounts(first?: string, second?: string): readonly Account[] {
  return [
    { id: 'bikosh', nickname: first?.trim() || 'Бикош', email: 'bikosh@lovepromises.app' },
    { id: 'aminosh', nickname: second?.trim() || 'Аминош', email: 'aminosh@lovepromises.app' },
  ]
}

// Объект целиком, а не поле по имени: под `tsx` сборочных переменных нет вовсе
const env: Partial<ImportMetaEnv> = import.meta.env ?? {}

export const ACCOUNTS: readonly Account[] = makeAccounts(env.VITE_PUBLIC_PARTNER_1_NAME, env.VITE_PUBLIC_PARTNER_2_NAME)

export const PIN_LENGTH = 6

/**
 * Аккаунт повара. Не участник пары: в app_members его нет, и права ему даёт
 * только набор политик повара. Пароля как такового нет - секрет приходит
 * в ссылке, которую выпускает владелец (cook_link_issue).
 */
export const COOK_EMAIL = 'cook@lovepromises.app'
