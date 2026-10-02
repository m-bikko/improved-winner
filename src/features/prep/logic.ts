import { shiftDays } from '@/lib/date'
import { cycleDay, forecast, type Period } from '@/features/cycle/cycle'

export type Check = {
  id: string
  userId: string
  itemKey: string | null
  title: string | null
  doneOn: string | null
}

/** Дни, когда человек отметил витамины, - сколько подряд до сегодня. */
export function vitaminStreak(days: readonly string[], today: string): number {
  const set = new Set(days)
  // Сегодня ещё не отмечено - серию не обрывает: день идёт
  let day = set.has(today) ? today : shiftDays(today, -1)
  let n = 0
  while (set.has(day)) {
    n++
    day = shiftDays(day, -1)
  }
  return n
}

/** Дней с витаминами с начала подготовки. */
export function vitaminDaysSince(days: readonly string[], since: string): number {
  return days.filter((d) => d >= since).length
}

export type Window = {
  from: string
  to: string
  ovulation: string
  /** Сегодня внутри окна - и не идёт менструация. */
  now: boolean
  /** Прогноз пока приблизительный - как и в разделе цикла. */
  approximate: boolean
}

/**
 * Ближайшее благоприятное окно - из того же расчёта, что у раздела цикла.
 *
 * Текущее, если оно ещё не прошло; иначе - из прогноза следующего цикла.
 * При задержке окна нет: пока цикл не начался, любая дата была бы выдумкой.
 *
 * Одна поправка к календарному окну: оно не начинается раньше, чем
 * кончится ожидаемая менструация. Пока циклов мало, окно расширено запасом
 * на неуверенность и при коротком цикле заезжает на первые дни. В календаре
 * это просто цветные клетки, а здесь экран прямо говорит «сейчас
 * благоприятные дни» - и сказать это на пятый день менструации было бы
 * неправдой. По той же причине «сейчас» не говорится, пока она идёт.
 */
export function nextWindow(
  periods: Period[],
  today: string,
  lutealDays: number,
  lhDates: readonly string[],
): Window | null {
  const state = cycleDay(periods, today, lutealDays, lhDates)
  if (!state || state.delay !== null) return null

  const lastStart = shiftDays(today, -(state.day - 1))
  const afterPeriod = shiftDays(lastStart, state.periodLength)
  const from = state.fertileFrom < afterPeriod ? afterPeriod : state.fertileFrom
  if (today <= state.fertileTo && from <= state.fertileTo) {
    return {
      from,
      to: state.fertileTo,
      ovulation: state.ovulation,
      now: !state.bleeding && today >= from,
      approximate: state.approximate,
    }
  }

  const next = forecast(periods, lutealDays, 1, lhDates)[0]
  if (!next) return null
  const nextFrom = shiftDays(next.end, 1)
  return {
    from: next.fertileFrom < nextFrom ? nextFrom : next.fertileFrom,
    to: next.fertileTo,
    ovulation: next.ovulation,
    now: false,
    approximate: state.approximate,
  }
}
