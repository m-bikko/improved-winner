import { useT } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fromLocalISO, monthName, toLocalISO, todayLocal, weekdayShortNames } from '@/lib/date'
import type { Macros } from '@/lib/nutrition'
import { Sheet } from '@/ui/Sheet'
import { Loading } from '@/ui/States'

type DaySummary = { kcal: number; protein: number; goalKcal: number | null; goalProtein: number | null }

function useMonth(userId: string, year: number, month: number) {
  const from = toLocalISO(new Date(year, month, 1))
  const to = toLocalISO(new Date(year, month + 1, 0))

  return useQuery({
    queryKey: ['diary-month', userId, from],
    // Обычный объект, а не Map: кэш сериализуется в IndexedDB, и Map после
    // восстановления превращается в {} без методов. Здесь это уже ломалось.
    queryFn: async (): Promise<Record<string, DaySummary>> => {
      const { data, error } = await supabase.rpc('diary_month', {
        p_user: userId,
        p_from: from,
        p_to: to,
      })
      if (error) throw error

      const byDay: Record<string, DaySummary> = {}
      for (const row of data ?? []) {
        // PostgREST отдаёт date строкой YYYY-MM-DD; обрезаем на случай,
        // если когда-нибудь приедет с временем
        byDay[String(row.day).slice(0, 10)] = {
          kcal: Number(row.kcal ?? 0),
          protein: Number(row.protein ?? 0),
          goalKcal: row.goal_kcal === null ? null : Number(row.goal_kcal),
          goalProtein: row.goal_protein === null ? null : Number(row.goal_protein),
        }
      }
      return byDay
    },
    enabled: userId !== '',
  })
}

/**
 * Месяц кольцами.
 *
 * Каждый день - два вложенных кольца: внешнее калории, внутреннее белок.
 * Это малые множители одной и той же меры, поэтому и оформление то же, что
 * у большого кольца на экране дня: незаполненная часть - та же гамма, что
 * и заливка, только светлее.
 *
 * Норма берётся из снимка дня, а где его нет - текущая: ровно то же правило,
 * что и на экране дня, иначе календарь и день расходились бы в цифрах.
 */
export function MonthCalendar({
  open,
  onClose,
  userId,
  currentDate,
  liveGoal,
  onPickDate,
}: {
  open: boolean
  onClose: () => void
  userId: string
  currentDate: string
  liveGoal: Macros | null
  onPickDate: (date: string) => void
}) {
  const t = useT()
  const anchor = fromLocalISO(currentDate)
  const [cursor, setCursor] = useState(() => ({
    year: anchor.getFullYear(),
    month: anchor.getMonth(),
  }))

  const month = useMonth(userId, cursor.year, cursor.month)
  const today = todayLocal()

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1)
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
    // getDay(): воскресенье это 0, а неделя у нас начинается с понедельника
    const lead = (first.getDay() + 6) % 7
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ]
  }, [cursor])

  const shift = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: next.getFullYear(), month: next.getMonth() })
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('diary.calendar')}>
      <div className="pb-2">
        {/* Переключатель месяца - той же капсулой, что переключатель дня
            в дневнике: один жест в обоих местах */}
        <div className="mb-3 flex items-center gap-1 rounded-2xl bg-surface p-1 shadow-card">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label={t('cal.prevMonth')}
            className="flex size-11 items-center justify-center rounded-xl text-muted transition-colors active:bg-raised"
          >
            <ChevronLeft size={22} aria-hidden />
          </button>
          <span className="min-w-0 flex-1 truncate text-center font-display text-[17px] font-bold">
            {monthName(cursor.month)} {cursor.year}
          </span>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label={t('cal.nextMonth')}
            className="flex size-11 items-center justify-center rounded-xl text-muted transition-colors active:bg-raised"
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

        {month.isPending ? (
          <Loading />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <span key={`gap-${i}`} />
              const iso = toLocalISO(new Date(cursor.year, cursor.month, day))
              const data = month.data?.[iso]
              return (
                <DayCell
                  key={iso}
                  day={day}
                  kcalRatio={ratio(data?.kcal, data?.goalKcal ?? liveGoal?.kcal)}
                  proteinRatio={ratio(data?.protein, data?.goalProtein ?? liveGoal?.protein)}
                  isToday={iso === today}
                  isSelected={iso === currentDate}
                  onClick={() => {
                    onPickDate(iso)
                    onClose()
                  }}
                />
              )
            })}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-1.5 px-1 text-[13px] text-muted">
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-accent" aria-hidden />
            {t('cal.outerRing')}
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-protein" aria-hidden />
            {t('cal.innerRing')}
          </span>
        </div>
      </div>
    </Sheet>
  )
}

function ratio(value: number | undefined, goal: number | null | undefined): number {
  if (!value || !goal || goal <= 0) return 0
  return value / goal
}

const SIZE = 40
const OUTER_R = 17
const INNER_R = 12.5
const STROKE = 3

function DayCell({
  day,
  kcalRatio,
  proteinRatio,
  isToday,
  isSelected,
  onClick,
}: {
  day: number
  kcalRatio: number
  proteinRatio: number
  isToday: boolean
  isSelected: boolean
  onClick: () => void
}) {
  const t = useT()
  const empty = kcalRatio === 0 && proteinRatio === 0

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('cal.dayMacros', {
        day,
        kcal: Math.round(kcalRatio * 100),
        protein: Math.round(proteinRatio * 100),
      })}
      className={`relative flex aspect-square items-center justify-center rounded-2xl
                  transition-colors active:bg-raised ${isSelected ? 'bg-surface shadow-card' : ''}`}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 size-full" aria-hidden>
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          <Arc r={OUTER_R} ratio={kcalRatio} color="var(--color-accent)" dim={empty} />
          <Arc r={INNER_R} ratio={proteinRatio} color="var(--color-protein)" dim={empty} />
        </g>
      </svg>
      <span
        className={`relative text-[13px] tabular-nums ${
          isToday ? 'font-bold text-accent' : empty ? 'text-muted' : 'font-medium text-ink'
        }`}
      >
        {day}
      </span>
    </button>
  )
}

function Arc({ r, ratio, color, dim }: { r: number; ratio: number; color: string; dim: boolean }) {
  const circumference = 2 * Math.PI * r
  const filled = Math.min(ratio, 1)
  return (
    <>
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={r}
        fill="none"
        stroke={color}
        // Трек - та же гамма, что и заливка, только светлее. В днях без записей
        // ещё бледнее: календарь нужен, чтобы с одного взгляда видеть, какие
        // дни отмечены, а одинаковые кольца везде это скрывали бы
        strokeOpacity={dim ? 0.06 : 0.18}
        strokeWidth={STROKE}
      />
      {filled > 0 && (
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          stroke={ratio > 1.05 ? 'var(--color-danger)' : color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled)}
        />
      )}
    </>
  )
}
