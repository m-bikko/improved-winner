import {
  Bike,
  Dumbbell,
  Footprints,
  Music,
  Shield,
  StretchHorizontal,
  Target,
  Trophy,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/**
 * Виды тренировок и их энергетическая стоимость.
 *
 * `met` - метаболический эквивалент из общепринятого компендиума: во сколько
 * раз занятие расходует больше покоя. Расход = МЕТ x вес x часы. Это оценка,
 * а не измерение: реальные числа зависят от интенсивности, и разброс легко
 * в полтора раза. Поэтому оценку всегда можно переписать руками.
 *
 * Подписи живут в словарях перевода - здесь только id.
 * Словарь видов продублирован здесь и в CHECK у таблицы. Коэффициенты -
 * только здесь: база их не считает, потому что расход хранится снимком.
 * Совпадение видов проверяет `check-workouts`.
 */
export type WorkoutKind = {
  id: string
  met: number
  icon: LucideIcon
}

export const WORKOUT_KINDS: WorkoutKind[] = [
  { id: 'gym', met: 5.0, icon: Dumbbell },
  { id: 'run', met: 9.8, icon: Zap },
  { id: 'walk', met: 3.5, icon: Footprints },
  { id: 'bike', met: 7.5, icon: Bike },
  { id: 'swim', met: 7.0, icon: Waves },
  { id: 'yoga', met: 3.0, icon: Wind },
  { id: 'stretch', met: 2.3, icon: StretchHorizontal },
  { id: 'football', met: 7.0, icon: Trophy },
  { id: 'tennis', met: 6.0, icon: Target },
  { id: 'dance', met: 5.0, icon: Music },
  { id: 'fight', met: 8.0, icon: Shield },
  { id: 'other', met: 4.0, icon: Dumbbell },
]

export const KIND_BY_ID: Record<string, WorkoutKind> = Object.fromEntries(
  WORKOUT_KINDS.map((k) => [k.id, k]),
)

/**
 * Оценка расхода: МЕТ x вес x часы.
 *
 * Без веса оценки нет - и подставлять «средние 70 кг» тут нельзя: человек
 * увидит число, поверит ему и не догадается, что оно про кого-то другого.
 * Возвращаем null, а форма просит вписать расход руками.
 */
export function estimateKcal(kindId: string, minutes: number, weightKg: number | null): number | null {
  const kind = KIND_BY_ID[kindId]
  if (!kind || weightKg === null || weightKg <= 0 || minutes <= 0) return null
  return Math.round(kind.met * weightKg * (minutes / 60))
}
