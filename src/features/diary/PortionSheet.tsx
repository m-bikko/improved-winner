import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/ui/Button'
import { NumberField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { portionOf, type Food, type Serving } from '@/features/foods/types'
import { trim } from '@/features/foods/FoodsPage'
import { MEALS, MEAL_LABELS, type Meal } from './types'

type Props = {
  open: boolean
  food: Food
  servings: Serving[]
  meal: Meal
  initialGrams?: number
  initialServingLabel?: string | null
  /** Задано при правке существующей записи. */
  onDelete?: (() => void) | undefined
  onClose: () => void
  onSubmit: (result: { grams: number; meal: Meal; servingLabel: string | null }) => void
  busy?: boolean
}

/**
 * Экран количества: сколько именно съедено.
 *
 * Чипсы мер стоят перед полем граммов не случайно - «1 яйцо» человек знает
 * точно, а «55 г» ему пришлось бы прикидывать. Пересчёт КБЖУ показывается
 * сразу, чтобы решение «многовато, возьму меньше» принималось здесь, а не
 * после сохранения.
 */
export function PortionSheet({
  open,
  food,
  servings,
  meal: initialMeal,
  initialGrams,
  initialServingLabel,
  onDelete,
  onClose,
  onSubmit,
  busy = false,
}: Props) {
  const [grams, setGrams] = useState<number | ''>(initialGrams ?? 100)
  const [meal, setMeal] = useState<Meal>(initialMeal)
  const [servingLabel, setServingLabel] = useState<string | null>(initialServingLabel ?? null)

  const value = grams === '' ? 0 : grams
  const portion = portionOf(food, value)

  const pickServing = (serving: Serving | null) => {
    if (serving) {
      setGrams(serving.grams)
      setServingLabel(serving.label)
    } else {
      setGrams(100)
      setServingLabel(null)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={food.name}>
      <div className="flex flex-col gap-4">
        {servings.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Chip active={servingLabel === null} onClick={() => pickServing(null)}>
              100 г
            </Chip>
            {servings.map((s) => (
              <Chip key={s.id} active={servingLabel === s.label} onClick={() => pickServing(s)}>
                {s.label} · {trim(s.grams)} г
              </Chip>
            ))}
          </div>
        )}

        <NumberField
          label="Вес"
          suffix="г"
          value={grams}
          onValueChange={(g) => {
            setGrams(g)
            // Как только вес правят руками, подпись меры перестаёт быть правдой
            setServingLabel(null)
          }}
        />

        <div className="rounded-xl bg-raised px-4 py-3">
          <p className="text-2xl font-semibold">{Math.round(portion.kcal)} ккал</p>
          <p className="mt-1 text-sm">
            <span className="text-protein">Б {trim(portion.protein)}</span>{' '}
            <span className="text-fat">Ж {trim(portion.fat)}</span>{' '}
            <span className="text-carbs">У {trim(portion.carbs)}</span>
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm text-muted">Приём пищи</p>
          <div className="flex flex-wrap gap-2">
            {MEALS.map((m) => (
              <Chip key={m} active={meal === m} onClick={() => setMeal(m)}>
                {MEAL_LABELS[m]}
              </Chip>
            ))}
          </div>
        </div>

        <Button
          onClick={() => onSubmit({ grams: value, meal, servingLabel })}
          disabled={value <= 0}
          loading={busy}
        >
          {onDelete ? 'Сохранить' : 'Добавить'}
        </Button>

        {onDelete && (
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={18} aria-hidden />
            Удалить
          </Button>
        )}
      </div>
    </Sheet>
  )
}

function Chip({
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
      className={`rounded-full px-4 py-2 text-sm transition-colors ${
        active ? 'bg-accent text-accent-ink' : 'bg-raised text-ink ring-1 ring-line'
      }`}
    >
      {children}
    </button>
  )
}
