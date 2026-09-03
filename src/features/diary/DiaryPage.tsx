import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CloudOff, CopyPlus, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDayLabel, shiftDays, todayLocal } from '@/lib/date'
import { queueSize } from '@/lib/outbox'
import type { Macros } from '@/lib/nutrition'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorState, Loading } from '@/ui/States'
import { useFoods, useServingsByFood } from '@/features/foods/api'
import { trim } from '@/features/foods/FoodsPage'
import type { Food } from '@/features/foods/types'
import { goalsFor, useProfiles } from '@/features/profile/api'
import { useAddEntry, useCopyEntries, useDeleteEntry, useDiaryDay, useOutboxFlush, useUpdateEntry } from './api'
import { FoodPicker } from './FoodPicker'
import { PortionSheet } from './PortionSheet'
import { MEALS, MEAL_LABELS, sumEntries, type DiaryEntry, type Meal } from './types'

export function DiaryPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const [date, setDate] = useState(todayLocal)
  const [compare, setCompare] = useState(false)

  useOutboxFlush()

  const profiles = useProfiles()
  const foods = useFoods()
  const servings = useServingsByFood()

  const day = useDiaryDay(date, userId)
  const yesterday = useDiaryDay(shiftDays(date, -1), userId)

  const partner = profiles.data?.find((p) => p.userId !== userId)
  const partnerDay = useDiaryDay(date, compare && partner ? partner.userId : '')

  const me = profiles.data?.find((p) => p.userId === userId)
  const goals = goalsFor(me)

  // Выбор продукта и ввод количества — два шага одного действия, поэтому
  // состояние общее: picker отдаёт продукт, portion его принимает
  const [picking, setPicking] = useState<Meal | null>(null)
  const [portion, setPortion] = useState<
    { food: Food; meal: Meal; entry?: DiaryEntry } | null
  >(null)

  const addEntry = useAddEntry()
  const updateEntry = useUpdateEntry()
  const deleteEntry = useDeleteEntry()
  const copyEntries = useCopyEntries()

  const entries = day.data ?? []
  const totals = useMemo(() => sumEntries(entries), [entries])
  const pending = queueSize()

  const byMeal = (source: DiaryEntry[], meal: Meal) => source.filter((e) => e.meal === meal)

  const openEntry = (entry: DiaryEntry) => {
    const food = foods.data?.find((f) => f.id === entry.foodId)
    setPortion({
      // Продукт мог быть заархивирован — тогда восстанавливаем его из снимка
      // записи. Смысл снимка ровно в этом: история не зависит от справочника.
      food: food ?? entryAsFood(entry),
      meal: entry.meal,
      entry,
    })
  }

  if (day.isError) return <ErrorState error={day.error} onRetry={() => void day.refetch()} />

  return (
    <div className="mx-auto max-w-2xl px-4 pt-2 pb-24">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setDate(shiftDays(date, -1))}
          aria-label="Предыдущий день"
          className="p-3 text-muted"
        >
          <ChevronLeft size={20} aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => setDate(todayLocal())}
          className="text-base font-medium"
        >
          {formatDayLabel(date)}
        </button>

        <button
          type="button"
          onClick={() => setDate(shiftDays(date, 1))}
          aria-label="Следующий день"
          className="p-3 text-muted"
        >
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>

      {pending > 0 && (
        <p className="mb-2 flex items-center justify-center gap-1.5 rounded-lg bg-raised py-1.5 text-xs text-muted">
          <CloudOff size={13} aria-hidden />
          {pending} {pending === 1 ? 'запись ждёт' : 'записей ждут'} связи
        </p>
      )}

      {day.isPending ? <Loading /> : <Progress totals={totals} goals={goals} />}

      {partner && (
        <div className="mt-3 flex gap-1 rounded-xl bg-raised p-1">
          <ModeTab active={!compare} onClick={() => setCompare(false)}>
            Я
          </ModeTab>
          <ModeTab active={compare} onClick={() => setCompare(true)}>
            Сравнение
          </ModeTab>
        </div>
      )}

      {compare && partner ? (
        <Comparison
          mine={{ nickname: me?.nickname ?? 'Я', totals }}
          theirs={{
            nickname: partner.nickname,
            totals: sumEntries(partnerDay.data ?? []),
          }}
          loading={partnerDay.isPending}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {MEALS.map((meal) => {
            const mealEntries = byMeal(entries, meal)
            const yesterdayMeal = byMeal(yesterday.data ?? [], meal)
            return (
              <MealSection
                key={meal}
                meal={meal}
                entries={mealEntries}
                onAdd={() => setPicking(meal)}
                onOpen={openEntry}
                repeatable={mealEntries.length === 0 ? yesterdayMeal : []}
                onRepeat={() =>
                  void copyEntries.mutateAsync({
                    entries: yesterdayMeal,
                    toDate: date,
                    userId,
                  })
                }
                repeating={copyEntries.isPending}
              />
            )
          })}
        </div>
      )}

      {picking && (
        <FoodPicker
          open
          meal={picking}
          userId={userId}
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
                  if (id) void deleteEntry.mutateAsync(id)
                  setPortion(null)
                }
              : undefined
          }
          onSubmit={async ({ grams, meal, servingLabel }) => {
            if (portion.entry) {
              await updateEntry.mutateAsync({ id: portion.entry.id, grams, meal, servingLabel })
            } else {
              await addEntry.mutateAsync({
                userId,
                date,
                meal,
                food: portion.food,
                grams,
                servingLabel,
              })
            }
            setPortion(null)
          }}
        />
      )}
    </div>
  )
}

/** Заархивированный продукт восстанавливаем из снимка записи. */
function entryAsFood(entry: DiaryEntry): Food {
  return {
    id: entry.foodId ?? entry.id,
    kind: 'product',
    name: entry.name,
    brand: entry.brand,
    nameNorm: entry.name.toLowerCase(),
    kcal100: entry.kcal100,
    protein100: entry.protein100,
    fat100: entry.fat100,
    carbs100: entry.carbs100,
    yieldGrams: null,
    ingredientsCount: 0,
    ingredientsGrams: 0,
  }
}

function Progress({ totals, goals }: { totals: Macros; goals: Macros | null }) {
  if (!goals) {
    return (
      <div className="mt-3 rounded-xl bg-raised px-4 py-4 text-center">
        <p className="text-2xl font-semibold">{Math.round(totals.kcal)} ккал</p>
        <p className="mt-2 text-sm text-muted">
          Чтобы видеть цель, заполни{' '}
          <Link to="/profile" className="text-accent underline">
            профиль
          </Link>{' '}
          — рост, вес, год рождения.
        </p>
      </div>
    )
  }

  const left = goals.kcal - totals.kcal
  const over = left < 0

  return (
    <div className="mt-3 rounded-xl bg-raised px-4 py-4">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold">
          {Math.round(totals.kcal)}
          <span className="text-base font-normal text-muted"> / {goals.kcal} ккал</span>
        </span>
        <span className={`text-sm ${over ? 'text-danger' : 'text-muted'}`}>
          {over ? `+${Math.round(-left)} сверх` : `осталось ${Math.round(left)}`}
        </span>
      </div>

      <Bar value={totals.kcal} goal={goals.kcal} className="mt-2 h-2" color="bg-accent" />

      <div className="mt-3 grid grid-cols-3 gap-3">
        <MacroBar label="Б" value={totals.protein} goal={goals.protein} color="bg-protein" text="text-protein" />
        <MacroBar label="Ж" value={totals.fat} goal={goals.fat} color="bg-fat" text="text-fat" />
        <MacroBar label="У" value={totals.carbs} goal={goals.carbs} color="bg-carbs" text="text-carbs" />
      </div>
    </div>
  )
}

function MacroBar({
  label,
  value,
  goal,
  color,
  text,
}: {
  label: string
  value: number
  goal: number
  color: string
  text: string
}) {
  return (
    <div>
      <p className="mb-1 text-xs">
        <span className={text}>{label}</span>{' '}
        <span className="text-muted">
          {trim(value)} / {Math.round(goal)}
        </span>
      </p>
      <Bar value={value} goal={goal} className="h-1.5" color={color} />
    </div>
  )
}

function Bar({
  value,
  goal,
  color,
  className,
}: {
  value: number
  goal: number
  color: string
  className: string
}) {
  const filled = goal > 0 ? Math.min(100, (value / goal) * 100) : 0
  const over = goal > 0 && value > goal
  return (
    <div className={`w-full overflow-hidden rounded-full bg-line ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] ${over ? 'bg-danger' : color}`}
        style={{ width: `${filled}%` }}
      />
    </div>
  )
}

function MealSection({
  meal,
  entries,
  onAdd,
  onOpen,
  repeatable,
  onRepeat,
  repeating,
}: {
  meal: Meal
  entries: DiaryEntry[]
  onAdd: () => void
  onOpen: (entry: DiaryEntry) => void
  repeatable: DiaryEntry[]
  onRepeat: () => void
  repeating: boolean
}) {
  const totals = sumEntries(entries)

  return (
    <section className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="font-medium">{MEAL_LABELS[meal]}</span>
        {entries.length > 0 && (
          <span className="text-sm text-muted">{Math.round(totals.kcal)} ккал</span>
        )}
      </div>

      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onOpen(entry)}
          className="flex w-full items-center gap-3 border-t border-line px-4 py-2.5 text-left active:bg-raised"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{entry.name}</span>
            <span className="text-xs text-muted">
              {entry.servingLabel ? `${entry.servingLabel} · ` : ''}
              {trim(entry.grams)} г
            </span>
          </span>
          <span className="shrink-0 text-sm text-muted">{Math.round(entry.kcal)} ккал</span>
        </button>
      ))}

      {repeatable.length > 0 && (
        <button
          type="button"
          onClick={onRepeat}
          disabled={repeating}
          className="flex w-full items-center gap-2 border-t border-line px-4 py-2.5 text-sm text-muted active:bg-raised"
        >
          <CopyPlus size={16} aria-hidden />
          Повторить вчерашний {MEAL_LABELS[meal].toLowerCase()}
        </button>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-sm text-accent active:bg-raised"
      >
        <Plus size={16} aria-hidden />
        Добавить
      </button>
    </section>
  )
}

function Comparison({
  mine,
  theirs,
  loading,
}: {
  mine: { nickname: string; totals: Macros }
  theirs: { nickname: string; totals: Macros }
  loading: boolean
}) {
  if (loading) return <Loading />
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      {[mine, theirs].map((side) => (
        <div key={side.nickname} className="rounded-xl bg-surface px-4 py-4 ring-1 ring-line">
          <p className="text-sm text-muted">{side.nickname}</p>
          <p className="mt-1 text-2xl font-semibold">{Math.round(side.totals.kcal)}</p>
          <p className="text-xs text-muted">ккал</p>
          <p className="mt-3 text-sm">
            <span className="text-protein">Б {trim(side.totals.protein)}</span>
            <br />
            <span className="text-fat">Ж {trim(side.totals.fat)}</span>
            <br />
            <span className="text-carbs">У {trim(side.totals.carbs)}</span>
          </p>
        </div>
      ))}
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
        active ? 'bg-surface text-ink shadow-sm' : 'text-muted'
      }`}
    >
      {children}
    </button>
  )
}
