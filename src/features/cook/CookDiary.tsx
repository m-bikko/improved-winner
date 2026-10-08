import { useState } from 'react'
import { ChevronLeft, ChevronRight, NotebookPen } from 'lucide-react'
import { dynamicKey, useT } from '@/lib/i18n'
import { formatDayLabel, shiftDays, todayLocal } from '@/lib/date'
import { useDiaryDay } from '@/features/diary/api'
import { CalorieRing } from '@/features/diary/CalorieRing'
import { MEALS, sumEntries, type DiaryEntry } from '@/features/diary/types'
import { Card } from '@/ui/Card'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { useOwnerGoal } from './api'

/**
 * Дневник владельца для повара - только смотреть.
 *
 * День с листанием назад и вперёд, норма дня (из снимка - профиль повару
 * не открыт), итог и приёмы пищи с граммовкой и КБЖУ каждой записи.
 */
export function CookDiary({ ownerId, ownerName }: { ownerId: string; ownerName: string }) {
  const t = useT()
  const today = todayLocal()
  const [date, setDate] = useState(today)
  const day = useDiaryDay(date, ownerId)
  const goal = useOwnerGoal(ownerId, date)

  const entries = day.data ?? []
  const totals = sumEntries(entries)
  const round = (n: number) => Math.round(n)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4">
      <div className="flex items-center gap-2">
        <DayButton label={t('cook.prevDay')} onClick={() => setDate(shiftDays(date, -1))}>
          <ChevronLeft size={20} aria-hidden />
        </DayButton>
        <button type="button" onClick={() => setDate(today)} className="min-w-0 flex-1 text-center">
          <span className="block font-display text-lg font-extrabold">{formatDayLabel(date)}</span>
          {date !== today && <span className="block text-[12px] text-muted">{t('cook.backToToday')}</span>}
        </button>
        <DayButton label={t('cook.nextDay')} onClick={() => setDate(shiftDays(date, 1))} disabled={date >= today}>
          <ChevronRight size={20} aria-hidden />
        </DayButton>
      </div>

      {day.isError && <ErrorState error={day.error} onRetry={() => void day.refetch()} />}
      {day.isPending && <Loading />}

      {day.isSuccess && (
        <>
          <Card className="p-4">
            {goal.data ? (
              <CalorieRing totals={totals} goals={goal.data.goal} goalDirection={goal.data.goalDirection} />
            ) : (
              <p className="text-center font-display text-3xl font-extrabold tabular-nums">
                {round(totals.kcal)} <span className="text-lg font-bold text-muted">{t('unit.kcal')}</span>
              </p>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Macro label={t('food.protein')} value={totals.protein} goal={goal.data?.goal.protein} className="text-protein" />
              <Macro label={t('food.fat')} value={totals.fat} goal={goal.data?.goal.fat} className="text-fat" />
              <Macro label={t('food.carbs')} value={totals.carbs} goal={goal.data?.goal.carbs} className="text-carbs" />
            </div>
            {!goal.data && <p className="mt-3 text-center text-[13px] text-muted">{t('cook.noGoal', { name: ownerName })}</p>}
          </Card>

          {entries.length === 0 ? (
            <EmptyState icon={NotebookPen} tone="amber" title={t('cook.emptyDay')} hint={t('cook.emptyDayHint', { name: ownerName })} />
          ) : (
            MEALS.map((meal) => {
              const list = entries.filter((e) => e.meal === meal)
              if (list.length === 0) return null
              const sum = sumEntries(list)
              return (
                <Card key={meal} as="section" className="overflow-hidden">
                  <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-1">
                    <h2 className="font-display text-[17px] font-bold">{t(dynamicKey('meal', meal))}</h2>
                    <span className="text-sm font-semibold tabular-nums text-muted">
                      {round(sum.kcal)} {t('unit.kcal')}
                    </span>
                  </div>
                  <ul className="divide-y divide-line">
                    {list.map((e) => (
                      <Entry key={e.id} entry={e} />
                    ))}
                  </ul>
                </Card>
              )
            })
          )}
        </>
      )}
    </div>
  )
}

/** Запись: название, сколько граммов, калории и БЖУ этой порции. */
function Entry({ entry }: { entry: DiaryEntry }) {
  const t = useT()
  const round = (n: number) => Math.round(n)
  const one = (n: number) => (Math.round(n * 10) / 10).toString()
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">
          {entry.name}
          {entry.brand && <span className="font-normal text-muted"> · {entry.brand}</span>}
        </p>
        <p className="mt-0.5 text-[13px] text-muted tabular-nums">
          <span className="text-protein">
            {t('macro.p')} {one(entry.protein)}
          </span>{' '}
          <span className="text-fat">
            {t('macro.f')} {one(entry.fat)}
          </span>{' '}
          <span className="text-carbs">
            {t('macro.c')} {one(entry.carbs)}
          </span>
          {entry.servingLabel && <span> · {entry.servingLabel}</span>}
        </p>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <p className="font-display text-[17px] font-extrabold">
          {round(entry.grams)} {t('unit.gram')}
        </p>
        <p className="text-[13px] text-muted">
          {round(entry.kcal)} {t('unit.kcal')}
        </p>
      </div>
    </li>
  )
}

function Macro({ label, value, goal, className }: { label: string; value: number; goal: number | undefined; className: string }) {
  return (
    <div className="rounded-2xl bg-raised px-2 py-2.5">
      <p className={`font-display text-lg font-extrabold tabular-nums ${className}`}>
        {Math.round(value)}
        {goal !== undefined && <span className="text-[13px] font-semibold text-muted"> / {Math.round(goal)}</span>}
      </p>
      <p className="text-[12px] text-muted">{label}</p>
    </div>
  )
}

function DayButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-11 items-center justify-center rounded-full bg-surface text-muted shadow-card active:scale-95 disabled:opacity-30"
    >
      {children}
    </button>
  )
}
