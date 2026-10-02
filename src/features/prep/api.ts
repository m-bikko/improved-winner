import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Check } from './logic'

const KEY = ['prep'] as const

export type Prep = {
  /** Дата начала подготовки; null - ещё не начинали. */
  startedOn: string | null
  /** Отметки витаминов: кто и в какой день. */
  vitamins: { userId: string; date: string }[]
  checks: Check[]
}

/** План, витамины и чек-лист - три маленьких запроса под одним ключом. */
export function usePrep() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Prep> => {
      const [plan, vitamins, checks] = await Promise.all([
        supabase.from('prep_plan').select('started_on').maybeSingle(),
        supabase.from('prep_vitamins').select('user_id, date').order('date', { ascending: false }),
        supabase.from('prep_checks').select('*').order('created_at'),
      ])
      if (plan.error) throw plan.error
      if (vitamins.error) throw vitamins.error
      if (checks.error) throw checks.error
      return {
        startedOn: plan.data?.started_on ?? null,
        vitamins: vitamins.data.map((v) => ({ userId: v.user_id, date: v.date })),
        checks: checks.data.map((c) => ({
          id: c.id,
          userId: c.user_id,
          itemKey: c.item_key,
          title: c.title,
          doneOn: c.done_on,
        })),
      }
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: KEY })
}

export function useSetPlan() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (startedOn: string | null) => {
      if (startedOn === null) {
        const { error } = await supabase.from('prep_plan').delete().eq('id', true)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('prep_plan').upsert({ id: true, started_on: startedOn }, { onConflict: 'id' })
      if (error) throw error
    },
    onSettled: done,
  })
}

/** Витамины за день - оптимистично: это отметка, которую ставят каждый день. */
export function useToggleVitamins() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, date, on }: { userId: string; date: string; on: boolean }) => {
      const { error } = on
        ? await supabase.from('prep_vitamins').insert({ user_id: userId, date })
        : await supabase.from('prep_vitamins').delete().eq('user_id', userId).eq('date', date)
      if (error) throw error
    },
    onMutate: async ({ userId, date, on }) => {
      await qc.cancelQueries({ queryKey: KEY })
      const before = qc.getQueryData<Prep>(KEY)
      qc.setQueryData<Prep>(KEY, (p) =>
        p && {
          ...p,
          vitamins: on
            ? [{ userId, date }, ...p.vitamins.filter((v) => !(v.userId === userId && v.date === date))]
            : p.vitamins.filter((v) => !(v.userId === userId && v.date === date)),
        },
      )
      return { before }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(KEY, ctx.before)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

/**
 * Пункт-заготовка: отмечен - строка есть, снят - строки нет.
 * Так в базе один способ сказать «не сделано» (см. prep_checks_preset_done).
 */
export function useTogglePreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, itemKey, doneOn }: { userId: string; itemKey: string; doneOn: string | null }) => {
      const { error } = doneOn
        ? await supabase.from('prep_checks').insert({ user_id: userId, item_key: itemKey, done_on: doneOn })
        : await supabase.from('prep_checks').delete().eq('user_id', userId).eq('item_key', itemKey)
      if (error) throw error
    },
    onMutate: async ({ userId, itemKey, doneOn }) => {
      await qc.cancelQueries({ queryKey: KEY })
      const before = qc.getQueryData<Prep>(KEY)
      qc.setQueryData<Prep>(KEY, (p) => {
        if (!p) return p
        const rest = p.checks.filter((c) => !(c.userId === userId && c.itemKey === itemKey))
        return {
          ...p,
          checks: doneOn ? [...rest, { id: `optimistic-${itemKey}`, userId, itemKey, title: null, doneOn }] : rest,
        }
      })
      return { before }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(KEY, ctx.before)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useAddCustom() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async ({ userId, title }: { userId: string; title: string }) => {
      const { error } = await supabase.from('prep_checks').insert({ user_id: userId, title: title.trim() })
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useToggleCustom() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, doneOn }: { id: string; doneOn: string | null }) => {
      const { error } = await supabase.from('prep_checks').update({ done_on: doneOn }).eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useDeleteCustom() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('prep_checks').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}
