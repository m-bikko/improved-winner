import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/db'

type ListRow = Database['public']['Tables']['lists']['Row']
type ItemRow = Database['public']['Tables']['list_items']['Row']

export type ListItem = {
  id: string
  listId: string
  title: string
  note: string | null
  doneAt: string | null
  doneBy: string | null
  createdBy: string
  createdAt: string
}

export type List = {
  id: string
  title: string
  createdBy: string
  items: ListItem[]
}

function itemFromRow(r: ItemRow): ListItem {
  return {
    id: r.id,
    listId: r.list_id,
    title: r.title,
    note: r.note,
    doneAt: r.done_at,
    doneBy: r.done_by,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

/**
 * Списки вместе с пунктами - двумя запросами, а не вложенным select.
 *
 * Списков тут единицы, пунктов десятки. Собрать их на клиенте дешевле, чем
 * тянуть вложенную выборку, и главное - кэш остаётся плоским: пункт правится
 * куда чаще, чем сам список.
 */
export function useLists() {
  return useQuery({
    queryKey: ['lists'],
    queryFn: async (): Promise<List[]> => {
      const [lists, items] = await Promise.all([
        supabase.from('lists').select('*').order('created_at'),
        supabase.from('list_items').select('*').order('created_at', { ascending: false }),
      ])
      if (lists.error) throw lists.error
      if (items.error) throw items.error

      const byList = new Map<string, ListItem[]>()
      for (const row of items.data) {
        const item = itemFromRow(row)
        const bucket = byList.get(item.listId)
        if (bucket) bucket.push(item)
        else byList.set(item.listId, [item])
      }
      return lists.data.map((l: ListRow) => ({
        id: l.id,
        title: l.title,
        createdBy: l.created_by,
        items: byList.get(l.id) ?? [],
      }))
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: ['lists'] })
}

export function useSaveList() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (input: { id?: string; title: string }) => {
      const title = input.title.trim()
      const { error } = input.id
        ? await supabase.from('lists').update({ title }).eq('id', input.id)
        : await supabase.from('lists').insert({ title })
      if (error) throw error
    },
    onSuccess: done,
  })
}

export function useDeleteList() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lists').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: done,
  })
}

export function useAddItem() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (input: { listId: string; title: string }) => {
      const { error } = await supabase
        .from('list_items')
        .insert({ list_id: input.listId, title: input.title.trim() })
      if (error) throw error
    },
    onSuccess: done,
  })
}

/**
 * Отметка «сделано» вместе с тем, кто отметил.
 *
 * Пара done_at/done_by держится ограничением в базе, поэтому обнулять
 * их нужно вдвоём - иначе снятая галочка оставила бы висеть автора.
 */
export function useToggleItem() {
  const done = useInvalidate()
  const userId = useUserId()
  return useMutation({
    mutationFn: async (input: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from('list_items')
        .update(
          input.done
            ? { done_at: new Date().toISOString(), done_by: userId }
            : { done_at: null, done_by: null },
        )
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: done,
  })
}

export function useDeleteItem() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('list_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: done,
  })
}
