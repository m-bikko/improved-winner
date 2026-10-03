import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/db'

type Row = Database['public']['Tables']['wishlists']['Row']

export type Wish = {
  id: string
  title: string
  details: string | null
  category: string
  /** Путь объекта в бакете. Готовый URL не хранится - он протухает. */
  imagePath: string | null
  sortOrder: number
  createdBy: string
  createdAt: string
}

function fromRow(r: Row): Wish {
  return {
    id: r.id,
    title: r.title,
    details: r.details,
    category: r.category,
    imagePath: r.image_path,
    sortOrder: r.sort_order,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

export function useWishes() {
  return useQuery({
    queryKey: ['wishlist'],
    queryFn: async (): Promise<Wish[]> => {
      const { data, error } = await supabase
        .from('wishlists')
        .select('*')
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data.map(fromRow)
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: ['wishlist'] })
}

export function useSaveWish() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      title: string
      details: string | null
      category: string
    }): Promise<string> => {
      const row = {
        title: input.title.trim(),
        details: input.details?.trim() || null,
        category: input.category,
      }
      if (input.id) {
        const { error } = await supabase.from('wishlists').update(row).eq('id', input.id)
        if (error) throw error
        return input.id
      }
      const { data, error } = await supabase.from('wishlists').insert(row).select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: done,
  })
}

export function useDeleteWish() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wishlists').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: done,
  })
}

/**
 * Новый порядок - одним вызовом.
 *
 * Не серией обновлений: оборванная на середине серия оставила бы список
 * переставленным наполовину, и понять, что пошло не так, было бы нельзя.
 */
export function useReorderWishes() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('reorder_wishlists', { ids })
      if (error) throw error
    },
    onSuccess: done,
  })
}

// --- картинки ---------------------------------------------------------------

const PHOTO_BUCKET = 'wishlist-photos'

/** Час с запасом: ссылки кэшируются на 50 минут. */
const SIGNED_URL_TTL = 3600

/**
 * Подписанные ссылки - пачкой на весь список.
 *
 * Бакет приватный, прямых URL нет. Просить ссылку на каждую строку отдельно
 * означало бы запрос на строку при открытии раздела.
 */
export function useWishPhotoUrls(paths: readonly string[]) {
  const key = [...paths].sort().join(',')
  return useQuery({
    queryKey: ['wishlist-photo-urls', key],
    queryFn: async (): Promise<Record<string, string>> => {
      if (paths.length === 0) return {}
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls([...paths], SIGNED_URL_TTL)
      if (error) throw error
      const urls: Record<string, string> = {}
      for (const item of data ?? []) {
        if (item.signedUrl && item.path) urls[item.path] = item.signedUrl
      }
      return urls
    },
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    gcTime: 50 * 60_000,
  })
}

/**
 * Загружает готовый квадрат и привязывает его к желанию.
 *
 * Имя объекта случайное, старый файл удаляется ПОСЛЕ привязки нового:
 * запись по тому же пути оставила бы браузер и CDN отдавать прежнюю картинку,
 * а обратный порядок - строку со ссылкой в никуда, если удаление прошло,
 * а загрузка нет.
 */
export function useUploadWishPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      wishId,
      blob,
      extension,
      previousPath,
    }: {
      wishId: string
      blob: Blob
      extension: string
      previousPath: string | null
    }): Promise<{ path: string; bytes: number }> => {
      const path = `${wishId}/${crypto.randomUUID()}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })
      if (uploadError) throw uploadError

      const { error } = await supabase
        .from('wishlists')
        .update({ image_path: path })
        .eq('id', wishId)
      if (error) throw error

      if (previousPath) await supabase.storage.from(PHOTO_BUCKET).remove([previousPath])
      return { path, bytes: blob.size }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wishlist'] })
      void qc.invalidateQueries({ queryKey: ['wishlist-photo-urls'] })
    },
  })
}

export function useRemoveWishPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ wishId, path }: { wishId: string; path: string }) => {
      const { error } = await supabase
        .from('wishlists')
        .update({ image_path: null })
        .eq('id', wishId)
      if (error) throw error
      await supabase.storage.from(PHOTO_BUCKET).remove([path])
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wishlist'] })
      void qc.invalidateQueries({ queryKey: ['wishlist-photo-urls'] })
    },
  })
}

/** Своя бронь подарка: когда подарено (пусто - ещё нет). */
export type Reservation = { wishId: string; giftedOn: string | null }

/**
 * Тайные брони подарков - только свои. Владелец желания их не видит:
 * RLS не отдаёт ему ни строки, поэтому и ключ кэша у каждого свой смысл.
 */
export function useReservations() {
  return useQuery({
    queryKey: ['wishlist', 'reservations'],
    queryFn: async (): Promise<Record<string, Reservation>> => {
      const { data, error } = await supabase.from('wish_reservations').select('wish_id, gifted_on')
      if (error) throw error
      return Object.fromEntries(data.map((r) => [r.wish_id, { wishId: r.wish_id, giftedOn: r.gifted_on }]))
    },
  })
}

export function useSetReservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { wishId: string; state: 'reserved' | 'gifted' | null; today: string }) => {
      if (input.state === null) {
        const { error } = await supabase.from('wish_reservations').delete().eq('wish_id', input.wishId)
        if (error) throw error
        return
      }
      const { error } = await supabase
        .from('wish_reservations')
        .upsert({ wish_id: input.wishId, gifted_on: input.state === 'gifted' ? input.today : null }, { onConflict: 'wish_id' })
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['wishlist', 'reservations'] }),
  })
}
