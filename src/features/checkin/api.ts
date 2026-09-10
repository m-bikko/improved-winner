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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['checkins'] })
      // Отметка двигает огонёк, а восстановление становится ненужным -
      // оставить их несвежими значило бы показать вчерашнее число
      void qc.invalidateQueries({ queryKey: ['checkin-streaks'] })
      void qc.invalidateQueries({ queryKey: ['checkin-restorable'] })
      // И снимает единицу с иконки
      void qc.invalidateQueries({ queryKey: ['attention'] })
    },
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['checkins'] })
      // Отметка двигает огонёк, а восстановление становится ненужным -
      // оставить их несвежими значило бы показать вчерашнее число
      void qc.invalidateQueries({ queryKey: ['checkin-streaks'] })
      void qc.invalidateQueries({ queryKey: ['checkin-restorable'] })
      // И снимает единицу с иконки
      void qc.invalidateQueries({ queryKey: ['attention'] })
    },
  })
}

/**
 * Огоньки обоих: сколько дней подряд человек отмечался.
 *
 * Считает база, а не клиент. Копия арифметики на TS была бы третьей
 * (SQL для вечернего напоминания, SQL для экрана) - и первая разошедшаяся
 * копия показала бы уверенное неправильное число.
 */
export function useStreaks(today: string) {
  return useQuery({
    queryKey: ['checkin-streaks', today],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc('checkin_streaks', { today })
      if (error) throw error
      return Object.fromEntries(data.map((r) => [r.user_id, r.streak ?? 0]))
    },
  })
}

export type Restorable = { date: string; monthLeft: number }

/** Пропущенные дни за неделю и сколько восстановлений осталось в их месяце. */
export function useRestorable(today: string) {
  return useQuery({
    queryKey: ['checkin-restorable', today],
    queryFn: async (): Promise<Restorable[]> => {
      const { data, error } = await supabase.rpc('checkin_restorable', { today })
      if (error) throw error
      return data.map((r) => ({ date: r.date, monthLeft: r.month_left ?? 0 }))
    },
  })
}

/**
 * Восстановление пропущенного дня.
 *
 * Окно и лимит проверяет база: форма показывает только то, что уже разрешено,
 * но полагаться на это нельзя - между показом и нажатием проходит время,
 * а вкладок бывает две.
 */
export function useRestoreDay(today: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (date: string) => {
      const { error } = await supabase.rpc('restore_checkin_day', {
        target_date: date,
        today,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['checkin-streaks'] })
      void qc.invalidateQueries({ queryKey: ['checkin-restorable'] })
    },
  })
}
