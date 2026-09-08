import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { computeGoals, type ActivityLevel, type GoalDirection, type Macros, type Sex } from '@/lib/nutrition'

export type Profile = {
  userId: string
  nickname: string
  birthYear: number | null
  sex: Sex | null
  heightCm: number | null
  weightKg: number | null
  /** Тихие часы по местному времени. null - выключены. */
  quietFrom: number | null
  quietTo: number | null
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
        quietFrom: row.quiet_from,
        quietTo: row.quiet_to,
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
  })
}

export type WeightPoint = { date: string; weightKg: number }

export function useWeightLog(userId: string) {
  return useQuery({
    queryKey: ['weight', userId],
    queryFn: async (): Promise<WeightPoint[]> => {
      const { data, error } = await supabase
        .from('weight_log')
        .select('date, weight_kg')
        .eq('user_id', userId)
        .order('date')
      if (error) throw error
      return data.map((r) => ({ date: r.date, weightKg: r.weight_kg }))
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
    mutationFn: async (input: { userId: string; date: string; weightKg: number }) => {
      const { error } = await supabase
        .from('weight_log')
        .upsert(
          { user_id: input.userId, date: input.date, weight_kg: input.weightKg },
          { onConflict: 'user_id,date' },
        )
      if (error) throw error

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ weight_kg: input.weightKg })
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
