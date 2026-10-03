import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toLocalISO } from '@/lib/date'

export type StoryKind =
  | 'date'
  | 'meeting'
  | 'memory'
  | 'agreement'
  | 'challenge'
  | 'savings'
  | 'idea'
  | 'pregnancy'
  | 'baby'
  | 'gratitude'
  | 'question'
  | 'shot'

export type StoryItem = {
  kind: StoryKind
  /** День события - по локальному времени, даже если база отдала момент. */
  day: string
  title: string | null
  detail: string | null
  ref: string | null
  photo: string | null
  placeholder: string | null
  n: number | null
}

/**
 * Лента целиком одним запросом: база собирает её из десятка таблиц.
 * Язык - для названий идей; день для событий с моментом считает клиент.
 */
export function useStory(today: string, lang: string) {
  return useQuery({
    queryKey: ['story', today, lang],
    queryFn: async (): Promise<StoryItem[]> => {
      const { data, error } = await supabase.rpc('story', { today, lang })
      if (error) throw error
      return (data ?? [])
        .map((r) => ({
          kind: r.kind as StoryKind,
          day: r.day ?? (r.at ? toLocalISO(new Date(r.at)) : today),
          title: r.title,
          detail: r.detail,
          ref: r.ref,
          photo: r.photo,
          placeholder: r.placeholder,
          n: r.n === null ? null : Number(r.n),
        }))
        .filter((r) => r.day <= today)
        .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    },
  })
}
