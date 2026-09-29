import { lookupBarcode } from './openFoodFacts'
import { BarcodeScanner } from './BarcodeScanner'
import { useT } from '@/lib/i18n'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Apple, ChevronRight, CookingPot, ScanLine, SearchX } from 'lucide-react'
import { searchItems } from '@/lib/search'
import { Card } from '@/ui/Card'
import { SearchInput } from '@/ui/SearchInput'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { useFoodPhotoUrls, useFoods } from './api'
import { FoodThumb } from './FoodPhoto'
import type { Food, FoodKind } from './types'
import { Segmented } from '@/ui/Segmented'
import { Fab } from '@/ui/Fab'

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
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'product', label: t('food.tabProducts') },
          { value: 'dish', label: t('food.tabDishes') },
        ]}
      />

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
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-tone-green
                       shadow-card transition-transform active:scale-95"
          >
            <ScanLine size={20} aria-hidden />
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

      {lookup !== null && (
        <p className="rounded-2xl bg-raised px-4 py-3 text-sm text-muted">{lookup}</p>
      )}

      {foods.isPending && <Loading />}
      {foods.isError && <ErrorState error={foods.error} onRetry={() => void foods.refetch()} />}

      {foods.isSuccess && visible.length === 0 && (
        <EmptyState
          icon={query ? SearchX : tab === 'dish' ? CookingPot : Apple}
          tone="green"
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
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {visible.map((food) => (
              <li key={food.id}>
                <FoodRow
                  food={food}
                  to={`/foods/${food.id}`}
                  photoUrl={food.imagePath ? photos.data?.[food.imagePath] : undefined}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Fab
        onClick={() => navigate(tab === 'dish' ? '/foods/new?kind=dish' : '/foods/new')}
        label={t(tab === 'dish' ? 'food.newDish' : 'food.newProduct')}
      />
    </div>
  )
}

type FoodRowProps = {
  food: Food
  photoUrl?: string | undefined
  /** Правый край. По умолчанию у ссылки - шеврон, у кнопки - ничего. */
  trailing?: ReactNode | undefined
} & ({ to: string } | { onClick: () => void })

/**
 * Строка продукта: миниатюра, название и КБЖУ на 100 г.
 *
 * Одна на три места - список продуктов, выбор еды в дневник и выбор
 * ингредиента для блюда. Раньше у каждого места была своя вёрстка, и выбор
 * ингредиента остался вовсе без фотографий: одно и то же выглядело
 * по-разному в зависимости от того, откуда его открыли.
 *
 * Строка во всю ширину карточки и есть область нажатия, как у ListRow.
 */
export function FoodRow(props: FoodRowProps) {
  const { food, photoUrl } = props
  const t = useT()
  const trailing =
    props.trailing ??
    ('to' in props ? <ChevronRight size={18} className="shrink-0 text-muted/70" aria-hidden /> : null)

  const body = (
    <>
      <FoodThumb url={photoUrl} kind={food.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">
          {food.name}
          {food.brand && <span className="font-normal text-muted"> · {food.brand}</span>}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-muted">
          <span className="font-semibold text-ink tabular-nums">{Math.round(food.kcal100)}</span>{' '}
          {t('unit.kcal')} ·{' '}
          <span className="text-protein tabular-nums">
            {t('macro.p')} {trim(food.protein100)}
          </span>{' '}
          <span className="text-fat tabular-nums">
            {t('macro.f')} {trim(food.fat100)}
          </span>{' '}
          <span className="text-carbs tabular-nums">
            {t('macro.c')} {trim(food.carbs100)}
          </span>{' '}
          {t('pick.per100')}
        </span>
      </span>
      {trailing}
    </>
  )
  const cls =
    'flex w-full min-h-16 items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-raised'

  if ('to' in props) {
    return (
      <Link to={props.to} className={cls}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={props.onClick} className={cls}>
      {body}
    </button>
  )
}

/** 23.60 → «23.6», 0.00 → «0». Лишние нули в плотной строке только шумят. */
export function trim(value: number): string {
  return String(Math.round(value * 10) / 10)
}
