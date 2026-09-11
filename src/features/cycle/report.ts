import { tr, trPlural } from '@/lib/i18n'
import { daysBetween, type Period } from './cycle'

export type ReportCycle = {
  /** Дата начала менструации. */
  startedOn: string
  /** Длительность менструации в днях. null - не отмечен конец. */
  periodDays: number | null
  /** Длина цикла до следующего начала. null - цикл ещё идёт. */
  cycleDays: number | null
}

export type Report = {
  from: string
  to: string
  observedDays: number
  cycles: ReportCycle[]
  cycleMin: number | null
  cycleMax: number | null
  cycleAvg: number | null
  periodMin: number | null
  periodMax: number | null
  periodAvg: number | null
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

/**
 * Разбор истории на отдельные циклы.
 *
 * Длины НЕ пересчитываются: они приходят вместе с записью из вью `periods_v`,
 * и считать их здесь заново значило бы завести третью копию той же
 * арифметики. Выписка только собирает.
 *
 * Здесь НЕТ окна и НЕТ отбраковки по правдоподобию - в отличие от
 * `cycleStats`, которая считает среднее для прогноза. Врачу нужна полная
 * история, включая выбивающиеся значения: именно они и есть повод
 * для разговора, а отфильтруй мы их, выписка показала бы ровную картину
 * там, где её нет.
 *
 * Отбрасывается только будущее: опечатка в дате не должна превращаться
 * в цикл длиной в год.
 */
export function buildReport(periods: Period[], today: string): Report | null {
  const sorted = [...periods]
    .filter((p) => p.startedOn <= today)
    .sort((a, b) => (a.startedOn < b.startedOn ? -1 : 1))
  if (sorted.length === 0) return null

  const cycles: ReportCycle[] = sorted.map((p, i) => ({
    startedOn: p.startedOn,
    periodDays: p.periodDays,
    // У последней записи следующего начала нет, и вью честно отдаёт null.
    // Но если запись из будущего мы отбросили, её сосед всё ещё несёт
    // длину до неё - здесь это уже неправда
    cycleDays: sorted[i + 1] ? p.cycleDays : null,
  }))

  const cycleLengths = cycles.map((c) => c.cycleDays).filter((v): v is number => v !== null)
  const periodLengths = cycles.map((c) => c.periodDays).filter((v): v is number => v !== null)

  const first = sorted[0]!.startedOn
  return {
    from: first,
    to: today,
    observedDays: daysBetween(first, today) + 1,
    cycles,
    cycleMin: cycleLengths.length ? Math.min(...cycleLengths) : null,
    cycleMax: cycleLengths.length ? Math.max(...cycleLengths) : null,
    cycleAvg: avg(cycleLengths),
    periodMin: periodLengths.length ? Math.min(...periodLengths) : null,
    periodMax: periodLengths.length ? Math.max(...periodLengths) : null,
    periodAvg: avg(periodLengths),
  }
}

function dmy(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/**
 * Выписка простым текстом - чтобы скопировать, отправить или распечатать.
 *
 * Без разметки и без таблиц: текст переживает вставку куда угодно, а врачу
 * нужен не вид, а содержимое. Сноска про происхождение записей обязательна:
 * это дневник пациента, а не результат измерения, и выдавать одно за другое
 * нельзя.
 *
 * Название приложения приходит параметром, а не импортом: оно подставляется
 * сборкой, а модуль должен запускаться и вне её - иначе его нечем проверить.
 */
export function reportToText(report: Report, warningTitles: string[], appName: string): string {
  const lines: string[] = []
  lines.push(tr('rep.title'))
  lines.push(
    tr('rep.observed', {
      from: dmy(report.from),
      to: dmy(report.to),
      days: report.observedDays,
      unit: trPlural('unit.day', report.observedDays),
    }),
  )
  lines.push(tr('rep.recorded', { n: report.cycles.length }))
  lines.push('')

  if (report.cycleAvg !== null) {
    lines.push(
      tr('rep.cycleLen', {
        avg: report.cycleAvg,
        unit: trPlural('unit.day', report.cycleAvg),
        min: report.cycleMin ?? 0,
        max: report.cycleMax ?? 0,
      }),
    )
  } else {
    lines.push(tr('rep.cycleLenNone'))
  }
  if (report.periodAvg !== null) {
    lines.push(
      tr('rep.periodLen', {
        avg: report.periodAvg,
        unit: trPlural('unit.day', report.periodAvg),
        min: report.periodMin ?? 0,
        max: report.periodMax ?? 0,
      }),
    )
  }
  lines.push('')

  lines.push(tr('rep.history'))
  for (const c of report.cycles) {
    const period =
      c.periodDays === null
        ? tr('rep.periodUnknown')
        : tr('rep.periodDays', {
            n: c.periodDays,
            unit: trPlural('unit.day', c.periodDays),
          })
    const cycle =
      c.cycleDays === null
        ? tr('rep.cycleOngoing')
        : tr('rep.cycleDays', {
            n: c.cycleDays,
            unit: trPlural('unit.day', c.cycleDays),
          })
    lines.push(`  ${dmy(c.startedOn)} — ${period}, ${cycle}`)
  }

  if (warningTitles.length > 0) {
    lines.push('')
    lines.push(tr('rep.warnings'))
    for (const w of warningTitles) lines.push(`  — ${w}`)
  }

  lines.push('')
  lines.push(tr('rep.footer', { app: appName }))
  return lines.join('\n')
}
