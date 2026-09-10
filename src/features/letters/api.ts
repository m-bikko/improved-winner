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
  /** Путь объекта в бакете. Читается только после доставки. */
  imagePath: string | null
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
    imagePath: r.image_path,
    deliveredAt: r.delivered_at,
    createdAt: r.created_at,
  }
}

/**
 * Пришедшие письма.
 *
 * Фильтр не пишем: его держит политика. Запечатанное письмо сюда не приедет
 * вовсе - ни чужое, ни своё. Это правильное место для такого правила:
 * экран можно обойти, политику нет.
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

/**
 * Сколько своих писем в пути - одно число без дат и без текста.
 *
 * Без него написанное письмо исчезает в никуда, и человек не может отличить
 * «запечатано» от «не сохранилось». Чужие не считаются: узнать, что партнёр
 * что-то написал, - уже спойлер.
 */
export function useLettersInFlight() {
  return useQuery({
    queryKey: ['letters-in-flight'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('letters_in_flight')
      if (error) throw error
      return data ?? 0
    },
  })
}

const PHOTO_BUCKET = 'letter-photos'

/** Час с запасом: ссылки кэшируются на 50 минут. */
const SIGNED_URL_TTL = 3600

/**
 * Подписанные ссылки на снимки пришедших писем - пачкой.
 *
 * К запечатанному письму ссылку не выдадут: политика бакета спрашивает
 * не про членство, а про доставку конкретного письма.
 */
export function useLetterPhotoUrls(paths: readonly string[]) {
  const key = [...paths].sort().join(',')
  return useQuery({
    queryKey: ['letter-photo-urls', key],
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
 * Запечатывает письмо, при необходимости вместе со снимком.
 *
 * Id письма генерирует КЛИЕНТ - тот же приём, что у записей дневника.
 * Иначе его пришлось бы получать через `insert ... returning`, а RETURNING
 * требует прав на чтение, которых у запечатанного письма нет ни у кого,
 * включая автора.
 *
 * Снимок уезжает первым: при неудачной вставке останется осиротевший файл,
 * но он никому не виден - без письма политика чтения не пропустит к нему
 * никого. Обратный порядок оставил бы письмо со ссылкой в никуда.
 */
export function useSaveLetter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      body: string
      deliverOn: string
      audience: LetterAudience
      photo: { blob: Blob; extension: string } | null
    }) => {
      const id = crypto.randomUUID()
      let imagePath: string | null = null

      if (input.photo) {
        imagePath = `${id}/${crypto.randomUUID()}.${input.photo.extension}`
        const { error } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(imagePath, input.photo.blob, {
            contentType: input.photo.blob.type,
            cacheControl: '31536000',
          })
        if (error) throw error
      }

      const { error } = await supabase.from('letters').insert({
        id,
        body: input.body.trim(),
        deliver_on: input.deliverOn,
        audience: input.audience,
        image_path: imagePath,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['letters'] })
      void qc.invalidateQueries({ queryKey: ['letters-in-flight'] })
    },
  })
}

