import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Round } from './logic'

const KEY = ['quiz'] as const

/**
 * Раунды, видимые ответы и прогресс - три запроса под одним ключом.
 *
 * Ответы - отдельным запросом: на них своя политика (ответы второго видны
 * после своего раунда), и вложенная выборка тихо вернула бы неполный список.
 */
export function useRounds() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Round[]> => {
      const [rounds, answers, progress] = await Promise.all([
        supabase.from('tot_rounds').select('*').order('created_at', { ascending: false }),
        supabase.from('tot_answers').select('*'),
        supabase.rpc('tot_progress'),
      ])
      if (rounds.error) throw rounds.error
      if (answers.error) throw answers.error
      if (progress.error) throw progress.error
      return rounds.data.map((r) => ({
        id: r.id,
        pairs: r.pairs,
        createdBy: r.created_by,
        createdAt: r.created_at,
        answers: answers.data
          .filter((a) => a.round_id === r.id)
          .map((a) => ({
            roundId: a.round_id,
            userId: a.user_id,
            pairId: a.pair_id,
            pick: a.pick === 1 ? 1 : 0,
            guess: a.guess === 1 ? 1 : 0,
          })),
        answered: Object.fromEntries(
          (progress.data ?? []).filter((p) => p.round_id === r.id).map((p) => [p.user_id, p.answered]),
        ),
      }))
    },
  })
}

export function useCreateRound() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pairs: string[]) => {
      const { error } = await supabase.from('tot_rounds').insert({ pairs })
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

/**
 * Ответ на пару - оптимистично: следующая пара показывается сразу,
 * а не после ответа сервера. Десять пар подряд с ожиданием сети между
 * ними - это уже не игра.
 */
export function useAnswer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { roundId: string; userId: string; pairId: string; pick: 0 | 1; guess: 0 | 1 }) => {
      const { error } = await supabase.from('tot_answers').insert({
        round_id: a.roundId,
        user_id: a.userId,
        pair_id: a.pairId,
        pick: a.pick,
        guess: a.guess,
      })
      if (error) throw error
    },
    onMutate: async (a) => {
      await qc.cancelQueries({ queryKey: KEY })
      const before = qc.getQueryData<Round[]>(KEY)
      qc.setQueryData<Round[]>(KEY, (list) =>
        list?.map((r) =>
          r.id !== a.roundId
            ? r
            : {
                ...r,
                answers: [...r.answers, a],
                answered: { ...r.answered, [a.userId]: (r.answered[a.userId] ?? 0) + 1 },
              },
        ),
      )
      return { before }
    },
    onError: (_e, _a, ctx) => {
      if (ctx?.before) qc.setQueryData(KEY, ctx.before)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}
