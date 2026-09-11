/**
 * Правила повторения задач.
 *
 * В базе лежит только ближайший срок - она сдвигает его вперёд после того,
 * как вхождение прошло. Календарю этого мало: он показывает месяц целиком,
 * и повторяющаяся задача должна быть видна на всех своих датах.
 *
 * Поэтому та же логика повторена здесь и в SQL-функции next_occurrence.
 * Дублирование осознанное: без него календарь не смог бы показать будущие
 * вхождения, а уведомления не смогли бы обойтись без обращения к клиенту.
 * Согласие двух реализаций проверяет scripts/check-recurrence.ts -
 * расхождение означало бы, что календарь показывает одни даты,
 * а уведомления приходят в другие.
 */

import { tr, trPlural } from '@/lib/i18n'

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly'

export type Recurrence = {
  freq: Freq
  interval: number
  /** Только для weekly. ISO: 1 - понедельник, 7 - воскресенье. */
  weekdays?: number[]
}

/** Ключи подписей: сами подписи живут в словарях. */
export const FREQ_KEYS: Record<Freq, 'recur.day' | 'recur.week' | 'recur.month' | 'recur.year'> = {
  daily: 'recur.day',
  weekly: 'recur.week',
  monthly: 'recur.month',
  yearly: 'recur.year',
}

export const WEEKDAY_KEYS = [
  'weekday.mon',
  'weekday.tue',
  'weekday.wed',
  'weekday.thu',
  'weekday.fri',
  'weekday.sat',
  'weekday.sun',
] as const

/** ISO-номер дня недели: понедельник 1, воскресенье 7. */
export function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1
}

/**
 * Следующее вхождение строго после указанного момента.
 *
 * Для недельного правила с выбранными днями шаг идёт по дням, а не по неделям:
 * «пн, ср, пт» - это три вхождения в неделю, а не одно.
 */
export function nextOccurrence(from: Date, rule: Recurrence): Date | null {
  const step = Math.max(1, Math.trunc(rule.interval))

  if (rule.freq === 'weekly' && rule.weekdays && rule.weekdays.length > 0) {
    const days = new Set(rule.weekdays)
    const candidate = new Date(from)
    for (let i = 0; i < 371; i++) {
      candidate.setDate(candidate.getDate() + 1)
      if (days.has(isoWeekday(candidate))) return candidate
    }
    return null
  }

  const next = new Date(from)
  switch (rule.freq) {
    case 'daily':
      next.setDate(next.getDate() + step)
      return next
    case 'weekly':
      next.setDate(next.getDate() + step * 7)
      return next
    case 'monthly': {
      // Конец месяца подрезаем так же, как Postgres: 31 января + месяц = 28/29
      // февраля. Без этого setMonth перекинул бы дату на 3 марта.
      const day = next.getDate()
      next.setDate(1)
      next.setMonth(next.getMonth() + step)
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
      next.setDate(Math.min(day, lastDay))
      return next
    }
    case 'yearly': {
      const day = next.getDate()
      const month = next.getMonth()
      next.setDate(1)
      next.setFullYear(next.getFullYear() + step)
      const lastDay = new Date(next.getFullYear(), month + 1, 0).getDate()
      next.setMonth(month)
      next.setDate(Math.min(day, lastDay))
      return next
    }
  }
}

/**
 * Все вхождения задачи, попадающие в диапазон.
 *
 * Начинает от сохранённого срока и идёт вперёд. Назад не идёт: база уже
 * сдвинула срок за прошедшие вхождения, и восстанавливать их незачем -
 * прошлое повторяющейся задачи нас не интересует, интересует расписание.
 */
export function occurrencesInRange(
  dueAt: Date,
  rule: Recurrence | null,
  until: Date | null,
  from: Date,
  to: Date,
  limit = 200,
  /**
   * Отменённые вхождения - моменты, а не даты.
   *
   * Дата потребовала бы решать, в чьём часовом поясе она считается: у базы
   * UTC, у людей Алматы, и вхождение в час ночи попадало бы во вчера.
   * Момент сравнивается точно и пояса не знает. То же представление
   * и в базе, иначе календарь и рассылка расходились бы.
   */
  excluded: readonly string[] = [],
): Date[] {
  const skip = new Set(excluded.map((iso) => new Date(iso).getTime()))

  if (!rule) {
    const single = dueAt >= from && dueAt <= to && !skip.has(dueAt.getTime())
    return single ? [dueAt] : []
  }

  const out: Date[] = []
  let cursor = new Date(dueAt)

  for (let i = 0; i < limit; i++) {
    if (cursor > to) break
    if (until && cursor > until) break
    if (cursor >= from && !skip.has(cursor.getTime())) out.push(new Date(cursor))

    const next = nextOccurrence(cursor, rule)
    if (!next || next <= cursor) break
    cursor = next
  }

  return out
}

const EVERY: Record<Freq, 'recur.everyDay' | 'recur.everyWeek' | 'recur.everyMonth' | 'recur.everyYear'> = {
  daily: 'recur.everyDay',
  weekly: 'recur.everyWeek',
  monthly: 'recur.everyMonth',
  yearly: 'recur.everyYear',
}

const UNIT: Record<Freq, string> = {
  daily: 'recur.unit.day',
  weekly: 'recur.unit.week',
  monthly: 'recur.unit.month',
  yearly: 'recur.unit.year',
}

export function describeRecurrence(rule: Recurrence | null): string {
  if (!rule) return tr('recur.none')

  const step = Math.max(1, Math.trunc(rule.interval))
  const base =
    step === 1
      ? tr(EVERY[rule.freq])
      : tr('recur.every', { step, unit: trPlural(UNIT[rule.freq] ?? '', step) })

  if (rule.freq === 'weekly' && rule.weekdays && rule.weekdays.length > 0) {
    const days = [...rule.weekdays]
      .sort((a, b) => a - b)
      .map((d) => tr(WEEKDAY_KEYS[d - 1] ?? 'weekday.mon'))
      .join(', ')
    return `${base}: ${days}`
  }

  return base
}
