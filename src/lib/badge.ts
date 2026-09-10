import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

type BadgeApi = {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/**
 * Число на иконке: «сколько требует тебя».
 *
 * Считает база (`attention_count`), а не клиент, хотя данные для этого
 * на экране уже есть. Причина одна: то же число ставит service worker,
 * когда прилетает push при закрытом приложении, и вторая копия правила
 * на TypeScript однажды разошлась бы с первой - человек увидел бы, как
 * бейдж меняется в момент открытия приложения, и не понял бы, какому
 * из чисел верить.
 *
 * Между обновлениями число может отставать: срок задачи наступает сам,
 * без всякого действия. Для бейджа это допустимо - он ориентир, а не счётчик.
 */
export function useAppBadge(enabled: boolean): void {
  const { data } = useQuery({
    queryKey: ['attention'],
    enabled,
    queryFn: async (): Promise<number> => {
      const { data: value, error } = await supabase.rpc('attention_count', {
        target: (await supabase.auth.getUser()).data.user?.id ?? '',
      })
      if (error) throw error
      return value ?? 0
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (data === undefined) return
    void setBadge(data)
  }, [data])
}

/**
 * Ставит или снимает бейдж.
 *
 * Отдельно от хука, потому что то же самое делает service worker: правило
 * «ноль - значит снять» должно быть одинаковым, иначе на иконке зависнет
 * ноль, который в iOS выглядит как единица в кружке.
 */
export async function setBadge(count: number): Promise<void> {
  const api = navigator as unknown as BadgeApi
  try {
    if (count > 0) await api.setAppBadge?.(count)
    else await api.clearAppBadge?.()
  } catch {
    // Бейдж - украшение. Браузер без поддержки или отозванное разрешение
    // не повод ронять экран
  }
}
