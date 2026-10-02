import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { tr } from '@/lib/i18n'
import type { Database } from '@/types/db'

type Row = Database['public']['Tables']['question_answers']['Row']

export type Answer = {
  userId: string
  date: string
  questionId: string
  body: string
  createdAt: string
}

/** Кто и на какой вопрос ответил - без текста. Видно до своего ответа. */
export type Progress = { date: string; userId: string; questionId: string }

function fromRow(r: Row): Answer {
  return {
    userId: r.user_id,
    date: r.date,
    questionId: r.question_id,
    body: r.body,
    createdAt: r.created_at,
  }
}

/**
 * Видимые ответы: свои - все, партнёра - только за дни, где есть свой.
 *
 * Фильтра на экране нет: остальное отрезает RLS. Строк немного - два ответа
 * в день, - поэтому берём всё разом, а архив собирается из того же кэша.
 */
export function useAnswers() {
  return useQuery({
    queryKey: ['question', 'answers'],
    queryFn: async (): Promise<Answer[]> => {
      const { data, error } = await supabase
        .from('question_answers')
        .select('*')
        .order('date', { ascending: false })
      if (error) throw error
      return data.map(fromRow)
    },
  })
}

export function useProgress() {
  return useQuery({
    queryKey: ['question', 'progress'],
    queryFn: async (): Promise<Progress[]> => {
      const { data, error } = await supabase.rpc('question_progress', { since: '2000-01-01' })
      if (error) throw error
      return (data ?? []).map((r) => ({ date: r.date, userId: r.user_id, questionId: r.question_id }))
    },
  })
}

/**
 * Ошибки базы - словами экрана. Обе ситуации редкие, но без перевода
 * человек увидел бы текст исключения Postgres.
 */
function explain(error: { message: string; code?: string }): Error {
  if (error.message.includes('question_answers_same_question')) return new Error(tr('qd.mismatch'))
  return new Error(error.message)
}

export function useSaveAnswer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      userId: string
      date: string
      questionId: string
      body: string
      /** Ответ уже был - правим, а не вставляем. */
      existing: boolean
    }) => {
      const body = input.body.trim()
      if (input.existing) {
        const { data, error } = await supabase
          .from('question_answers')
          .update({ body })
          .eq('user_id', input.userId)
          .eq('date', input.date)
          .select('date')
        if (error) throw explain(error)
        // Политика молча не находит строку, если второй уже ответил:
        // UPDATE без ошибки и без строк. Значит, ответы открыты и правка закрыта
        if (!data || data.length === 0) throw new Error(tr('qd.lockedNow'))
        return
      }
      const { error } = await supabase.from('question_answers').insert({
        user_id: input.userId,
        date: input.date,
        question_id: input.questionId,
        body,
      })
      if (error) throw explain(error)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['question'] })
    },
  })
}
