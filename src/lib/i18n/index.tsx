import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isLang, pluralFor, type Lang } from './lang'
import { ru, type Key } from './ru'
import { kk } from './kk'
import { en } from './en'

const DICTS: Record<Lang, Record<Key, string>> = { ru, kk, en }

const STORE_KEY = 'love-promises-lang'

type Ctx = {
  lang: Lang
  setLang: (lang: Lang) => void
}

const LangContext = createContext<Ctx | null>(null)

/**
 * Язык живёт в двух местах, и это не дублирование.
 *
 * В профиле - потому что он свой у каждого, переезжает на другое устройство
 * и его спрашивают рассылки. В localStorage - потому что экран входа рисуется
 * раньше, чем появляется профиль, и выбирать между «показать по-русски всем»
 * и «ждать сеть ради заголовка» не хочется.
 *
 * Профиль главнее: при расхождении localStorage подтягивается к нему.
 */
export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY)
      return isLang(saved) ? saved : 'ru'
    } catch {
      return 'ru'
    }
  })

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORE_KEY, next)
    } catch {
      /* приватный режим - язык проживёт до перезагрузки */
    }
    document.documentElement.lang = next
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang])
  return <LangContext value={value}>{children}</LangContext>
}

/**
 * Ключ, собранный из данных: `dynamicKey('state', 'joy')` → `state.joy`.
 *
 * Единственное место, где тип ключа приходится утверждать вручную.
 * Иначе каст расползся бы по всем словарным экранам - состояниям,
 * категориям, видам тренировок, - и гарантия «все ключи на месте»
 * превратилась бы в набор обещаний.
 */
export function dynamicKey(prefix: string, id: string): Key {
  return `${prefix}.${id}` as Key
}

export function useLang(): Ctx {
  const ctx = use(LangContext)
  if (!ctx) throw new Error('LangProvider не подключён')
  return ctx
}

export type Translate = {
  (key: Key, vars?: Record<string, string | number>): string
  /** Считаемое слово: ключ без суффикса, дальше `.one/.few/.many`. */
  plural: (key: string, n: number) => string
  lang: Lang
}

/**
 * Перевод.
 *
 * Подстановка простая, `{имя}` - без форматов и падежей: всё, что сложнее,
 * в трёх языках сразу всё равно не сойдётся, и такие места честнее собирать
 * из отдельных ключей.
 */
export function useT(): Translate {
  const { lang } = useLang()

  return useMemo(() => {
    const dict = DICTS[lang]

    const translate = ((key: Key, vars?: Record<string, string | number>) => {
      // Русский - запасной вариант: пустая строка на экране хуже чужого языка
      const raw = dict[key] ?? ru[key] ?? key
      if (!vars) return raw
      return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in vars ? String(vars[name]) : whole,
      )
    }) as Translate

    translate.lang = lang
    translate.plural = (key: string, n: number) => {
      const pick = (suffix: string) => dict[`${key}.${suffix}` as Key] ?? ''
      return pluralFor(lang, n, pick('one'), pick('few'), pick('many'))
    }
    return translate
  }, [lang])
}
