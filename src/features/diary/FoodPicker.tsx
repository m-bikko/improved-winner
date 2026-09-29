import { dynamicKey, useT } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import { Clock, Plus, Repeat, SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { searchItems } from '@/lib/search'
import { Card, SectionTitle } from '@/ui/Card'
import { SearchInput } from '@/ui/SearchInput'
import { Sheet } from '@/ui/Sheet'
import { EmptyState, Loading } from '@/ui/States'
import { FoodRow } from '@/features/foods/FoodsPage'
import { useFoodPhotoUrls, useFoods } from '@/features/foods/api'
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

  // Ненайденное заводится сразу с набранным названием: человек только что
  // напечатал его в поиске, и печатать второй раз в форме незачем
  const typed = query.trim()
  const newFoodLink = typed ? `/foods/new?${new URLSearchParams({ name: typed }).toString()}` : '/foods/new'

  return (
    <Sheet open={open} onClose={onClose} title={t(dynamicKey('meal', meal))} bleed>
      <div className="sticky top-0 z-10 bg-bg px-4 pt-1 pb-3">
        <SearchInput value={query} onChange={setQuery} placeholder={t('pick.placeholder')} autoFocus />
      </div>

      {foods.isPending && <Loading />}

      {mode === 'recent' && (
        <SectionTitle className="mx-4 mb-2">
          <span className="flex items-center gap-1.5">
            <Repeat size={15} aria-hidden />
            {t('pick.frequent')}
          </span>
        </SectionTitle>
      )}

      {foods.isSuccess && results.length === 0 && (
        <EmptyState
          icon={SearchX}
          tone="amber"
          title={t('pick.nothingFound')}
          hint={t('pick.nothingHint')}
          action={
            <Link
              to={newFoodLink}
              onClick={onClose}
              className="mt-1 flex min-h-11 items-center gap-1.5 rounded-2xl bg-accent-soft px-5 text-[15px]
                         font-semibold text-accent-soft-ink transition-transform active:scale-[0.97]"
            >
              <Plus size={18} strokeWidth={2.4} aria-hidden />
              {t('pick.newFood')}
            </Link>
          }
        />
      )}

      {results.length > 0 && (
        <Card className="mx-4 mb-5 overflow-hidden">
          <ul className="divide-y divide-line">
            {results.map((food) => (
              <li key={food.id}>
                <FoodRow
                  food={food}
                  onClick={() => onPick(food)}
                  photoUrl={food.imagePath ? photos.data?.[food.imagePath] : undefined}
                  trailing={
                    mode === 'recent' ? (
                      <Clock size={15} className="shrink-0 text-muted/70" aria-hidden />
                    ) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Sheet>
  )
}
