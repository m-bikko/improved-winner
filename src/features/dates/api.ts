import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

import { OCCASION_KINDS, type OccasionKind } from './kinds'

export { OCCASION_KINDS, type OccasionKind }

export type Occasion = {
  id: string
  title: string
  /** Исходная дата вместе с годом - по нему считается, которая это годовщина. */
  date: string
  kind: OccasionKind
  yearly: boolean
  note: string | null
  createdBy: string
  /** Чей день рождения - если это один из двоих. */
  personId: string | null
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
  personId: string | null
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
      // «Чей день» - отдельным лёгким запросом: функцию с другим набором
      // колонок пришлось бы пересоздавать, а нужно одно поле
      const [{ data, error }, people] = await Promise.all([
        supabase.rpc('occasions_upcoming', { today }),
        supabase.from('occasions').select('id, person_id'),
      ])
      if (error) throw error
      if (people.error) throw people.error
      const whose = new Map(people.data.map((p) => [p.id, p.person_id]))
      return data.map((r) => ({
        id: r.id,
        title: r.title,
        date: r.date,
        kind: r.kind as OccasionKind,
        yearly: r.yearly,
        note: r.note,
        createdBy: r.created_by,
        personId: whose.get(r.id) ?? null,
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
        // Чей - только у дня рождения (это держит и CHECK в базе)
        person_id: input.kind === 'birthday' ? input.personId : null,
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
