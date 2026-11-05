import { useT } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserId } from '@/auth/AuthProvider'
import { isCookMode } from '@/lib/mode'
import { Archive, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Field, NumberField } from '@/ui/Field'
import { useArchiveFood, useFoods, useSaveDish, useSaveServings, useUploadFoodPhoto, type DishItem } from './api'
import { FoodPhotoEditor } from './FoodPhoto'
import { ProductPicker } from './ProductPicker'
import { trim } from './FoodsPage'
import type { Food, Serving } from './types'

type ItemDraft = { key: string; foodId: string; grams: number | '' }
type ServingDraft = { key: string; label: string; grams: number | '' }

/**
 * Конструктор блюда: список продуктов с граммовками и готовый вес.
 *
 * Готовый вес нужен потому, что при готовке масса меняется: борщ выкипает,
 * крупа набирает воду. Без него КБЖУ на 100 г готового блюда врал бы на
 * десятки процентов. Пусто - берём сумму сырых граммовок.
 */
export function DishForm({
  existing,
  existingItems,
  existingServings,
}: {
  existing: Food | undefined
  existingItems: DishItem[]
  existingServings: Serving[]
}) {
  const t = useT()
  const navigate = useNavigate()
  const foods = useFoods()
  const saveDish = useSaveDish()
  const saveServings = useSaveServings()
  const uploadPhoto = useUploadFoodPhoto()
  const archive = useArchiveFood()
  const userId = useUserId()
  // Повар правит только свои блюда - чужие открываются для просмотра
  const readOnly = isCookMode && existing !== undefined && existing.createdBy !== userId
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)

  const [name, setName] = useState(existing?.name ?? '')
  const [yieldGrams, setYieldGrams] = useState<number | ''>(existing?.yieldGrams ?? '')
  const [items, setItems] = useState<ItemDraft[]>(() =>
    existingItems.map((i) => ({ key: i.id, foodId: i.foodId, grams: i.grams })),
  )
  const [servings, setServings] = useState<ServingDraft[]>(() =>
    existingServings.map((s) => ({ key: s.id, label: s.label, grams: s.grams })),
  )
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const byId = useMemo(() => new Map((foods.data ?? []).map((f) => [f.id, f])), [foods.data])

  // Тот же расчёт, что делает вью foods_v. Дублируется намеренно: показать
  // итог нужно до сохранения, когда серверу считать ещё нечего.
  const computed = useMemo(() => {
    let rawGrams = 0
    const sum = { kcal: 0, protein: 0, fat: 0, carbs: 0 }
    for (const item of items) {
      const food = byId.get(item.foodId)
      const grams = item.grams === '' ? 0 : item.grams
      if (!food || grams <= 0) continue
      rawGrams += grams
      sum.kcal += (food.kcal100 * grams) / 100
      sum.protein += (food.protein100 * grams) / 100
      sum.fat += (food.fat100 * grams) / 100
      sum.carbs += (food.carbs100 * grams) / 100
    }
    const total = yieldGrams === '' ? rawGrams : yieldGrams
    if (total <= 0) return { rawGrams, per100: null }
    return {
      rawGrams,
      per100: {
        kcal: (sum.kcal / total) * 100,
        protein: (sum.protein / total) * 100,
        fat: (sum.fat / total) * 100,
        carbs: (sum.carbs / total) * 100,
      },
    }
  }, [items, byId, yieldGrams])

  const canSave = name.trim().length > 0 && items.some((i) => i.foodId && i.grams !== '')

  const submit = async () => {
    setError(null)
    try {
      const dishId = await saveDish.mutateAsync({
        ...(existing ? { id: existing.id } : {}),
        draft: {
          // У домашнего блюда бренда не бывает, поэтому поля в форме нет -
          // но у уже заведённого его не затираем
          name,
          brand: existing?.brand ?? null,
          yieldGrams: yieldGrams === '' ? null : yieldGrams,
          items: items.map((i) => ({ foodId: i.foodId, grams: i.grams === '' ? 0 : i.grams })),
        },
      })
      await saveServings.mutateAsync({
        foodId: dishId,
        servings: servings.map((s) => ({ label: s.label, grams: s.grams === '' ? 0 : s.grams })),
      })
      if (!existing && pendingPhoto) {
        try {
          await uploadPhoto.mutateAsync({ foodId: dishId, file: pendingPhoto, previousPath: null })
        } catch {
          navigate(`/foods/${dishId}?photo=failed`, { replace: true })
          return
        }
      }
      navigate('/foods', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {/* «Назад» теперь в шапке оболочки - здесь только имя того, что правим */}
      <h2 className="truncate px-1 font-display text-2xl font-extrabold tracking-tight">
        {existing?.name ?? t('food.newDish')}
      </h2>

      {readOnly && <p className="rounded-2xl bg-raised px-4 py-3 text-sm text-muted">{t('food.readOnly')}</p>}

      <fieldset disabled={readOnly} className="contents">
      <Card as="section" className="p-4">
        <Field
          label={t('food.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('food.namePlaceholderDish')}
          autoFocus={!existing}
        />
      </Card>

      <Card as="section" className="overflow-hidden">
        <h3 className="px-4 pt-3.5 pb-2 font-display text-[17px] font-bold">{t('food.composition')}</h3>

        {items.length > 0 && (
          <ul>
            {items.map((item, i) => {
              const food = byId.get(item.foodId)
              return (
                <li
                  key={item.key}
                  // Разделитель от текста, а не от края - как в строках дневника
                  className="relative flex items-center gap-2 py-2 pr-2 pl-4 before:absolute before:inset-x-4
                             before:top-0 before:h-px before:bg-line"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{food?.name ?? t('food.removed')}</span>
                    {food && (
                      <span className="block truncate text-[13px] text-muted tabular-nums">
                        {t('food.per100kcal', { n: Math.round(food.kcal100) })}
                      </span>
                    )}
                  </span>
                  <span className="w-24 shrink-0">
                    <NumberField
                      label={t('food.gramsOf', { name: food?.name ?? t('food.ingredient') })}
                      hideLabel
                      suffix={t('unit.gram')}
                      value={item.grams}
                      onValueChange={(g) => {
                        const next = [...items]
                        next[i] = { ...item, grams: g }
                        setItems(next)
                      }}
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                    aria-label={t('food.removeIngredient')}
                    className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-muted
                               transition-colors active:bg-raised"
                  >
                    <Trash2 size={17} aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {/* Добавление - кнопкой внизу карточки, как «Добавить» у приёма пищи */}
        <div className="px-3 pt-1 pb-3">
          <Button variant="soft" className="min-h-11 w-full text-[15px]" onClick={() => setPicking(true)}>
            <Plus size={18} strokeWidth={2.4} aria-hidden />
            {t('food.addProduct')}
          </Button>
        </div>
      </Card>

      <Card as="section" className="flex flex-col gap-3 p-4">
        <NumberField
          label={t('food.yield')}
          suffix={t('unit.gram')}
          value={yieldGrams}
          onValueChange={setYieldGrams}
          placeholder={String(Math.round(computed.rawGrams) || '')}
          hint={
            computed.rawGrams > 0
              ? t('food.yieldHint', { n: Math.round(computed.rawGrams) })
              : t('food.yieldHintEmpty')
          }
        />

        {computed.per100 && (
          <div className="rounded-2xl bg-raised px-4 py-3">
            <p className="text-[13px] text-muted">{t('food.per100dish')}</p>
            <p className="mt-1 font-display text-[26px] leading-tight font-extrabold tabular-nums">
              {Math.round(computed.per100.kcal)}{' '}
              <span className="font-sans text-base font-medium text-muted">{t('unit.kcal')}</span>
            </p>
            <p className="mt-1 text-sm tabular-nums">
              <span className="text-protein">
                {t('macro.p')} {trim(computed.per100.protein)}
              </span>{' '}
              <span className="text-fat">
                {t('macro.f')} {trim(computed.per100.fat)}
              </span>{' '}
              <span className="text-carbs">
                {t('macro.c')} {trim(computed.per100.carbs)}
              </span>
            </p>
          </div>
        )}
      </Card>

      <FoodPhotoEditor
        foodId={existing?.id}
        imagePath={existing?.imagePath ?? null}
        pending={pendingPhoto}
        onPending={setPendingPhoto}
      />

      <Card as="section" className="flex flex-col gap-3 p-4">
        <div>
          <h3 className="font-display text-[17px] font-bold">{t('food.servings')}</h3>
          <p className="mt-0.5 text-[13px] text-muted">{t('food.servingsHintDish')}</p>
        </div>
        {servings.map((s, i) => (
          <div key={s.key} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field
                label={t('food.serving')}
                value={s.label}
                onChange={(e) => {
                  const next = [...servings]
                  next[i] = { ...s, label: e.target.value }
                  setServings(next)
                }}
                placeholder={t('food.servingPlaceholderDish')}
              />
            </div>
            <div className="w-28">
              <NumberField
                label={t('portion.weight')}
                suffix={t('unit.gram')}
                value={s.grams}
                onValueChange={(g) => {
                  const next = [...servings]
                  next[i] = { ...s, grams: g }
                  setServings(next)
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setServings(servings.filter((_, j) => j !== i))}
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
          onClick={() =>
            setServings([...servings, { key: crypto.randomUUID(), label: '', grams: '' }])
          }
        >
          <Plus size={18} aria-hidden />
          {t('food.addServing')}
        </Button>
      </Card>

      </fieldset>

      {error && <p className="px-1 text-sm text-danger">{error}</p>}

      {!readOnly && (
        <Button
          className="mt-1 min-h-14 text-[17px]"
          onClick={() => void submit()}
          disabled={!canSave}
          loading={saveDish.isPending || uploadPhoto.isPending}
        >
          {t('common.save')}
        </Button>
      )}

      {existing && !readOnly && (
        <Button
          variant="danger"
          loading={archive.isPending}
          onClick={() => {
            void archive.mutateAsync(existing.id).then(() => navigate('/foods', { replace: true }))
          }}
        >
          <Archive size={18} aria-hidden />
          {t('food.archive')}
        </Button>
      )}

      <ProductPicker
        open={picking}
        excludeIds={items.map((i) => i.foodId)}
        onClose={() => setPicking(false)}
        onPick={(food) => {
          setItems([...items, { key: crypto.randomUUID(), foodId: food.id, grams: '' }])
          setPicking(false)
        }}
      />
    </div>
  )
}
