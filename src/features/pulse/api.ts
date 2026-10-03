import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { tr } from '@/lib/i18n'

export type PulseEntry = { userId: string; month: string; scores: number[]; note: string | null }

const KEY = ['pulse'] as const

/** Видимые оценки (свои и раскрытые) и кто за какой месяц ответил. */
export function usePulse() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<{ entries: PulseEntry[]; progress: { month: string; userId: string }[] }> => {
      const [entries, progress] = await Promise.all([
        supabase.from('pulse_entries').select('*').order('month', { ascending: false }),
        supabase.rpc('pulse_progress'),
      ])
      if (entries.error) throw entries.error
      if (progress.error) throw progress.error
      return {
        entries: entries.data.map((e) => ({ userId: e.user_id, month: e.month, scores: e.scores, note: e.note })),
        progress: (progress.data ?? []).map((p) => ({ month: p.month, userId: p.user_id })),
      }
    },
  })
}

export function useSavePulse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { userId: string; month: string; scores: number[]; note: string; existing: boolean }) => {
      const row = { scores: input.scores, note: input.note.trim() || null }
      if (input.existing) {
        const { data, error } = await supabase
          .from('pulse_entries')
          .update(row)
          .eq('user_id', input.userId)
          .eq('month', input.month)
          .select('month')
        if (error) throw error
        // Политика молча не находит строку, если второй уже ответил
        if (!data || data.length === 0) throw new Error(tr('pl.lockedNow'))
        return
      }
      const { error } = await supabase.from('pulse_entries').insert({ user_id: input.userId, month: input.month, ...row })
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}
