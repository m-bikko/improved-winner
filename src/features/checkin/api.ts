import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/db'
import type { Checkin } from './states'

type Row = Database['public']['Tables']['checkins']['Row']

function fromRow(row: Row): Checkin {
  return {
    userId: row.user_id,
    date: row.date,
    states: row.states ?? [],
    note: row.note,
  }
}

/**
 * Отметки обоих участников сразу.
 *
 * Одним запросом, а не по человеку: строк тут две в день на двоих, и раздел
 * ради того и существует, чтобы видеть оба ответа рядом. Разделять их
 * на два запроса значило бы платить дважды за то, что всегда нужно вместе.
 */
export function useCheckins() {
  return useQuery({
    queryKey: ['checkins'],
    queryFn: async (): Promise<Checkin[]> => {
      const { data, error } = await supabase
        .from('checkins')
        .select('*')
        .order('date', { ascending: false })
        .limit(120)
      if (error) throw error
      return data.map(fromRow)
    },
  })
}

export function useSaveCheckin() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: async (input: { date: string; states: string[]; note: string | null }) => {
      const { error } = await supabase.from('checkins').upsert({
        user_id: userId,
        date: input.date,
        states: input.states,
        note: input.note?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['checkins'] }),
  })
}

/** Пустую отметку база не принимает, поэтому «стереть всё» - это удалить строку. */
export function useDeleteCheckin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (date: string) => {
      const { error } = await supabase.from('checkins').delete().eq('date', date)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['checkins'] }),
  })
}
