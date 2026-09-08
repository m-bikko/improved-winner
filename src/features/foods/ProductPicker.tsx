import { useMemo, useState } from 'react'
import { searchItems } from '@/lib/search'
import { SearchInput } from '@/ui/SearchInput'
import { Sheet } from '@/ui/Sheet'
import { EmptyState } from '@/ui/States'
import { useFoods } from './api'
import { trim } from './FoodsPage'
import type { Food } from './types'

/**
 * Выбор продукта-ингредиента для блюда.
 *
 * Показывает только kind='product': блюдо внутри блюда запрещено на уровне
 * базы составными внешними ключами, и предлагать в списке то, что всё равно
 * не сохранится, было бы издевательством.
 */
export function ProductPicker({
  open,
  onClose,
  onPick,
  excludeIds = [],
}: {
  open: boolean
  onClose: () => void
  onPick: (food: Food) => void
  excludeIds?: string[]
}) {
  const [query, setQuery] = useState('')
  const foods = useFoods()

  const results = useMemo(() => {
    const products = (foods.data ?? []).filter(
      (f) => f.kind === 'product' && !excludeIds.includes(f.id),
    )
    return searchItems(products, query, { limit: 40 })
  }, [foods.data, query, excludeIds])

  return (
    <Sheet open={open} onClose={onClose} title="Ингредиент" bleed>
      <div className="sticky top-0 z-10 bg-bg px-4 pt-3 pb-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Название продукта" autoFocus />
      </div>

      {results.length === 0 && <EmptyState title="Ничего не нашлось" />}

      <ul className="px-2 pb-4">
        {results.map((food) => (
          <li key={food.id}>
            <button
              type="button"
              onClick={() => onPick(food)}
              className="w-full rounded-xl px-3 py-3 text-left active:bg-raised"
            >
              <span className="block truncate">{food.name}</span>
              <span className="text-xs text-muted">
                {Math.round(food.kcal100)} ккал · Б {trim(food.protein100)} Ж {trim(food.fat100)} У{' '}
                {trim(food.carbs100)} на 100 г
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
