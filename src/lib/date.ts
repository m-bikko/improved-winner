/**
 * Работа с датами дневника.
 *
 * Дату дня всегда считает клиент. Часовой пояс базы - UTC, поэтому
 * `default current_date` или `now()` в SQL означали бы, что еда, съеденная
 * в 21:00 по Алматы, уезжает на завтра.
 *
 * По той же причине здесь нет ни одного toISOString(): он отдаёт дату в UTC.
 * Это классическая ошибка, которая проявляется только вечером и только
 * в плюсовых поясах - то есть ровно там, где живут пользователи.
 */

import { tr } from '@/lib/i18n'
import { activeLocale } from '@/lib/i18n/lang'

/** Локальная дата в формате YYYY-MM-DD. */
export function toLocalISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayLocal(): string {
  return toLocalISO(new Date())
}

/** Разбор YYYY-MM-DD в локальную полночь (не в UTC, как это сделал бы new Date(iso)). */
export function fromLocalISO(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

export function shiftDays(iso: string, days: number): string {
  const date = fromLocalISO(iso)
  date.setDate(date.getDate() + days)
  return toLocalISO(date)
}

/**
 * Момент времени → значение для <input type="datetime-local">.
 *
 * Собирается по частям вручную. toISOString() здесь дал бы UTC, и вечерний
 * дедлайн показывался бы в поле сдвинутым на несколько часов назад.
 */
export function toDateTimeInput(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${toLocalISO(d)}T${hh}:${mm}`
}

/**
 * Значение из <input type="datetime-local"> → момент времени.
 *
 * Строка без указания зоны трактуется как местное время - это то, что человек
 * и имел в виду, ставя «14:30».
 */
export function fromDateTimeInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/*
 * Месяцы и дни недели НЕ лежат в словарях: их знает Intl, и на всех трёх
 * языках он назовёт их правильнее, чем список, переписанный руками.
 * В словаре остаётся только то, чего в Intl нет, - «сегодня» и «вчера».
 */

/** «Сегодня в 14:30», «Вчера в 9:00», «3 сентября, 14:30». */
export function formatDueAt(iso: string): string {
  const date = new Date(iso)
  const day = toLocalISO(date)
  const time = date.toLocaleTimeString(activeLocale(), { hour: '2-digit', minute: '2-digit' })
  const today = todayLocal()

  if (day === today) return tr('date.todayAt', { time })
  if (day === shiftDays(today, -1)) return tr('date.yesterdayAt', { time })
  if (day === shiftDays(today, 1)) return tr('date.tomorrowAt', { time })

  const dayMonth = date.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'long' })
  return `${dayMonth}, ${time}`
}

/** «Сегодня», «Вчера», «Завтра» или «3 сентября, среда». */
export function formatDayLabel(iso: string): string {
  const today = todayLocal()
  if (iso === today) return tr('common.today')
  if (iso === shiftDays(today, -1)) return tr('common.yesterday')
  if (iso === shiftDays(today, 1)) return tr('common.tomorrow')

  return fromLocalISO(iso).toLocaleDateString(activeLocale(), {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  })
}

/**
 * Название месяца на текущем языке.
 *
 * Через Intl, а не списком: три календаря держали три копии одного и того же
 * списка, и каждая новая локаль требовала бы трёх правок. Форма именительная
 * («Сентябрь»), потому что в заголовке календаря месяц стоит сам по себе,
 * а не в дате.
 */
export function monthName(month: number): string {
  const name = new Date(2000, month, 1).toLocaleDateString(activeLocale(), { month: 'long' })
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * Короткие дни недели, с понедельника.
 *
 * Понедельник первым задан жёстко: в приложении календари недельные
 * и начинаются с него, а `Intl` определяет первый день по локали -
 * в английской он воскресенье, и сетка разъехалась бы.
 */
export function weekdayShortNames(): string[] {
  // 2024-01-01 - понедельник
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(activeLocale(), { weekday: 'short' }),
  )
}
