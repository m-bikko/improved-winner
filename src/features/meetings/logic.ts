import { diffDays } from '@/lib/date'

export type MeetingItem = { id: string; title: string; done: boolean; source: 'wish' | 'watch' | 'idea' | null; createdAt: string }

export type Meeting = {
  id: string
  startsOn: string
  endsOn: string
  place: string | null
  note: string | null
  memoryId: string | null
  createdBy: string
  items: MeetingItem[]
}

export type MeetingState =
  | { kind: 'upcoming'; days: number }
  | { kind: 'now'; day: number; of: number }
  | { kind: 'past' }

export function stateOf(m: Meeting, today: string): MeetingState {
  if (today < m.startsOn) return { kind: 'upcoming', days: diffDays(today, m.startsOn) }
  if (today > m.endsOn) return { kind: 'past' }
  return { kind: 'now', day: diffDays(m.startsOn, today) + 1, of: diffDays(m.startsOn, m.endsOn) + 1 }
}

/** Ближайшая: идущая сейчас или первая из будущих. Прошедшие не в счёт. */
export function nextMeeting(list: readonly Meeting[], today: string): Meeting | null {
  return [...list].filter((m) => m.endsOn >= today).sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1))[0] ?? null
}

/** Подпись воспоминания из встречи: что из плана успели. */
export function memoryCaption(m: Meeting, prefix: string): string {
  const done = m.items.filter((i) => i.done).map((i) => i.title)
  return done.length === 0 ? prefix : `${prefix}: ${done.join(', ')}`
}
