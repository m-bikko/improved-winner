import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type PersonYear = {
  userId: string
  nickname: string
  checkinDays: number
  bestStreak: number
  topStates: { id: string; n: number }[]
  diaryDays: number
  avgKcal: number | null
  topFoods: { name: string; n: number }[]
  workouts: number
  workoutMinutes: number
  workoutKcal: number
  weightFrom: number | null
  weightTo: number | null
}

export type YearSummary = {
  year: number
  people: PersonYear[]
  together: {
    topicsOpened: number
    topicsClosed: number
    tasksDone: number
    wishesAdded: number
    commentsWritten: number
  }
}

/**
 * Итог года одним запросом.
 *
 * Считает база: за годом дневника пришлось бы тянуть тысячи строк ради
 * семи чисел, а сводка нужна раз в год и целиком.
 */
export function useYear(year: number) {
  return useQuery({
    queryKey: ['year', year],
    queryFn: async (): Promise<YearSummary> => {
      const { data, error } = await supabase.rpc('year_in_numbers', { year })
      if (error) throw error
      return data as unknown as YearSummary
    },
  })
}
