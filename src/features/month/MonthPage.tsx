import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { todayLocal } from '@/lib/date'
import { plural } from '@/lib/plural'
import { ErrorState, Loading } from '@/ui/States'
import { useMonthSummary, type MonthPerson } from './api'

const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

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

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3 pb-10">
      <div className="flex items-center justify-between gap-3">
        <Arrow dir="prev" disabled={atStart} onClick={() => shift(-1)} />
        <h1 className="text-xl font-semibold">
          {MONTHS[month - 1]} {year}
        </h1>
        <Arrow dir="next" disabled={isNow} onClick={() => shift(1)} />
      </div>

      {summary.isPending || !summary.data ? (
        <Loading />
      ) : (
        summary.data.people.map((p) => (
          <Person key={p.userId} person={p} elapsed={elapsed} />
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
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? 'Предыдущий месяц' : 'Следующий месяц'}
      className="flex size-10 shrink-0 items-center justify-center rounded-full
                 bg-raised text-muted ring-1 ring-line disabled:opacity-30"
    >
      <Icon size={20} aria-hidden />
    </button>
  )
}

function Person({ person: p, elapsed }: { person: MonthPerson; elapsed: number }) {
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
    <section className="mt-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="font-medium">{p.nickname}</h2>

      {p.days === 0 ? (
        <p className="mt-2 text-sm text-muted">За этот месяц записей нет.</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-4">
            <Stat value={`${p.avgKcal}`} label="ккал в среднем за день" />
            <Stat value={`${p.avgGoal}`} label="норма в среднем" />
          </dl>

          <p className="mt-3 text-sm text-muted">
            Записано {p.days} {plural(p.days, 'день', 'дня', 'дней')} из {elapsed}
            {p.days < elapsed && ' — в незаписанные дни съеденное не учтено'}
          </p>

          {p.deficit !== null && (
            <p className="mt-3 border-t border-line pt-3 text-sm">
              {p.deficit >= 0 ? 'Дефицит' : 'Профицит'} за месяц{' '}
              <span className="font-medium">{Math.abs(p.deficit)} ккал</span>
              <span className="text-muted"> — это {fmtKg(p.expectedKg)}</span>
            </p>
          )}

          {weight ? (
            <p className="mt-1 text-sm">
              По весам: {fmtWeight(weight.from)} → {fmtWeight(weight.to)} кг
              <span className="text-muted"> — {fmtKg(weight.delta)}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              Взвешиваний за месяц {p.weightPoints === 0 ? 'не было' : 'меньше двух'} — сравнить
              не с чем.
            </p>
          )}

          <Verdict person={p} actual={actual} elapsed={elapsed} />

          {p.workouts > 0 && (
            <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
              Тренировок {p.workouts} · {Math.round(p.workoutMinutes / 60)}{' '}
              {plural(Math.round(p.workoutMinutes / 60), 'час', 'часа', 'часов')} ·{' '}
              {p.workoutKcal} ккал. В дефицит не входят: коэффициент активности уже в норме.
            </p>
          )}
        </>
      )}
    </section>
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
  if (value === 0) return '0 кг'
  return `${value > 0 ? '+' : '−'}${Math.abs(value)} кг`
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
  if (p.days < 5) {
    return (
      <p className="mt-3 text-sm text-muted">
        Записей мало — на таком числе дней судить не о чем.
      </p>
    )
  }
  if (actual === null || p.expectedKg === null) return null

  const diff = Math.round((actual - p.expectedKg) * 10) / 10
  const gaps = elapsed - p.days

  if (Math.abs(diff) <= 1) {
    return (
      <p className="mt-3 rounded-xl bg-raised px-3 py-2 text-sm">
        Сходится: вес идёт туда же, куда и дефицит.
      </p>
    )
  }

  return (
    <p className="mt-3 rounded-xl bg-raised px-3 py-2 text-sm">
      {actual < p.expectedKg
        ? 'Вес падает быстрее, чем объясняет дефицит.'
        : 'Вес меняется медленнее, чем объясняет дефицит.'}
      <span className="text-muted">
        {' '}
        Расхождение {fmtKg(diff)}.{' '}
        {gaps > 0
          ? `Вероятнее всего, дело в ${gaps} ${plural(gaps, 'незаписанном дне', 'незаписанных днях', 'незаписанных днях')}: съеденное в них не учтено.`
          : 'На месяце такое даёт вода и гликоген — килограмм в любую сторону здесь норма.'}
      </span>
    </p>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="text-2xl font-semibold tabular-nums">{value}</dt>
      <dd className="text-sm text-muted">{label}</dd>
    </div>
  )
}
