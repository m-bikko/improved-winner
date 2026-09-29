import { dynamicKey, useT } from '@/lib/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChartNoAxesColumn,
  ChevronDown,
  ChevronUp,
  CircleQuestionMark,
  CloudOff,
  CopyPlus,
  Plus,
  Target,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatDayLabel, shiftDays, todayLocal } from '@/lib/date'
import { useLocalFlag } from '@/lib/localFlag'
import { queueSize } from '@/lib/outbox'
import type { GoalDirection, Macros } from '@/lib/nutrition'
import { useAuth } from '@/auth/AuthProvider'
import { useHeaderAction } from '@/shell/HeaderAction'
import { ErrorState, Loading } from '@/ui/States'
import { Card } from '@/ui/Card'
import { ListGroup, ListRow } from '@/ui/List'
import { Segmented } from '@/ui/Segmented'
import { useFoods, useServingsByFood } from '@/features/foods/api'
import { trim } from '@/features/foods/FoodsPage'
import type { Food } from '@/features/foods/types'
import { goalsFor, useProfiles } from '@/features/profile/api'
import {
  useAddEntry,
  useCopyEntries,
  useDayGoal,
  useDeleteEntry,
  useDiaryDay,
  useFreezeDayGoal,
  useOutboxFlush,
  useReorderEntries,
  useUpdateEntry,
} from './api'
import { CalorieRing, CalorieRingMini } from './CalorieRing'
import { WorkoutsSection } from './WorkoutsSection'
import { useWorkouts } from './workoutsApi'
import { DraggableEntry, MealDropZone } from './DraggableEntry'
import { MacroInfoSheet, type Nutrient } from './MacroInfo'
import { diffOrder, moveEntry } from './reorder'
import { MonthCalendar } from './MonthCalendar'
import { FoodPicker } from './FoodPicker'
import { PortionSheet } from './PortionSheet'
import { MEALS, sumEntries, type DiaryEntry, type Meal } from './types'

const isMeal = (value: string | null): value is Meal =>
  value !== null && (MEALS as readonly string[]).includes(value)

export function DiaryPage() {
  const t = useT()
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const [date, setDate] = useState(todayLocal)
  const [compare, setCompare] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [explaining, setExplaining] = useState<Nutrient | null>(null)

  // useMemo обязателен: useHeaderAction ставит слот в эффекте, и новый узел
  // на каждом рендере переустанавливал бы его без остановки
  useHeaderAction(
    useMemo(
      () => (
        <button
          type="button"
          onClick={() => setCalendarOpen(true)}
          aria-label={t('diary.calendar')}
          className="flex size-10 items-center justify-center rounded-full text-ink
                     transition-colors active:bg-raised"
        >
          <CalendarDays size={21} aria-hidden />
        </button>
      ),
      [],
    ),
  )

  useOutboxFlush()

  const profiles = useProfiles()
  const foods = useFoods()
  const servings = useServingsByFood()

  const day = useDiaryDay(date, userId)
  const yesterday = useDiaryDay(shiftDays(date, -1), userId)

  const partner = profiles.data?.find((p) => p.userId !== userId)
  const partnerDay = useDiaryDay(date, compare && partner ? partner.userId : '')

  const me = profiles.data?.find((p) => p.userId === userId)

  // Тренировки обоих одним запросом. Ключ тот же, что и в секции ниже,
  // поэтому лишнего похода в сеть нет - TanStack отдаёт один и тот же кэш
  const workouts = useWorkouts(date)
  const burnedBy = (who: string): number =>
    (workouts.data ?? []).filter((w) => w.userId === who).reduce((sum, w) => sum + w.kcal, 0)

  const liveGoal = goalsFor(me)
  const frozen = useDayGoal(userId, date)

  // Сегодня норма живая - она отражает текущий вес и цель. Прошлые дни читаются
  // из снимка, иначе сброшенный вес переписал бы уже закрытые кольца.
  const isToday = date === todayLocal()
  const goals = isToday ? liveGoal : (frozen.data?.goal ?? liveGoal)
  const goalDirection = isToday
    ? (me?.goalDirection ?? 'maintain')
    : (frozen.data?.goalDirection ?? me?.goalDirection ?? 'maintain')

  // Выбор продукта и ввод количества - два шага одного действия, поэтому
  // состояние общее: picker отдаёт продукт, portion его принимает
  const [picking, setPicking] = useState<Meal | null>(null)
  const [portion, setPortion] = useState<
    { food: Food; meal: Meal; entry?: DiaryEntry } | null
  >(null)

  // «Еда» с главной приходит сюда с ?add=<приём> и сразу открывает выбор
  // продукта. Параметр снимается: иначе «назад» из шторки и перезагрузка
  // открывали бы её снова
  const [params, setParams] = useSearchParams()
  const addParam = params.get('add')
  useEffect(() => {
    if (!isMeal(addParam)) return
    setDate(todayLocal())
    setPicking(addParam)
    setParams({}, { replace: true })
  }, [addParam, setParams])

  const addEntry = useAddEntry()
  const updateEntry = useUpdateEntry()
  const deleteEntry = useDeleteEntry()
  const copyEntries = useCopyEntries()
  const freezeGoal = useFreezeDayGoal()

  // Норма дня замораживается при записи еды, а не при открытии экрана: побочный
  // эффект от простого просмотра - плохая идея, а день без единой записи
  // сохранять незачем.
  const freezeTodayGoal = () => {
    if (!isToday || !liveGoal) return
    void freezeGoal.mutateAsync({
      userId,
      date,
      goal: liveGoal,
      goalDirection: me?.goalDirection ?? 'maintain',
    })
  }

  const entries = day.data ?? []
  const totals = useMemo(() => sumEntries(entries), [entries])
  const pending = queueSize()

  const byMeal = (source: DiaryEntry[], meal: Meal) => source.filter((e) => e.meal === meal)

  // --- Перетаскивание --------------------------------------------------------
  const qc = useQueryClient()
  const reorder = useReorderEntries()
  const beforeDrag = useRef<DiaryEntry[] | null>(null)

  // Ручка отдельная, поэтому порога в несколько пикселей достаточно: жест
  // не конкурирует с тапом по строке и не требует удержания
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const dayKey = ['diary', userId, date]

  // Пишем порядок прямо в кэш запроса, а не во второе состояние: иначе список
  // имел бы два источника правды, и они разъезжались бы при любом обновлении
  const applyOrder = (next: DiaryEntry[]) => qc.setQueryData(dayKey, next)

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    applyOrder(moveEntry(entries, String(active.id), String(over.id)))
  }

  const onDragEnd = (event: DragEndEvent) => {
    const original = beforeDrag.current
    beforeDrag.current = null
    if (!original) return

    const { active, over } = event
    const final = over ? moveEntry(entries, String(active.id), String(over.id)) : entries
    applyOrder(final)

    const updates = diffOrder(original, final)
    if (updates.length > 0) void reorder.mutateAsync(updates)
  }

  const openEntry = (entry: DiaryEntry) => {
    const food = foods.data?.find((f) => f.id === entry.foodId)
    setPortion({
      // Продукт мог быть заархивирован - тогда восстанавливаем его из снимка
      // записи. Смысл снимка ровно в этом: история не зависит от справочника.
      food: food ?? entryAsFood(entry),
      meal: entry.meal,
      entry,
    })
  }

  if (day.isError) return <ErrorState error={day.error} onRetry={() => void day.refetch()} />

  return (
    <div className="stagger mx-auto max-w-2xl px-4 pt-1">
      {/* Переключатель дня - капсулой: стрелки получают крупную область
          нажатия, а тап по дате возвращает к сегодняшнему дню */}
      <div className="flex items-center gap-1 rounded-2xl bg-surface p-1 shadow-card">
        <button
          type="button"
          onClick={() => setDate(shiftDays(date, -1))}
          aria-label={t('diary.prevDay')}
          className="flex size-11 items-center justify-center rounded-xl text-muted transition-colors active:bg-raised"
        >
          <ChevronLeft size={22} aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => setDate(todayLocal())}
          className="min-w-0 flex-1 truncate font-display text-[17px] font-bold"
        >
          {formatDayLabel(date)}
        </button>

        <button
          type="button"
          onClick={() => setDate(shiftDays(date, 1))}
          aria-label={t('diary.nextDay')}
          className="flex size-11 items-center justify-center rounded-xl text-muted transition-colors active:bg-raised"
        >
          <ChevronRight size={22} aria-hidden />
        </button>
      </div>

      {pending > 0 && (
        <p className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-raised py-2 text-xs text-muted">
          <CloudOff size={13} aria-hidden />
          {t.plural('diary.pending', pending).replace('{n}', String(pending))}
        </p>
      )}

      {day.isPending ? (
        <Loading />
      ) : (
        <Progress
          totals={totals}
          goals={goals}
          goalDirection={goalDirection}
          onExplain={setExplaining}
        />
      )}

      {partner && (
        <Segmented
          className="mt-3"
          value={compare ? 'compare' : 'me'}
          onChange={(v) => setCompare(v === 'compare')}
          options={[
            { value: 'me', label: t('diary.me') },
            { value: 'compare', label: t('diary.compare') },
          ]}
        />
      )}

      {compare && partner ? (
        <Comparison
          mine={{ nickname: me?.nickname ?? t('diary.me'), totals, burned: burnedBy(userId) }}
          theirs={{
            nickname: partner.nickname,
            totals: sumEntries(partnerDay.data ?? []),
            burned: burnedBy(partner.userId),
          }}
          theirEntries={partnerDay.data ?? []}
          loading={partnerDay.isPending}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={() => {
            beforeDrag.current = entries
          }}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            if (beforeDrag.current) applyOrder(beforeDrag.current)
            beforeDrag.current = null
          }}
        >
          <div className="stagger mt-4 flex flex-col gap-3">
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
                    void copyEntries
                      .mutateAsync({ entries: yesterdayMeal, toDate: date, userId })
                      .then(freezeTodayGoal)
                  }
                  repeating={copyEntries.isPending}
                />
              )
            })}
          </div>
        </DndContext>
      )}

      {!compare && (
        <>
          <WorkoutsSection date={date} eatenKcal={totals.kcal} goalKcal={goals?.kcal ?? null} />

          {/* Ссылка внизу дня, а не пункт меню: итоги месяца смотрят
              из дневника и редко */}
          <ListGroup className="mt-3">
            <ListRow to="/month" icon={ChartNoAxesColumn} tone="amber" title={t('diary.monthSummary')} />
          </ListGroup>
        </>
      )}

      <MacroInfoSheet
        nutrient={explaining}
        goalDirection={goalDirection}
        onClose={() => setExplaining(null)}
      />

      <MonthCalendar
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        userId={userId}
        currentDate={date}
        liveGoal={liveGoal}
        onPickDate={setDate}
      />

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
              freezeTodayGoal()
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
    // Снимок записи фотографию не хранит: она живёт в справочнике, а запись
    // должна оставаться читаемой и без него
    imagePath: null,
    // У снимка кода нет и быть не может: он восстанавливается из записи
    // дневника, а не из карточки продукта
    barcode: null,
  }
}

function Progress({
  totals,
  goals,
  goalDirection,
  onExplain,
}: {
  totals: Macros
  goals: Macros | null
  goalDirection: GoalDirection
  onExplain: (nutrient: Nutrient) => void
}) {
  const t = useT()
  // Без роста и веса норму не посчитать, и выдумывать её нельзя: человек будет
  // ориентироваться на неё каждый день. Поэтому вместо числа - прямое указание,
  // чего не хватает, и кнопка туда, где это заполняется.
  if (!goals) {
    return (
      <Card className="mt-3 flex flex-col items-center gap-3 px-5 py-6 text-center">
        <Target size={26} className="text-muted" aria-hidden />
        <p className="text-2xl font-semibold">
          {Math.round(totals.kcal)} {t('unit.kcal')}
        </p>
        <p className="text-sm text-muted">
          {t('diary.noGoalHint')}
        </p>
        <Link
          to="/profile"
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-accent-ink"
        >
          {t('diary.fillProfile')}
        </Link>
      </Card>
    )
  }

  // Свёрнут по умолчанию: развёрнутый блок занимал треть экрана, а списка еды
  // из-за него не было видно вовсе. Выбор запоминается - на телефоне и на
  // ноутбуке удобно по-разному.
  const [expanded, setExpanded] = useLocalFlag('diary-progress-expanded', false)

  if (!expanded) {
    return (
      <Card className="mt-3 px-4 py-3.5">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className="flex w-full items-center gap-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <CalorieRingMini totals={totals} goals={goals} goalDirection={goalDirection} />
          </span>
          <ChevronDown size={18} className="shrink-0 text-muted" aria-hidden />
        </button>

        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <MiniMacro label={t('macro.p')} value={totals.protein} goal={goals.protein} color="bg-protein" text="text-protein" />
          <MiniMacro label={t('macro.f')} value={totals.fat} goal={goals.fat} color="bg-fat" text="text-fat" />
          <MiniMacro label={t('macro.c')} value={totals.carbs} goal={goals.carbs} color="bg-carbs" text="text-carbs" />
        </div>
      </Card>
    )
  }

  return (
    <Card className="relative mt-3 px-4 py-5">
      <HelpButton
        label={t('diary.whatAreCalories')}
        onClick={() => onExplain('kcal')}
        className="absolute top-2 left-2"
      />
      <button
        type="button"
        onClick={() => setExpanded(false)}
        aria-expanded
        aria-label={t('diary.collapse')}
        className="absolute top-2 right-2 p-2 text-muted"
      >
        <ChevronUp size={18} aria-hidden />
      </button>

      <CalorieRing totals={totals} goals={goals} goalDirection={goalDirection} />

      <div className="mt-5 grid grid-cols-3 gap-3">
        <MacroBar
          label={t('macro.p')}
          value={totals.protein}
          goal={goals.protein}
          color="bg-protein"
          text="text-protein"
          onExplain={() => onExplain('protein')}
        />
        <MacroBar
          label={t('macro.f')}
          value={totals.fat}
          goal={goals.fat}
          color="bg-fat"
          text="text-fat"
          onExplain={() => onExplain('fat')}
        />
        <MacroBar
          label={t('macro.c')}
          value={totals.carbs}
          goal={goals.carbs}
          color="bg-carbs"
          text="text-carbs"
          onExplain={() => onExplain('carbs')}
        />
      </div>
    </Card>
  )
}

/**
 * Макрос в свёрнутом виде: подпись, числа и полоска в одну строку.
 *
 * Кнопки «?» тут нет намеренно - в свёрнутом блоке для неё нет места, а тап
 * по нему и так раскрывает подробности, где справка на месте.
 */
function MiniMacro({
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
      <p className="mb-1 truncate text-[11px] leading-none">
        <span className={text}>{label}</span>{' '}
        <span className="text-muted">
          {Math.round(value)}/{Math.round(goal)}
        </span>
      </p>
      <Bar value={value} goal={goal} className="h-1" color={color} />
    </div>
  )
}

function HelpButton({
  label,
  onClick,
  className = '',
}: {
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      // Крупная область нажатия вокруг мелкой иконки: 14 пикселей значка
      // пальцем не попасть
      className={`p-2 text-muted ${className}`}
    >
      <CircleQuestionMark size={15} aria-hidden />
    </button>
  )
}

function MacroBar({
  label,
  value,
  goal,
  color,
  text,
  onExplain,
}: {
  label: string
  value: number
  goal: number
  color: string
  text: string
  onExplain: () => void
}) {
  const t = useT()
  return (
    <div>
      <div className="mb-1 flex items-center gap-0.5">
        {/* nowrap и округление: «196.8 / 177» не влезало в треть ширины
            и разрывалось на две строки прямо по дроби */}
        <p className="truncate text-xs whitespace-nowrap">
          <span className={text}>{label}</span>{' '}
          <span className="text-muted">
            {Math.round(value)} / {Math.round(goal)}
          </span>
        </p>
        <HelpButton
          label={t('diary.whatIs', { name: label })}
          onClick={onExplain}
          className="-my-2 -mr-1"
        />
      </div>
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
    <div className={`w-full overflow-hidden rounded-full bg-raised ${className}`}>
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
  const t = useT()
  const totals = sumEntries(entries)
  const [collapsed, setCollapsed] = useLocalFlag(`diary-meal-${meal}-collapsed`, false)

  return (
    <Card as="section" className="overflow-hidden">
      {/* Зона сброса охватывает всю секцию, включая заголовок. Иначе в свёрнутый
          приём нельзя было бы перетащить еду: ронять было бы не на что,
          и перетаскивание отваливалось бы ровно там, где секцию убрали с глаз. */}
      <MealDropZone meal={meal} isEmpty={entries.length === 0 && !collapsed}>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          className="flex w-full items-center gap-3 px-4 pt-3.5 pb-3 text-left transition-colors active:bg-raised"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[17px] font-bold">{t(dynamicKey('meal', meal))}</span>
            {collapsed && entries.length > 0 && (
              <span className="mt-0.5 block truncate text-xs">
                <span className="text-protein">
                  {t('macro.p')} {Math.round(totals.protein)}
                </span>{' '}
                <span className="text-fat">
                  {t('macro.f')} {Math.round(totals.fat)}
                </span>{' '}
                <span className="text-carbs">
                  {t('macro.c')} {Math.round(totals.carbs)}
                </span>
              </span>
            )}
            {collapsed && entries.length === 0 && (
              <span className="mt-0.5 block text-xs text-muted">{t('diary.empty')}</span>
            )}
          </span>

          {entries.length > 0 && (
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {Math.round(totals.kcal)} <span className="font-normal text-muted">{t('unit.kcal')}</span>
            </span>
          )}
          {collapsed ? (
            <ChevronDown size={16} className="shrink-0 text-muted" aria-hidden />
          ) : (
            <ChevronUp size={16} className="shrink-0 text-muted" aria-hidden />
          )}
        </button>

        {!collapsed && (
          <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            {entries.map((entry) => (
              <DraggableEntry key={entry.id} entry={entry} onOpen={() => onOpen(entry)} />
            ))}
          </SortableContext>
        )}
      </MealDropZone>

      {/* Действия приёма - кнопками внутри карточки, а не строками с рамкой:
          «Добавить» - самое частое действие во всём приложении, и строка
          мелким розовым текстом у края его прятала */}
      {!collapsed && (
        <div className="flex gap-2 px-3 pt-1 pb-3">
          <button
            type="button"
            onClick={onAdd}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-accent-soft
                       px-4 text-[15px] font-semibold text-accent-soft-ink transition-transform active:scale-[0.97]"
          >
            <Plus size={18} strokeWidth={2.4} aria-hidden />
            {t('common.add')}
          </button>
          {repeatable.length > 0 && (
            <button
              type="button"
              onClick={onRepeat}
              disabled={repeating}
              aria-label={t('diary.repeatYesterday', {
                meal: t(dynamicKey('meal', meal)).toLowerCase(),
              })}
              className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-2xl bg-raised
                         px-3.5 text-sm font-medium text-ink transition-transform active:scale-[0.97]
                         disabled:opacity-50"
            >
              <CopyPlus size={17} aria-hidden className="shrink-0" />
              <span className="truncate">{t('diary.yesterday')}</span>
            </button>
          )}
        </div>
      )}
    </Card>
  )
}

/**
 * Сравнение дня: итоги рядом и что именно ел партнёр.
 *
 * Итогов одних мало. «У неё 1900 ккал» - это повод спросить «а из чего?»,
 * и раньше ответ на этот вопрос приходилось искать вне приложения, хотя
 * записи партнёра уже загружены тем же запросом, что даёт сумму.
 *
 * Список партнёра только для чтения: правит записи каждый свои, это
 * закреплено политикой RLS, и кнопки, ведущие к отказу базы, здесь не нужны.
 * Свой день редактируется на вкладке «Я» - там он и живёт.
 */
function Comparison({
  mine,
  theirs,
  theirEntries,
  loading,
}: {
  mine: { nickname: string; totals: Macros; burned: number }
  theirs: { nickname: string; totals: Macros; burned: number }
  theirEntries: DiaryEntry[]
  loading: boolean
}) {
  const t = useT()
  if (loading) return <Loading />

  const theirMeals = MEALS.map((meal) => ({
    meal,
    entries: theirEntries.filter((e) => e.meal === meal),
  })).filter((group) => group.entries.length > 0)

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[mine, theirs].map((side) => (
          <Card key={side.nickname} className="px-4 py-4">
            <p className="text-sm font-medium text-muted">{side.nickname}</p>
            <p className="mt-1 font-display text-[28px] leading-none font-extrabold tabular-nums">{Math.round(side.totals.kcal)}</p>
            <p className="text-xs text-muted">{t('unit.kcal')}</p>
            <p className="mt-3 text-sm">
              <span className="text-protein">
                {t('macro.p')} {trim(side.totals.protein)}
              </span>
              <br />
              <span className="text-fat">
                {t('macro.f')} {trim(side.totals.fat)}
              </span>
              <br />
              <span className="text-carbs">
                {t('macro.c')} {trim(side.totals.carbs)}
              </span>
            </p>
            {side.burned > 0 && (
              <p className="mt-3 border-t border-line pt-2 text-sm text-muted">
                {t('diary.burnedOnTraining', { n: Math.round(side.burned) })}
              </p>
            )}
          </Card>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <p className="text-sm text-muted">
          {t('diary.partnerAte', { name: theirs.nickname })}
        </p>

        {theirMeals.length === 0 ? (
          <p className="rounded-3xl bg-surface px-4 py-5 text-center text-sm text-muted shadow-card">
            {t('diary.noEntriesDay')}
          </p>
        ) : (
          theirMeals.map(({ meal, entries }) => (
            <Card key={meal} className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="font-display text-[17px] font-bold">{t(dynamicKey('meal', meal))}</span>
                <span className="text-sm text-muted">
                  {Math.round(sumEntries(entries).kcal)} {t('unit.kcal')}
                </span>
              </div>
              <ul className="border-t border-line">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-baseline justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{entry.name}</span>
                      <span className="text-xs text-muted">
                        {trim(entry.grams)} {t('unit.gram')}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-muted">
                      {Math.round(entry.kcal)} {t('unit.kcal')}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))
        )}
      </div>
    </>
  )
}
