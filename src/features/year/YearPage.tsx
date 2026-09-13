import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { todayLocal } from '@/lib/date'
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
  const t = useT()
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
        <h1 className="text-2xl font-semibold">{t('year.title', { year })}</h1>
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
            <h2 className="font-medium">{t('year.together')}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <Stat n={summary.data.together.topicsOpened} label={t('year.topicsOpened')} />
              <Stat n={summary.data.together.topicsClosed} label={t('year.topicsClosed')} />
              <Stat n={summary.data.together.commentsWritten} label={t('year.comments')} />
              <Stat n={summary.data.together.tasksDone} label={t('year.tasksDone')} />
              <Stat n={summary.data.together.wishesAdded} label={t('year.wishes')} />
              <Stat n={summary.data.together.thanksSaid} label={t('year.thanks')} />
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
  const t = useT()
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={t(dir === 'prev' ? 'year.prev' : 'year.next')}
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
  // Одним объектом, а не тремя переменными: проверка `delta !== null`
  // не сужает weightFrom и weightTo, и поля потом приходится разыменовывать
  // с восклицательным знаком
  const weight =
    p.weightFrom !== null && p.weightTo !== null
      ? {
          from: p.weightFrom,
          to: p.weightTo,
          delta: Math.round((p.weightTo - p.weightFrom) * 10) / 10,
        }
      : null

  return (
    <section className="mt-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="font-medium">{p.nickname}</h2>

      <dl className="mt-3 grid grid-cols-2 gap-4">
        <Stat n={p.checkinDays} label={t('year.checkinDays')} />
        <Stat n={p.bestStreak} label={t('year.bestStreak')} />
      </dl>

      {p.topStates.length > 0 && (
        <Line
          title={t('year.topStates')}
          items={p.topStates.map((s) => ({
            text: STATE_BY_ID[s.id] ? t(dynamicKey('state', s.id)) : s.id,
            n: s.n,
          }))}
        />
      )}

      {p.diaryDays > 0 && (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Stat n={p.diaryDays} label={t('year.diaryDays')} />
            {p.avgKcal !== null && <Stat n={p.avgKcal} label={t('year.avgKcal')} />}
          </dl>
          {p.topFoods.length > 0 && (
            <Line
              title={t('year.topFoods')}
              items={p.topFoods.map((f) => ({ text: f.name, n: f.n }))}
            />
          )}
        </>
      )}

      {p.workouts > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-4">
          <Stat n={p.workouts} label={t.plural('year.workouts', p.workouts)} />
          <Stat n={hours} label={t('year.hoursOfLoad', { unit: t.plural('unit.hour', hours) })} />
          <Stat n={p.workoutKcal} label={t('year.workoutKcal')} />
        </dl>
      )}

      {weight !== null && weight.delta !== 0 && (
        <p className="mt-4 border-t border-line pt-3 text-sm">
          {t('year.weight', { from: weight.from, to: weight.to })}{' '}
          <span className="text-muted">
            ({weight.delta > 0 ? '+' : ''}
            {weight.delta})
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
