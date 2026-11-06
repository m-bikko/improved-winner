import { useRef, useState } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDayLabel, fromLocalISO, shiftDays, todayLocal, weekdayShortNames } from '@/lib/date'
import { useT } from '@/lib/i18n'
import { SPRING } from '@/ui/motion'
import { RingArc } from './CalorieRing'
import { useDiarySummaries } from './api'

/** Понедельник недели, в которую попадает день. */
function weekStart(iso: string): string {
  // getDay(): воскресенье это 0, а неделя у нас начинается с понедельника
  return shiftDays(iso, -((fromLocalISO(iso).getDay() + 6) % 7))
}

/** Сколько пикселей нужно провести пальцем, чтобы сменить неделю. */
const SWIPE = 48

const RING = 38

/**
 * Лента недели над дневником: семь дней, у каждого своё мини-кольцо.
 *
 * Раньше день переключался стрелками по одному, и чтобы понять, как прошла
 * неделя, нужно было пролистать её целиком или открыть календарь месяца.
 * Лента показывает неделю разом - и любой её день в одно касание.
 * Стрелки и свайп листают уже неделями.
 *
 * Выбранный день берёт сумму из открытого дня (`current`), а не из итогов:
 * добавленная еда должна сдвигать кольцо сразу, не дожидаясь, пока
 * перезапросятся итоги недели.
 */
export function WeekStrip({
  userId,
  date,
  onPick,
  liveGoalKcal,
  current,
}: {
  userId: string
  date: string
  onPick: (date: string) => void
  /** Норма на случай, когда у дня нет снимка, - то же правило, что у календаря. */
  liveGoalKcal: number | null
  current: { kcal: number; goalKcal: number | null }
}) {
  const t = useT()
  const today = todayLocal()
  const monday = weekStart(date)
  const days = Array.from({ length: 7 }, (_, i) => shiftDays(monday, i))
  const summaries = useDiarySummaries(userId, monday, days[6] ?? monday)
  const names = weekdayShortNames()

  // Направление последней смены недели - от него зависит, откуда въедет новая
  const [direction, setDirection] = useState(0)
  // Свайп заканчивается отпусканием пальца над кнопкой дня, и браузер
  // может засчитать это нажатием. Гасим клики в первые мгновения после
  // свайпа. Время, а не флаг: телефон клик после свайпа часто не присылает,
  // и взведённый флаг съел бы следующее настоящее нажатие
  const swipedAt = useRef(0)

  const shiftWeek = (delta: number) => {
    setDirection(delta)
    onPick(shiftDays(date, delta * 7))
  }

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) < SWIPE) return
    swipedAt.current = performance.now()
    shiftWeek(info.offset.x < 0 ? 1 : -1)
  }

  return (
    <div className="rounded-3xl bg-surface p-1.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          aria-label={t('diary.prevWeek')}
          className="flex size-11 items-center justify-center text-accent transition-opacity active:opacity-40 active:duration-0"
        >
          <ChevronLeft size={22} strokeWidth={2.4} aria-hidden />
        </button>
        {/* Тап по дате возвращает к сегодняшнему дню - как и раньше */}
        <button
          type="button"
          onClick={() => {
            setDirection(today < date ? -1 : 1)
            onPick(today)
          }}
          className="min-h-11 min-w-0 flex-1 truncate text-[17px] font-semibold first-letter:uppercase"
        >
          {formatDayLabel(date)}
        </button>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          aria-label={t('diary.nextWeek')}
          className="flex size-11 items-center justify-center text-accent transition-opacity active:opacity-40 active:duration-0"
        >
          <ChevronRight size={22} strokeWidth={2.4} aria-hidden />
        </button>
      </div>

      <div className="overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.ul
            key={monday}
            custom={direction}
            variants={{
              enter: (d: number) => ({ x: d * 60, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d * -60, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: [0.2, 0.85, 0.25, 1] }}
            drag="x"
            dragSnapToOrigin
            dragElastic={0.2}
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={onDragEnd}
            className="grid grid-cols-7 pt-1"
          >
            {days.map((iso, i) => {
              const selected = iso === date
              const summary = summaries.data?.[iso]
              const kcal = selected ? current.kcal : (summary?.kcal ?? 0)
              const goal = selected ? current.goalKcal : (summary?.goalKcal ?? liveGoalKcal)
              const ratio = goal && goal > 0 ? kcal / goal : 0
              const future = iso > today
              return (
                <li key={iso}>
                  <button
                    type="button"
                    onClick={() => {
                      if (performance.now() - swipedAt.current < 400) return
                      onPick(iso)
                    }}
                    aria-pressed={selected}
                    aria-label={`${formatDayLabel(iso)}: ${Math.round(kcal)} ${t('unit.kcal')}`}
                    className={`relative flex w-full flex-col items-center gap-1 rounded-xl pt-1.5 pb-2
                                transition-opacity active:opacity-60 active:duration-0 ${future ? 'opacity-40' : ''}`}
                  >
                    {selected && (
                      <motion.span
                        layoutId="week-pill"
                        transition={SPRING}
                        aria-hidden
                        className="absolute inset-0 rounded-xl bg-raised"
                      />
                    )}
                    <span
                      className={`relative text-[11px] font-medium uppercase ${selected ? 'text-ink' : 'text-muted'}`}
                    >
                      {names[i]}
                    </span>
                    <span className="relative flex items-center justify-center" aria-hidden>
                      <RingArc size={RING} ratio={ratio} />
                      <span
                        className={`absolute text-[13px] font-semibold tabular-nums ${iso === today ? 'text-accent' : ''}`}
                      >
                        {fromLocalISO(iso).getDate()}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </motion.ul>
        </AnimatePresence>
      </div>
    </div>
  )
}
