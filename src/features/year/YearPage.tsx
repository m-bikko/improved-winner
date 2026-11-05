import { useState } from 'react'
import { ChevronLeft, ChevronRight, HeartHandshake } from 'lucide-react'
import { todayLocal } from '@/lib/date'
import { STATE_BY_ID } from '@/features/checkin/states'
import { dynamicKey, useT } from '@/lib/i18n'
import { Avatar, personTone } from '@/ui/Avatar'
import { Card } from '@/ui/Card'
import { IconBadge } from '@/ui/IconBadge'
import { ErrorState, Loading } from '@/ui/States'
import type { Tone } from '@/ui/tones'
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

  const ids = (summary.data?.people ?? []).map((p) => p.userId)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {/* Капсула, как переключатель дня в дневнике: листать годы - то же
          движение, что листать дни, и выглядеть оно должно так же */}
      <div className="flex items-center gap-1 rounded-2xl bg-surface p-1 shadow-card">
        <Arrow
          dir="prev"
          disabled={year <= FIRST_YEAR}
          onClick={() => setYear((y) => y - 1)}
        />
        {/* Видно только число: «Год в цифрах» уже написано в шапке, а второй
            раз рядом читалось бы как эхо. Полная подпись - для скринридера */}
        <h2 className="min-w-0 flex-1 text-center font-display text-[22px] font-extrabold tracking-tight tabular-nums">
          <span aria-hidden>{year}</span>
          <span className="sr-only">{t('year.title', { year })}</span>
        </h2>
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
          {/* Общая карточка праздничнее личных: заливка тоном акцента
              и акцентные числа. Это то, что сделали вдвоём, - ради неё
              экран и открывают */}
          <Card
            as="section"
            className="bg-linear-to-br from-accent-soft to-transparent to-70% p-5"
          >
            <div className="flex items-center gap-2.5">
              <IconBadge icon={HeartHandshake} tone="accent" size="sm" />
              <h2 className="font-display text-[17px] font-bold">{t('year.together')}</h2>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
              <Stat big n={summary.data.together.topicsOpened} label={t('year.topicsOpened')} />
              <Stat big n={summary.data.together.topicsClosed} label={t('year.topicsClosed')} />
              <Stat big n={summary.data.together.commentsWritten} label={t('year.comments')} />
              <Stat big n={summary.data.together.tasksDone} label={t('year.tasksDone')} />
              <Stat big n={summary.data.together.wishesAdded} label={t('year.wishes')} />
              <Stat big n={summary.data.together.thanksSaid} label={t('year.thanks')} />
            </dl>
          </Card>

          {summary.data.people.map((p) => (
            <Person key={p.userId} person={p} tone={personTone(p.userId, ids)} />
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
      className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted
                 transition-colors active:bg-raised disabled:opacity-30"
    >
      <Icon size={22} aria-hidden />
    </button>
  )
}

function Stat({ n, label, big = false }: { n: number; label: string; big?: boolean }) {
  return (
    <div>
      <dt
        className={`font-display leading-none font-extrabold tracking-tight tabular-nums ${
          big ? 'text-[40px] text-accent' : 'text-[32px]'
        }`}
      >
        {n}
      </dt>
      <dd className="mt-1.5 text-[13px] leading-snug text-muted">{label}</dd>
    </div>
  )
}

function Person({ person: p, tone }: { person: PersonYear; tone: Tone }) {
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
    <Card as="section" className="p-5">
      <div className="flex items-center gap-2.5">
        <Avatar name={p.nickname} tone={tone} size="sm" />
        <h2 className="min-w-0 truncate font-display text-[17px] font-bold">{p.nickname}</h2>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
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
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-line pt-5">
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
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-line pt-5">
          <Stat n={p.workouts} label={t.plural('year.workouts', p.workouts)} />
          <Stat n={hours} label={t('year.hoursOfLoad', { unit: t.plural('unit.hour', hours) })} />
          <Stat n={p.workoutKcal} label={t('year.workoutKcal')} />
        </dl>
      )}

      {weight !== null && weight.delta !== 0 && (
        <p className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-4 text-[15px]">
          <span className="tabular-nums">{t('year.weight', { from: weight.from, to: weight.to })}</span>
          <span className="rounded-full bg-raised px-2.5 py-0.5 text-[13px] font-semibold text-muted tabular-nums">
            {weight.delta > 0 ? '+' : ''}
            {weight.delta}
          </span>
        </p>
      )}
    </Card>
  )
}

function Line({ title, items }: { title: string; items: { text: string; n: number }[] }) {
  return (
    <div className="mt-5">
      <p className="text-[13px] font-semibold tracking-wide text-muted uppercase">{title}</p>
      <ul className="mt-1.5 flex flex-col">
        {items.map((i) => (
          <li key={i.text} className="flex items-baseline justify-between gap-3 py-1 text-[15px]">
            <span className="min-w-0 truncate">{i.text}</span>
            <span className="shrink-0 font-semibold text-muted tabular-nums">{i.n}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
