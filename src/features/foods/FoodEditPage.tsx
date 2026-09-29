import { useT } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, Barcode, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { normalize } from '@/lib/search'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
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
  const t = useT()
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const foods = useFoods()
  const servings = useServingsByFood()
  const dishItems = useDishItems(id)

  const isNew = id === undefined

  if (foods.isError) return <ErrorState error={foods.error} onRetry={() => void foods.refetch()} />
  if (!foods.isSuccess || !servings.isSuccess) return <Loading />

  const existing = isNew ? undefined : foods.data.find((f) => f.id === id)
  if (!isNew && !existing) return <ErrorState error={new Error(t('food.notFound'))} />

  // Для существующей записи тип берём из неё самой, для новой - из ссылки
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
    <FoodForm
      key={id ?? 'new'}
      existing={existing}
      existingServings={ownServings}
      isDish={false}
      prefill={{
        barcode: params.get('barcode'),
        name: params.get('name'),
        brand: params.get('brand'),
        kcal: params.get('kcal'),
        protein: params.get('protein'),
        fat: params.get('fat'),
        carbs: params.get('carbs'),
      }}
    />
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

/**
 * Что пришло по ссылке от сканера.
 *
 * Всё строками и всё может отсутствовать: справочник заполняют люди,
 * и половина полей там регулярно пустая. Пустое поле формы честнее нуля,
 * который человек примет за измеренное значение.
 */
type Prefill = {
  barcode: string | null
  name: string | null
  brand: string | null
  kcal: string | null
  protein: string | null
  fat: string | null
  carbs: string | null
}

/** Число из ссылки или пусто. Мусор в адресе не должен становиться КБЖУ. */
function num(value: string | null): number | '' {
  if (value === null) return ''
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : ''
}

function FoodForm({
  existing,
  existingServings,
  isDish,
  prefill,
}: {
  existing: Food | undefined
  existingServings: Serving[]
  isDish: boolean
  prefill?: Prefill
}) {
  const t = useT()
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
      : {
          name: prefill?.name ?? '',
          brand: prefill?.brand ?? '',
          kcal: num(prefill?.kcal ?? null),
          protein: num(prefill?.protein ?? null),
          fat: num(prefill?.fat ?? null),
          carbs: num(prefill?.carbs ?? null),
        },
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
          // Только у новой записи: форма редактирования о коде не знает,
          // и передавать undefined значит «не трогать»
          ...(existing || !prefill?.barcode ? {} : { barcode: prefill.barcode }),
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
      // Продукт может быть ингредиентом блюда - там ON DELETE RESTRICT,
      // и сообщение базы полезнее любого нашего пересказа
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {/* «Назад» теперь в шапке оболочки - здесь только имя того, что правим */}
      <h2 className="truncate px-1 font-display text-2xl font-extrabold tracking-tight">
        {existing ? existing.name : t(isDish ? 'food.newDish' : 'food.newProduct')}
      </h2>

      <Card as="section" className="flex flex-col gap-4 p-4">
        <Field
          label={t('food.name')}
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder={t('food.namePlaceholder')}
          autoFocus={!existing}
        />

        {duplicate && (
          <p className="flex items-start gap-2 rounded-2xl bg-raised px-3.5 py-3 text-sm text-muted">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-tone-amber" aria-hidden />
            {t('food.duplicate', { name: duplicate })}
          </p>
        )}

        <Field
          label={t('food.brand')}
          value={form.brand}
          onChange={(e) => patch({ brand: e.target.value })}
          placeholder={t('common.optional')}
        />

        {/* Код виден, но не правится: его источник - упаковка, а не человек,
            и опечатка тут сделала бы продукт ненаходимым */}
        {(existing?.barcode ?? prefill?.barcode ?? null) !== null && (
          <p className="-mt-1 flex items-center gap-1.5 text-[13px] text-muted">
            <Barcode size={15} aria-hidden className="shrink-0" />
            <span>
              {t('food.barcode')}: <span className="tabular-nums">{existing?.barcode ?? prefill?.barcode}</span>
            </span>
          </p>
        )}
      </Card>

      <Card as="section" className="p-4">
        <h3 className="mb-3 font-display text-[17px] font-bold">{t('food.per100title')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label={t('food.kcal')}
            suffix={t('unit.kcal')}
            max={900}
            value={form.kcal}
            onValueChange={(v) => patch({ kcal: v })}
          />
          <NumberField
            label={t('food.protein')}
            suffix={t('unit.gram')}
            max={100}
            value={form.protein}
            onValueChange={(v) => patch({ protein: v })}
          />
          <NumberField
            label={t('food.fat')}
            suffix={t('unit.gram')}
            max={100}
            value={form.fat}
            onValueChange={(v) => patch({ fat: v })}
          />
          <NumberField
            label={t('food.carbs')}
            suffix={t('unit.gram')}
            max={100}
            value={form.carbs}
            onValueChange={(v) => patch({ carbs: v })}
          />
        </div>
        <AtwaterHint {...form} />
      </Card>

      <FoodPhotoEditor foodId={existing?.id} imagePath={existing?.imagePath ?? null} />

      <ServingsEditor value={servingDrafts} onChange={setServingDrafts} />

      {error && <p className="px-1 text-sm text-danger">{error}</p>}

      <Button className="mt-1 min-h-14 text-[17px]" onClick={() => void submit()} disabled={!canSave} loading={busy}>
        {t('common.save')}
      </Button>

      {existing && (
        <Button variant="danger" onClick={() => void doArchive()} loading={archive.isPending}>
          <Archive size={18} aria-hidden />
          {t('food.archive')}
        </Button>
      )}
    </div>
  )
}

/**
 * Сверка калорий с макросами по Атуотеру: 4 ккал на грамм белка и углеводов,
 * 9 на грамм жира. Ловит потерянную цифру ещё до сохранения - иначе она потом
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
  const t = useT()
  if (kcal === '' || kcal < 20) return null
  const computed = 4 * (protein || 0) + 9 * (fat || 0) + 4 * (carbs || 0)
  if (Math.abs(kcal - computed) / kcal < 0.25) return null

  return (
    <p className="mt-3 flex items-start gap-2 rounded-2xl bg-raised px-3.5 py-3 text-[13px] text-muted">
      <TriangleAlert size={15} className="mt-0.5 shrink-0 text-tone-amber" aria-hidden />
      {t('food.mismatch', { computed: Math.round(computed), kcal })}
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
  const t = useT()
  return (
    <Card as="section" className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="font-display text-[17px] font-bold">{t('food.servings')}</h3>
        <p className="mt-0.5 text-[13px] text-muted">{t('food.servingsHintProduct')}</p>
      </div>

      {value.map((s, i) => (
        <div key={s.key} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field
              label={t('food.serving')}
              value={s.label}
              onChange={(e) => {
                const next = [...value]
                next[i] = { ...s, label: e.target.value }
                onChange(next)
              }}
              placeholder={t('food.servingPlaceholder')}
            />
          </div>
          <div className="w-28">
            <NumberField
              label={t('portion.weight')}
              suffix={t('unit.gram')}
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
            aria-label={t('food.deleteServing')}
            // Высотой ровно с поле: кнопка стоит в одну линию с ним
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-muted
                       transition-colors active:bg-raised"
          >
            <Trash2 size={18} aria-hidden />
          </button>
        </div>
      ))}

      <Button
        variant="soft"
        className="min-h-11 text-[15px]"
        onClick={() => onChange([...value, { key: crypto.randomUUID(), label: '', grams: '' }])}
      >
        <Plus size={18} aria-hidden />
        {t('food.addServing')}
      </Button>
    </Card>
  )
}
