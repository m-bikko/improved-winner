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

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly'

export type Recurrence = {
  freq: Freq
  interval: number
  /** Только для weekly. ISO: 1 - понедельник, 7 - воскресенье. */
  weekdays?: number[]
}

export const FREQ_LABELS: Record<Freq, string> = {
  daily: 'День',
  weekly: 'Неделя',
  monthly: 'Месяц',
  yearly: 'Год',
}

export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const

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
): Date[] {
  if (!rule) {
    return dueAt >= from && dueAt <= to ? [dueAt] : []
  }

  const out: Date[] = []
  let cursor = new Date(dueAt)

  for (let i = 0; i < limit; i++) {
    if (cursor > to) break
    if (until && cursor > until) break
    if (cursor >= from) out.push(new Date(cursor))

    const next = nextOccurrence(cursor, rule)
    if (!next || next <= cursor) break
    cursor = next
  }

  return out
}

/**
 * «Каждый день», «Каждые 2 недели: Пн, Ср», «Каждый месяц».
 *
 * Формы выписаны целиком, а не собираются из корня и окончания: попытка
 * приклеить «ую» к «Каждый» давала «Каждыйую неделю».
 */
const SINGULAR: Record<Freq, string> = {
  daily: 'Каждый день',
  weekly: 'Каждую неделю',
  monthly: 'Каждый месяц',
  yearly: 'Каждый год',
}

/** Родительный падеж множественного: «каждые 3 …». */
const PLURAL: Record<Freq, string> = {
  daily: 'дня',
  weekly: 'недели',
  monthly: 'месяца',
  yearly: 'года',
}

/** Для 5 и больше форма меняется: «5 дней», а не «5 дня». */
const MANY: Record<Freq, string> = {
  daily: 'дней',
  weekly: 'недель',
  monthly: 'месяцев',
  yearly: 'лет',
}

/** Числа на 1, кроме 11: «каждые 21 день», а не «21 дней». */
const ONE: Record<Freq, string> = {
  daily: 'день',
  weekly: 'неделю',
  monthly: 'месяц',
  yearly: 'год',
}

function unitFor(freq: Freq, step: number): string {
  const last = step % 10
  const teen = step % 100 >= 11 && step % 100 <= 14
  if (!teen && last === 1) return ONE[freq]
  if (!teen && last >= 2 && last <= 4) return PLURAL[freq]
  return MANY[freq]
}

export function describeRecurrence(rule: Recurrence | null): string {
  if (!rule) return 'Не повторяется'

  const step = Math.max(1, Math.trunc(rule.interval))
  const base = step === 1 ? SINGULAR[rule.freq] : `Каждые ${step} ${unitFor(rule.freq, step)}`

  if (rule.freq === 'weekly' && rule.weekdays && rule.weekdays.length > 0) {
    const days = [...rule.weekdays]
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_LABELS[d - 1])
      .join(', ')
    return `${base}: ${days}`
  }

  return base
}
