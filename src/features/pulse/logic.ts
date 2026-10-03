import { TALK_GAP } from './areas'
import type { PulseEntry } from './api'

/** Месяц - его первое число: так он хранится в базе. */
export function monthOf(today: string): string {
  return `${today.slice(0, 7)}-01`
}

export function average(scores: readonly number[]): number {
  return scores.length === 0 ? 0 : Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10
}

/** Области, где оценки разошлись настолько, что стоит поговорить. */
export function gaps(mine: PulseEntry, theirs: PulseEntry): number[] {
  return mine.scores.flatMap((s, i) => (Math.abs(s - (theirs.scores[i] ?? s)) >= TALK_GAP ? [i] : []))
}

/** Месяцы, где ответили оба, - по убыванию: история и тренд. */
export function revealedMonths(entries: readonly PulseEntry[], me: string, partner: string): string[] {
  const months = new Set(entries.filter((e) => e.userId === me).map((e) => e.month))
  return [...new Set(entries.filter((e) => e.userId === partner && months.has(e.month)).map((e) => e.month))].sort((a, b) =>
    a < b ? 1 : -1,
  )
}
