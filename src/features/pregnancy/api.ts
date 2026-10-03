import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type Pregnancy = { motherId: string; lmp: string; endedOn: string | null }
export type Visit = { id: string; date: string; title: string; note: string | null; done: boolean }
export type KickSession = { id: string; userId: string; startedAt: string; endedAt: string; kicks: number }

const KEY = ['pregnancy'] as const

/** Режим, визиты и сессии шевелений - под одним ключом: раздел один. */
export function usePregnancy() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<{ pregnancy: Pregnancy | null; visits: Visit[]; kicks: KickSession[] }> => {
      const [g, visits, kicks] = await Promise.all([
        supabase.from('pregnancy').select('*').maybeSingle(),
        supabase.from('pregnancy_visits').select('*').order('date'),
        supabase.from('kick_sessions').select('*').order('started_at', { ascending: false }).limit(20),
      ])
      if (g.error) throw g.error
      if (visits.error) throw visits.error
      if (kicks.error) throw kicks.error
      return {
        pregnancy: g.data ? { motherId: g.data.mother_id, lmp: g.data.lmp, endedOn: g.data.ended_on } : null,
        visits: visits.data.map((v) => ({ id: v.id, date: v.date, title: v.title, note: v.note, done: v.done })),
        kicks: kicks.data.map((k) => ({
          id: k.id,
          userId: k.user_id,
          startedAt: k.started_at,
          endedAt: k.ended_at,
          kicks: k.kicks,
        })),
      }
    },
  })
}

/** Идёт ли беременность - для главной, цикла и подготовки. */
export function useActivePregnancy(): Pregnancy | null {
  const q = usePregnancy()
  const g = q.data?.pregnancy ?? null
  return g && g.endedOn === null ? g : null
}

function useDone() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: KEY })
}

/**
 * Включить режим (или начать заново после закрытого): одна строка на пару,
 * поэтому upsert по ключу-константе.
 */
export function useStartPregnancy() {
  const done = useDone()
  return useMutation({
    mutationFn: async ({ motherId, lmp }: { motherId: string; lmp: string }) => {
      const { error } = await supabase
        .from('pregnancy')
        .upsert({ id: true, mother_id: motherId, lmp, ended_on: null }, { onConflict: 'id' })
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useUpdateLmp() {
  const done = useDone()
  return useMutation({
    mutationFn: async (lmp: string) => {
      const { error } = await supabase.from('pregnancy').update({ lmp }).eq('id', true)
      if (error) throw error
    },
    onSettled: done,
  })
}

/** Закрыть режим. Причину не спрашиваем. */
export function useEndPregnancy() {
  const done = useDone()
  return useMutation({
    mutationFn: async (endedOn: string) => {
      const { error } = await supabase.from('pregnancy').update({ ended_on: endedOn }).eq('id', true)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useSaveVisit() {
  const done = useDone()
  return useMutation({
    mutationFn: async (v: { id?: string; date: string; title: string; note: string; done?: boolean }) => {
      const row = { date: v.date, title: v.title.trim(), note: v.note.trim() || null, ...(v.done !== undefined ? { done: v.done } : {}) }
      const { error } = v.id
        ? await supabase.from('pregnancy_visits').update(row).eq('id', v.id)
        : await supabase.from('pregnancy_visits').insert(row)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useDeleteVisit() {
  const done = useDone()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pregnancy_visits').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useSaveKicks() {
  const done = useDone()
  return useMutation({
    mutationFn: async (s: { startedAt: string; endedAt: string; kicks: number }) => {
      const { error } = await supabase
        .from('kick_sessions')
        .insert({ started_at: s.startedAt, ended_at: s.endedAt, kicks: s.kicks })
      if (error) throw error
    },
    onSettled: done,
  })
}
