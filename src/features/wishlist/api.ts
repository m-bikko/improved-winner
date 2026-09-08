import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/db'

type ListRow = Database['public']['Tables']['wishlists']['Row']
type ItemRow = Database['public']['Tables']['wishlist_items']['Row']

export type WishlistItem = {
  id: string
  wishlistId: string
  title: string
  note: string | null
  doneAt: string | null
  doneBy: string | null
  createdBy: string
  createdAt: string
}

export type Wishlist = {
  id: string
  title: string
  createdBy: string
  items: WishlistItem[]
}

function itemFromRow(r: ItemRow): WishlistItem {
  return {
    id: r.id,
    wishlistId: r.wishlist_id,
    title: r.title,
    note: r.note,
    doneAt: r.done_at,
    doneBy: r.done_by,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

/**
 * Вишлисты вместе с пунктами - двумя запросами, а не вложенным select.
 *
 * Вишлистов тут единицы, пунктов десятки. Собрать их на клиенте дешевле, чем
 * тянуть вложенную выборку, и главное - кэш остаётся плоским: пункт правится
 * куда чаще, чем сам список.
 */
export function useWishlists() {
  return useQuery({
    queryKey: ['wishlist'],
    queryFn: async (): Promise<Wishlist[]> => {
      const [lists, items] = await Promise.all([
        supabase.from('wishlists').select('*').order('created_at'),
        supabase.from('wishlist_items').select('*').order('created_at', { ascending: false }),
      ])
      if (lists.error) throw lists.error
      if (items.error) throw items.error

      const byList = new Map<string, WishlistItem[]>()
      for (const row of items.data) {
        const item = itemFromRow(row)
        const bucket = byList.get(item.wishlistId)
        if (bucket) bucket.push(item)
        else byList.set(item.wishlistId, [item])
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
  return () => void qc.invalidateQueries({ queryKey: ['wishlist'] })
}

export function useSaveWishlist() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (input: { id?: string; title: string }) => {
      const title = input.title.trim()
      const { error } = input.id
        ? await supabase.from('wishlists').update({ title }).eq('id', input.id)
        : await supabase.from('wishlists').insert({ title })
      if (error) throw error
    },
    onSuccess: done,
  })
}

export function useDeleteWishlist() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wishlists').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: done,
  })
}

export function useAddItem() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (input: { wishlistId: string; title: string }) => {
      const { error } = await supabase
        .from('wishlist_items')
        .insert({ wishlist_id: input.wishlistId, title: input.title.trim() })
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
        .from('wishlist_items')
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
      const { error } = await supabase.from('wishlist_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: done,
  })
}
