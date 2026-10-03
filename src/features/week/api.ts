import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type WeekPerson = {
  userId: string
  nickname: string
  diaryDays: number
  avgKcal: number | null
  avgGoal: number | null
  workouts: number
  workoutMinutes: number
  weightFrom: number | null
  weightTo: number | null
  checkins: number
  gratitudes: number
  questions: number
  challengeMarks: number
  voice: number
  shots: number
}

export type WeekSummary = {
  from: string
  to: string
  people: WeekPerson[]
  together: { questions: number; shots: number; memories: number; watched: number; meetingDays: number; deposits: number }
}

/** Сводка недели с понедельника `from` - одна функция базы на экран и на push. */
export function useWeekSummary(from: string) {
  return useQuery({
    queryKey: ['week-summary', from],
    queryFn: async (): Promise<WeekSummary> => {
      const { data, error } = await supabase.rpc('week_summary', { d0: from })
      if (error) throw error
      return data as unknown as WeekSummary
    },
  })
}
