import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/db'

type Row = Database['public']['Tables']['workouts']['Row']

export type Workout = {
  id: string
  userId: string
  date: string
  kind: string
  minutes: number
  /** Снимок расхода на момент записи. */
  kcal: number
  note: string | null
}

function fromRow(r: Row): Workout {
  return {
    id: r.id,
    userId: r.user_id,
    date: r.date,
    kind: r.kind,
    minutes: r.minutes,
    kcal: Number(r.kcal),
    note: r.note,
  }
}

/** Тренировки обоих за день - как и дневник, раздел общий на чтение. */
export function useWorkouts(date: string) {
  return useQuery({
    queryKey: ['workouts', date],
    queryFn: async (): Promise<Workout[]> => {
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .eq('date', date)
        .order('created_at')
      if (error) throw error
      return data.map(fromRow)
    },
  })
}

export function useSaveWorkout() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      date: string
      kind: string
      minutes: number
      kcal: number
      note: string | null
    }) => {
      const row = {
        user_id: userId,
        date: input.date,
        kind: input.kind,
        minutes: input.minutes,
        kcal: input.kcal,
        note: input.note?.trim() || null,
      }
      const { error } = input.id
        ? await supabase.from('workouts').update(row).eq('id', input.id)
        : await supabase.from('workouts').insert(row)
      if (error) throw error
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['workouts', v.date] }),
  })
}

export function useDeleteWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; date: string }) => {
      const { error } = await supabase.from('workouts').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['workouts', v.date] }),
  })
}
