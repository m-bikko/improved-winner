import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/db'
import { nextOccurrence, type Recurrence } from './recurrence'

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
  /** Смещения в минутах до срока. 0 — в момент дедлайна. */
  reminders: number[]
  recurrence: Recurrence | null
  /** Последний день, когда повторение уместно. */
  recurrenceUntil: string | null
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
    reminders: row.reminders ?? [],
    recurrence: (row.recurrence as Recurrence | null) ?? null,
    recurrenceUntil: row.recurrence_until,
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
      reminders: number[]
      recurrence: Recurrence | null
      recurrenceUntil: string | null
    }) => {
      const payload = {
        title: input.title.trim(),
        notes: input.notes.trim() || null,
        due_at: input.dueAt,
        reminders: input.reminders,
        // Повторение без срока нечему сдвигать — это же требует CHECK в схеме
        recurrence: input.dueAt ? input.recurrence : null,
        recurrence_until: input.dueAt ? input.recurrenceUntil : null,
      }

      if (input.id) {
        // Срок или набор напоминаний изменились — значит об этом вхождении
        // ещё не сообщали. Без сброса перенесённая задача больше никогда
        // бы о себе не напомнила.
        const { error } = await supabase
          .from('tasks')
          .update({ ...payload, reminded_offsets: [] })
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

/**
 * Отметка о выполнении.
 *
 * У повторяющейся задачи «выполнено» означает не конец, а переход к следующему
 * вхождению: помечать её сделанной навсегда — значит потерять расписание после
 * первого же раза. Поэтому срок сдвигается, отметки об отправленных
 * напоминаниях обнуляются, а сама задача остаётся открытой.
 */
export function useToggleTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { task: Task; done: boolean; userId: string }) => {
      const { task } = input

      if (input.done && task.recurrence && task.dueAt) {
        const next = nextOccurrence(new Date(task.dueAt), task.recurrence)
        const beyondEnd =
          next !== null &&
          task.recurrenceUntil !== null &&
          next > new Date(`${task.recurrenceUntil}T23:59:59`)

        if (next && !beyondEnd) {
          const { error } = await supabase
            .from('tasks')
            .update({ due_at: next.toISOString(), reminded_offsets: [] })
            .eq('id', task.id)
          if (error) throw error
          return 'advanced' as const
        }
        // Повторение кончилось — закрываем задачу окончательно
      }

      const { error } = await supabase
        .from('tasks')
        .update(
          input.done
            ? { done_at: new Date().toISOString(), done_by: input.userId }
            : { done_at: null, done_by: null, reminded_offsets: [] },
        )
        .eq('id', task.id)
      if (error) throw error
      return 'closed' as const
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
