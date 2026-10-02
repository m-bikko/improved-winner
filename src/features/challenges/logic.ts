import { diffDays, shiftDays } from '@/lib/date'

export type Mark = { userId: string; date: string }

export type Challenge = {
  id: string
  title: string
  icon: string
  days: number
  startedOn: string
  stoppedOn: string | null
  createdBy: string
  createdAt: string
  marks: Mark[]
}

/** Последний день челленджа: плановый или день остановки. */
export function lastDay(c: Challenge): string {
  return c.stoppedOn ?? shiftDays(c.startedOn, c.days - 1)
}

export type Status = 'upcoming' | 'active' | 'done'

export function statusOf(c: Challenge, today: string): Status {
  if (today < c.startedOn) return 'upcoming'
  if (today > lastDay(c) || c.stoppedOn !== null) return 'done'
  return 'active'
}

/** Номер сегодняшнего дня внутри челленджа, 1..days. */
export function dayNumber(c: Challenge, today: string): number {
  return Math.min(Math.max(diffDays(c.startedOn, today) + 1, 1), c.days)
}

/** Все дни челленджа по порядку - клетки сетки. Остановка срок не укорачивает. */
export function daysOf(c: Challenge): string[] {
  return Array.from({ length: c.days }, (_, i) => shiftDays(c.startedOn, i))
}

export function marked(c: Challenge, userId: string, date: string): boolean {
  return c.marks.some((m) => m.userId === userId && m.date === date)
}

export function countOf(c: Challenge, userId: string): number {
  return c.marks.filter((m) => m.userId === userId).length
}

/** Дни, когда отметились оба. */
export function togetherCount(c: Challenge, a: string, b: string): number {
  if (b === '') return 0
  const mine = new Set(c.marks.filter((m) => m.userId === a).map((m) => m.date))
  return c.marks.filter((m) => m.userId === b && mine.has(m.date)).length
}

/**
 * Общая серия: сколько дней подряд отметились оба.
 *
 * Сегодня, пока не отметились оба, серию не обрывает - день ещё идёт.
 * Иначе утром каждого дня серия показывала бы ноль.
 */
export function jointStreak(c: Challenge, a: string, b: string, today: string): number {
  if (b === '') return 0
  const both = (d: string) => marked(c, a, d) && marked(c, b, d)
  const end = today < lastDay(c) ? today : lastDay(c)
  let day = both(end) ? end : shiftDays(end, -1)
  let n = 0
  while (day >= c.startedOn && both(day)) {
    n++
    day = shiftDays(day, -1)
  }
  return n
}

/**
 * Можно ли поставить или снять отметку за этот день.
 *
 * Только внутри срока и не в будущем: отметиться «за завтра» значило бы
 * пообещать, а не сделать. Прошлые дни открыты - забыть отметиться вечером
 * не повод терять день. Границы срока держит и база (challenge_marks_guard).
 */
export function canMark(c: Challenge, date: string, today: string): boolean {
  return date >= c.startedOn && date <= lastDay(c) && date <= today
}
