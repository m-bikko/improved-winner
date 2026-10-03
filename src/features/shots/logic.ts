/** Сколько минут даётся на кадр после сигнала. */
export const SHOT_WINDOW_MIN = 10

/** Сколько после сигнала ещё можно снять. */
export const SHOT_LATE_HOURS = 24

/** Насколько опоздали: минуты сверх десяти, 0 - вовремя. */
export function lateMinutes(sentAt: string, createdAt: string): number {
  const minutes = (new Date(createdAt).getTime() - new Date(sentAt).getTime()) / 60_000
  return Math.max(0, Math.round(minutes - SHOT_WINDOW_MIN))
}

/** Состояние дня для того, кто смотрит. */
export type ShotState =
  | { kind: 'waiting' }
  | { kind: 'open'; secondsLeft: number }
  | { kind: 'late' }
  | { kind: 'closed' }

export function shotState(sentAt: string | null, now: number): ShotState {
  if (sentAt === null) return { kind: 'waiting' }
  const elapsed = (now - new Date(sentAt).getTime()) / 1000
  if (elapsed < SHOT_WINDOW_MIN * 60) return { kind: 'open', secondsLeft: Math.ceil(SHOT_WINDOW_MIN * 60 - elapsed) }
  if (elapsed < SHOT_LATE_HOURS * 3600) return { kind: 'late' }
  return { kind: 'closed' }
}

/** «7:05» - минуты и секунды. */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
