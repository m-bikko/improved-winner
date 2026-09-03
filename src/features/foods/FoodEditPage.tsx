import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, ChevronLeft, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { normalize } from '@/lib/search'
import { Button } from '@/ui/Button'
import { Field, NumberField } from '@/ui/Field'
import { ErrorState, Loading } from '@/ui/States'
import {
  useArchiveFood,
  useDishItems,
  useFoods,
  useSaveFood,
  useSaveServings,
  useServingsByFood,
} from './api'
import { DishForm } from './DishForm'
import { FoodPhotoEditor } from './FoodPhoto'
import type { Food, Serving } from './types'

/**
 * Загрузка отделена от формы намеренно: форма держит состояние черновика,
 * и если бы ранние return'ы по загрузке и ошибке стояли перед её хуками,
 * получилось бы условное использование хуков.
 */
export function FoodEditPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const foods = useFoods()
  const servings = useServingsByFood()
  const dishItems = useDishItems(id)

  const isNew = id === undefined

  if (foods.isError) return <ErrorState error={foods.error} onRetry={() => void foods.refetch()} />
  if (!foods.isSuccess || !servings.isSuccess) return <Loading />

  const existing = isNew ? undefined : foods.data.find((f) => f.id === id)
  if (!isNew && !existing) return <ErrorState error={new Error('Продукт не найден')} />

  // Для существующей записи тип берём из неё самой, для новой — из ссылки
  const isDish = existing ? existing.kind === 'dish' : params.get('kind') === 'dish'
  const ownServings = id ? (servings.byFood.get(id) ?? []) : []

  if (isDish) {
    if (existing && !dishItems.isSuccess) return <Loading />
    return (
      <DishForm
        key={id ?? 'new-dish'}
        existing={existing}
        existingItems={dishItems.data ?? []}
        existingServings={ownServings}
      />
    )
  }

  return (
    // Пересоздаём форму при смене продукта, иначе черновик перетечёт
    // с одной карточки на другую
    <FoodForm key={id ?? 'new'} existing={existing} existingServings={ownServings} isDish={false} />
  )
}

type ServingDraft = { key: string; label: string; grams: number | '' }

type FormState = {
  name: string
  brand: string
  kcal: number | ''
  protein: number | ''
  fat: number | ''
  carbs: number | ''
}

function FoodForm({
  existing,
  existingServings,
  isDish,
}: {
  existing: Food | undefined
  existingServings: Serving[]
  isDish: boolean
}) {
  const navigate = useNavigate()
  const saveFood = useSaveFood()
  const saveServings = useSaveServings()
  const archive = useArchiveFood()
  const foods = useFoods()

  const [form, setForm] = useState<FormState>(() =>
    existing
      ? {
          name: existing.name,
          brand: existing.brand ?? '',
          kcal: existing.kcal100,
          protein: existing.protein100,
          fat: existing.fat100,
          carbs: existing.carbs100,
        }
      : { name: '', brand: '', kcal: '', protein: '', fat: '', carbs: '' },
  )
  const [servingDrafts, setServingDrafts] = useState<ServingDraft[]>(() =>
    existingServings.map((s) => ({ key: s.id, label: s.label, grams: s.grams })),
  )
  const [error, setError] = useState<string | null>(null)

  const duplicate = useMemo(() => {
    const target = normalize(form.name)
    if (target.length < 2) return null
    const hit = foods.data?.find((f) => f.id !== existing?.id && normalize(f.name) === target)
    return hit ? `${hit.name}${hit.brand ? ` · ${hit.brand}` : ''}` : null
  }, [foods.data, form.name, existing?.id])

  const patch = (next: Partial<FormState>) => setForm((prev) => ({ ...prev, ...next }))
  const canSave = form.name.trim().length > 0 && form.kcal !== ''
  const busy = saveFood.isPending || saveServings.isPending

  const submit = async () => {
    setError(null)
    try {
      const savedId = await saveFood.mutateAsync({
        ...(existing ? { id: existing.id } : {}),
        draft: {
          name: form.name,
          brand: form.brand || null,
          kcal100: form.kcal === '' ? 0 : form.kcal,
          protein100: form.protein === '' ? 0 : form.protein,
          fat100: form.fat === '' ? 0 : form.fat,
          carbs100: form.carbs === '' ? 0 : form.carbs,
        },
      })
      await saveServings.mutateAsync({
        foodId: savedId,
        servings: servingDrafts.map((s) => ({
          label: s.label,
          grams: s.grams === '' ? 0 : s.grams,
        })),
      })
      navigate('/foods', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const doArchive = async () => {
    if (!existing) return
    setError(null)
    try {
      await archive.mutateAsync(existing.id)
      navigate('/foods', { replace: true })
    } catch (e) {
      // Продукт может быть ингредиентом блюда — там ON DELETE RESTRICT,
      // и сообщение базы полезнее любого нашего пересказа
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <div className="flex items-center gap-1 py-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Назад"
          className="-ml-2 p-2 text-muted"
        >
          <ChevronLeft size={22} aria-hidden />
        </button>
        <span className="truncate text-base font-medium">
          {existing ? existing.name : isDish ? 'Новое блюдо' : 'Новый продукт'}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        <Field
          label="Название"
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Куриная грудка"
          autoFocus={!existing}
        />

        {duplicate && (
          <p className="flex items-start gap-2 rounded-xl bg-raised px-3 py-2.5 text-sm text-muted">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-fat" aria-hidden />
            Такое название уже есть: «{duplicate}». Если это другой продукт, добавь бренд —
            иначе в дневнике их будет не различить.
          </p>
        )}

        <Field
          label="Бренд"
          value={form.brand}
          onChange={(e) => patch({ brand: e.target.value })}
          placeholder="необязательно"
        />

        <div className="rounded-xl bg-raised p-3">
          <p className="mb-3 text-sm font-medium">На 100 грамм</p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Калории"
              suffix="ккал"
              max={900}
              value={form.kcal}
              onValueChange={(v) => patch({ kcal: v })}
            />
            <NumberField
              label="Белки"
              suffix="г"
              max={100}
              value={form.protein}
              onValueChange={(v) => patch({ protein: v })}
            />
            <NumberField
              label="Жиры"
              suffix="г"
              max={100}
              value={form.fat}
              onValueChange={(v) => patch({ fat: v })}
            />
            <NumberField
              label="Углеводы"
              suffix="г"
              max={100}
              value={form.carbs}
              onValueChange={(v) => patch({ carbs: v })}
            />
          </div>
          <AtwaterHint {...form} />
        </div>

        <FoodPhotoEditor foodId={existing?.id} imagePath={existing?.imagePath ?? null} />

        <ServingsEditor value={servingDrafts} onChange={setServingDrafts} />

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} disabled={!canSave} loading={busy}>
          Сохранить
        </Button>

        {existing && (
          <Button variant="danger" onClick={() => void doArchive()} loading={archive.isPending}>
            <Archive size={18} aria-hidden />
            В архив
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Сверка калорий с макросами по Атуотеру: 4 ккал на грамм белка и углеводов,
 * 9 на грамм жира. Ловит потерянную цифру ещё до сохранения — иначе она потом
 * тихо врёт в каждом расчёте дня.
 *
 * Подсказка, а не блокировка: у алкоголя и продуктов с клетчаткой расхождение
 * честное (в вине калории даёт спирт, которого нет ни в Б, ни в Ж, ни в У).
 */
function AtwaterHint({
  kcal,
  protein,
  fat,
  carbs,
}: {
  kcal: number | ''
  protein: number | ''
  fat: number | ''
  carbs: number | ''
}) {
  if (kcal === '' || kcal < 20) return null
  const computed = 4 * (protein || 0) + 9 * (fat || 0) + 4 * (carbs || 0)
  if (Math.abs(kcal - computed) / kcal < 0.25) return null

  return (
    <p className="mt-3 text-xs text-muted">
      По белкам, жирам и углеводам выходит {Math.round(computed)} ккал, а указано {kcal}. Проверь,
      не потерялась ли цифра. Для алкоголя и продуктов с клетчаткой расхождение нормально.
    </p>
  )
}

function ServingsEditor({
  value,
  onChange,
}: {
  value: ServingDraft[]
  onChange: (next: ServingDraft[]) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">Готовые меры</p>
        <p className="text-xs text-muted">
          «1 шт», «1 стакан 250 мл», «1 тарелка». Чтобы не прикидывать граммы каждый раз.
        </p>
      </div>

      {value.map((s, i) => (
        <div key={s.key} className="flex items-end gap-2">
          <div className="flex-1">
            <Field
              label="Мера"
              value={s.label}
              onChange={(e) => {
                const next = [...value]
                next[i] = { ...s, label: e.target.value }
                onChange(next)
              }}
              placeholder="1 шт"
            />
          </div>
          <div className="w-28">
            <NumberField
              label="Вес"
              suffix="г"
              value={s.grams}
              onValueChange={(g) => {
                const next = [...value]
                next[i] = { ...s, grams: g }
                onChange(next)
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label="Удалить меру"
            className="mb-1.5 p-3 text-muted"
          >
            <Trash2 size={18} aria-hidden />
          </button>
        </div>
      ))}

      <Button
        variant="secondary"
        onClick={() => onChange([...value, { key: crypto.randomUUID(), label: '', grams: '' }])}
      >
        <Plus size={18} aria-hidden />
        Добавить меру
      </Button>
    </div>
  )
}
