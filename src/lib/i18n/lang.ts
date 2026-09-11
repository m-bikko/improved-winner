export const LANGS = ['ru', 'kk', 'en'] as const
export type Lang = (typeof LANGS)[number]

export const LANG_NAMES: Record<Lang, string> = {
  ru: 'Русский',
  kk: 'Қазақша',
  en: 'English',
}

/** Локаль для дат и чисел. Формат вывода не переводится - он берётся отсюда. */
export const LOCALES: Record<Lang, string> = {
  ru: 'ru-RU',
  kk: 'kk-KZ',
  en: 'en-US',
}

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value)
}

/**
 * Множественное число.
 *
 * У трёх языков три разных правила, и сводить их к одному нельзя:
 *
 *   русский   - три формы (1 день, 2 дня, 5 дней);
 *   казахский - формы нет вовсе, существительное после числительного
 *               не изменяется (1 күн, 2 күн, 5 күн);
 *   английский- две формы (1 day, 2 days).
 *
 * Поэтому словарь хранит три варианта на каждое считаемое слово, а функция
 * выбирает по правилу языка. В казахском все три совпадают - это не изъян
 * словаря, а свойство языка, и записать его явно честнее, чем выдумывать
 * особый случай в коде.
 */
export function pluralFor(lang: Lang, n: number, one: string, few: string, many: string): string {
  if (lang === 'kk') return one
  if (lang === 'en') return Math.abs(n) === 1 ? one : many

  const abs = Math.abs(n) % 100
  if (abs > 10 && abs < 20) return many
  const last = abs % 10
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

/**
 * Активный язык вне React.
 *
 * Нужен чистым помощникам - форматированию дат, например: они вызываются
 * из десятков мест, и протаскивать язык параметром через каждое значило бы
 * менять сигнатуры всего кода ради одной подписи. Значение ставит провайдер,
 * и при его смене перерисовывается всё дерево, так что расхождения
 * на экране не будет.
 */
let active: Lang = 'ru'

export function setActiveLang(lang: Lang): void {
  active = lang
}

export function activeLang(): Lang {
  return active
}

export function activeLocale(): string {
  return LOCALES[active]
}
