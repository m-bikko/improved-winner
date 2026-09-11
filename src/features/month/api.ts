import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type MonthPerson = {
  userId: string
  nickname: string
  days: number
  avgKcal: number | null
  avgGoal: number | null
  /** Норма минус съеденное за все записанные дни. Положительный - дефицит. */
  deficit: number | null
  /** Сколько кило это объясняет: дефицит / 7700. */
  expectedKg: number | null
  weightFrom: number | null
  weightTo: number | null
  weightPoints: number
  workouts: number
  workoutMinutes: number
  workoutKcal: number
}

export type MonthSummary = {
  year: number
  month: number
  people: MonthPerson[]
}

export function useMonthSummary(year: number, month: number) {
  return useQuery({
    queryKey: ['month-summary', year, month],
    queryFn: async (): Promise<MonthSummary> => {
      const { data, error } = await supabase.rpc('month_summary', { year, month })
      if (error) throw error
      return data as unknown as MonthSummary
    },
  })
}
