import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/db'
import type { Period } from './cycle'

type Row = Database['public']['Views']['periods_v']['Row']
type SettingsRow = Database['public']['Tables']['cycle_settings']['Row']

export type CycleSettings = {
  trackingEnabled: boolean
  shareWithPartner: boolean
  lutealDays: number
}

export const DEFAULT_SETTINGS: CycleSettings = {
  trackingEnabled: false,
  shareWithPartner: false,
  lutealDays: 14,
}

function fromRow(row: Row): Period {
  return {
    id: row.id ?? '',
    startedOn: row.started_on ?? '',
    endedOn: row.ended_on,
    note: row.note,
    periodDays: row.period_days,
    cycleDays: row.cycle_days,
  }
}

function settingsFromRow(row: SettingsRow): CycleSettings {
  return {
    trackingEnabled: row.tracking_enabled,
    shareWithPartner: row.share_with_partner,
    lutealDays: row.luteal_days,
  }
}

/**
 * Записи одного человека.
 *
 * Читается через вью: длины менструации и цикла считает база, потому что
 * длина цикла — это расстояние до следующей записи, и на клиенте её пришлось
 * бы вычислять при каждом рендере из соседей.
 *
 * Партнёру запрос вернёт пусто, если владелец не открыл раздел, — так решает
 * RLS, а не эта функция. Отсутствие данных здесь неотличимо от «не поделились»,
 * и это правильно: клиент не должен уметь различать «нет записей» и «мне
 * не показывают».
 */
export function usePeriods(userId: string) {
  return useQuery({
    queryKey: ['periods', userId],
    enabled: userId !== '',
    queryFn: async (): Promise<Period[]> => {
      const { data, error } = await supabase
        .from('periods_v')
        .select('*')
        .eq('user_id', userId)
        .order('started_on', { ascending: true })
      if (error) throw error
      return data.map(fromRow)
    },
  })
}

export function useCycleSettings() {
  return useQuery({
    queryKey: ['cycle-settings'],
    queryFn: async (): Promise<CycleSettings> => {
      const { data, error } = await supabase.from('cycle_settings').select('*').maybeSingle()
      if (error) throw error
      return data ? settingsFromRow(data) : DEFAULT_SETTINGS
    },
  })
}

export function useSaveCycleSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (next: CycleSettings): Promise<void> => {
      const { data: session } = await supabase.auth.getUser()
      const userId = session.user?.id
      if (!userId) throw new Error('Нет сессии')
      const { error } = await supabase.from('cycle_settings').upsert({
        user_id: userId,
        tracking_enabled: next.trackingEnabled,
        share_with_partner: next.shareWithPartner,
        luteal_days: next.lutealDays,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cycle-settings'] })
      void qc.invalidateQueries({ queryKey: ['periods'] })
    },
  })
}

export function useStartPeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (startedOn: string): Promise<void> => {
      const { error } = await supabase.from('periods').insert({ started_on: startedOn })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['periods'] }),
  })
}

export function useSavePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      startedOn: string
      endedOn: string | null
      note: string | null
    }): Promise<void> => {
      const { error } = await supabase
        .from('periods')
        .update({
          started_on: input.startedOn,
          ended_on: input.endedOn,
          note: input.note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['periods'] }),
  })
}

export function useDeletePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('periods').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['periods'] }),
  })
}
