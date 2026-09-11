import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Столько кнопка остывает. То же число стоит в базе - она и решает. */
export const NUDGE_COOLDOWN_MS = 30 * 60_000

/** Когда я в последний раз нажимал. null - ещё ни разу. */
export function useLastNudge() {
  return useQuery({
    queryKey: ['last-nudge'],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc('last_nudge')
      if (error) throw error
      return data ?? null
    },
  })
}

/**
 * Отправка.
 *
 * Остывание проверяет БАЗА, а не экран: заблокированную кнопку обходят
 * перезагрузкой страницы. Экран только показывает остывание заранее,
 * чтобы человек узнавал о нём не из ошибки.
 */
export function useSendNudge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('send_nudge')
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['last-nudge'] }),
  })
}
