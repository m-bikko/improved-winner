import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { COOK_EMAIL } from '@/lib/accounts'
import type { GoalDirection, Macros } from '@/lib/nutrition'

/** Вход повара: секрет из ссылки - это пароль его аккаунта. */
export async function signInCook(secret: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithPassword({ email: COOK_EMAIL, password: secret })
  return error === null
}

/**
 * Чей дневник видит повар. null - ссылка отозвана или это не повар:
 * база отдаёт контекст только действующему повару (is_cook).
 */
export function useCookContext(enabled: boolean) {
  return useQuery({
    queryKey: ['cook', 'context'],
    enabled,
    staleTime: 0,
    queryFn: async (): Promise<{ ownerId: string; ownerName: string } | null> => {
      const { data, error } = await supabase.rpc('cook_context')
      if (error) throw error
      const row = data?.[0]
      return row ? { ownerId: row.owner_id, ownerName: row.owner_name } : null
    },
  })
}

/**
 * Норма дня владельца - из снимков дня, последнего на эту дату или раньше.
 *
 * Профиль владельца повару не открыт (там вес, цели и всё остальное), а снимок
 * нормы - ровно то, что нужно, чтобы считать граммовку под неё.
 */
export function useOwnerGoal(ownerId: string, date: string) {
  return useQuery({
    queryKey: ['cook', 'goal', ownerId, date],
    enabled: ownerId !== '',
    queryFn: async (): Promise<{ goal: Macros; goalDirection: GoalDirection; date: string } | null> => {
      const { data, error } = await supabase
        .from('daily_goals')
        .select('date, kcal, protein, fat, carbs, goal_direction')
        .eq('user_id', ownerId)
        .lte('date', date)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        goal: { kcal: data.kcal, protein: data.protein, fat: data.fat, carbs: data.carbs },
        goalDirection: data.goal_direction as GoalDirection,
        date: data.date,
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Сторона владельца: выпустить, отозвать, посмотреть ссылку повара

export type CookStatus = { issuedAt: string | null; revokedAt: string | null; lastSignInAt: string | null }

/** null - у этого человека повара нет. */
export function useCookStatus() {
  return useQuery({
    queryKey: ['cook', 'status'],
    queryFn: async (): Promise<CookStatus | null> => {
      const { data, error } = await supabase.rpc('cook_status')
      if (error) throw error
      const row = data?.[0]
      return row ? { issuedAt: row.issued_at, revokedAt: row.revoked_at, lastSignInAt: row.last_sign_in_at } : null
    },
  })
}

/** Ссылка из секрета: фрагмент (#) не уходит на сервер и не попадает в логи. */
export function cookLink(secret: string): string {
  return `${window.location.origin}/cook#${secret}`
}

export function useIssueCookLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('cook_link_issue')
      if (error) throw error
      return cookLink(data)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['cook', 'status'] }),
  })
}

export function useRevokeCookLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cook_link_revoke')
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['cook', 'status'] }),
  })
}
