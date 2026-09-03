import { useCallback, useState } from 'react'

/**
 * Булев переключатель, переживающий перезагрузку.
 *
 * Для мелочей вроде «блок свёрнут»: такое должно помниться, но не стоит
 * ни запроса к базе, ни синхронизации между устройствами — на телефоне
 * и на ноутбуке удобно по-разному.
 *
 * Любое обращение к localStorage обёрнуто: в приватном режиме и при забитом
 * хранилище оно бросает, а из-за настройки вида списка приложение падать
 * не должно.
 */
export function useLocalFlag(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored === null ? fallback : stored === '1'
    } catch {
      return fallback
    }
  })

  const update = useCallback(
    (next: boolean) => {
      setValue(next)
      try {
        localStorage.setItem(key, next ? '1' : '0')
      } catch {
        /* см. выше */
      }
    },
    [key],
  )

  return [value, update]
}
