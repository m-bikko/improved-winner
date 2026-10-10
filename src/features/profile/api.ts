import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enqueue, isRetriable } from '@/lib/outbox'
import { supabase } from '@/lib/supabase'
import { computeGoals, macrosFor, type ActivityLevel, type GoalDirection, type Macros, type Sex } from '@/lib/nutrition'
import { leanKg } from '@/lib/body'

export type Profile = {
  userId: string
  nickname: string
  birthYear: number | null
  sex: Sex | null
  heightCm: number | null
  weightKg: number | null
  /**
   * Последний известный процент жира и измеренный обмен. Оба необязательны:
   * их даёт только взвешивание на умных весах, и без них всё считается
   * ровно как раньше.
   */
  bodyFatPct: number | null
  bmrKcal: number | null
  /** Тихие часы по местному времени. null - выключены. */
  quietFrom: number | null
  quietTo: number | null
  /** Язык интерфейса. Его же спрашивают рассылки. */
  language: string
  activityLevel: ActivityLevel
  goalDirection: GoalDirection
  goalsMode: 'auto' | 'manual'
  goalKcal: number | null
  goalProtein: number | null
  goalFat: number | null
  goalCarbs: number | null
  /** Пусто - уведомления в Telegram не приходят. */
  telegramChatId: string | null
}

/**
 * Оба профиля сразу: ник партнёра нужен для подписей в темах и для режима
 * сравнения в дневнике, а строк всего две.
 */
export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase.from('profiles').select('*')
      if (error) throw error
      return data.map((row) => ({
        userId: row.user_id,
        nickname: row.nickname,
        birthYear: row.birth_year,
        sex: row.sex as Sex | null,
        heightCm: row.height_cm,
        weightKg: row.weight_kg,
        bodyFatPct: row.body_fat_pct,
        bmrKcal: row.bmr_kcal,
        quietFrom: row.quiet_from,
        quietTo: row.quiet_to,
        language: row.language,
        activityLevel: row.activity_level as ActivityLevel,
        goalDirection: row.goal_direction as GoalDirection,
        goalsMode: row.goals_mode as 'auto' | 'manual',
        goalKcal: row.goal_kcal,
        goalProtein: row.goal_protein,
        goalFat: row.goal_fat,
        goalCarbs: row.goal_carbs,
        telegramChatId: row.telegram_chat_id,
      }))
    },
    staleTime: 5 * 60_000,
  })
}

/**
 * Цели профиля. При goals_mode='auto' считаются на лету из веса и роста,
 * при 'manual' берутся как есть.
 *
 * Разделение принципиально: без него человек переопределил бы цель руками,
 * потом изменил вес - и значение либо молча затёрлось бы, либо навсегда застыло.
 */
export function goalsFor(profile: Profile | undefined): Macros | null {
  if (!profile) return null

  if (profile.goalsMode === 'manual' && profile.goalKcal) {
    // Своя норма меняет только калории. Б/Ж/У делятся по тем же правилам,
    // что и у расчётной, и от СЕГОДНЯШНЕГО веса и тощей массы - сохранённые
    // в профиле граммы нужны лишь на случай, когда веса нет вовсе.
    if (profile.weightKg !== null) return macrosFor(profile.goalKcal, profile.weightKg, leanFrom(profile))
    return {
      kcal: profile.goalKcal,
      protein: profile.goalProtein ?? 0,
      fat: profile.goalFat ?? 0,
      carbs: profile.goalCarbs ?? 0,
    }
  }

  return computeGoals({
    birthYear: profile.birthYear,
    sex: profile.sex,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    activityLevel: profile.activityLevel,
    goalDirection: profile.goalDirection,
    // Тощая масса считается из процента и СЕГОДНЯШНЕГО веса, а не берётся
    // готовой: процент меняется медленно, вес - каждый день, и норма белка
    // должна идти за весом, а не застывать на дне последнего взвешивания
    // на умных весах.
    leanKg: leanFrom(profile),
    bmrKcal: profile.bmrKcal,
  })
}

/** Тощая масса из профиля. null - процента жира нет или веса нет. */
export function leanFrom(profile: Profile): number | null {
  if (profile.weightKg === null || profile.bodyFatPct === null) return null
  return leanKg(profile.weightKg, profile.bodyFatPct)
}

/**
 * Точка журнала веса.
 *
 * Вес обязателен, остальное - нет, и это не оговорка, а устройство раздела:
 * обычные весы дают одно число, и день с одним числом полноценно участвует
 * в графике, в расчёте расхода и в выписке. Умные добавляют состав, и тогда
 * открывается то, что без него посчитать нельзя.
 */
export type WeightPoint = {
  date: string
  weightKg: number
  bodyFatPct: number | null
  musclePct: number | null
  skeletalMusclePct: number | null
  waterPct: number | null
  visceral: number | null
  bmrKcal: number | null
}

/** Расширенные поля - то, что приходит только с умных весов. */
export type BodyFields = Omit<WeightPoint, 'date' | 'weightKg'>

export const EMPTY_BODY: BodyFields = {
  bodyFatPct: null,
  musclePct: null,
  skeletalMusclePct: null,
  waterPct: null,
  visceral: null,
  bmrKcal: null,
}

export function useWeightLog(userId: string) {
  return useQuery({
    queryKey: ['weight', userId],
    queryFn: async (): Promise<WeightPoint[]> => {
      const { data, error } = await supabase
        .from('weight_log')
        .select(
          'date, weight_kg, body_fat_pct, muscle_pct, skeletal_muscle_pct, water_pct, visceral, bmr_kcal',
        )
        .eq('user_id', userId)
        .order('date')
      if (error) throw error
      return data.map((r) => ({
        date: r.date,
        weightKg: r.weight_kg,
        bodyFatPct: r.body_fat_pct,
        musclePct: r.muscle_pct,
        skeletalMusclePct: r.skeletal_muscle_pct,
        waterPct: r.water_pct,
        visceral: r.visceral,
        bmrKcal: r.bmr_kcal,
      }))
    },
    enabled: userId !== '',
  })
}

/**
 * Запись веса за день.
 *
 * upsert по (user_id, date): взвесился дважды за день - остаётся последнее
 * значение, а не два конфликтующих. Заодно обновляет profiles.weight_kg,
 * от которого зависит расчёт целей.
 */
export function useLogWeight() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: { userId: string; date: string; weightKg: number } & Partial<BodyFields>,
    ) => {
      // Расширенные поля пишутся ВСЕГДА, в том числе как null.
      //
      // Иначе выходит ловушка: человек ввёл состав с умных весов, на другой
      // день взвесился обычными и переписал день - проценты остались бы
      // от прошлого взвешивания и выглядели бы сегодняшним измерением.
      // Отсутствие данных - тоже данные, и стирать их надо явно.
      const row = {
        user_id: input.userId,
        date: input.date,
        weight_kg: input.weightKg,
        body_fat_pct: input.bodyFatPct ?? null,
        muscle_pct: input.musclePct ?? null,
        skeletal_muscle_pct: input.skeletalMusclePct ?? null,
        water_pct: input.waterPct ?? null,
        visceral: input.visceral ?? null,
        bmr_kcal: input.bmrKcal ?? null,
      }
      const { error } = await supabase
        .from('weight_log')
        .upsert(row, { onConflict: 'user_id,date' })
      if (error) {
        if (!isRetriable(error)) throw error
        enqueue({
          table: 'weight_log',
          onConflict: 'user_id,date',
          row,
          key: `weight_log:${input.date}`,
        })
        // Профиль без связи не обновить, но это и не потеря: weight_kg
        // в нём - последнее известное значение, и оно догонит при досылке
        return
      }

      // В профиль уходит вес всегда, а состав - только когда он есть.
      // Обычное взвешивание не должно стирать последний известный процент
      // жира: состав - свойство тела, а не сегодняшнего дня, и человек,
      // вставший на чужие весы в гостях, не должен из-за этого получить
      // другую норму белка.
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          weight_kg: input.weightKg,
          ...(input.bodyFatPct != null && { body_fat_pct: input.bodyFatPct }),
          ...(input.bmrKcal != null && { bmr_kcal: input.bmrKcal }),
        })
        .eq('user_id', input.userId)
      if (profileError) throw profileError
    },
    onSuccess: (_r, input) => {
      void qc.invalidateQueries({ queryKey: ['weight', input.userId] })
      void qc.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export function useSaveProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { userId: string; patch: Partial<Profile> }) => {
      const p = input.patch
      const { error } = await supabase
        .from('profiles')
        .update({
          ...(p.nickname !== undefined && { nickname: p.nickname }),
          ...(p.birthYear !== undefined && { birth_year: p.birthYear }),
          ...(p.sex !== undefined && { sex: p.sex }),
          ...(p.heightCm !== undefined && { height_cm: p.heightCm }),
          ...(p.weightKg !== undefined && { weight_kg: p.weightKg }),
          ...(p.activityLevel !== undefined && { activity_level: p.activityLevel }),
          ...(p.goalDirection !== undefined && { goal_direction: p.goalDirection }),
          ...(p.goalsMode !== undefined && { goals_mode: p.goalsMode }),
          ...(p.goalKcal !== undefined && { goal_kcal: p.goalKcal }),
          ...(p.goalProtein !== undefined && { goal_protein: p.goalProtein }),
          ...(p.goalFat !== undefined && { goal_fat: p.goalFat }),
          ...(p.goalCarbs !== undefined && { goal_carbs: p.goalCarbs }),
          ...(p.telegramChatId !== undefined && { telegram_chat_id: p.telegramChatId }),
        })
        .eq('user_id', input.userId)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}
