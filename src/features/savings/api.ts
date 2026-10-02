import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { tr } from '@/lib/i18n'
import type { Currency, Goal } from './logic'

const KEY = ['savings'] as const

function explain(error: { message: string }): Error {
  if (error.message.includes('savings_not_negative')) return new Error(tr('sv.negative'))
  return new Error(error.message)
}

/** Цели вместе с вкладами - одним запросом: вкладов десятки, не тысячи. */
export function useGoals() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await supabase
        .from('savings_goals')
        .select('*, savings_deposits(*)')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data.map((g) => ({
        id: g.id,
        title: g.title,
        icon: g.icon,
        // numeric из PostgREST приходит числом; Number() - на случай строки
        // при очень больших значениях
        target: Number(g.target),
        currency: g.currency as Currency,
        deadline: g.deadline,
        createdBy: g.created_by,
        createdAt: g.created_at,
        archivedAt: g.archived_at,
        deposits: g.savings_deposits
          .map((d) => ({
            id: d.id,
            goalId: d.goal_id,
            userId: d.user_id,
            amount: Number(d.amount),
            date: d.date,
            note: d.note,
            createdAt: d.created_at,
          }))
          .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1)),
      }))
    },
  })
}

export function useSaveGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      title: string
      icon: string
      target: number
      currency: Currency
      deadline: string | null
    }) => {
      const row = {
        title: input.title.trim(),
        icon: input.icon,
        target: input.target,
        currency: input.currency,
        deadline: input.deadline,
      }
      const { error } = input.id
        ? await supabase.from('savings_goals').update(row).eq('id', input.id)
        : await supabase.from('savings_goals').insert(row)
      if (error) throw explain(error)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useArchiveGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from('savings_goals')
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('savings_goals').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useAddDeposit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { goalId: string; amount: number; date: string; note: string | null }) => {
      const { error } = await supabase.from('savings_deposits').insert({
        goal_id: input.goalId,
        amount: input.amount,
        date: input.date,
        note: input.note?.trim() || null,
      })
      if (error) throw explain(error)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteDeposit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('savings_deposits').delete().eq('id', id)
      if (error) throw explain(error)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}
