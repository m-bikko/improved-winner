import { useT } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import { SearchX } from 'lucide-react'
import { searchItems } from '@/lib/search'
import { Card } from '@/ui/Card'
import { SearchInput } from '@/ui/SearchInput'
import { Sheet } from '@/ui/Sheet'
import { EmptyState } from '@/ui/States'
import { useFoodPhotoUrls, useFoods } from './api'
import { FoodRow } from './FoodsPage'
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
  const t = useT()
  const [query, setQuery] = useState('')
  const foods = useFoods()

  // Пути на всю базу, как в разделе продуктов и в выборе еды: ключ запроса
  // тот же, и подписи приходят из кэша, а не новым походом в хранилище
  const photoPaths = useMemo(
    () => (foods.data ?? []).map((f) => f.imagePath).filter((p): p is string => p !== null),
    [foods.data],
  )
  const photos = useFoodPhotoUrls(photoPaths)

  const results = useMemo(() => {
    const products = (foods.data ?? []).filter(
      (f) => f.kind === 'product' && !excludeIds.includes(f.id),
    )
    return searchItems(products, query, { limit: 40 })
  }, [foods.data, query, excludeIds])

  return (
    <Sheet open={open} onClose={onClose} title={t('food.ingredientTitle')} bleed>
      <div className="sticky top-0 z-10 bg-bg px-4 pt-1 pb-3">
        <SearchInput value={query} onChange={setQuery} placeholder={t('food.productNamePlaceholder')} autoFocus />
      </div>

      {results.length === 0 && <EmptyState icon={SearchX} title={t('pick.nothingFound')} />}

      {results.length > 0 && (
        <Card className="mx-4 mb-5 overflow-hidden">
          <ul className="divide-y divide-line">
            {results.map((food) => (
              <li key={food.id}>
                <FoodRow
                  food={food}
                  onClick={() => onPick(food)}
                  photoUrl={food.imagePath ? photos.data?.[food.imagePath] : undefined}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Sheet>
  )
}
