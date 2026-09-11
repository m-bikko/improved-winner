/**
 * Расчёт дневных целей.
 *
 * Формула Миффлина - Сан Жеора для базового обмена, дальше коэффициент
 * активности и поправка на цель. Считается на клиенте и на лету: так изменение
 * веса сразу отражается в целях, и не нужно ни триггеров, ни фонового пересчёта.
 */

export type Sex = 'male' | 'female'

// Списками, а не объединениями: интерфейс перечисляет их в этом порядке -
// от меньшего к большему, - и порядок должен быть записан там же, где сам
// набор, иначе он разъедется при добавлении уровня
export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number]

export const GOAL_DIRECTIONS = ['lose', 'maintain', 'gain'] as const
export type GoalDirection = (typeof GOAL_DIRECTIONS)[number]

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

/** Поправка к суточной норме под цель. */
const GOAL_FACTORS: Record<GoalDirection, number> = {
  lose: 0.85,
  maintain: 1,
  gain: 1.1,
}

export type Macros = { kcal: number; protein: number; fat: number; carbs: number }

export type GoalInput = {
  birthYear: number | null
  sex: Sex | null
  heightCm: number | null
  weightKg: number | null
  activityLevel: ActivityLevel
  goalDirection: GoalDirection
}

/**
 * Цели по данным профиля. null, если данных не хватает - тогда приложение
 * показывает не выдуманное число, а приглашение заполнить профиль.
 */
export function computeGoals(input: GoalInput): Macros | null {
  const { birthYear, sex, heightCm, weightKg, activityLevel, goalDirection } = input
  if (!birthYear || !sex || !heightCm || !weightKg) return null

  const age = new Date().getFullYear() - birthYear
  if (age < 5 || age > 120) return null

  // Миффлин - Сан Жеор
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161)
  const kcal = bmr * ACTIVITY_FACTORS[activityLevel] * GOAL_FACTORS[goalDirection]

  // Белок и жир привязаны к весу, углеводы забирают остаток: так при дефиците
  // режется именно то, что можно резать, а не мышцы
  const protein = 1.8 * weightKg
  const fat = 0.9 * weightKg
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4)

  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
  }
}
