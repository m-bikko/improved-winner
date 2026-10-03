import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { prepareMemoryImage } from '@/lib/image'

const KEY = ['shots'] as const
const BUCKET = 'shots'

export type Shot = {
  id: string
  day: string
  userId: string
  path: string
  thumbPath: string
  width: number
  height: number
  placeholder: string
  caption: string | null
  createdAt: string
}

export type ShotDay = {
  day: string
  /** Когда пришёл сигнал. */
  sentAt: string
  /** Видимые кадры: свой всегда, второго - когда открыт. */
  shots: Shot[]
  /** Кто уже снял - и тогда, когда кадр второго ещё закрыт. */
  posted: string[]
}

/**
 * Дни с сигналом, кадры и кто уже снял - одним ключом.
 *
 * Сигнал дня виден только после отправки (RLS), поэтому «сегодня ещё
 * не было» - это просто отсутствие строки, а не время, которое можно
 * подсмотреть.
 */
export function useShots() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ShotDay[]> => {
      const [prompts, shots, progress] = await Promise.all([
        supabase.from('shot_prompts').select('day, sent_at').order('day', { ascending: false }).limit(60),
        supabase.from('shots').select('*').order('day', { ascending: false }).limit(120),
        supabase.rpc('shot_progress'),
      ])
      if (prompts.error) throw prompts.error
      if (shots.error) throw shots.error
      if (progress.error) throw progress.error
      return prompts.data
        .filter((p): p is { day: string; sent_at: string } => p.sent_at !== null)
        .map((p) => ({
          day: p.day,
          sentAt: p.sent_at,
          shots: shots.data
            .filter((s) => s.day === p.day)
            .map((s) => ({
              id: s.id,
              day: s.day,
              userId: s.user_id,
              path: s.path,
              thumbPath: s.thumb_path,
              width: s.width,
              height: s.height,
              placeholder: s.placeholder,
              caption: s.caption,
              createdAt: s.created_at,
            })),
          posted: (progress.data ?? []).filter((x) => x.day === p.day).map((x) => x.user_id),
        }))
    },
    // Десять минут на кадр: при открытии - свежие данные, а пока день открыт
    // и кто-то ещё не снял - перечитываем раз в 30 секунд
    staleTime: 0,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((d) => Date.now() - new Date(d.sentAt).getTime() < 86_400_000 && d.posted.length < 2) ? 30_000 : false,
  })
}

/** Подписанные ссылки пачкой - час, кэш на 50 минут, как у воспоминаний. */
export function useShotUrls(paths: readonly string[]) {
  const key = [...paths].sort().join(',')
  return useQuery({
    queryKey: ['shot-urls', key],
    queryFn: async (): Promise<Record<string, string>> => {
      if (paths.length === 0) return {}
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls([...paths], 3600)
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
 * Снять: ужать в три размера, загрузить в свою папку, потом строка.
 *
 * Строка - после файлов: иначе второму пришло бы «снял кадр», который
 * ещё нельзя открыть. Не вставилась строка - файлы убираются.
 */
export function useSendShot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, day, file, caption }: { userId: string; day: string; file: File; caption: string }) => {
      const image = await prepareMemoryImage(file)
      const id = crypto.randomUUID()
      const path = `${userId}/${id}.${image.full.extension}`
      const thumbPath = `${userId}/${id}-t.${image.thumb.extension}`
      const opts = (blob: Blob) => ({ contentType: blob.type, cacheControl: '31536000', upsert: false })
      const full = await supabase.storage.from(BUCKET).upload(path, image.full.blob, opts(image.full.blob))
      if (full.error) throw full.error
      const thumb = await supabase.storage.from(BUCKET).upload(thumbPath, image.thumb.blob, opts(image.thumb.blob))
      if (thumb.error) {
        await supabase.storage.from(BUCKET).remove([path])
        throw thumb.error
      }
      const { error } = await supabase.from('shots').insert({
        id,
        day,
        user_id: userId,
        path,
        thumb_path: thumbPath,
        width: image.full.width,
        height: image.full.height,
        placeholder: image.placeholder,
        caption: caption.trim() || null,
      })
      if (error) {
        await supabase.storage.from(BUCKET).remove([path, thumbPath])
        throw error
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

/** Убрать свой кадр: файлы, потом строка - как у воспоминаний. */
export function useDeleteShot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (shot: Shot) => {
      const removed = await supabase.storage.from(BUCKET).remove([shot.path, shot.thumbPath])
      if (removed.error) throw removed.error
      const { error } = await supabase.from('shots').delete().eq('id', shot.id)
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}
