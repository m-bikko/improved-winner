import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/db'

type Row = Database['public']['Tables']['letters']['Row']

export type LetterAudience = 'partner' | 'both'

export type Letter = {
  id: string
  authorId: string
  audience: LetterAudience
  deliverOn: string
  body: string
  deliveredAt: string | null
  createdAt: string
}

function fromRow(r: Row): Letter {
  return {
    id: r.id,
    authorId: r.author_id,
    audience: r.audience as LetterAudience,
    deliverOn: r.deliver_on,
    body: r.body,
    deliveredAt: r.delivered_at,
    createdAt: r.created_at,
  }
}

/**
 * Письма, которые мне позволено видеть.
 *
 * Фильтр не пишем: его держит политика. Чужое письмо до срока не приедет
 * сюда вовсе, и это правильное место для такого правила - экран можно обойти,
 * политику нет.
 */
export function useLetters() {
  return useQuery({
    queryKey: ['letters'],
    queryFn: async (): Promise<Letter[]> => {
      const { data, error } = await supabase
        .from('letters')
        .select('*')
        .order('deliver_on', { ascending: true })
      if (error) throw error
      return data.map(fromRow)
    },
  })
}

export function useSaveLetter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      body: string
      deliverOn: string
      audience: LetterAudience
    }) => {
      const row = {
        body: input.body.trim(),
        deliver_on: input.deliverOn,
        audience: input.audience,
      }
      const { error } = input.id
        ? await supabase.from('letters').update(row).eq('id', input.id)
        : await supabase.from('letters').insert(row)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['letters'] }),
  })
}

export function useDeleteLetter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('letters').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['letters'] }),
  })
}
