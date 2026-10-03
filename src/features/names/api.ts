import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { tr } from '@/lib/i18n'

export type Origin = 'kazakh' | 'slavic' | 'intl' | 'custom'
export type Gender = 'm' | 'f' | 'u'

export type BabyName = {
  key: string
  name: string
  latin: string | null
  gender: Gender
  origin: Origin
  meaning: { ru: string | null; en: string | null; kk: string | null }
  rank: number | null
  createdBy: string | null
}

/** Список имён меняется редко - только своими добавлениями. */
export function useBabyNames() {
  return useQuery({
    queryKey: ['names', 'list'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<BabyName[]> => {
      const { data, error } = await supabase.from('baby_names').select('*')
      if (error) throw error
      return data
        .map((n) => ({
          key: n.key,
          name: n.name,
          latin: n.latin,
          gender: n.gender as Gender,
          origin: n.origin as Origin,
          meaning: { ru: n.meaning_ru, en: n.meaning_en, kk: n.meaning_kk },
          rank: n.rank,
          createdBy: n.created_by,
        }))
        // Свои - первыми (их добавили, чтобы проголосовать), дальше по месту
        .sort((a, b) => (a.rank ?? -1) - (b.rank ?? -1))
    },
  })
}

/** Свои голоса - только свои: чужие RLS не отдаёт вовсе. */
export function useMyVotes() {
  return useQuery({
    queryKey: ['names', 'votes'],
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await supabase.from('name_votes').select('name_key, liked')
      if (error) throw error
      return Object.fromEntries(data.map((v) => [v.name_key, v.liked]))
    },
  })
}

/** Совпадения - единственное, что известно о голосах второго. */
export function useMatches() {
  return useQuery({
    queryKey: ['names', 'matches'],
    queryFn: async (): Promise<{ key: string; at: string }[]> => {
      const { data, error } = await supabase.rpc('name_matches')
      if (error) throw error
      return (data ?? [])
        .map((m) => ({ key: m.name_key, at: m.matched_at }))
        .sort((a, b) => (a.at < b.at ? 1 : -1))
    },
  })
}

/**
 * Голос - оптимистично: карточка улетает сразу. После ответа сервера
 * перечитываются совпадения, и если голос создал совпадение - это видно
 * по возвращённому списку (onMatch).
 */
export function useVote(onMatch: (key: string) => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, key, liked }: { userId: string; key: string; liked: boolean | null }) => {
      const { error } =
        liked === null
          ? await supabase.from('name_votes').delete().eq('user_id', userId).eq('name_key', key)
          : await supabase.from('name_votes').upsert({ user_id: userId, name_key: key, liked }, { onConflict: 'user_id,name_key' })
      if (error) throw error
    },
    onMutate: async ({ key, liked }) => {
      await qc.cancelQueries({ queryKey: ['names', 'votes'] })
      const before = qc.getQueryData<Record<string, boolean>>(['names', 'votes'])
      qc.setQueryData<Record<string, boolean>>(['names', 'votes'], (v) => {
        const next = { ...(v ?? {}) }
        if (liked === null) delete next[key]
        else next[key] = liked
        return next
      })
      return { before }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(['names', 'votes'], ctx.before)
    },
    onSuccess: async (_r, { key, liked }) => {
      if (!liked) {
        void qc.invalidateQueries({ queryKey: ['names', 'matches'] })
        return
      }
      const matches = await qc.fetchQuery({
        queryKey: ['names', 'matches'],
        staleTime: 0,
        queryFn: async () => {
          const { data, error } = await supabase.rpc('name_matches')
          if (error) throw error
          return (data ?? []).map((m) => ({ key: m.name_key, at: m.matched_at })).sort((a, b) => (a.at < b.at ? 1 : -1))
        },
      })
      if (matches.some((m) => m.key === key)) onMatch(key)
    },
  })
}

export function useAddName() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, name, gender }: { userId: string; name: string; gender: Gender }) => {
      const key = `c-${crypto.randomUUID()}`
      const { error } = await supabase
        .from('baby_names')
        .insert({ key, name: name.trim(), gender, origin: 'custom', created_by: userId })
      if (error) {
        if (error.message.includes('baby_names_unique_name')) throw new Error(tr('nm.exists'))
        throw error
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['names', 'list'] }),
  })
}
