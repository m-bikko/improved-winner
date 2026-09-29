import { useT } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { fromLocalISO, monthName, toLocalISO, todayLocal, weekdayShortNames } from '@/lib/date'
import { Card } from '@/ui/Card'
import { occurrencesInRange } from './recurrence'
import type { Task } from './api'

export type Occurrence = { task: Task; at: Date }

/**
 * Месяц задач.
 *
 * Повторяющиеся задачи раскрываются на видимый диапазон здесь, а не в базе:
 * там лежит только ближайший срок, потому что материализовать вхождения
 * означало бы решать «на сколько лет вперёд» и чистить хвосты при каждой
 * правке правила. Календарю же нужен ровно один месяц.
 */
export function TasksCalendar({
  tasks,
  selected,
  onSelect,
}: {
  tasks: Task[]
  selected: string
  onSelect: (date: string) => void
}) {
  const t = useT()
  const anchor = fromLocalISO(selected)
  const [cursor, setCursor] = useState(() => ({
    year: anchor.getFullYear(),
    month: anchor.getMonth(),
  }))

  const today = todayLocal()

  const { byDay, cells } = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1)
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
    const rangeFrom = new Date(cursor.year, cursor.month, 1, 0, 0, 0)
    const rangeTo = new Date(cursor.year, cursor.month, daysInMonth, 23, 59, 59)

    const map = new Map<string, Occurrence[]>()
    for (const task of tasks) {
      if (!task.dueAt || task.doneAt) continue
      const dates = occurrencesInRange(
        new Date(task.dueAt),
        task.recurrence,
        task.recurrenceUntil ? new Date(`${task.recurrenceUntil}T23:59:59`) : null,
        rangeFrom,
        rangeTo,
        200,
        task.excludedAt,
      )
      for (const at of dates) {
        const key = toLocalISO(at)
        const list = map.get(key)
        if (list) list.push({ task, at })
        else map.set(key, [{ task, at }])
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.at.getTime() - b.at.getTime())
    }

    // getDay(): воскресенье это 0, а неделя у нас начинается с понедельника
    const lead = (first.getDay() + 6) % 7
    return {
      byDay: map,
      cells: [
        ...Array.from({ length: lead }, () => null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
      ],
    }
  }, [tasks, cursor])

  const shift = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: next.getFullYear(), month: next.getMonth() })
  }

  return (
    <Card as="section" className="px-2 pt-1.5 pb-2.5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label={t('cal.prevMonth')}
          className="flex size-11 items-center justify-center rounded-full text-muted transition-colors active:bg-raised"
        >
          <ChevronLeft size={22} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            const now = new Date()
            setCursor({ year: now.getFullYear(), month: now.getMonth() })
            onSelect(todayLocal())
          }}
          className="min-h-11 rounded-full px-3 font-display text-[17px] font-bold tabular-nums
                     transition-colors active:bg-raised"
        >
          {monthName(cursor.month)} {cursor.year}
        </button>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label={t('cal.nextMonth')}
          className="flex size-11 items-center justify-center rounded-full text-muted transition-colors active:bg-raised"
        >
          <ChevronRight size={22} aria-hidden />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {weekdayShortNames().map((w) => (
          <span key={w} className="py-1 text-center text-[13px] font-medium text-muted">
            {w}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <span key={`gap-${i}`} />
          const iso = toLocalISO(new Date(cursor.year, cursor.month, day))
          const items = byDay.get(iso) ?? []
          const isToday = iso === today
          const isSelected = iso === selected
          const overdue = items.some((o) => o.at <= new Date())

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              aria-label={t('cal.dayLabel', { day, n: items.length })}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              // Сегодня - обводкой, выбранный - заливкой: так оба читаются
              // одновременно, когда выбран другой день, и не спорят, когда
              // выбран сам сегодняшний
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl
                          transition-colors ${
                            isSelected
                              ? 'bg-accent text-accent-ink shadow-[0_6px_14px_-6px_var(--c-accent)]'
                              : isToday
                                ? 'ring-2 ring-accent ring-inset active:bg-raised'
                                : 'active:bg-raised'
                          }`}
            >
              <span
                className={`text-[15px] leading-none tabular-nums ${
                  isSelected
                    ? 'font-bold'
                    : isToday
                      ? 'font-bold text-accent'
                      : items.length > 0
                        ? 'font-semibold text-ink'
                        : 'text-muted'
                }`}
              >
                {day}
              </span>

              {/* Точки вместо числа: до трёх задач их видно и так, а «5»
                  на клетке 40 пикселей читается хуже, чем «много».
                  Остаток - плюсом, а не «+2» мелким кеглем: текст в 9px
                  на телефоне не прочесть, а точное число есть в aria-label */}
              <span className="flex h-1.5 items-center gap-0.5">
                {items.slice(0, 3).map((_, index) => (
                  <span
                    key={index}
                    className={`size-1.5 rounded-full ${
                      isSelected ? 'bg-accent-ink/80' : overdue ? 'bg-danger' : 'bg-accent'
                    }`}
                  />
                ))}
                {items.length > 3 && (
                  <Plus
                    size={9}
                    strokeWidth={3.5}
                    aria-hidden
                    className={isSelected ? 'text-accent-ink/80' : 'text-muted'}
                  />
                )}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/** Вхождения выбранного дня - для списка под сеткой. */
export function occurrencesOn(tasks: Task[], iso: string): Occurrence[] {
  const from = fromLocalISO(iso)
  const to = new Date(from)
  to.setHours(23, 59, 59, 999)

  const out: Occurrence[] = []
  for (const task of tasks) {
    if (!task.dueAt || task.doneAt) continue
    for (const at of occurrencesInRange(
      new Date(task.dueAt),
      task.recurrence,
      task.recurrenceUntil ? new Date(`${task.recurrenceUntil}T23:59:59`) : null,
      from,
      to,
      200,
      task.excludedAt,
    )) {
      out.push({ task, at })
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}
