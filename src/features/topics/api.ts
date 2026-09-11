import { tr } from '@/lib/i18n'
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/db'

type TopicRow = Database['public']['Tables']['topics']['Row']

export type TopicStatus = 'open' | 'closed'

export type Topic = {
  id: string
  title: string
  body: string | null
  status: TopicStatus
  resolution: string | null
  createdBy: string
  createdAt: string
  closedAt: string | null
  closedBy: string | null
}

export type Comment = {
  id: string
  topicId: string
  authorId: string
  body: string
  createdAt: string
}

function topicFromRow(row: TopicRow): Topic {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status as TopicStatus,
    resolution: row.resolution,
    createdBy: row.created_by,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
  }
}

/**
 * Список тем. Пустой запрос отдаёт всё, непустой уходит в RPC.
 *
 * Поиск здесь серверный, в отличие от продуктов: у тем длинный текст,
 * и FTS берёт словоформы одного слова - «отпуска» находит «отпуск».
 *
 * Чего он НЕ умеет (проверено на живом Postgres): связывать однокоренные слова
 * разных частей речи. «обсуждение» стеммится в 'обсужден', а «обсудили» -
 * в 'обсуд', и это разные основы. Для таких случаев в RPC есть подстрочный
 * запасной путь по всему тексту темы.
 *
 * На коротких названиях продуктов FTS проигрывает префиксам, поэтому там
 * поиск живёт на клиенте.
 */
export function useTopics(query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['topics', trimmed],
    queryFn: async (): Promise<Topic[]> => {
      if (trimmed === '') {
        const { data, error } = await supabase
          .from('topics')
          .select('*')
          .order('created_at', { ascending: false })
        if (error) throw error
        return data.map(topicFromRow)
      }

      const { data, error } = await supabase.rpc('search_topics', { q: trimmed })
      if (error) throw error
      return (data ?? []).map(topicFromRow)
    },
  })
}

export function useTopic(id: string | undefined) {
  return useQuery({
    queryKey: ['topic', id],
    queryFn: async (): Promise<Topic> => {
      const { data, error } = await supabase.from('topics').select('*').eq('id', id ?? '').single()
      if (error) throw error
      return topicFromRow(data)
    },
    enabled: id !== undefined,
  })
}

export function useComments(topicId: string | undefined) {
  return useQuery({
    queryKey: ['comments', topicId],
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from('topic_comments')
        .select('*')
        .eq('topic_id', topicId ?? '')
        .order('created_at')
      if (error) throw error
      return data.map((r) => ({
        id: r.id,
        topicId: r.topic_id,
        authorId: r.author_id,
        body: r.body,
        createdAt: r.created_at,
      }))
    },
    enabled: topicId !== undefined,
  })
}

export function useCreateTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title: string; body: string }): Promise<string> => {
      const { data, error } = await supabase
        .from('topics')
        .insert({ title: input.title.trim(), body: input.body.trim() || null })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['topics'] }),
  })
}

/**
 * Закрытие темы.
 *
 * resolution, closed_at и closed_by ставятся вместе - табличный CHECK в схеме
 * не примет закрытую тему без текста решения или без отметки, кто закрыл.
 */
export function useCloseTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; resolution: string; userId: string }) => {
      const { error } = await supabase
        .from('topics')
        .update({
          status: 'closed',
          resolution: input.resolution.trim(),
          closed_at: new Date().toISOString(),
          closed_by: input.userId,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_r, input) => {
      void qc.invalidateQueries({ queryKey: ['topics'] })
      void qc.invalidateQueries({ queryKey: ['topic', input.id] })
    },
  })
}

/**
 * Переоткрытие.
 *
 * Прошлое решение уезжает комментарием в ленту, а не стирается: понять,
 * к чему в прошлый раз пришли и почему этого оказалось мало, важнее, чем
 * чистая карточка.
 */
export function useReopenTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; previousResolution: string | null }) => {
      if (input.previousResolution) {
        const { error } = await supabase.from('topic_comments').insert({
          topic_id: input.id,
          body: tr('topic.reopened', { resolution: input.previousResolution }),
        })
        if (error) throw error
      }

      const { error } = await supabase
        .from('topics')
        .update({ status: 'open', resolution: null, closed_at: null, closed_by: null })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_r, input) => {
      void qc.invalidateQueries({ queryKey: ['topics'] })
      void qc.invalidateQueries({ queryKey: ['topic', input.id] })
      void qc.invalidateQueries({ queryKey: ['comments', input.id] })
    },
  })
}

export function useAddComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { topicId: string; body: string }) => {
      const { error } = await supabase
        .from('topic_comments')
        .insert({ topic_id: input.topicId, body: input.body.trim() })
      if (error) throw error
    },
    onSuccess: (_r, input) => void qc.invalidateQueries({ queryKey: ['comments', input.topicId] }),
  })
}

export function useDeleteTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('topics').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['topics'] }),
  })
}

/**
 * Подписка на изменения темы и её комментариев.
 *
 * Пользователей двое, и тема - единственное место, где они разговаривают.
 * Realtime здесь стоит одной подписки, а даёт эффект «партнёр ответил»
 * без перезагрузки страницы.
 */
export function useTopicRealtime(topicId: string | undefined): void {
  const qc = useQueryClient()
  useEffect(() => {
    if (!topicId) return

    const channel = supabase
      .channel(`topic:${topicId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'topic_comments', filter: `topic_id=eq.${topicId}` },
        () => void qc.invalidateQueries({ queryKey: ['comments', topicId] }),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'topics', filter: `id=eq.${topicId}` },
        () => void qc.invalidateQueries({ queryKey: ['topic', topicId] }),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [topicId, qc])
}
