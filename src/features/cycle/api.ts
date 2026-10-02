import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/db'
import type { Period } from './cycle'
import { type DayLog, type Flow, type Mood, type Symptom } from './dayLog'

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
    longConfirmed: row.long_confirmed === true,
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
 * длина цикла - это расстояние до следующей записи, и на клиенте её пришлось
 * бы вычислять при каждом рендере из соседей.
 *
 * Партнёру запрос вернёт пусто, если владелец не открыл раздел, - так решает
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

/**
 * Длина лютеиновой фазы ВЛАДЕЛИЦЫ цикла.
 *
 * Свой цикл - из своих настроек. Чужой (открытый партнёром) - из её
 * настроек через cycle_luteal_of: прочитать строку настроек партнёр не может,
 * и раньше прогноз её цикла на его телефоне молча считался с ЕГО лютеиновой
 * фазой, расходясь с её прогнозом на пару дней.
 */
export function useLutealOf(ownerId: string, own: boolean): number {
  const settings = useCycleSettings()
  const other = useQuery({
    queryKey: ['cycle-luteal', ownerId],
    enabled: !own && ownerId !== '',
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase.rpc('cycle_luteal_of', { owner: ownerId })
      if (error) throw error
      return data ?? null
    },
  })
  if (own) return settings.data?.lutealDays ?? DEFAULT_SETTINGS.lutealDays
  return other.data ?? DEFAULT_SETTINGS.lutealDays
}

export function useSaveCycleSettings() {
  const qc = useQueryClient()
  // id берётся из контекста, а не из supabase.auth.getUser(): тот ходит
  // в сеть на каждый вызов, и в логе запросов это было видно отдельной
  // строкой «user» рядом с каждой записью настроек.
  const userId = useUserId()
  return useMutation({
    mutationFn: async (next: CycleSettings): Promise<void> => {
      const { error } = await supabase.from('cycle_settings').upsert({
        user_id: userId,
        tracking_enabled: next.trackingEnabled,
        share_with_partner: next.shareWithPartner,
        luteal_days: next.lutealDays,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    // Записи не трогаем: от настроек зависят только производные величины,
    // а они считаются на клиенте из уже загруженных данных. Лишний инвалидейт
    // тянул за собой перезапрос обеих историй на каждое изменение.
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cycle-settings'] }),
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

/**
 * Менструация задним числом.
 *
 * Отдельно от useStartPeriod, потому что это другое действие: та отмечает
 * начало сегодня и ничего не спрашивает, эта заводит запись с любыми датами.
 *
 * Нужна ровно тем, кто только начал вести раздел: пока прошлых циклов нет,
 * приложению не из чего считать ни среднюю длину, ни прогноз - оно молчит
 * до второй менструации, то есть до следующего месяца. Внесённые вручную
 * два-три прошлых цикла дают прогноз сразу.
 *
 * Пересечения, порядок дат и разумную длину держит база: перекрывающиеся
 * записи она отвергает исключающим индексом, а не формой.
 */
export function useAddPeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      startedOn: string
      endedOn: string | null
      note: string | null
    }): Promise<void> => {
      const { error } = await supabase.from('periods').insert({
        started_on: input.startedOn,
        ended_on: input.endedOn,
        note: input.note,
      })
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

/**
 * «Этот длинный цикл был настоящим» - снимает подозрение в пропущенной
 * менструации, и цикл снова идёт в прогноз и в предупреждения.
 */
export function useConfirmLongCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('periods')
        .update({ long_confirmed: true, updated_at: new Date().toISOString() })
        .eq('id', id)
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

type DayRow = Database['public']['Tables']['cycle_days']['Row']

function dayFromRow(row: DayRow): DayLog {
  return {
    date: row.date,
    flow: row.flow as Flow | null,
    pain: row.pain,
    mood: row.mood as Mood | null,
    symptoms: (row.symptoms ?? []) as Symptom[],
    note: row.note,
    lhPositive: row.lh_positive,
  }
}

/**
 * Отметки по дням одного человека.
 *
 * Тянутся все сразу, а не помесячно: строк тут единицы в месяц, и один запрос
 * при открытии раздела дешевле, чем запрос на каждое перелистывание календаря.
 * Плюс так они переживают офлайн вместе с остальным кэшем.
 */
export function useCycleDays(userId: string) {
  return useQuery({
    queryKey: ['cycle-days', userId],
    enabled: userId !== '',
    queryFn: async (): Promise<DayLog[]> => {
      const { data, error } = await supabase
        .from('cycle_days')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
      if (error) throw error
      return data.map(dayFromRow)
    },
  })
}

export function useSaveCycleDay() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: async (log: DayLog): Promise<void> => {
      const { error } = await supabase.from('cycle_days').upsert({
        user_id: userId,
        date: log.date,
        flow: log.flow,
        pain: log.pain,
        mood: log.mood,
        symptoms: log.symptoms,
        note: log.note?.trim() || null,
        lh_positive: log.lhPositive,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cycle-days'] }),
  })
}

/** Пустая отметка в базе запрещена, поэтому «стереть всё» - это удалить строку. */
export function useDeleteCycleDay() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (date: string): Promise<void> => {
      const { error } = await supabase.from('cycle_days').delete().eq('date', date)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cycle-days'] }),
  })
}

/**
 * Открыл ли партнёр мне свой цикл.
 *
 * Через RPC, а не через чтение его настроек: настройки партнёру не видны
 * намеренно, иначе по самому их наличию можно было бы понять, что раздел
 * включён, даже когда доступ закрыт.
 *
 * Отдельный запрос понадобился из-за настоящей поломки. Раньше факт доступа
 * определялся по тому, вернулись ли записи, - и ноль записей был неотличим
 * от «не поделились». Человек открыл партнёру цикл, ещё ничего не отметив,
 * а тот видел ровно то же, что и до открытия. Функция возвращает true только
 * когда владелец сам включил показ, так что лишнего она не раскрывает.
 */
export function useCycleShared(partnerId: string) {
  return useQuery({
    queryKey: ['cycle-shared', partnerId],
    enabled: partnerId !== '',
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('cycle_shared_with_me', { owner: partnerId })
      if (error) throw error
      return data === true
    },
  })
}
