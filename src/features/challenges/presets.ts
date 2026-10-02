import {
  BookOpen,
  CandyOff,
  Dumbbell,
  Flower2,
  Footprints,
  GlassWater,
  Heart,
  Moon,
  PhoneOff,
  Salad,
  Sunrise,
  Target,
  Video,
  type LucideIcon,
} from 'lucide-react'

/**
 * Значки челленджа. Ключ хранится в базе (CHECK: a-z и подчёркивание),
 * поэтому ключи не переименовываются - только добавляются.
 */
export const CHALLENGE_ICONS = {
  steps: Footprints,
  sugar: CandyOff,
  workout: Dumbbell,
  water: GlassWater,
  sleep: Moon,
  reading: BookOpen,
  phone: PhoneOff,
  call: Video,
  sunrise: Sunrise,
  calm: Flower2,
  veggies: Salad,
  heart: Heart,
  target: Target,
} as const satisfies Record<string, LucideIcon>

export type ChallengeIcon = keyof typeof CHALLENGE_ICONS

export function iconOf(key: string): LucideIcon {
  return (CHALLENGE_ICONS as Record<string, LucideIcon>)[key] ?? Target
}

/**
 * Готовые челленджи: название (ключ словаря `chp.<id>`), значок и срок
 * по умолчанию. Название сохраняется текстом на языке того, кто начал:
 * челлендж - это договорённость двоих, а не элемент интерфейса.
 *
 * Видеозвонок и тёплое слово - про пару на расстоянии, остальное - про
 * общие цели, которые проще держать вдвоём.
 */
export const PRESETS: readonly { id: string; icon: ChallengeIcon; days: number }[] = [
  { id: 'steps', icon: 'steps', days: 30 },
  { id: 'no_sugar', icon: 'sugar', days: 21 },
  { id: 'call', icon: 'call', days: 30 },
  { id: 'workout', icon: 'workout', days: 30 },
  { id: 'water', icon: 'water', days: 14 },
  { id: 'sleep', icon: 'sleep', days: 21 },
  { id: 'reading', icon: 'reading', days: 30 },
  { id: 'no_phone', icon: 'phone', days: 14 },
  { id: 'kind_word', icon: 'heart', days: 7 },
  { id: 'early', icon: 'sunrise', days: 21 },
  { id: 'calm', icon: 'calm', days: 14 },
  { id: 'veggies', icon: 'veggies', days: 21 },
]

export const DURATIONS = [7, 14, 21, 30] as const
