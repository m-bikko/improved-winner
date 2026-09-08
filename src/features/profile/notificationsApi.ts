import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'

export type ChannelSettings = { telegram: boolean; push: boolean }

/**
 * Настройки уведомлений: только свои, только осознанные отказы.
 *
 * Отсутствие строки означает «включено», поэтому таблица почти всегда пуста,
 * а новый вид рассылки работает сразу и не требует засева.
 */
export function useNotificationSettings() {
  return useQuery({
    queryKey: ['notification-settings'],
    queryFn: async (): Promise<Record<string, ChannelSettings>> => {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('kind, telegram, push')
      if (error) throw error
      return Object.fromEntries(data.map((r) => [r.kind, { telegram: r.telegram, push: r.push }]))
    },
  })
}

export function useSaveNotificationSetting() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: async (input: { kind: string; telegram: boolean; push: boolean }) => {
      const { error } = await supabase
        .from('notification_settings')
        .upsert(
          { user_id: userId, kind: input.kind, telegram: input.telegram, push: input.push },
          { onConflict: 'user_id,kind' },
        )
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notification-settings'] }),
  })
}

/** Тихие часы живут в профиле: они одни на все виды. */
export function useSaveQuietHours() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: async (input: { from: number | null; to: number | null }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ quiet_from: input.from, quiet_to: input.to })
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}
