import { useState, type ReactNode } from 'react'
import { ChefHat, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { dynamicKey, useT } from '@/lib/i18n'
import { formatDayLabel, shiftDays, todayLocal } from '@/lib/date'
import { useAddEntry, useDeleteEntry, useDiaryDay, useOutboxFlush, useUpdateEntry } from '@/features/diary/api'
import { CalorieRing } from '@/features/diary/CalorieRing'
import { FoodPicker } from '@/features/diary/FoodPicker'
import { PortionSheet } from '@/features/diary/PortionSheet'
import { MEAL_ICON, entryAsFood } from '@/features/diary/entryFood'
import { MEALS, sumEntries, type DiaryEntry, type Meal } from '@/features/diary/types'
import { useFoods, useServingsByFood } from '@/features/foods/api'
import type { Food } from '@/features/foods/types'
import { Card } from '@/ui/Card'
import { IconBadge } from '@/ui/IconBadge'
import { ErrorState, Loading } from '@/ui/States'
import { useOwnerGoal } from './api'

/**
 * Дневник владельца для повара.
 *
 * Повар и смотрит, и записывает: что подал и сколько - в любой приём пищи
 * выбранного дня, теми же шторками выбора продукта и порции, что у пары.
 * Свои записи он открывает и правит или удаляет; записи владельца - только
 * смотреть (это держит база, а экран просто не предлагает лишнего).
 */
export function CookDiary({ ownerId, ownerName }: { ownerId: string; ownerName: string }) {
  const t = useT()
  const cookId = useUserId()
  const today = todayLocal()
  const [date, setDate] = useState(today)
  const day = useDiaryDay(date, ownerId)
  const goal = useOwnerGoal(ownerId, date)
  const foods = useFoods()
  const servings = useServingsByFood()
  const addEntry = useAddEntry()
  const updateEntry = useUpdateEntry()
  const deleteEntry = useDeleteEntry()
  const [picking, setPicking] = useState<Meal | null>(null)
  const [portion, setPortion] = useState<{ food: Food; meal: Meal; entry?: DiaryEntry } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Записи, отложенные без сети, уходят при первой связи - как у пары
  useOutboxFlush()

  const entries = day.data ?? []
  const totals = sumEntries(entries)
  const round = (n: number) => Math.round(n)

  const openEntry = (entry: DiaryEntry) => {
    const food = foods.data?.find((f) => f.id === entry.foodId)
    setPortion({ food: food ?? entryAsFood(entry), meal: entry.meal, entry })
  }

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

          {entries.length === 0 && <p className="px-1 text-center text-sm text-muted">{t('cook.emptyDayHint', { name: ownerName })}</p>}
          {error && <p className="px-1 text-sm text-danger">{error}</p>}

          {MEALS.map((meal) => {
            const list = entries.filter((e) => e.meal === meal)
            const sum = sumEntries(list)
            const look = MEAL_ICON[meal]
            return (
              <Card key={meal} as="section" className="overflow-hidden">
                <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
                  <IconBadge icon={look.icon} tone={look.tone} size="sm" />
                  <h2 className="min-w-0 flex-1 font-display text-[17px] font-bold">{t(dynamicKey('meal', meal))}</h2>
                  {list.length > 0 && (
                    <span className="text-sm font-semibold tabular-nums text-muted">
                      {round(sum.kcal)} {t('unit.kcal')}
                    </span>
                  )}
                </div>
                {list.length > 0 && (
                  <ul className="divide-y divide-line border-t border-line">
                    {list.map((e) => (
                      <Entry key={e.id} entry={e} mine={e.createdBy === cookId} onOpen={() => openEntry(e)} />
                    ))}
                  </ul>
                )}
                <div className="px-3 pt-1 pb-3">
                  <button
                    type="button"
                    onClick={() => setPicking(meal)}
                    className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-accent-soft px-4
                               text-[15px] font-semibold text-accent-soft-ink transition-transform active:scale-[0.97]"
                  >
                    <Plus size={18} strokeWidth={2.4} aria-hidden />
                    {t('common.add')}
                  </button>
                </div>
              </Card>
            )
          })}
        </>
      )}

      {picking && (
        <FoodPicker
          open
          meal={picking}
          userId={ownerId}
          onClose={() => setPicking(null)}
          onPick={(food) => {
            setPortion({ food, meal: picking })
            setPicking(null)
          }}
        />
      )}

      {portion && (
        <PortionSheet
          open
          food={portion.food}
          servings={servings.byFood.get(portion.food.id) ?? []}
          meal={portion.meal}
          {...(portion.entry ? { initialGrams: portion.entry.grams } : {})}
          {...(portion.entry ? { initialServingLabel: portion.entry.servingLabel } : {})}
          busy={addEntry.isPending || updateEntry.isPending}
          onClose={() => setPortion(null)}
          onDelete={
            portion.entry
              ? () => {
                  const id = portion.entry?.id
                  if (id) deleteEntry.mutate(id, { onError: (e) => setError(e.message) })
                  setPortion(null)
                }
              : undefined
          }
          onSubmit={async ({ grams, meal, servingLabel }) => {
            setError(null)
            try {
              if (portion.entry) {
                await updateEntry.mutateAsync({ id: portion.entry.id, grams, meal, servingLabel })
              } else {
                await addEntry.mutateAsync({ userId: ownerId, date, meal, food: portion.food, grams, servingLabel })
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            }
            setPortion(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * Запись: название, граммы, калории и БЖУ порции. Свою повар открывает
 * и правит; запись владельца - просто строка, без нажатия.
 */
function Entry({ entry, mine, onOpen }: { entry: DiaryEntry; mine: boolean; onOpen: () => void }) {
  const t = useT()
  const round = (n: number) => Math.round(n)
  const one = (n: number) => (Math.round(n * 10) / 10).toString()
  const byCook = entry.createdBy !== null && entry.createdBy !== entry.userId
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">
          {entry.name}
          {entry.brand && <span className="font-normal text-muted"> · {entry.brand}</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[13px] text-muted tabular-nums">
          {byCook && <ChefHat size={13} aria-label={t('diary.byCook')} className="shrink-0 text-tone-amber" />}
          <span className="text-protein">
            {t('macro.p')} {one(entry.protein)}
          </span>
          <span className="text-fat">
            {t('macro.f')} {one(entry.fat)}
          </span>
          <span className="text-carbs">
            {t('macro.c')} {one(entry.carbs)}
          </span>
          {entry.servingLabel && <span>· {entry.servingLabel}</span>}
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
    </>
  )
  return (
    <li>
      {mine ? (
        <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-raised">
          {body}
        </button>
      ) : (
        <div className="flex items-start gap-3 px-4 py-3">{body}</div>
      )}
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

function DayButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
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
