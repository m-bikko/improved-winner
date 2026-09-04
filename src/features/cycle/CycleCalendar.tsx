import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fromLocalISO, toLocalISO, todayLocal } from '@/lib/date'
import type { CycleDay, Forecast, Period } from './cycle'
import type { DayLog } from './dayLog'

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
] as const

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const

type Mark = {
  /** Менструация, которая уже была: отмечена руками. */
  bled: boolean
  /** Менструация, которую только ожидаем. */
  predicted: boolean
  fertile: boolean
  ovulation: boolean
  logged: boolean
}

/**
 * Месяц цикла.
 *
 * Заливка - только для того, что было: отмеченные дни менструации. Прогноз
 * рисуется контуром, а не заливкой, и это не украшение. Ожидаемое и
 * случившееся не должны выглядеть одинаково: иначе через месяц не отличить,
 * что человек отметил сам, а что приложение предположило за него.
 */
export function CycleCalendar({
  periods,
  current,
  forecasts,
  logs,
  selected,
  onSelect,
}: {
  periods: Period[]
  /**
   * Текущий цикл. Идёт отдельно от forecasts не для удобства: его менструация
   * уже случилась и размечена по записям, а вот овуляция и фертильное окно
   * ещё впереди и нигде больше не отмечены. Без него календарь молчал бы
   * про окно ровно того цикла, в котором человек живёт сейчас, - а полоса
   * над ним про это окно говорит. Расхождение читалось бы как ошибка.
   */
  current: CycleDay | null
  forecasts: Forecast[]
  logs: DayLog[]
  selected: string
  onSelect: (date: string) => void
}) {
  const anchor = fromLocalISO(selected)
  const [cursor, setCursor] = useState(() => ({
    year: anchor.getFullYear(),
    month: anchor.getMonth(),
  }))
  const today = todayLocal()

  const { cells, marks } = useMemo(() => {
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
    // Понедельник первым: getDay() отдаёт воскресенье нулём, поэтому сдвиг.
    const firstWeekday = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7

    const list: (string | null)[] = Array.from({ length: firstWeekday }, () => null)
    for (let d = 1; d <= daysInMonth; d++) {
      list.push(toLocalISO(new Date(cursor.year, cursor.month, d)))
    }

    const map = new Map<string, Mark>()
    const mark = (iso: string, patch: Partial<Mark>) => {
      const current = map.get(iso) ?? {
        bled: false, predicted: false, fertile: false, ovulation: false, logged: false,
      }
      map.set(iso, { ...current, ...patch })
    }

    for (const p of periods) {
      const end = p.endedOn ?? p.startedOn
      for (let iso = p.startedOn; iso <= end; iso = toLocalISO(new Date(fromLocalISO(iso).getTime() + 86_400_000))) {
        mark(iso, { bled: true })
      }
    }
    for (const f of forecasts) {
      for (let iso = f.start; iso <= f.end; iso = toLocalISO(new Date(fromLocalISO(iso).getTime() + 86_400_000))) {
        mark(iso, { predicted: true })
      }
      for (let iso = f.fertileFrom; iso <= f.fertileTo; iso = toLocalISO(new Date(fromLocalISO(iso).getTime() + 86_400_000))) {
        mark(iso, { fertile: true })
      }
      mark(f.ovulation, { ovulation: true })
    }
    if (current) {
      for (
        let iso = current.fertileFrom;
        iso <= current.fertileTo;
        iso = toLocalISO(new Date(fromLocalISO(iso).getTime() + 86_400_000))
      ) {
        mark(iso, { fertile: true })
      }
      mark(current.ovulation, { ovulation: true })
    }

    for (const log of logs) mark(log.date, { logged: true })

    return { cells: list, marks: map }
  }, [cursor, periods, current, forecasts, logs])

  const shift = (by: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + by, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  return (
    <section className="rounded-2xl bg-surface p-3 ring-1 ring-line">
      <div className="mb-2 flex items-center justify-between px-1">
        <button type="button" onClick={() => shift(-1)} aria-label="Прошлый месяц" className="p-2 text-muted">
          <ChevronLeft size={20} aria-hidden />
        </button>
        <span className="text-sm font-medium">
          {MONTH_NAMES[cursor.month]} {cursor.year}
        </span>
        <button type="button" onClick={() => shift(1)} aria-label="Следующий месяц" className="p-2 text-muted">
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-center text-xs text-muted">
            {w}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, i) => {
          if (!iso) return <span key={`pad-${i}`} aria-hidden />
          const m = marks.get(iso)
          const isToday = iso === today
          const isSelected = iso === selected
          const day = Number(iso.slice(8, 10))

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              aria-current={isToday ? 'date' : undefined}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors
                ${m?.bled ? 'bg-accent text-accent-ink font-medium' : ''}
                ${!m?.bled && m?.predicted ? 'ring-1 ring-accent/60 text-accent' : ''}
                ${!m?.bled && !m?.predicted ? 'bg-raised' : ''}
                ${isSelected ? 'ring-2 ring-ink' : ''}
                ${isToday && !isSelected ? 'ring-1 ring-muted' : ''}`}
            >
              {day}
              <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                {m?.ovulation && <span className="size-1.5 rounded-full bg-carbs" aria-hidden />}
                {m?.fertile && !m.ovulation && (
                  <span className="size-1 rounded-full bg-carbs/70" aria-hidden />
                )}
                {m?.logged && <span className="size-1 rounded-full bg-ink/60" aria-hidden />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted">
        <Legend className="bg-accent">была</Legend>
        <Legend className="ring-1 ring-accent/60">ожидается</Legend>
        <Legend className="bg-carbs">овуляция</Legend>
        <Legend className="bg-ink/60">есть отметка</Legend>
      </div>
    </section>
  )
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-full ${className}`} aria-hidden />
      {children}
    </span>
  )
}
