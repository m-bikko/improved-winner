import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { tr } from '@/lib/i18n'

import type { IdeaCategory } from './logic'

export { IDEA_CATEGORIES, type IdeaCategory } from './logic'

export type Idea = {
  key: string
  category: IdeaCategory
  /** Своя идея - одной строкой; у идей банка пусто. */
  title: string | null
  texts: { ru: string | null; en: string | null; kk: string | null }
  hints: { ru: string | null; en: string | null; kk: string | null }
  rank: number | null
  createdBy: string | null
}

export type Done = { key: string; doneOn: string; memoryId: string | null }

/**
 * Банк меняется только добавлениями пары - но добавленное вторым надо
 * увидеть сразу, чтобы проголосовать: поэтому кэш свежий минуту, а не десять.
 */
export function useIdeas() {
  return useQuery({
    queryKey: ['ideas', 'list'],
    staleTime: 60_000,
    queryFn: async (): Promise<Idea[]> => {
      const { data, error } = await supabase.from('date_ideas').select('*')
      if (error) throw error
      return data
        .map((i) => ({
          key: i.key,
          category: i.category as IdeaCategory,
          title: i.title,
          texts: { ru: i.title_ru, en: i.title_en, kk: i.title_kk },
          hints: { ru: i.hint_ru, en: i.hint_en, kk: i.hint_kk },
          rank: i.rank,
          createdBy: i.created_by,
        }))
        // Свои - первыми: их добавили, чтобы второй их увидел
        .sort((a, b) => (a.rank ?? -1) - (b.rank ?? -1))
    },
  })
}

/** Свои голоса - и только свои: чужие RLS не отдаёт. */
export function useIdeaVotes() {
  return useQuery({
    queryKey: ['ideas', 'votes'],
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await supabase.from('idea_votes').select('idea_key, liked')
      if (error) throw error
      return Object.fromEntries(data.map((v) => [v.idea_key, v.liked]))
    },
  })
}

async function fetchMatches(): Promise<{ key: string; at: string }[]> {
  const { data, error } = await supabase.rpc('idea_matches')
  if (error) throw error
  return (data ?? []).map((m) => ({ key: m.idea_key, at: m.matched_at })).sort((a, b) => (a.at < b.at ? 1 : -1))
}

/** Совпадения - список «хотим вместе». */
export function useIdeaMatches() {
  return useQuery({ queryKey: ['ideas', 'matches'], queryFn: fetchMatches })
}

export function useIdeasDone() {
  return useQuery({
    queryKey: ['ideas', 'done'],
    queryFn: async (): Promise<Done[]> => {
      const { data, error } = await supabase.from('idea_done').select('*').order('done_on', { ascending: false })
      if (error) throw error
      return data.map((d) => ({ key: d.idea_key, doneOn: d.done_on, memoryId: d.memory_id }))
    },
  })
}

/**
 * Голос - оптимистично, как у имён: карточка улетает сразу, а после ответа
 * сервера перечитываются совпадения - если голос создал совпадение, это
 * видно по списку (onMatch).
 */
export function useIdeaVote(onMatch: (key: string) => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, key, liked }: { userId: string; key: string; liked: boolean | null }) => {
      const { error } =
        liked === null
          ? await supabase.from('idea_votes').delete().eq('user_id', userId).eq('idea_key', key)
          : await supabase.from('idea_votes').upsert({ user_id: userId, idea_key: key, liked }, { onConflict: 'user_id,idea_key' })
      if (error) throw error
    },
    onMutate: async ({ key, liked }) => {
      await qc.cancelQueries({ queryKey: ['ideas', 'votes'] })
      const before = qc.getQueryData<Record<string, boolean>>(['ideas', 'votes'])
      qc.setQueryData<Record<string, boolean>>(['ideas', 'votes'], (v) => {
        const next = { ...(v ?? {}) }
        if (liked === null) delete next[key]
        else next[key] = liked
        return next
      })
      return { before }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(['ideas', 'votes'], ctx.before)
    },
    onSuccess: async (_r, { key, liked }) => {
      if (!liked) {
        void qc.invalidateQueries({ queryKey: ['ideas', 'matches'] })
        return
      }
      const matches = await qc.fetchQuery({ queryKey: ['ideas', 'matches'], staleTime: 0, queryFn: fetchMatches })
      if (matches.some((m) => m.key === key)) onMatch(key)
    },
  })
}

/** Своя идея: добавивший сразу «хочет» её - иначе зачем добавлял. */
export function useAddIdea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, title, category }: { userId: string; title: string; category: IdeaCategory }) => {
      const key = `c-${crypto.randomUUID()}`
      const { error } = await supabase.from('date_ideas').insert({ key, category, title: title.trim(), created_by: userId })
      if (error) {
        if (error.message.includes('date_ideas_custom_unique')) throw new Error(tr('id.exists'))
        throw error
      }
      const vote = await supabase.from('idea_votes').insert({ user_id: userId, idea_key: key, liked: true })
      if (vote.error) throw vote.error
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['ideas', 'list'] })
      void qc.invalidateQueries({ queryKey: ['ideas', 'votes'] })
      void qc.invalidateQueries({ queryKey: ['ideas', 'matches'] })
    },
  })
}

/**
 * Сделали: отметка на двоих и, по желанию, воспоминание с названием идеи.
 * Воспоминание - сначала: отметка ссылается на него.
 */
export function useMarkDone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, doneOn, caption }: { key: string; doneOn: string; caption: string | null }) => {
      let memoryId: string | null = null
      if (caption) {
        memoryId = crypto.randomUUID()
        const mem = await supabase.from('memories').insert({ id: memoryId, happened_on: doneOn, caption })
        if (mem.error) throw mem.error
      }
      const { error } = await supabase.from('idea_done').insert({ idea_key: key, done_on: doneOn, memory_id: memoryId })
      if (error) throw error
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['ideas', 'done'] })
      void qc.invalidateQueries({ queryKey: ['memories'] })
    },
  })
}

export function useUndoDone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase.from('idea_done').delete().eq('idea_key', key)
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['ideas', 'done'] }),
  })
}

/** В план ближайшей встречи - пунктом с пометкой «из идей». */
export function useAddToMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ meetingId, title }: { meetingId: string; title: string }) => {
      const { error } = await supabase.from('meeting_items').insert({ meeting_id: meetingId, title, source: 'idea' })
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['meetings'] }),
  })
}
