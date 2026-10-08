/**
 * Режим приложения на этом устройстве: пара или повар.
 *
 * Повар входит по ссылке /cook#секрет и дальше пользуется теми же экранами
 * продуктов, что и пара, - но под своим аккаунтом и со своим набором прав
 * (их держит база). Режим решается ОДИН раз при загрузке, до создания
 * клиента Supabase и кэша запросов: от него зависят ключ сессии и ключ кэша.
 * Иначе ссылка, открытая на телефоне Бикоша, выкинула бы его из аккаунта,
 * а кэш повара смешался бы с кэшем пары.
 *
 * Однажды открытая ссылка запоминает режим: повар добавляет приложение
 * на экран «Домой», и иконка открывает его экран, а не PIN-пад.
 */
const MODE_KEY = 'love-promises-mode'

function detect(): 'pair' | 'cook' {
  try {
    if (window.location.pathname.startsWith('/cook') && window.location.hash.length > 1) {
      localStorage.setItem(MODE_KEY, 'cook')
      return 'cook'
    }
    return localStorage.getItem(MODE_KEY) === 'cook' ? 'cook' : 'pair'
  } catch {
    // Хранилище недоступно - режим живёт только для этой загрузки
    return window.location.pathname.startsWith('/cook') ? 'cook' : 'pair'
  }
}

export const MODE = detect()
export const isCookMode = MODE === 'cook'

/** Выйти из режима повара: устройство снова приложение пары. */
export function leaveCookMode(): void {
  try {
    localStorage.removeItem(MODE_KEY)
  } catch {
    /* нечего чистить */
  }
}
