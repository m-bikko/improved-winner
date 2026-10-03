import { fromLocalISO, shiftDays } from '@/lib/date'

/** Понедельник недели, в которую попадает день. Воскресенье - её конец. */
export function weekStart(day: string): string {
  const weekday = fromLocalISO(day).getDay() // 0 - воскресенье
  return shiftDays(day, weekday === 0 ? -6 : 1 - weekday)
}
