import { dynamicKey, useT } from '@/lib/i18n'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { Segmented } from '@/ui/Segmented'
import { Sheet } from '@/ui/Sheet'
import { portionOf, type Food, type Serving } from '@/features/foods/types'
import { trim } from '@/features/foods/FoodsPage'
import { MEALS, type Meal } from './types'

type Props = {
  open: boolean
  food: Food
  servings: Serving[]
  meal: Meal
  initialGrams?: number
  initialServingLabel?: string | null
  /** Задано при правке существующей записи. */
  onDelete?: (() => void) | undefined
  /** Спрашивать ли второе нажатие. Не нужно, если удаление можно отменить. */
  confirmDelete?: boolean
  onClose: () => void
  onSubmit: (result: { grams: number; meal: Meal; servingLabel: string | null }) => void
  busy?: boolean
}

/**
 * Быстрые граммовки. 100 среди них - тот же «на 100 г», что раньше стоял
 * отдельным чипом; остальные закрывают частые «полтарелки» и «побольше»
 * одним касанием, без клавиатуры.
 */
const PRESETS = [50, 100, 150, 200, 250] as const

/**
 * Экран количества: сколько именно съедено.
 *
 * Чипсы мер стоят перед полем граммов не случайно - «1 яйцо» человек знает
 * точно, а «55 г» ему пришлось бы прикидывать. Пересчёт КБЖУ показывается
 * сразу, чтобы решение «многовато, возьму меньше» принималось здесь, а не
 * после сохранения.
 *
 * Это самое частое действие приложения, поэтому граммы - крупным числом,
 * а не обычным полем формы, и кнопка прибита к низу шторки: с открытой
 * клавиатурой шторка низкая, и кнопка под прокруткой терялась бы ровно
 * тогда, когда вес уже набран.
 */
export function PortionSheet({
  open,
  food,
  servings,
  meal: initialMeal,
  initialGrams,
  initialServingLabel,
  onDelete,
  confirmDelete = true,
  onClose,
  onSubmit,
  busy = false,
}: Props) {
  const t = useT()
  const [grams, setGrams] = useState<number | ''>(initialGrams ?? 100)
  const [meal, setMeal] = useState<Meal>(initialMeal)
  const [servingLabel, setServingLabel] = useState<string | null>(initialServingLabel ?? null)

  const value = grams === '' ? 0 : grams
  const portion = portionOf(food, value)

  const pickServing = (serving: Serving) => {
    setGrams(serving.grams)
    setServingLabel(serving.label)
  }

  const pickGrams = (next: number) => {
    setGrams(next)
    // Граммовка - не мера: подпись «1 тарелка» к ней уже не относится
    setServingLabel(null)
  }

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    // Enter в поле приходит мимо кнопки, поэтому её disabled тут не спасает
    if (busy || value <= 0) return
    onSubmit({ grams: value, meal, servingLabel })
  }

  return (
    <Sheet open={open} onClose={onClose} title={food.name}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {servings.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {servings.map((s) => (
              <Chip key={s.id} selected={servingLabel === s.label} onClick={() => pickServing(s)}>
                {s.label} <span className="tabular-nums opacity-70">· {trim(s.grams)} {t('unit.gram')}</span>
              </Chip>
            ))}
          </div>
        )}

        <GramsInput
          label={t('portion.weight')}
          value={grams}
          onValueChange={(g) => {
            setGrams(g)
            // Как только вес правят руками, подпись меры перестаёт быть правдой
            setServingLabel(null)
          }}
          summary={
            <>
              <span className="font-display text-[17px] font-bold text-ink tabular-nums">
                {Math.round(portion.kcal)} {t('unit.kcal')}
              </span>
              <span className="text-[13px] tabular-nums">
                <span className="text-protein">
                  {t('macro.p')} {trim(portion.protein)}
                </span>{' '}
                <span className="text-fat">
                  {t('macro.f')} {trim(portion.fat)}
                </span>{' '}
                <span className="text-carbs">
                  {t('macro.c')} {trim(portion.carbs)}
                </span>
              </span>
            </>
          }
        />

        <div className="grid grid-cols-5 gap-2">
          {PRESETS.map((g) => {
            const active = servingLabel === null && grams === g
            return (
              <button
                key={g}
                type="button"
                onClick={() => pickGrams(g)}
                aria-pressed={active}
                className={`flex min-h-11 items-center justify-center rounded-2xl text-[15px] font-semibold
                            tabular-nums transition-[background-color,color,transform] duration-150
                            active:scale-95 active:duration-75 ${
                              active ? 'bg-accent text-accent-ink' : 'bg-surface text-ink shadow-card'
                            }`}
              >
                {g}
                <span className="sr-only"> {t('unit.gram')}</span>
              </button>
            )
          })}
        </div>

        <Segmented
          ariaLabel={t('meal.title')}
          value={meal}
          onChange={setMeal}
          options={MEALS.map((m) => ({ value: m, label: t(dynamicKey('meal', m)) }))}
        />

        {/* Низ шторки: кнопка всегда видна, даже когда содержимое прокручено.
            -mx/-mb гасят поля шторки, чтобы подложка шла от края до края */}
        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex gap-2 bg-bg px-5 pt-2 pb-5">
          {onDelete && (
            <Button
              variant="danger"
              confirm={confirmDelete}
              onClick={onDelete}
              aria-label={t('common.delete')}
              className={`min-h-14 shrink-0 ${confirmDelete ? 'min-w-14 px-3 text-[15px]' : 'w-14 px-0'}`}
            >
              <Trash2 size={20} aria-hidden />
            </Button>
          )}
          <Button
            type="submit"
            disabled={value <= 0}
            loading={busy}
            className="min-h-14 flex-1 text-[17px]"
          >
            {!busy &&
              (onDelete ? (
                <Check size={20} strokeWidth={2.4} aria-hidden />
              ) : (
                <Plus size={20} strokeWidth={2.4} aria-hidden />
              ))}
            {t(onDelete ? 'common.save' : 'common.add')}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

/**
 * Граммы крупным числом.
 *
 * Разбор ввода тот же, что у NumberField, - «98.» должно оставаться «98.»,
 * запятая равна точке, - но вид другой: здесь число и есть главный элемент
 * шторки, и в стандартном поле формы оно терялось среди остального.
 *
 * Ширина поля идёт за числом в `ch`, чтобы «г» стояло сразу за цифрами,
 * а не у дальнего края. Вся карточка - подпись поля: касание в любом её
 * месте ставит курсор, попадать в сами цифры не нужно.
 */
function GramsInput({
  label,
  value,
  onValueChange,
  summary,
}: {
  label: string
  value: number | ''
  onValueChange: (value: number | '') => void
  summary: ReactNode
}) {
  const t = useT()
  const id = useId()
  const [text, setText] = useState(() => (value === '' ? '' : String(value)))

  // Внешняя смена (чип меры, пресет) переписывает текст; набор руками - нет,
  // иначе «98.» схлопывалось бы в «98» прямо под пальцем
  useEffect(() => {
    const parsed = text === '' ? '' : Number(text)
    if (parsed !== value) setText(value === '' ? '' : String(value))
    // text намеренно вне зависимостей: эффект реагирует на внешнее значение
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <label
      htmlFor={id}
      className="flex cursor-text flex-col items-center gap-1 rounded-3xl bg-surface px-4 pt-3 pb-4 shadow-card
                 ring-accent transition-shadow focus-within:ring-2"
    >
      <span id={`${id}-label`} className="text-[13px] font-medium text-muted">
        {label}
      </span>
      <span className="flex items-baseline justify-center gap-1.5">
        <input
          id={id}
          // Имя поля - только «Вес»: иначе в него попала бы вся карточка
          // вместе с пересчётом, и скринридер читал бы калории как подпись
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-summary`}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          value={text}
          placeholder="0"
          onChange={(e) => {
            const raw = e.target.value.replace(',', '.').trim()
            if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
            setText(raw)
            onValueChange(raw === '' || raw === '.' ? '' : Number(raw))
          }}
          // Выделение при фокусе: чаще всего вес вписывают заново, и «100»
          // иначе пришлось бы сначала стирать
          onFocus={(e) => e.currentTarget.select()}
          style={{ width: `${Math.max(text.length, 1) + 0.4}ch` }}
          className="min-w-0 bg-transparent p-0 text-center font-display text-[46px] leading-none
                     font-extrabold tabular-nums outline-none placeholder:text-muted/50"
        />
        <span className="font-display text-2xl font-bold text-muted">{t('unit.gram')}</span>
      </span>
      <span
        id={`${id}-summary`}
        className="mt-1 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-0.5"
      >
        {summary}
      </span>
    </label>
  )
}
