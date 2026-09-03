import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/db'

type Row = Database['public']['Tables']['tasks']['Row']

export type Task = {
  id: string
  title: string
  notes: string | null
  /** ISO с зоной. null — задача без срока. */
  dueAt: string | null
  doneAt: string | null
  doneBy: string | null
  createdBy: string
  createdAt: string
}

function fromRow(row: Row): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueAt: row.due_at,
    doneAt: row.done_at,
    doneBy: row.done_by,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        // Сначала по сроку, затем по дате создания: задачи без срока
        // не должны вклиниваться между срочными
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map(fromRow)
    },
  })
}

export function useSaveTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      title: string
      notes: string
      dueAt: string | null
    }) => {
      const payload = {
        title: input.title.trim(),
        notes: input.notes.trim() || null,
        due_at: input.dueAt,
      }

      if (input.id) {
        // Срок сдвинули — значит об этом дедлайне ещё не сообщали. Без сброса
        // перенесённая задача больше никогда бы о себе не напомнила.
        const { error } = await supabase
          .from('tasks')
          .update({ ...payload, notified_at: null })
          .eq('id', input.id)
        if (error) throw error
        return input.id
      }

      const { data, error } = await supabase.from('tasks').insert(payload).select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useToggleTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; done: boolean; userId: string }) => {
      const { error } = await supabase
        .from('tasks')
        .update(
          input.done
            ? { done_at: new Date().toISOString(), done_by: input.userId }
            : { done_at: null, done_by: null },
        )
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}
