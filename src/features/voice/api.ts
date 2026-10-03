import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Recording } from './recorder'

const KEY = ['voice'] as const
const BUCKET = 'voice-notes'

export type VoiceNote = {
  id: string
  authorId: string
  path: string
  durationMs: number
  peaks: number[]
  createdAt: string
  listenedAt: string | null
}

export function useVoiceNotes() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<VoiceNote[]> => {
      const { data, error } = await supabase
        .from('voice_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data.map((v) => ({
        id: v.id,
        authorId: v.author_id,
        path: v.path,
        durationMs: v.duration_ms,
        peaks: v.peaks,
        createdAt: v.created_at,
        listenedAt: v.listened_at,
      }))
    },
  })
}

/** Расширение файла по типу записи: m4a для mp4/AAC, webm для Opus. */
function extensionOf(mime: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mpeg')) return 'mp3'
  return 'm4a'
}

/**
 * Отправка: сначала файл (в папку со своим id - так требует политика
 * бакета), потом строка. Строка после файла: иначе второму пришло бы
 * уведомление о записке, которую ещё нельзя послушать.
 */
export function useSendVoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, rec }: { userId: string; rec: Recording }) => {
      const id = crypto.randomUUID()
      const type = rec.mime.split(';')[0] ?? 'audio/mp4'
      const path = `${userId}/${id}.${extensionOf(type)}`
      const up = await supabase.storage
        .from(BUCKET)
        .upload(path, rec.blob, { contentType: type, cacheControl: '31536000', upsert: false })
      if (up.error) throw up.error
      const { error } = await supabase
        .from('voice_notes')
        .insert({ id, path, duration_ms: Math.round(rec.durationMs), peaks: rec.peaks })
      if (error) {
        await supabase.storage.from(BUCKET).remove([path])
        throw error
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteVoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (note: VoiceNote) => {
      const removed = await supabase.storage.from(BUCKET).remove([note.path])
      if (removed.error) throw removed.error
      const { error } = await supabase.from('voice_notes').delete().eq('id', note.id)
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

/** «Прослушано» - ставит тот, кому записка (колоночное право в базе). */
export function useMarkListened() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('voice_notes')
        .update({ listened_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

/**
 * Звук целиком, а не потоком: записка до полумегабайта, а <audio>
 * с подписанной ссылкой шлёт Range-запросы, которые Service Worker с кэшем
 * по пути отдать частями не умеет - Safari такой ответ не играет.
 * Скачанный файл ложится в тот же кэш и второй раз берётся с устройства.
 */
export async function loadVoice(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) throw error
  const res = await fetch(data.signedUrl)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return URL.createObjectURL(await res.blob())
}
