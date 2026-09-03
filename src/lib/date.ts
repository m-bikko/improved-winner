/**
 * Работа с датами дневника.
 *
 * Дату дня всегда считает клиент. Часовой пояс базы — UTC, поэтому
 * `default current_date` или `now()` в SQL означали бы, что еда, съеденная
 * в 21:00 по Алматы, уезжает на завтра.
 *
 * По той же причине здесь нет ни одного toISOString(): он отдаёт дату в UTC.
 * Это классическая ошибка, которая проявляется только вечером и только
 * в плюсовых поясах — то есть ровно там, где живут пользователи.
 */

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

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const

const WEEKDAYS = [
  'воскресенье', 'понедельник', 'вторник', 'среда',
  'четверг', 'пятница', 'суббота',
] as const

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
 * Строка без указания зоны трактуется как местное время — это то, что человек
 * и имел в виду, ставя «14:30».
 */
export function fromDateTimeInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** «Сегодня в 14:30», «Вчера в 9:00», «3 сентября, 14:30». */
export function formatDueAt(iso: string): string {
  const date = new Date(iso)
  const day = toLocalISO(date)
  const time = date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  const today = todayLocal()

  if (day === today) return `сегодня в ${time}`
  if (day === shiftDays(today, -1)) return `вчера в ${time}`
  if (day === shiftDays(today, 1)) return `завтра в ${time}`

  const month = MONTHS[date.getMonth()] ?? ''
  return `${date.getDate()} ${month}, ${time}`
}

/** «Сегодня», «Вчера», «Завтра» или «3 сентября, среда». */
export function formatDayLabel(iso: string): string {
  const today = todayLocal()
  if (iso === today) return 'Сегодня'
  if (iso === shiftDays(today, -1)) return 'Вчера'
  if (iso === shiftDays(today, 1)) return 'Завтра'

  const date = fromLocalISO(iso)
  const month = MONTHS[date.getMonth()] ?? ''
  const weekday = WEEKDAYS[date.getDay()] ?? ''
  return `${date.getDate()} ${month}, ${weekday}`
}
