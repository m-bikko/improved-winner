import {
  Activity,
  CigaretteOff,
  Coffee,
  Droplet,
  FlaskConical,
  HeartPulse,
  Microscope,
  Pill,
  ShieldCheck,
  Smile,
  Stethoscope,
  Syringe,
  ThermometerSun,
  WineOff,
  type LucideIcon,
} from 'lucide-react'
import type { Sex } from '@/lib/nutrition'

/** Кому пункт: ей, ему или каждому из двоих - тогда у каждого своя галочка. */
export type Audience = 'female' | 'male' | 'both'

/**
 * Пункты подготовки. Название и пояснение - в словарях (`prep.item.<id>`
 * и `.hint`), здесь только кому и значок.
 *
 * Это памятка, а не назначение: общие рекомендации, которые дают при
 * планировании беременности (ВОЗ, акушерские сообщества), сформулированные
 * без дозировок там, где их должен назначать врач. Экран говорит это прямо.
 *
 * Ключ хранится в базе как отметка «сделано» - не переименовывать.
 */
export const PREP_ITEMS: readonly { id: string; who: Audience; icon: LucideIcon }[] = [
  { id: 'gyn_visit', who: 'female', icon: Stethoscope },
  { id: 'folic_start', who: 'female', icon: Pill },
  { id: 'rubella', who: 'female', icon: Syringe },
  { id: 'thyroid', who: 'female', icon: Activity },
  { id: 'blood_iron', who: 'female', icon: Droplet },
  { id: 'cervical', who: 'female', icon: Microscope },
  { id: 'caffeine', who: 'female', icon: Coffee },
  { id: 'urologist', who: 'male', icon: Stethoscope },
  { id: 'overheating', who: 'male', icon: ThermometerSun },
  { id: 'vitamins_him', who: 'male', icon: Pill },
  { id: 'blood_group', who: 'both', icon: HeartPulse },
  { id: 'infections', who: 'both', icon: FlaskConical },
  { id: 'dentist', who: 'both', icon: Smile },
  { id: 'no_smoking', who: 'both', icon: CigaretteOff },
  { id: 'alcohol', who: 'both', icon: WineOff },
  { id: 'vaccines', who: 'both', icon: ShieldCheck },
]

/**
 * Пункты человека по полу из профиля. Пол не указан - показываем все:
 * лучше лишний пункт, чем пропущенный анализ.
 */
export function itemsFor(sex: Sex | null): typeof PREP_ITEMS {
  if (sex === null) return PREP_ITEMS
  return PREP_ITEMS.filter((i) => i.who === 'both' || i.who === sex)
}

/** Сколько дней фолиевой считается хорошей подготовкой: три месяца. */
export const FOLATE_GOAL_DAYS = 90
