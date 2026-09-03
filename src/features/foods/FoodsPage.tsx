import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { searchItems } from '@/lib/search'
import { SearchInput } from '@/ui/SearchInput'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { useFoodPhotoUrls, useFoods } from './api'
import { FoodThumb } from './FoodPhoto'
import type { Food, FoodKind } from './types'

export function FoodsPage() {
  const [tab, setTab] = useState<FoodKind>('product')
  const [query, setQuery] = useState('')
  const foods = useFoods()
  const navigate = useNavigate()

  const visible = useMemo(() => {
    const all = foods.data ?? []
    return searchItems(
      all.filter((f) => f.kind === tab),
      query,
      { limit: 300 },
    )
  }, [foods.data, tab, query])

  // Ссылки берём на всё, что есть в базе, а не на текущую выборку: иначе каждый
  // символ в поиске менял бы список путей и дёргал новый запрос за подписями
  const photoPaths = useMemo(
    () => (foods.data ?? []).map((f) => f.imagePath).filter((p): p is string => p !== null),
    [foods.data],
  )
  const photos = useFoodPhotoUrls(photoPaths)

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3 pb-28">
      <div className="mb-3 flex gap-1 rounded-xl bg-raised p-1">
        <Tab active={tab === 'product'} onClick={() => setTab('product')}>
          Продукты
        </Tab>
        <Tab active={tab === 'dish'} onClick={() => setTab('dish')}>
          Блюда
        </Tab>
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Название или бренд" />

      {foods.isPending && <Loading />}
      {foods.isError && <ErrorState error={foods.error} onRetry={() => void foods.refetch()} />}

      {foods.isSuccess && visible.length === 0 && (
        <EmptyState
          title={query ? 'Ничего не нашлось' : tab === 'dish' ? 'Блюд пока нет' : 'Продуктов нет'}
          hint={
            query
              ? 'Проверь написание или заведи новый продукт'
              : tab === 'dish'
                ? 'Блюдо — это несколько продуктов с граммовками. КБЖУ посчитается само.'
                : undefined
          }
        />
      )}

      {visible.length > 0 && (
        <ul className="mt-3 overflow-hidden rounded-xl ring-1 ring-line">
          {visible.map((food, i) => (
            <li key={food.id} className={i > 0 ? 'border-t border-line' : undefined}>
              <FoodRow
                food={food}
                to={`/foods/${food.id}`}
                photoUrl={food.imagePath ? photos.data?.[food.imagePath] : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => navigate(tab === 'dish' ? '/foods/new?kind=dish' : '/foods/new')}
        aria-label={tab === 'dish' ? 'Новое блюдо' : 'Новый продукт'}
        className="fixed right-5 bottom-6 z-20 flex size-14 items-center justify-center
                   rounded-full bg-accent text-accent-ink shadow-lg
                   transition-transform active:scale-95"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Plus size={26} aria-hidden />
      </button>
    </div>
  )
}

function Tab({
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
      className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
        active ? 'bg-surface text-ink shadow-sm' : 'text-muted'
      }`}
    >
      {children}
    </button>
  )
}

/** Строка продукта. Используется и здесь, и в шторке выбора из дневника. */
export function FoodRow({
  food,
  to,
  photoUrl,
}: {
  food: Food
  to: string
  photoUrl?: string | undefined
}) {
  return (
    <Link to={to} className="flex items-center gap-3 bg-surface px-4 py-3 active:bg-raised">
      <FoodThumb url={photoUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base">
          {food.name}
          {food.brand && <span className="text-muted"> · {food.brand}</span>}
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          {Math.round(food.kcal100)} ккал ·{' '}
          <span className="text-protein">Б {trim(food.protein100)}</span>{' '}
          <span className="text-fat">Ж {trim(food.fat100)}</span>{' '}
          <span className="text-carbs">У {trim(food.carbs100)}</span>
          <span className="text-muted"> на 100 г</span>
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
    </Link>
  )
}

/** 23.60 → «23.6», 0.00 → «0». Лишние нули в плотной строке только шумят. */
export function trim(value: number): string {
  return String(Math.round(value * 10) / 10)
}
