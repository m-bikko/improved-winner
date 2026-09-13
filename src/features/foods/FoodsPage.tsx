import { lookupBarcode } from './openFoodFacts'
import { BarcodeScanner } from './BarcodeScanner'
import { useT } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, ScanLine } from 'lucide-react'
import { searchItems } from '@/lib/search'
import { SearchInput } from '@/ui/SearchInput'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { useFoodPhotoUrls, useFoods } from './api'
import { FoodThumb } from './FoodPhoto'
import type { Food, FoodKind } from './types'

export function FoodsPage() {
  const t = useT()
  const [tab, setTab] = useState<FoodKind>('product')
  const [query, setQuery] = useState('')
  const foods = useFoods()
  const navigate = useNavigate()
  const [scanning, setScanning] = useState(false)
  const [lookup, setLookup] = useState<string | null>(null)

  /**
   * Что делать с распознанным кодом.
   *
   * Сначала своя база - она уже в памяти целиком, и попадание здесь означает,
   * что внешний справочник не нужен вовсе. Дальше справочник, и только если
   * и он молчит - ручное заведение с уже привязанным кодом.
   */
  const resolve = async (code: string): Promise<void> => {
    setLookup(null)
    const known = (foods.data ?? []).find((f) => f.barcode === code)
    if (known) {
      navigate(`/foods/${known.id}`)
      return
    }
    try {
      const found = await lookupBarcode(code)
      if (!found) {
        setLookup(t('scan.notFound'))
        return
      }
      const params = new URLSearchParams({ barcode: code, name: found.name })
      if (found.brand !== null) params.set('brand', found.brand)
      if (found.kcal100 !== null) params.set('kcal', String(found.kcal100))
      if (found.protein100 !== null) params.set('protein', String(found.protein100))
      if (found.fat100 !== null) params.set('fat', String(found.fat100))
      if (found.carbs100 !== null) params.set('carbs', String(found.carbs100))
      navigate(`/foods/new?${params.toString()}`)
    } catch {
      // Справочник в сети, а приложение работает и без неё: молчаливый отказ
      // тут честнее ошибки - код всегда можно завести руками
      setLookup(t('scan.notFound'))
    }
  }

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
          {t('food.tabProducts')}
        </Tab>
        <Tab active={tab === 'dish'} onClick={() => setTab('dish')}>
          {t('food.tabDishes')}
        </Tab>
      </div>

      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <SearchInput value={query} onChange={setQuery} placeholder={t('food.searchPlaceholder')} />
        </span>
        {/* Только у продуктов: у сваренного борща штрихкода не бывает */}
        {tab === 'product' && (
          <button
            type="button"
            onClick={() => setScanning(true)}
            aria-label={t('scan.scan')}
            className="shrink-0 rounded-xl bg-raised p-3 text-muted ring-1 ring-line"
          >
            <ScanLine size={18} aria-hidden />
          </button>
        )}
      </div>

      {scanning && (
        <BarcodeScanner
          open
          onClose={() => setScanning(false)}
          onCode={(code) => {
            setScanning(false)
            void resolve(code)
          }}
        />
      )}

      {lookup !== null && <p className="mt-2 text-sm text-muted">{lookup}</p>}

      {foods.isPending && <Loading />}
      {foods.isError && <ErrorState error={foods.error} onRetry={() => void foods.refetch()} />}

      {foods.isSuccess && visible.length === 0 && (
        <EmptyState
          title={t(
            query ? 'pick.nothingFound' : tab === 'dish' ? 'food.noDishes' : 'food.noProducts',
          )}
          hint={
            query
              ? t('pick.nothingHint')
              : tab === 'dish'
                ? t('food.dishHint')
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
        aria-label={t(tab === 'dish' ? 'food.newDish' : 'food.newProduct')}
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
  const t = useT()
  return (
    <Link to={to} className="flex items-center gap-3 bg-surface px-4 py-3 active:bg-raised">
      <FoodThumb url={photoUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base">
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
          </span>
          <span className="text-muted"> {t('pick.per100')}</span>
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
