import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Agreement } from './logic'

export type { Agreement } from './logic'

/**
 * Договорённости - решения закрытых тем.
 *
 * Ключ под ['topics']: темы инвалидируют весь префикс при каждом изменении,
 * и закрытая в обсуждении тема сразу появляется здесь.
 */
export function useAgreements() {
  return useQuery({
    queryKey: ['topics', 'agreements'],
    queryFn: async (): Promise<Agreement[]> => {
      const { data, error } = await supabase
        .from('topics')
        .select('id, title, resolution, closed_at, closed_by, pinned_at')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
      if (error) throw error
      return data
        .filter((r) => r.resolution !== null && r.closed_at !== null && r.closed_by !== null)
        .map((r) => ({
          id: r.id,
          title: r.title,
          resolution: r.resolution ?? '',
          closedAt: r.closed_at ?? '',
          closedBy: r.closed_by ?? '',
          pinnedAt: r.pinned_at,
        }))
    },
  })
}

export function usePinAgreement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase
        .from('topics')
        .update({ pinned_at: pinned ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['topics'] }),
  })
}

/**
 * Договорённость без обсуждения - сразу закрытой темой: «мы решили»
 * часто случается в звонке, а не в приложении. Тот же CHECK, что у
 * закрытия темы, требует текст решения и кто закрыл.
 */
export function useCreateAgreement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title: string; resolution: string; userId: string }) => {
      const { error } = await supabase.from('topics').insert({
        title: input.title.trim(),
        status: 'closed',
        resolution: input.resolution.trim(),
        closed_at: new Date().toISOString(),
        closed_by: input.userId,
      })
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['topics'] }),
  })
}
