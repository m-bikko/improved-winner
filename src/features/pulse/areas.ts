import { CalendarHeart, HeartHandshake, MessageCircle, Sparkles, Telescope, type LucideIcon } from 'lucide-react'

/**
 * Области разговора месяца - ПО ПОРЯДКУ ОЦЕНОК В БАЗЕ.
 *
 * Оценки хранятся массивом из пяти чисел, и номер числа - это номер области
 * здесь. Переставить или заменить область значит поменять смысл всех
 * прошлых месяцев, поэтому только так, как есть.
 */
export const PULSE_AREAS: readonly { id: string; icon: LucideIcon }[] = [
  { id: 'closeness', icon: Sparkles },
  { id: 'support', icon: HeartHandshake },
  { id: 'time', icon: CalendarHeart },
  { id: 'talk', icon: MessageCircle },
  { id: 'future', icon: Telescope },
]

/** С какой разницы в оценках область стоит обсудить. */
export const TALK_GAP = 3
