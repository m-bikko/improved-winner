/**
 * Аккаунты приложения.
 *
 * Их ровно два и они не меняются, поэтому список захардкожен: экрану входа
 * не нужен запрос к базе, чтобы показать две карточки, а PIN вводится до того,
 * как появится хоть какая-то сессия.
 *
 * Адреса синтетические - почты за ними не существует и письма туда не уходят.
 * Отсюда важное следствие: восстановления пароля по email нет, единственный путь
 * при забытом PIN - scripts/bootstrap-users.ts с секретным ключом.
 *
 * PIN-ов здесь нет и быть не должно: они живут в .env, который не в репозитории.
 */
export type AccountId = 'bikosh' | 'aminosh'

export type Account = {
  id: AccountId
  nickname: string
  email: string
}

export const ACCOUNTS: readonly Account[] = [
  { id: 'bikosh', nickname: 'Бикош', email: 'bikosh@lovepromises.app' },
  { id: 'aminosh', nickname: 'Аминош', email: 'aminosh@lovepromises.app' },
]

export const PIN_LENGTH = 6

/**
 * Аккаунт повара. Не участник пары: в app_members его нет, и права ему даёт
 * только набор политик повара. Пароля как такового нет - секрет приходит
 * в ссылке, которую выпускает владелец (cook_link_issue).
 */
export const COOK_EMAIL = 'cook@lovepromises.app'
