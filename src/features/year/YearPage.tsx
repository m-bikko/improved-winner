import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { todayLocal } from '@/lib/date'
import { plural } from '@/lib/plural'
import { STATE_BY_ID } from '@/features/checkin/states'
import { dynamicKey, useT } from '@/lib/i18n'
import { ErrorState, Loading } from '@/ui/States'
import { useYear, type PersonYear } from './api'

/** Раньше данных просто нет - приложение появилось в 2026-м. */
const FIRST_YEAR = 2026

/**
 * Год в цифрах.
 *
 * Ничего нового не собирается: всё уже лежит в дневнике, отметках, темах
 * и задачах. Смысл в том, что за год данных набирается больше, чем помещается
 * в память: «сто девяносто дней подряд» человек про себя не знает.
 *
 * Пустые места не прячутся заглушками «0» там, где данных не было вовсе:
 * ноль тренировок и отсутствие тренировок - разные вещи, и вторую честнее
 * не показывать.
 */
export function YearPage() {
  const thisYear = Number(todayLocal().slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const summary = useYear(year)

  if (summary.isError) {
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3 pb-10">
      <div className="flex items-center justify-between gap-3">
        <Arrow
          dir="prev"
          disabled={year <= FIRST_YEAR}
          onClick={() => setYear((y) => y - 1)}
        />
        <h1 className="text-2xl font-semibold">{year} в цифрах</h1>
        <Arrow
          dir="next"
          disabled={year >= thisYear}
          onClick={() => setYear((y) => y + 1)}
        />
      </div>

      {summary.isPending || !summary.data ? (
        <Loading />
      ) : (
        <>
          <section className="mt-5 rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-medium">Вместе</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <Stat n={summary.data.together.topicsOpened} label="тем завели" />
              <Stat n={summary.data.together.topicsClosed} label="тем закрыли" />
              <Stat n={summary.data.together.commentsWritten} label="ответов в темах" />
              <Stat n={summary.data.together.tasksDone} label="задач сделали" />
              <Stat n={summary.data.together.wishesAdded} label="желаний записали" />
            </dl>
          </section>

          {summary.data.people.map((p) => (
            <Person key={p.userId} person={p} />
          ))}
        </>
      )}
    </div>
  )
}

function Arrow({
  dir,
  disabled,
  onClick,
}: {
  dir: 'prev' | 'next'
  disabled: boolean
  onClick: () => void
}) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? 'Предыдущий год' : 'Следующий год'}
      className="flex size-10 shrink-0 items-center justify-center rounded-full
                 bg-raised text-muted ring-1 ring-line disabled:opacity-30"
    >
      <Icon size={20} aria-hidden />
    </button>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <dt className="text-2xl font-semibold tabular-nums">{n}</dt>
      <dd className="text-sm text-muted">{label}</dd>
    </div>
  )
}

function Person({ person: p }: { person: PersonYear }) {
  const t = useT()
  const hours = Math.round(p.workoutMinutes / 60)
  const delta =
    p.weightFrom !== null && p.weightTo !== null
      ? Math.round((p.weightTo - p.weightFrom) * 10) / 10
      : null

  return (
    <section className="mt-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="font-medium">{p.nickname}</h2>

      <dl className="mt-3 grid grid-cols-2 gap-4">
        <Stat n={p.checkinDays} label="дней отметился" />
        <Stat n={p.bestStreak} label="лучшая серия подряд" />
      </dl>

      {p.topStates.length > 0 && (
        <Line
          title="Чаще всего чувствовал"
          items={p.topStates.map((s) => ({
            text: STATE_BY_ID[s.id] ? t(dynamicKey('state', s.id)) : s.id,
            n: s.n,
          }))}
        />
      )}

      {p.diaryDays > 0 && (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Stat n={p.diaryDays} label="дней в дневнике" />
            {p.avgKcal !== null && <Stat n={p.avgKcal} label="ккал в среднем за день" />}
          </dl>
          {p.topFoods.length > 0 && (
            <Line
              title="Чаще всего ел"
              items={p.topFoods.map((f) => ({ text: f.name, n: f.n }))}
            />
          )}
        </>
      )}

      {p.workouts > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-4">
          <Stat n={p.workouts} label={plural(p.workouts, 'тренировка', 'тренировки', 'тренировок')} />
          <Stat n={hours} label={`${plural(hours, 'час', 'часа', 'часов')} нагрузки`} />
          <Stat n={p.workoutKcal} label="ккал потрачено" />
        </dl>
      )}

      {delta !== null && delta !== 0 && (
        <p className="mt-4 border-t border-line pt-3 text-sm">
          Вес: {p.weightFrom} → {p.weightTo} кг{' '}
          <span className="text-muted">
            ({delta > 0 ? '+' : ''}
            {delta})
          </span>
        </p>
      )}
    </section>
  )
}

function Line({ title, items }: { title: string; items: { text: string; n: number }[] }) {
  return (
    <div className="mt-4">
      <p className="text-sm text-muted">{title}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {items.map((i) => (
          <li key={i.text} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{i.text}</span>
            <span className="shrink-0 text-muted tabular-nums">{i.n}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
