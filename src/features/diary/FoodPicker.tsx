import { dynamicKey, useT } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import { Clock, Plus, Repeat } from 'lucide-react'
import { Link } from 'react-router-dom'
import { searchItems } from '@/lib/search'
import { SearchInput } from '@/ui/SearchInput'
import { Sheet } from '@/ui/Sheet'
import { EmptyState, Loading } from '@/ui/States'
import { trim } from '@/features/foods/FoodsPage'
import { useFoodPhotoUrls, useFoods } from '@/features/foods/api'
import { FoodThumb } from '@/features/foods/FoodPhoto'
import type { Food } from '@/features/foods/types'
import { useRecentFoodIds } from './api'
import { type Meal } from './types'

type Props = {
  open: boolean
  meal: Meal
  userId: string
  onClose: () => void
  onPick: (food: Food) => void
}

/**
 * Шторка выбора продукта.
 *
 * До ввода показывает «Недавние» и «Часто» - в них попадает почти всё, что ест
 * человек изо дня в день, и это экономит больше времени, чем любое ускорение
 * самого поиска.
 */
export function FoodPicker({ open, meal, userId, onClose, onPick }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const foods = useFoods()
  const recent = useRecentFoodIds(userId)

  // Один запрос за подписями на всю базу: он кэшируется и переиспользуется
  // разделом продуктов, потому что ключ у запроса тот же
  const photoPaths = useMemo(
    () => (foods.data ?? []).map((f) => f.imagePath).filter((p): p is string => p !== null),
    [foods.data],
  )
  const photos = useFoodPhotoUrls(photoPaths)

  const { results, mode } = useMemo(() => {
    const all = foods.data ?? []
    if (query.trim()) {
      return { results: searchItems(all, query, { limit: 40 }), mode: 'search' as const }
    }

    const stats = new Map((recent.data ?? []).map((r) => [r.foodId, r]))
    if (stats.size === 0) {
      return { results: all.slice(0, 30), mode: 'all' as const }
    }

    // Сначала частое, при равной частоте - недавнее
    const known = all
      .filter((f) => stats.has(f.id))
      .sort((a, b) => {
        const sa = stats.get(a.id)
        const sb = stats.get(b.id)
        return (sb?.count ?? 0) - (sa?.count ?? 0) || (sb?.lastAt ?? '').localeCompare(sa?.lastAt ?? '')
      })
    return { results: known.slice(0, 30), mode: 'recent' as const }
  }, [foods.data, recent.data, query])

  return (
    <Sheet open={open} onClose={onClose} title={t(dynamicKey('meal', meal))} bleed>
      <div className="sticky top-0 z-10 bg-bg px-4 pt-3 pb-2">
        <SearchInput value={query} onChange={setQuery} placeholder={t('pick.placeholder')} autoFocus />
      </div>

      {foods.isPending && <Loading />}

      {mode === 'recent' && (
        <p className="flex items-center gap-1.5 px-4 pt-1 pb-2 text-xs text-muted">
          <Repeat size={13} aria-hidden />
          {t('pick.frequent')}
        </p>
      )}

      {foods.isSuccess && results.length === 0 && (
        <EmptyState
          title={t('pick.nothingFound')}
          hint={t('pick.nothingHint')}
          action={
            <Link to="/foods/new" onClick={onClose} className="flex items-center gap-1.5 text-sm text-accent">
              <Plus size={16} aria-hidden />
              {t('pick.newFood')}
            </Link>
          }
        />
      )}

      <ul className="px-2 pb-4">
        {results.map((food) => (
          <li key={food.id}>
            <button
              type="button"
              onClick={() => onPick(food)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-raised"
            >
              <FoodThumb url={food.imagePath ? photos.data?.[food.imagePath] : undefined} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {food.name}
                  {food.brand && <span className="text-muted"> · {food.brand}</span>}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {Math.round(food.kcal100)} {t('unit.kcal')} ·{' '}
                  <span className="text-protein">
                    {t('macro.p')} {trim(food.protein100)}
                  </span>{' '}
                  <span className="text-fat">
                    {t('macro.f')} {trim(food.fat100)}
                  </span>{' '}
                  <span className="text-carbs">
                    {t('macro.c')} {trim(food.carbs100)}
                  </span>{' '}
                  {t('pick.per100')}
                </span>
              </span>
              {mode === 'recent' && <Clock size={14} className="shrink-0 text-muted" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
