import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const KEY = ['pauses'] as const

export type PauseNote = { userId: string; feel: string; when: string | null; need: string }

export type Pause = {
  id: string
  startedBy: string
  startedAt: string
  endsAt: string
  closedAt: string | null
  outcome: 'peace' | 'topic' | 'agreement' | null
  topicId: string | null
  /** Видимые строки: свои всегда, второго - когда написал свои. */
  notes: PauseNote[]
  /** Кто уже написал - и когда строки второго ещё закрыты. */
  notedBy: string[]
}

/**
 * Паузы с их строками. Пока пауза открыта, перечитывается раз в 15 секунд:
 * «пауза закончилась» и строки второго должны появиться без перезагрузки -
 * в ссоре никто не будет дёргать экран вниз.
 */
export function usePauses() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Pause[]> => {
      const [pauses, notes, progress] = await Promise.all([
        supabase.from('pauses').select('*').order('started_at', { ascending: false }).limit(30),
        supabase.from('pause_notes').select('*'),
        supabase.rpc('pause_progress'),
      ])
      if (pauses.error) throw pauses.error
      if (notes.error) throw notes.error
      if (progress.error) throw progress.error
      return pauses.data.map((p) => ({
        id: p.id,
        startedBy: p.started_by,
        startedAt: p.started_at,
        endsAt: p.ends_at,
        closedAt: p.closed_at,
        outcome: p.outcome as Pause['outcome'],
        topicId: p.topic_id,
        notes: notes.data
          .filter((n) => n.pause_id === p.id)
          .map((n) => ({ userId: n.user_id, feel: n.feel, when: n.when_text, need: n.need })),
        notedBy: (progress.data ?? []).filter((x) => x.pause_id === p.id).map((x) => x.user_id),
      }))
    },
    // В ссоре важна каждая минута: при открытии экрана - всегда свежие данные
    staleTime: 0,
    refetchInterval: (q) => ((q.state.data ?? []).some((p) => p.closedAt === null) ? 15_000 : false),
  })
}

function useDone() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: KEY })
}

export function useStartPause() {
  const done = useDone()
  return useMutation({
    mutationFn: async (endsAt: string) => {
      const { error } = await supabase.from('pauses').insert({ ends_at: endsAt })
      if (error) throw error
    },
    onSettled: done,
  })
}

/** Закончить раньше: «сейчас» по часам базы - она поправит отстающие часы телефона. */
export function useEndEarly() {
  const done = useDone()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pauses').update({ ends_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useWriteNotes() {
  const done = useDone()
  return useMutation({
    mutationFn: async (input: { pauseId: string; userId: string; feel: string; when: string; need: string; isNew: boolean }) => {
      const row = { feel: input.feel.trim(), when_text: input.when.trim() || null, need: input.need.trim() }
      const { error } = input.isNew
        ? await supabase.from('pause_notes').insert({ pause_id: input.pauseId, user_id: input.userId, ...row })
        : await supabase.from('pause_notes').update(row).eq('pause_id', input.pauseId).eq('user_id', input.userId)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useClosePause() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; outcome: 'peace' | 'topic' | 'agreement'; topicId?: string }) => {
      const { error } = await supabase
        .from('pauses')
        .update({ closed_at: new Date().toISOString(), outcome: input.outcome, topic_id: input.topicId ?? null })
        .eq('id', input.id)
      if (error) throw error
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY })
      void qc.invalidateQueries({ queryKey: ['topics'] })
    },
  })
}
