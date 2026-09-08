import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type LastReply = {
  topicId: string
  topicTitle: string
  authorId: string
  createdAt: string
}

/**
 * Последний ответ в открытой теме.
 *
 * Единственный запрос, которого нет ни в одном разделе: списку тем он не нужен,
 * а «Сегодня» отвечает именно на вопрос «мне ответили?». Одна строка,
 * а не пересчёт непрочитанного: отметок о прочтении в приложении нет,
 * и заводить их ради одной плашки - несоразмерно.
 */
export function useLastReply() {
  return useQuery({
    queryKey: ['last-reply'],
    queryFn: async (): Promise<LastReply | null> => {
      const { data, error } = await supabase
        .from('topic_comments')
        .select('topic_id, author_id, created_at, topics!inner(title, status)')
        .eq('topics.status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) throw error
      const row = data[0]
      if (!row) return null
      return {
        topicId: row.topic_id,
        topicTitle: (row.topics as unknown as { title: string }).title,
        authorId: row.author_id,
        createdAt: row.created_at,
      }
    },
  })
}
