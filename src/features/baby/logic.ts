import { fromLocalISO } from '@/lib/date'

/**
 * Возраст малыша: полные месяцы и дни сверх них.
 *
 * Месяц - календарный: 10 января → 10 февраля - месяц. Если в месяце нет
 * такого числа, месяц исполняется в его последний день: родившемуся
 * 31 января месяц - 28 февраля, два - 31 марта.
 */
export function ageOf(born: string, today: string): { months: number; days: number; totalDays: number } {
  const b = fromLocalISO(born)
  const t = fromLocalISO(today)
  const totalDays = Math.round((t.getTime() - b.getTime()) / 86_400_000)
  if (totalDays <= 0) return { months: 0, days: 0, totalDays: Math.max(0, totalDays) }
  const monthDay = (k: number): Date => {
    const y = b.getFullYear()
    const m = b.getMonth() + k
    return new Date(y, m, Math.min(b.getDate(), new Date(y, m + 1, 0).getDate()))
  }
  let months = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth())
  if (monthDay(months) > t) months -= 1
  const days = Math.round((t.getTime() - monthDay(months).getTime()) / 86_400_000)
  return { months, days, totalDays }
}

/** Сколько прошло с события: «2:15» - часы и минуты. */
export function sinceLabel(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
