import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toLocalISO } from '@/lib/date'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/db'
import { nextOccurrence, type Recurrence } from './recurrence'

type Row = Database['public']['Tables']['tasks']['Row']

export type Task = {
  id: string
  title: string
  notes: string | null
  /** ISO с зоной. null - задача без срока. */
  dueAt: string | null
  doneAt: string | null
  doneBy: string | null
  createdBy: string
  createdAt: string
  /** Смещения в минутах до срока. 0 - в момент дедлайна. */
  reminders: number[]
  recurrence: Recurrence | null
  /** Последний день, когда повторение уместно. */
  recurrenceUntil: string | null
  /**
   * Отменённые или заменённые вхождения - моменты в ISO.
   *
   * Момент, а не дата: у базы часовой пояс UTC, у людей Алматы, и вхождение
   * в час ночи попадало бы во вчера. То же представление и в SQL, иначе
   * календарь и рассылка расходились бы в том, какое вхождение отменено.
   */
  excludedAt: string[]
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
    excludedAt: row.excluded_at ?? [],
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

/**
 * Область правки повторяющейся задачи - как в календарях.
 *
 * `all` - правило и все вхождения. Единственный режим, который был раньше,
 *   и потому единственный, который человек получал не выбирая.
 * `one` - только открытое вхождение: оно уходит в excluded_at исходной
 *   задачи, а рядом заводится обычная разовая.
 * `following` - это и дальнейшие: у исходной ставится recurrence_until
 *   на день перед вхождением, а новая продолжает правило с новыми полями.
 *
 * Материализовать вхождения по-прежнему не нужно: и исключение, и разрез
 * выражаются двумя строками вместо тысячи.
 */
export type EditScope = 'all' | 'one' | 'following'

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
      /** Какое вхождение открыли. Нужен только для `one` и `following`. */
      occurrenceAt?: string | null
      scope?: EditScope
    }) => {
      const payload = {
        title: input.title.trim(),
        notes: input.notes.trim() || null,
        due_at: input.dueAt,
        reminders: input.reminders,
        // Повторение без срока нечему сдвигать - это же требует CHECK в схеме
        recurrence: input.dueAt ? input.recurrence : null,
        recurrence_until: input.dueAt ? input.recurrenceUntil : null,
      }

      const scope = input.scope ?? 'all'

      if (input.id && scope !== 'all' && input.occurrenceAt) {
        const { data: current, error: readError } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', input.id)
          .single()
        if (readError) throw readError

        if (scope === 'one') {
          const { error: excludeError } = await supabase
            .from('tasks')
            .update({
              excluded_at: [...(current.excluded_at ?? []), input.occurrenceAt],
            })
            .eq('id', input.id)
          if (excludeError) throw excludeError

          // Разовая замена: правило не наследуется, иначе одна перенесённая
          // тренировка размножилась бы в собственный ряд.
          const { data, error } = await supabase
            .from('tasks')
            .insert({ ...payload, recurrence: null, recurrence_until: null })
            .select('id')
            .single()
          if (error) throw error
          return data.id
        }

        // following: исходная кончается за день до открытого вхождения
        const cutoff = new Date(input.occurrenceAt)
        cutoff.setDate(cutoff.getDate() - 1)
        const until = toLocalISO(cutoff)

        const { error: cutError } = await supabase
          .from('tasks')
          .update({ recurrence_until: until })
          .eq('id', input.id)
        if (cutError) throw cutError

        const { data, error } = await supabase
          .from('tasks')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error
        return data.id
      }

      if (input.id) {
        // Срок или набор напоминаний изменились - значит об этом вхождении
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      // Просроченные задачи входят в число на иконке
      void qc.invalidateQueries({ queryKey: ['attention'] })
    },
  })
}

/**
 * Отметка о выполнении.
 *
 * У повторяющейся задачи «выполнено» означает не конец, а переход к следующему
 * вхождению: помечать её сделанной навсегда - значит потерять расписание после
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
        // Повторение кончилось - закрываем задачу окончательно
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      // Просроченные задачи входят в число на иконке
      void qc.invalidateQueries({ queryKey: ['attention'] })
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      // Просроченные задачи входят в число на иконке
      void qc.invalidateQueries({ queryKey: ['attention'] })
    },
  })
}
