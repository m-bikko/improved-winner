import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { tr } from '@/lib/i18n'
import type { Challenge } from './logic'

const KEY = ['challenges'] as const

/** Ошибки инвариантов - словами экрана, а не текстом исключения Postgres. */
function explain(error: { message: string }): Error {
  if (error.message.includes('challenge_marks_in_range')) return new Error(tr('ch.outOfRange'))
  if (error.message.includes('challenges_keep_marks')) return new Error(tr('ch.keepMarks'))
  return new Error(error.message)
}

/**
 * Челленджи вместе с отметками - одним запросом.
 *
 * Отметок немного: два человека, до ста дней. Отдельный запрос на отметки
 * каждого челленджа означал бы по запросу на карточку.
 */
export function useChallenges() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Challenge[]> => {
      const { data, error } = await supabase
        .from('challenges')
        .select('*, challenge_marks(user_id, date)')
        .order('started_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map((r) => ({
        id: r.id,
        title: r.title,
        icon: r.icon,
        days: r.days,
        startedOn: r.started_on,
        stoppedOn: r.stopped_on,
        createdBy: r.created_by,
        createdAt: r.created_at,
        marks: r.challenge_marks.map((m) => ({ userId: m.user_id, date: m.date })),
      }))
    },
  })
}

export function useCreateChallenge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title: string; icon: string; days: number; startedOn: string }) => {
      const { error } = await supabase.from('challenges').insert({
        title: input.title.trim(),
        icon: input.icon,
        days: input.days,
        started_on: input.startedOn,
      })
      if (error) throw explain(error)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateChallenge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      title?: string
      icon?: string
      stoppedOn?: string | null
    }) => {
      const patch: { title?: string; icon?: string; stopped_on?: string | null } = {}
      if (input.title !== undefined) patch.title = input.title.trim()
      if (input.icon !== undefined) patch.icon = input.icon
      if (input.stoppedOn !== undefined) patch.stopped_on = input.stoppedOn
      const { error } = await supabase.from('challenges').update(patch).eq('id', input.id)
      if (error) throw explain(error)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteChallenge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('challenges').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

/**
 * Поставить или снять свою отметку.
 *
 * Оптимистично: клетка закрашивается сразу, а при ошибке возвращается как
 * было. Отметка - самое частое действие раздела, и ждать сеть на каждое
 * нажатие значило бы сделать его вязким.
 */
export function useToggleMark() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { challengeId: string; userId: string; date: string; on: boolean }) => {
      if (input.on) {
        const { error } = await supabase
          .from('challenge_marks')
          .insert({ challenge_id: input.challengeId, user_id: input.userId, date: input.date })
        if (error) throw explain(error)
      } else {
        const { error } = await supabase
          .from('challenge_marks')
          .delete()
          .eq('challenge_id', input.challengeId)
          .eq('user_id', input.userId)
          .eq('date', input.date)
        if (error) throw explain(error)
      }
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: KEY })
      const before = qc.getQueryData<Challenge[]>(KEY)
      qc.setQueryData<Challenge[]>(KEY, (list) =>
        list?.map((c) => {
          if (c.id !== input.challengeId) return c
          const rest = c.marks.filter((m) => !(m.userId === input.userId && m.date === input.date))
          return { ...c, marks: input.on ? [...rest, { userId: input.userId, date: input.date }] : rest }
        }),
      )
      return { before }
    },
    onError: (_e, _input, ctx) => {
      if (ctx?.before) qc.setQueryData(KEY, ctx.before)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}
