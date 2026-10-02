import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MemoryImage } from '@/lib/image'

const KEY = ['memories'] as const
const BUCKET = 'memory-photos'

export type MemoryPhoto = {
  id: string
  path: string
  thumbPath: string
  width: number
  height: number
  placeholder: string
  position: number
}

export type Memory = {
  id: string
  authorId: string
  happenedOn: string
  caption: string | null
  place: string | null
  createdAt: string
  photos: MemoryPhoto[]
  /** Кто поставил сердце. */
  hearts: string[]
}

/**
 * Лента целиком, с фото и сердцами, одним запросом.
 *
 * Строки лёгкие: сами снимки в хранилище, а здесь пути и заглушка
 * в полкилобайта. Сотня воспоминаний с фото - около сотни килобайт.
 */
export function useMemories() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Memory[]> => {
      const { data, error } = await supabase
        .from('memories')
        .select('*, memory_photos(*), memory_hearts(user_id)')
        .order('happened_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map((m) => ({
        id: m.id,
        authorId: m.author_id,
        happenedOn: m.happened_on,
        caption: m.caption,
        place: m.place,
        createdAt: m.created_at,
        photos: m.memory_photos
          .map((p) => ({
            id: p.id,
            path: p.path,
            thumbPath: p.thumb_path,
            width: p.width,
            height: p.height,
            placeholder: p.placeholder,
            position: p.position,
          }))
          .sort((a, b) => a.position - b.position),
        hearts: m.memory_hearts.map((h) => h.user_id),
      }))
    },
  })
}

/** Час с запасом: ссылки кэшируются на 50 минут. */
const SIGNED_URL_TTL = 3600

/**
 * Подписанные ссылки пачкой.
 *
 * Бакет приватный. Ссылка меняется каждый час, и браузерный кэш по ней
 * промахивался бы - поэтому Service Worker держит снимки по пути без токена
 * (public/push-sw.js): объект с тем же путём не меняется никогда, имена
 * случайные. Повторное открытие ленты не качает ничего.
 */
export function useMemoryUrls(paths: readonly string[]) {
  const key = [...paths].sort().join(',')
  return useQuery({
    queryKey: ['memory-urls', key],
    queryFn: async (): Promise<Record<string, string>> => {
      if (paths.length === 0) return {}
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls([...paths], SIGNED_URL_TTL)
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

export function useSaveMemory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      isNew: boolean
      happenedOn: string
      caption: string | null
      place: string | null
    }) => {
      const row = {
        happened_on: input.happenedOn,
        caption: input.caption?.trim() || null,
        place: input.place?.trim() || null,
      }
      const { error } = input.isNew
        ? await supabase.from('memories').insert({ id: input.id, ...row })
        : await supabase.from('memories').update(row).eq('id', input.id)
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

/**
 * Загрузка одного снимка: полный размер и превью - в папку воспоминания,
 * потом строка с путями и заглушкой.
 *
 * Строка вставляется ПОСЛЕ загрузки: иначе лента на миг показала бы фото,
 * которого ещё нет в хранилище. Если вставка не прошла - загруженное
 * убирается, чтобы в бакете не копились сироты.
 */
export async function uploadMemoryPhoto(memoryId: string, image: MemoryImage, position: number): Promise<number> {
  const name = crypto.randomUUID()
  const path = `${memoryId}/${name}.${image.full.extension}`
  const thumbPath = `${memoryId}/${name}-t.${image.thumb.extension}`
  const opts = (blob: Blob) => ({ contentType: blob.type, cacheControl: '31536000', upsert: false })

  const full = await supabase.storage.from(BUCKET).upload(path, image.full.blob, opts(image.full.blob))
  if (full.error) throw full.error
  const thumb = await supabase.storage.from(BUCKET).upload(thumbPath, image.thumb.blob, opts(image.thumb.blob))
  if (thumb.error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw thumb.error
  }

  const { error } = await supabase.from('memory_photos').insert({
    memory_id: memoryId,
    path,
    thumb_path: thumbPath,
    width: image.full.width,
    height: image.full.height,
    placeholder: image.placeholder,
    position,
  })
  if (error) {
    await supabase.storage.from(BUCKET).remove([path, thumbPath])
    throw error
  }
  return image.full.blob.size + image.thumb.blob.size
}

export function useRemovePhoto() {
  const qc = useQueryClient()
  return useMutation({
    // Тот же порядок, что у удаления воспоминания: файлы, потом строка
    mutationFn: async (photo: MemoryPhoto) => {
      const removed = await supabase.storage.from(BUCKET).remove([photo.path, photo.thumbPath])
      if (removed.error) throw removed.error
      const { error } = await supabase.from('memory_photos').delete().eq('id', photo.id)
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

/**
 * Удаление: сначала файлы, потом строка. Удаление объектов разрешено
 * владельцу файла (owner_id), так что порядок важен только для того, чтобы
 * при обрыве на середине осталась запись без фото, а не фото без записи -
 * первое видно и удаляется повторно, второе не видно никому.
 */
export function useDeleteMemory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (memory: Memory) => {
      const paths = memory.photos.flatMap((p) => [p.path, p.thumbPath])
      if (paths.length > 0) {
        const { error } = await supabase.storage.from(BUCKET).remove(paths)
        if (error) throw error
      }
      const { error } = await supabase.from('memories').delete().eq('id', memory.id)
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

/** Сердце - оптимистично, как «хочу» в фильмах. */
export function useToggleHeart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ memoryId, userId, on }: { memoryId: string; userId: string; on: boolean }) => {
      const { error } = on
        ? await supabase.from('memory_hearts').insert({ memory_id: memoryId, user_id: userId })
        : await supabase.from('memory_hearts').delete().eq('memory_id', memoryId).eq('user_id', userId)
      if (error) throw error
    },
    onMutate: async ({ memoryId, userId, on }) => {
      await qc.cancelQueries({ queryKey: KEY })
      const before = qc.getQueryData<Memory[]>(KEY)
      qc.setQueryData<Memory[]>(KEY, (list) =>
        list?.map((m) =>
          m.id !== memoryId
            ? m
            : { ...m, hearts: on ? [...m.hearts.filter((h) => h !== userId), userId] : m.hearts.filter((h) => h !== userId) },
        ),
      )
      return { before }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(KEY, ctx.before)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useInvalidateMemories() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: KEY })
}
