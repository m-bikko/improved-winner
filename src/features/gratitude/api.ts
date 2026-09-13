import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/db'

type Row = Database['public']['Tables']['gratitudes']['Row']

export type Gratitude = {
  id: string
  authorId: string
  body: string
  createdAt: string
}

function fromRow(row: Row): Gratitude {
  return {
    id: row.id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
  }
}

/** Сколько держим на экране. Журнал тут не архив, а недавняя память. */
const RECENT = 30

/**
 * Благодарности обоих сразу.
 *
 * Одним запросом и без разделения по автору: смысл раздела в том, чтобы
 * видеть и своё, и чужое рядом. Разделив, мы получили бы два списка,
 * из которых один человек читает только второй.
 */
export function useGratitudes() {
  return useQuery({
    queryKey: ['gratitudes'],
    queryFn: async (): Promise<Gratitude[]> => {
      const { data, error } = await supabase
        .from('gratitudes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(RECENT)
      if (error) throw error
      return (data ?? []).map(fromRow)
    },
  })
}

export function useAddGratitude() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string): Promise<void> => {
      const { error } = await supabase.from('gratitudes').insert({ body: body.trim() })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gratitudes'] }),
  })
}

/**
 * Удаление только своего - это держит база.
 *
 * Чужую благодарность стереть нельзя, и это не про безопасность: сказанное
 * вслух не должно зависеть от настроения того, кому сказали.
 */
export function useDeleteGratitude() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('gratitudes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gratitudes'] }),
  })
}
