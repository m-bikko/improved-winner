import { diffDays, shiftDays } from '@/lib/date'
import { CHECKPOINTS, WEEKS, type WeekInfo } from './weeks'

/** Срок родов - 280 дней от первого дня последней менструации. */
export const TERM_DAYS = 280

export type Gestation = {
  /** Полных недель. */
  week: number
  /** День недели, 0..6. */
  day: number
  trimester: 1 | 2 | 3
  dueDate: string
  daysLeft: number
  /** Доля срока 0..1 - для шкалы. */
  progress: number
}

export function gestation(lmp: string, today: string): Gestation {
  const days = Math.max(diffDays(lmp, today), 0)
  const week = Math.floor(days / 7)
  return {
    week,
    day: days % 7,
    // Триместры - по распространённой границе: до 13 недель включительно,
    // 14-27, с 28-й
    trimester: week < 14 ? 1 : week < 28 ? 2 : 3,
    dueDate: shiftDays(lmp, TERM_DAYS),
    daysLeft: TERM_DAYS - days,
    progress: Math.min(days / TERM_DAYS, 1),
  }
}

/** Сведения о неделе: до 4-й показывать нечего, после 40-й - как 40-я. */
export function weekInfo(week: number): WeekInfo | null {
  if (week < 4) return null
  return WEEKS.find((w) => w.week === Math.min(week, 40)) ?? null
}

export type CheckpointState = 'done' | 'now' | 'soon' | 'later'

/** Где неделя относительно вехи: прошла, идёт, скоро (в пределах 4 недель) или впереди. */
export function checkpointState(week: number, from: number, to: number): CheckpointState {
  if (week > to) return 'done'
  if (week >= from) return 'now'
  if (from - week <= 4) return 'soon'
  return 'later'
}

/** Вехи, о которых стоит сказать сейчас: идущие и ближайшие. */
export function upcomingCheckpoints(week: number): typeof CHECKPOINTS {
  return CHECKPOINTS.filter((c) => {
    const s = checkpointState(week, c.fromWeek, c.toWeek)
    return s === 'now' || s === 'soon'
  })
}

/** С какой недели показывать счёт шевелений и таймер схваток. */
export const KICKS_FROM = 24
export const CONTRACTIONS_FROM = 34

/** С какой недели на экране кнопка «Малыш родился». Раньше - из настроек: роды бывают и раньше срока. */
export const BORN_FROM = 36
