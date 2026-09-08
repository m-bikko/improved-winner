import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type OccasionKind = 'birthday' | 'anniversary' | 'other'

export type Occasion = {
  id: string
  title: string
  /** Исходная дата вместе с годом - по нему считается, которая это годовщина. */
  date: string
  kind: OccasionKind
  yearly: boolean
  note: string | null
  createdBy: string
  /** Ближайшее наступление. */
  nextOn: string
  /** Сколько дней осталось. 0 - сегодня. */
  days: number
  /** Которая это годовщина. 0 - считать нечего. */
  years: number
}

export type OccasionInput = {
  title: string
  date: string
  kind: OccasionKind
  yearly: boolean
  note: string | null
}

/**
 * Даты сразу с числом дней до ближайшего наступления.
 *
 * Считает база: календарная арифметика на 29 февраля ведёт себя неочевидно,
 * и вторая её копия на клиенте разошлась бы с рассылкой ровно в тот год,
 * когда это заметнее всего.
 */
export function useOccasions(today: string) {
  return useQuery({
    queryKey: ['occasions', today],
    queryFn: async (): Promise<Occasion[]> => {
      const { data, error } = await supabase.rpc('occasions_upcoming', { today })
      if (error) throw error
      return data.map((r) => ({
        id: r.id,
        title: r.title,
        date: r.date,
        kind: r.kind as OccasionKind,
        yearly: r.yearly,
        note: r.note,
        createdBy: r.created_by,
        nextOn: r.next_on,
        days: r.days,
        years: r.years,
      }))
    },
  })
}

export function useSaveOccasion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: OccasionInput & { id?: string }) => {
      const row = {
        title: input.title.trim(),
        date: input.date,
        kind: input.kind,
        yearly: input.yearly,
        note: input.note?.trim() || null,
      }
      const { error } = input.id
        ? await supabase.from('occasions').update(row).eq('id', input.id)
        : await supabase.from('occasions').insert(row)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['occasions'] }),
  })
}

export function useDeleteOccasion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('occasions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['occasions'] }),
  })
}
