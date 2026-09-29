import { tr, useT } from '@/lib/i18n'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthName, todayLocal } from '@/lib/date'
import type { Tone } from '@/ui/tones'
import { Avatar, personTone } from '@/ui/Avatar'
import { Card } from '@/ui/Card'
import { ErrorState, Loading } from '@/ui/States'
import { useMonthSummary, type MonthPerson } from './api'

/** Приложение появилось в 2026-м, раньше данных нет. */
const FIRST = { year: 2026, month: 1 }

/**
 * Итоги месяца: сходится ли то, что вы делаете.
 *
 * Между днём и годом было пусто. День не отвечает на вопрос «работает ли»,
 * год отвечает слишком поздно. Месяц - промежуток, на котором изменение
 * веса уже видно, а поправить ещё не поздно.
 *
 * Экран НЕ рапортует об успехе. Он ставит рядом два числа - насколько
 * похудел по дефициту и насколько по весам - и называет расхождение,
 * когда оно есть. Сводка, которая всегда говорит «отлично», не нужна
 * никому.
 */
export function MonthPage() {
  const today = todayLocal()
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const [month, setMonth] = useState(Number(today.slice(5, 7)))
  const summary = useMonthSummary(year, month)

  const shift = (by: number) => {
    const next = month + by
    if (next < 1) {
      setYear(year - 1)
      setMonth(12)
    } else if (next > 12) {
      setYear(year + 1)
      setMonth(1)
    } else setMonth(next)
  }

  const isNow = year === Number(today.slice(0, 4)) && month === Number(today.slice(5, 7))
  const atStart = year === FIRST.year && month === FIRST.month

  // Сколько дней месяца уже прошло: незаписанный день - главная причина,
  // по которой дефицит выглядит больше настоящего
  const daysInMonth = new Date(year, month, 0).getDate()
  const elapsed = isNow ? Number(today.slice(8, 10)) : daysInMonth

  if (summary.isError) {
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
  }

  const ids = summary.data?.people.map((p) => p.userId) ?? []

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {/* Капсула, как переключатель дня в дневнике: экран открывают оттуда,
          и листать месяцы должно быть тем же жестом, что и дни */}
      <div className="flex items-center gap-1 rounded-2xl bg-surface p-1 shadow-card">
        <Arrow dir="prev" disabled={atStart} onClick={() => shift(-1)} />
        <h2 className="min-w-0 flex-1 truncate text-center font-display text-[17px] font-bold">
          {monthName(month - 1)} {year}
        </h2>
        <Arrow dir="next" disabled={isNow} onClick={() => shift(1)} />
      </div>

      {summary.isPending || !summary.data ? (
        <Loading />
      ) : (
        summary.data.people.map((p) => (
          <Person key={p.userId} person={p} elapsed={elapsed} tone={personTone(p.userId, ids)} />
        ))
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
      aria-label={dir === 'prev' ? t('cal.prevMonth') : t('cal.nextMonth')}
      className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted
                 transition-colors active:bg-raised disabled:opacity-30"
    >
      <Icon size={20} aria-hidden />
    </button>
  )
}

function Person({
  person: p,
  elapsed,
  tone,
}: {
  person: MonthPerson
  elapsed: number
  tone: Tone
}) {
  const t = useT()
  // Пара «было - стало» как одно значение: иначе TypeScript не сужает
  // weightFrom и weightTo по факту того, что посчиталась разница
  const weight =
    p.weightFrom !== null && p.weightTo !== null
      ? {
          from: p.weightFrom,
          to: p.weightTo,
          delta: Math.round((p.weightTo - p.weightFrom) * 10) / 10,
        }
      : null
  const actual = weight?.delta ?? null

  return (
    <Card as="section" className="p-4">
      <div className="flex items-center gap-3">
        <Avatar name={p.nickname} tone={tone} />
        <h3 className="min-w-0 flex-1 truncate font-display text-[17px] font-bold">{p.nickname}</h3>
      </div>

      {p.days === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('month.noRecords')}</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2">
            {/* Прочерк вместо «null»: без нормы в профиле среднего по ней нет */}
            <Stat value={p.avgKcal === null ? '—' : String(p.avgKcal)} label={t('month.avgKcal')} />
            <Stat value={p.avgGoal === null ? '—' : String(p.avgGoal)} label={t('month.avgGoal')} />
          </dl>

          <p className="mt-3 text-sm text-muted">
            {t('month.logged', { n: p.days, unit: t.plural('unit.day', p.days), total: elapsed })}
            {p.days < elapsed && t('month.gapsNote')}
          </p>

          {p.deficit !== null && (
            <p className="mt-3 border-t border-line pt-3 text-sm">
              {t('month.forMonth', {
                kind: p.deficit >= 0 ? t('month.deficit') : t('month.surplus'),
                n: Math.abs(p.deficit),
              })}
              <span className="text-muted"> — {t('month.thatIs', { kg: fmtKg(p.expectedKg) })}</span>
            </p>
          )}

          {weight ? (
            <p className="mt-1 text-sm">
              {t('month.byScales', { from: fmtWeight(weight.from), to: fmtWeight(weight.to) })}
              <span className="text-muted"> — {fmtKg(weight.delta)}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              {t('month.nothingToCompare', {
                what: p.weightPoints === 0 ? t('month.noWeighIns') : t('month.fewWeighIns'),
              })}
            </p>
          )}

          <Verdict person={p} actual={actual} elapsed={elapsed} />

          {p.workouts > 0 && (
            <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
              {t('month.workouts', {
                n: p.workouts,
                hours: Math.round(p.workoutMinutes / 60),
                unit: t.plural('unit.hour', Math.round(p.workoutMinutes / 60)),
                kcal: p.workoutKcal,
              })}
            </p>
          )}
        </>
      )}
    </Card>
  )
}

/**
 * «−0.6 кг», «+1.2 кг», «0 кг» - со знаком, потому что знак тут и есть смысл.
 *
 * Минус настоящий, а не дефис: в строке рядом с цифрами дефис читается
 * как тире и теряется.
 */
function fmtKg(value: number | null): string {
  if (value === null) return '—'
  if (value === 0) return tr('month.kgZero')
  return tr('month.kgDelta', { sign: value > 0 ? '+' : '−', n: Math.abs(value) })
}

/** Вес всегда с одним знаком после запятой: «98.35 → 95.3» выглядит опечаткой. */
function fmtWeight(value: number): string {
  return value.toFixed(1)
}

/**
 * Вердикт.
 *
 * Молчит, когда судить не о чем, и не хвалит без повода. Расхождение
 * в килограмм на месяце - обычное дело: вес движется водой и гликогеном,
 * а незаписанный день прячет съеденное и раздувает дефицит. Поэтому порог
 * широкий, а причина названа прямо.
 */
function Verdict({
  person: p,
  actual,
  elapsed,
}: {
  person: MonthPerson
  actual: number | null
  elapsed: number
}) {
  const t = useT()
  if (p.days < 5) {
    return (
      <p className="mt-3 text-sm text-muted">
        {t('month.tooFew')}
      </p>
    )
  }
  if (actual === null || p.expectedKg === null) return null

  const diff = Math.round((actual - p.expectedKg) * 10) / 10
  const gaps = elapsed - p.days

  if (Math.abs(diff) <= 1) {
    return (
      <p className="mt-3 rounded-2xl bg-raised px-3.5 py-3 text-sm">
        {t('month.matches')}
      </p>
    )
  }

  return (
    <p className="mt-3 rounded-2xl bg-raised px-3.5 py-3 text-sm">
      {actual < p.expectedKg
        ? t('month.faster')
        : t('month.slower')}
      <span className="text-muted">
        {' '}
        {t('month.gapDiff', { kg: fmtKg(diff) })}{' '}
        {gaps > 0
          ? t('month.blameGaps', { n: gaps, unit: t.plural('month.gapDay', gaps) })
          : t('month.blameWater')}
      </span>
    </p>
  )
}

/**
 * Число и подпись. В разметке подпись - термин (dt), число - значение (dd),
 * а на экране число сверху: его ищут глазами первым.
 */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse justify-end rounded-2xl bg-raised/60 px-3.5 py-3">
      <dt className="mt-0.5 text-[13px] leading-snug text-muted">{label}</dt>
      <dd className="font-display text-[28px] leading-none font-extrabold tabular-nums">{value}</dd>
    </div>
  )
}
