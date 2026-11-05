import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react'
import { Check, ChevronDown, Images, LoaderCircle, MapPin, MapPinned, Navigation, Pencil, Search, Trash2, Undo2, X } from 'lucide-react'
import { dynamicKey, useLang, useT } from '@/lib/i18n'
import { formatDayLabel, toLocalISO, todayLocal } from '@/lib/date'
import { usePair } from '@/features/profile/pair'
import { useBurst } from '@/ui/Burst'
import { Button } from '@/ui/Button'
import { Chip, Tag } from '@/ui/Chip'
import { Fab } from '@/ui/Fab'
import { Field, INPUT_CLASS } from '@/ui/Field'
import { ListGroup, ListRow } from '@/ui/List'
import { SearchInput } from '@/ui/SearchInput'
import { Segmented } from '@/ui/Segmented'
import { Sheet } from '@/ui/Sheet'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { Switch } from '@/ui/Switch'
import { useAddPlace, useDeletePlace, useEditPlace, useMarkVisited, usePlaces, useUnmarkVisited } from './api'
import { boundsOfCity, cityAt, findCities, reversePlace, searchPlaces, type SearchArea } from './geocoder'
import {
  ADDRESS_MAX,
  CITIES,
  NAME_MAX,
  NOTE_MAX,
  PLACE_KINDS,
  contains,
  osmRouteUrl,
  samePoint,
  type Bounds,
  type GeoHit,
  type MapCity,
  type Place,
  type PlaceKind,
  type Point,
} from './logic'
import { KIND_LOOK } from './look'
import { PlaceMap, type MapHandle, type MapView } from './PlaceMap'

type Tab = 'want' | 'been'

/** Точка, которую только что поставили, - ещё не место, а кандидат. */
type Draft = GeoHit & { looking: boolean }

/** Мельче этого масштаба на экране уже не город, а область или страна. */
const CITY_MIN_ZOOM = 9
/** Город уточняем, когда карту перестали двигать: сервер бесплатный, а палец быстрый. */
const CITY_DELAY_MS = 700

const VIEW_KEY = 'love-promises-map-view'

function readView(): MapView | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return null
    const { lat, lng, zoom } = raw as Record<string, unknown>
    return typeof lat === 'number' && typeof lng === 'number' && typeof zoom === 'number' ? { lat, lng, zoom } : null
  } catch {
    return null
  }
}

function saveView(view: MapView): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view))
  } catch {
    // Закрытое хранилище: карта просто откроется заново
  }
}

/** Шесть знаков - около десяти сантиметров; больше карта всё равно не даёт. */
function tidy({ lat, lng }: Point): Point {
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }
}

function toTop(): void {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' })
}

/**
 * Места, куда хотим сходить, и где уже были.
 *
 * Добавить можно двумя путями: найти поиском или нажать на карту. Оба ведут
 * к одному и тому же - точке-кандидату с карточкой поверх карты. Форма сразу
 * не открывается намеренно: случайное нажатие при перетаскивании не должно
 * выбрасывать шторку на весь экран, а шторка закрыла бы саму точку.
 *
 * Карта показывает то же, что список под ней: вкладку и выбранный вид. Поиск
 * идёт в городе, который сейчас на экране, а сменить город можно селектом на карте.
 */
export function PlacesPage() {
  const t = useT()
  const { lang } = useLang()
  const places = usePlaces()
  const map = useRef<MapHandle>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const reverse = useRef<AbortController | null>(null)
  const detecting = useRef<AbortController | null>(null)
  const cityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Город только что выбрали сами: границы уже в пути, угадывать по центру незачем
  const cityChosen = useRef(false)

  const [initialView] = useState(readView)
  const [tab, setTab] = useState<Tab>('want')
  const [kind, setKind] = useState<PlaceKind | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState<{ draft: Draft } | { place: Place } | null>(null)
  const [visiting, setVisiting] = useState<Place | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [city, setCity] = useState<MapCity | null>(null)
  const [choosingCity, setChoosingCity] = useState(false)

  useEffect(
    () => () => {
      reverse.current?.abort()
      detecting.current?.abort()
      clearTimeout(cityTimer.current)
    },
    [],
  )

  const all = places.data ?? []
  const inTab = (which: Tab) => all.filter((p) => (which === 'been') === (p.visitedOn !== null))
  // Сначала недавние: в «Хотим» порядок уже такой, а сортировка устойчивая
  const tabPlaces = inTab(tab).sort((a, b) => (b.visitedOn ?? '').localeCompare(a.visitedOn ?? ''))
  const shown = kind ? tabPlaces.filter((p) => p.kind === kind) : tabPlaces
  const present = PLACE_KINDS.filter((k) => tabPlaces.some((p) => p.kind === k))
  const opened = all.find((p) => p.id === openId)

  const dropDraft = () => {
    reverse.current?.abort()
    setDraft(null)
  }

  const changeTab = (next: Tab) => {
    setTab(next)
    setKind(null)
    map.current?.fit(inTab(next))
  }

  const changeKind = (next: PlaceKind | null) => {
    setKind(next)
    map.current?.fit(next ? tabPlaces.filter((p) => p.kind === next) : tabPlaces)
  }

  const openPlace = (place: Place) => {
    const home: Tab = place.visitedOn ? 'been' : 'want'
    if (home !== tab) setTab(home)
    if (kind && kind !== place.kind) setKind(null)
    map.current?.flyTo(place)
    setOpenId(place.id)
  }

  const tapMap = (tapped: Point) => {
    const point = tidy(tapped)
    setNotice(null)
    reverse.current?.abort()
    const control = new AbortController()
    reverse.current = control
    setDraft({ ...point, name: '', address: null, kind: 'other', looking: true })
    // Вблизи важен точный дом, издалека - город: случайный дом в нём был бы неправдой
    const zoom = map.current?.zoom() ?? 16
    reversePlace(point, zoom >= 14 ? 18 : zoom, lang, control.signal)
      .then((hit) => {
        if (control.signal.aborted) return
        setDraft({ ...point, name: hit?.name ?? '', address: hit?.address ?? null, kind: hit?.kind ?? 'other', looking: false })
      })
      .catch(() => {
        // Адрес - удобство, а не условие: точка остаётся, название впишут сами
        if (!control.signal.aborted) setDraft((d) => (d ? { ...d, looking: false } : d))
      })
  }

  const pickHit = (hit: GeoHit) => {
    setNotice(null)
    toTop()
    const known = all.find((p) => samePoint(p, hit))
    if (known) {
      dropDraft()
      openPlace(known)
      return
    }
    reverse.current?.abort()
    setDraft({ ...hit, looking: false })
    map.current?.flyTo(hit, 16)
  }

  /** Карту передвинули: запомнить вид и уточнить, какой теперь город на экране. */
  const onMoved = (view: MapView) => {
    saveView(view)
    clearTimeout(cityTimer.current)
    if (cityChosen.current) return
    if (view.zoom < CITY_MIN_ZOOM) {
      detecting.current?.abort()
      setCity(null)
      return
    }
    // Внутри известного города спрашивать нечего
    if (city?.bounds && contains(city.bounds, view)) return
    cityTimer.current = setTimeout(() => {
      detecting.current?.abort()
      const control = new AbortController()
      detecting.current = control
      cityAt(view, lang, control.signal)
        .then((found) => {
          if (!control.signal.aborted) setCity(found)
        })
        .catch(() => {
          // Сети нет или сервер занят: поиск просто пойдёт по тому, что на экране
        })
    }, CITY_DELAY_MS)
  }

  const chooseCity = (choice: Point & { name: string; bounds: Bounds | null }) => {
    setChoosingCity(false)
    dropDraft()
    toTop()
    detecting.current?.abort()
    clearTimeout(cityTimer.current)
    setCity({ name: choice.name, bounds: choice.bounds })
    if (choice.bounds) {
      map.current?.flyToBounds(choice.bounds)
      return
    }
    // Карта едет сразу, а границы города догоняют её следующим запросом
    cityChosen.current = true
    map.current?.flyTo(choice, 12)
    const control = new AbortController()
    detecting.current = control
    boundsOfCity(choice.name, lang, control.signal)
      .then((bounds) => {
        if (!control.signal.aborted) setCity({ name: choice.name, bounds: bounds && contains(bounds, choice) ? bounds : null })
      })
      .catch(() => {})
      .finally(() => {
        cityChosen.current = false
      })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1 pb-16">
      <PlaceSearch
        inputRef={searchInput}
        city={city}
        near={() => map.current?.near() ?? null}
        onPick={pickHit}
      />

      <PlaceMap
        ref={map}
        places={shown}
        ready={places.isSuccess}
        selectedId={openId}
        draft={draft}
        initial={initialView}
        onTap={tapMap}
        onPin={openPlace}
        onMoved={onMoved}
        onLocateFailed={() => setNotice(t('places.locateFailed'))}
      >
        {/* Селект города - на самой карте: это выбор того, что она показывает */}
        <button
          type="button"
          onClick={() => setChoosingCity(true)}
          aria-haspopup="dialog"
          aria-label={`${t('places.city')}: ${city?.name ?? t('places.pickCity')}`}
          className="material absolute top-2 left-2 z-10 flex h-11 max-w-[calc(100%-4.5rem)] items-center gap-1.5 rounded-2xl pr-2.5 pl-3
                     text-[15px] font-semibold transition-transform duration-200 active:scale-95 active:duration-75"
        >
          <MapPin size={16} className="shrink-0 text-accent" aria-hidden />
          <span className="truncate">{city?.name ?? t('places.pickCity')}</span>
          <ChevronDown size={16} strokeWidth={2.4} className="shrink-0 text-muted" aria-hidden />
        </button>

        {draft && <DraftCard draft={draft} onAdd={() => setForm({ draft })} onDismiss={dropDraft} />}
      </PlaceMap>

      {notice && <p className="px-1 text-sm text-danger">{notice}</p>}

      <Segmented
        value={tab}
        onChange={changeTab}
        options={[
          { value: 'want', label: `${t('places.want')} · ${inTab('want').length}` },
          { value: 'been', label: `${t('places.been')} · ${inTab('been').length}` },
        ]}
      />

      {present.length > 1 && (
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-2">
            {present.map((k) => (
              <Chip key={k} size="sm" icon={KIND_LOOK[k].icon} selected={kind === k} onClick={() => changeKind(kind === k ? null : k)}>
                {t(dynamicKey('places.kind', k))}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {places.isError && <ErrorState error={places.error} onRetry={() => void places.refetch()} />}
      {places.isPending && <Loading />}
      {places.isSuccess &&
        (shown.length === 0 ? (
          tab === 'want' ? (
            <EmptyState icon={MapPinned} tone="green" title={t('places.empty')} hint={t('places.emptyHint')} />
          ) : (
            <EmptyState icon={Check} tone="green" title={t('places.emptyBeen')} hint={t('places.emptyBeenHint')} />
          )
        ) : (
          <ListGroup>
            {shown.map((p) => (
              <ListRow
                key={p.id}
                icon={KIND_LOOK[p.kind].icon}
                tone={KIND_LOOK[p.kind].tone}
                title={p.name}
                subtitle={p.visitedOn ? formatDayLabel(p.visitedOn) : (p.note ?? p.address)}
                onClick={() => openPlace(p)}
              />
            ))}
          </ListGroup>
        ))}

      <Fab
        label={t('places.add')}
        onClick={() => {
          toTop()
          searchInput.current?.focus()
        }}
      />

      {opened && (
        <PlaceSheet
          place={opened}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setOpenId(null)
            setForm({ place: opened })
          }}
          onVisit={() => {
            setOpenId(null)
            setVisiting(opened)
          }}
        />
      )}

      {form && (
        <PlaceForm
          {...form}
          city={city}
          onClose={() => setForm(null)}
          onSaved={(point) => {
            setForm(null)
            dropDraft()
            setTab('want')
            setKind(null)
            map.current?.flyTo(point)
          }}
        />
      )}

      {visiting && <VisitSheet place={visiting} onClose={() => setVisiting(null)} />}

      {choosingCity && <CitySheet current={city?.name ?? null} onPick={chooseCity} onClose={() => setChoosingCity(false)} />}
    </div>
  )
}

/** Где искать: в городе на экране, а пока он неизвестен - предпочитая то, что видно. */
function searchArea(city: MapCity | null, near: Bounds | null): SearchArea | null {
  if (city?.bounds) return { bounds: city.bounds, strict: true }
  return near ? { bounds: near, strict: false } : null
}

/**
 * Поиск по адресам и названиям. Запрос уходит по кнопке, а не по вводу:
 * условие публичного геокодера, и незачем слать ему каждую букву.
 *
 * Ищет в городе, который на экране: «Абая 10» есть почти в каждом городе. Ничего
 * не нашлось - об этом так и сказано, а выйти за границу можно одной кнопкой.
 */
function PlaceSearch({
  inputRef,
  city,
  near,
  onPick,
}: {
  inputRef: Ref<HTMLInputElement>
  city: MapCity | null
  near: () => Bounds | null
  onPick: (hit: GeoHit) => void
}) {
  const t = useT()
  const { lang } = useLang()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [hits, setHits] = useState<GeoHit[] | null>(null)
  const [everywhere, setEverywhere] = useState(false)
  const current = useRef<AbortController | null>(null)

  useEffect(() => () => current.current?.abort(), [])

  const reset = () => {
    current.current?.abort()
    setBusy(false)
    setFailed(false)
    setHits(null)
    setEverywhere(false)
  }

  const run = async (area: SearchArea | null) => {
    const text = query.trim()
    if (text.length < 2) return
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    reset()
    setEverywhere(area === null)
    const control = new AbortController()
    current.current = control
    setBusy(true)
    try {
      const found = await searchPlaces(text, lang, area, control.signal)
      if (!control.signal.aborted) setHits(found)
    } catch {
      if (!control.signal.aborted) setFailed(true)
    } finally {
      if (!control.signal.aborted) setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(searchArea(city, near()))
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={submit} role="search" className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchInput
            inputRef={inputRef}
            value={query}
            onChange={(next) => {
              setQuery(next)
              if (next === '') reset()
            }}
            placeholder={t('places.searchPlaceholder')}
          />
        </div>
        <Button type="submit" variant="soft" loading={busy} disabled={query.trim().length < 2} className="shrink-0 px-4">
          {t('places.searchGo')}
        </Button>
      </form>

      {failed && <p className="px-1 text-sm text-danger">{t('places.searchFailed')}</p>}
      {hits?.length === 0 && (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="min-w-0 text-sm text-muted">
            {city?.bounds && !everywhere ? t('places.searchEmptyIn', { city: city.name }) : t('places.searchEmpty')}
          </p>
          {city?.bounds && !everywhere && (
            <button
              type="button"
              onClick={() => void run(null)}
              className="flex min-h-10 shrink-0 items-center rounded-full bg-accent-soft px-4 text-[15px] font-semibold text-accent-soft-ink active:opacity-70"
            >
              {t('places.searchEverywhere')}
            </button>
          )}
        </div>
      )}
      {hits && hits.length > 0 && (
        <ListGroup>
          {hits.map((hit) => (
            <ListRow
              key={`${hit.lat},${hit.lng},${hit.name}`}
              icon={KIND_LOOK[hit.kind].icon}
              tone={KIND_LOOK[hit.kind].tone}
              title={hit.name}
              subtitle={hit.address}
              chevron={false}
              onClick={() => {
                onPick(hit)
                setQuery('')
                reset()
              }}
            />
          ))}
        </ListGroup>
      )}
      <p className="px-1 text-[12px] text-muted">
        {city ? t('places.searchIn', { city: city.name }) : t('places.mapHint')}
      </p>
    </div>
  )
}

/**
 * Селект города: карта сразу едет туда. Сверху города Казахстана, а любой другой -
 * поиском: в поездке нужен и не из списка. Поиск по кнопке, по той же причине, что
 * и адрес.
 */
function CitySheet({
  current,
  onPick,
  onClose,
}: {
  current: string | null
  onPick: (choice: Point & { name: string; bounds: Bounds | null }) => void
  onClose: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<Awaited<ReturnType<typeof findCities>> | null>(null)
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => request.current?.abort(), [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const text = query.trim()
    if (text.length < 2) return
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    request.current?.abort()
    const control = new AbortController()
    request.current = control
    setBusy(true)
    try {
      const list = await findCities(text, lang, control.signal)
      if (!control.signal.aborted) setFound(list)
    } catch {
      if (!control.signal.aborted) setFound([])
    } finally {
      if (!control.signal.aborted) setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={t('places.city')}>
      <div className="flex flex-col gap-3">
        <form onSubmit={(e) => void submit(e)} role="search" className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <SearchInput
              value={query}
              onChange={(next) => {
                setQuery(next)
                if (next === '') setFound(null)
              }}
              placeholder={t('places.citySearch')}
            />
          </div>
          <Button type="submit" variant="soft" loading={busy} disabled={query.trim().length < 2} className="shrink-0 px-4">
            {t('places.searchGo')}
          </Button>
        </form>

        {found?.length === 0 && <p className="px-1 text-sm text-muted">{t('places.cityEmpty')}</p>}
        {found && found.length > 0 && (
          <ListGroup>
            {found.map((c) => (
              <ListRow
                key={`${c.lat},${c.lng}`}
                title={c.name}
                subtitle={c.label}
                chevron={false}
                onClick={() => onPick({ lat: c.lat, lng: c.lng, name: c.name, bounds: c.bounds })}
              />
            ))}
          </ListGroup>
        )}

        {!found && (
          <ListGroup>
            {CITIES.map((c) => {
              const name = t(dynamicKey('places.city', c.id))
              return (
                <ListRow
                  key={c.id}
                  title={name}
                  chevron={false}
                  trailing={name === current ? <Check size={20} strokeWidth={2.6} className="text-accent" aria-hidden /> : undefined}
                  onClick={() => onPick({ lat: c.lat, lng: c.lng, name, bounds: null })}
                />
              )
            })}
          </ListGroup>
        )}
      </div>
    </Sheet>
  )
}

function DraftCard({ draft, onAdd, onDismiss }: { draft: Draft; onAdd: () => void; onDismiss: () => void }) {
  const t = useT()
  const title = draft.name || draft.address || `${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}`
  return (
    <div className="material absolute inset-x-2 bottom-6 z-10 flex items-center gap-2 rounded-2xl py-2 pr-1 pl-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold">
          {draft.looking && <LoaderCircle size={14} aria-label={t('common.loading')} className="shrink-0 animate-spin text-muted" />}
          <span className="truncate">{title}</span>
        </p>
        {draft.name && draft.address && <p className="truncate text-[12px] text-muted">{draft.address}</p>}
      </div>
      <Button disabled={draft.looking} onClick={onAdd} className="min-h-11 shrink-0 px-4 text-[15px]">
        {t('common.add')}
      </Button>
      <button type="button" aria-label={t('common.cancel')} onClick={onDismiss} className="flex size-11 shrink-0 items-center justify-center text-muted active:opacity-50">
        <X size={18} aria-hidden />
      </button>
    </div>
  )
}

function PlaceSheet({
  place,
  onClose,
  onEdit,
  onVisit,
}: {
  place: Place
  onClose: () => void
  onEdit: () => void
  onVisit: () => void
}) {
  const t = useT()
  const pair = usePair()
  const unmark = useUnmarkVisited()
  const remove = useDeletePlace()
  const [error, setError] = useState<string | null>(null)
  const look = KIND_LOOK[place.kind]
  const fail = (e: Error) => setError(e.message)

  return (
    <Sheet open onClose={onClose} title={place.name}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Tag icon={look.icon}>{t(dynamicKey('places.kind', place.kind))}</Tag>
          {place.visitedOn && (
            <Tag icon={Check} tone="accent">
              {t('places.beenOn', { date: formatDayLabel(place.visitedOn) })}
            </Tag>
          )}
        </div>

        {place.address && (
          <p className="flex items-start gap-2 text-sm text-muted">
            <MapPin size={16} aria-hidden className="mt-0.5 shrink-0" />
            {place.address}
          </p>
        )}
        {place.note && <p className="text-[15px] whitespace-pre-wrap">{place.note}</p>}

        {place.visitedOn ? (
          <Button variant="secondary" loading={unmark.isPending} onClick={() => unmark.mutate(place.id, { onError: fail })}>
            <Undo2 size={18} aria-hidden />
            {t('places.undoBeen')}
          </Button>
        ) : (
          <Button onClick={onVisit}>
            <Check size={18} aria-hidden />
            {t('places.beenAction')}
          </Button>
        )}

        <ListGroup>
          <ListRow href={osmRouteUrl(place)} icon={Navigation} tone="sky" title={t('places.route')} />
          <ListRow onClick={onEdit} icon={Pencil} tone="slate" title={t('common.edit')} />
          {place.memoryId && <ListRow to="/memories" icon={Images} tone="rose" title={t('places.inMemories')} />}
        </ListGroup>

        <p className="text-[13px] text-muted">
          {t('places.addedBy', { name: pair.nameOf(place.createdBy), date: formatDayLabel(toLocalISO(new Date(place.createdAt))) })}
        </p>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(place.id, { onSuccess: onClose, onError: fail })}>
          <Trash2 size={18} aria-hidden />
          {t('common.delete')}
        </Button>
      </div>
    </Sheet>
  )
}

/**
 * Форма места. Адрес и точка - одно и то же, сказанное двумя способами, поэтому они
 * рядом и связаны в обе стороны: нажал на карту - адрес подставился, нашёл адрес -
 * точка переехала. Поправить руками можно и то и другое.
 */
function PlaceForm(
  props: ({ draft: Draft } | { place: Place }) & { city: MapCity | null; onClose: () => void; onSaved: (point: Point) => void },
) {
  const t = useT()
  const { lang } = useLang()
  const add = useAddPlace()
  const edit = useEditPlace()
  const start = 'place' in props ? props.place : props.draft
  const [name, setName] = useState(start.name)
  const [kind, setKind] = useState<PlaceKind>(start.kind)
  const [note, setNote] = useState('place' in props ? (props.place.note ?? '') : '')
  const [point, setPoint] = useState<Point>({ lat: start.lat, lng: start.lng })
  const [address, setAddress] = useState(start.address ?? '')
  const [looking, setLooking] = useState(false)
  const [hits, setHits] = useState<GeoHit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [initial] = useState<MapView>({ lat: start.lat, lng: start.lng, zoom: 16 })
  const mini = useRef<MapHandle>(null)
  const request = useRef<AbortController | null>(null)
  const fail = (e: Error) => setError(e.message)

  useEffect(() => () => request.current?.abort(), [])

  const fresh = () => {
    request.current?.abort()
    const control = new AbortController()
    request.current = control
    return control
  }

  const tapMini = (tapped: Point) => {
    const next = tidy(tapped)
    setPoint(next)
    setHits(null)
    setLooking(true)
    const control = fresh()
    // Здесь спрашивают именно адрес: всегда с точностью до дома
    reversePlace(next, 18, lang, control.signal)
      .then((hit) => {
        if (control.signal.aborted) return
        setAddress(hit?.address ?? '')
        // Название не трогаем, если оно уже есть: его могли вписать сами
        if (hit?.name) setName((current) => current || hit.name)
      })
      .catch(() => {})
      .finally(() => {
        if (!control.signal.aborted) setLooking(false)
      })
  }

  const findAddress = () => {
    const text = address.trim()
    if (text.length < 2) return
    setError(null)
    setLooking(true)
    const control = fresh()
    searchPlaces(text, lang, props.city?.bounds ? { bounds: props.city.bounds, strict: true } : null, control.signal)
      .then((found) => {
        if (!control.signal.aborted) setHits(found)
      })
      .catch(() => {
        if (!control.signal.aborted) setError(t('places.searchFailed'))
      })
      .finally(() => {
        if (!control.signal.aborted) setLooking(false)
      })
  }

  const pickHit = (hit: GeoHit) => {
    setPoint({ lat: hit.lat, lng: hit.lng })
    setAddress(hit.address ?? hit.name)
    setHits(null)
    mini.current?.flyTo(hit, 16)
  }

  const submit = () => {
    setError(null)
    const clean = address.trim().slice(0, ADDRESS_MAX) || null
    const saved = () => props.onSaved(point)
    if ('place' in props) {
      edit.mutate({ id: props.place.id, name, kind, note, address: clean, ...point }, { onSuccess: saved, onError: fail })
      return
    }
    add.mutate({ ...point, address: clean, name, kind, note }, { onSuccess: saved, onError: fail })
  }

  return (
    <Sheet open onClose={props.onClose} title={'place' in props ? t('common.edit') : t('places.add')}>
      <div className="flex flex-col gap-4">
        <Field
          label={t('places.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('places.namePlaceholder')}
          maxLength={NAME_MAX}
          autoFocus={start.name === ''}
        />

        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">{t('places.address')}</span>
            <span className="relative flex items-center">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    findAddress()
                  }
                }}
                enterKeyHint="search"
                placeholder={t('places.addressPlaceholder')}
                maxLength={ADDRESS_MAX}
                className={`${INPUT_CLASS} pr-12`}
              />
              <button
                type="button"
                onClick={findAddress}
                disabled={address.trim().length < 2 || looking}
                aria-label={t('places.addressFind')}
                className="absolute right-0.5 flex size-11 items-center justify-center text-accent active:opacity-50 disabled:text-muted disabled:opacity-40"
              >
                {looking ? <LoaderCircle size={19} className="animate-spin" aria-hidden /> : <Search size={19} aria-hidden />}
              </button>
            </span>
          </label>
          {hits?.length === 0 && <p className="px-1 text-sm text-muted">{t('places.searchEmpty')}</p>}
          {hits && hits.length > 0 && (
            <ListGroup>
              {hits.map((hit) => (
                <ListRow
                  key={`${hit.lat},${hit.lng},${hit.name}`}
                  title={hit.name}
                  subtitle={hit.address}
                  chevron={false}
                  onClick={() => pickHit(hit)}
                />
              ))}
            </ListGroup>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <PlaceMap
            ref={mini}
            compact
            draft={point}
            initial={initial}
            onTap={tapMini}
            onLocateFailed={() => setError(t('places.locateFailed'))}
          />
          <p className="px-1 text-[13px] text-muted">{t('places.pointHint')}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('places.kind')}</span>
          <div className="flex flex-wrap gap-2">
            {PLACE_KINDS.map((k) => (
              <Chip key={k} icon={KIND_LOOK[k].icon} selected={kind === k} onClick={() => setKind(k)}>
                {t(dynamicKey('places.kind', k))}
              </Chip>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('common.note')}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('places.notePlaceholder')}
            maxLength={NOTE_MAX}
            rows={3}
            className={`${INPUT_CLASS} resize-none`}
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 bg-bg px-5 pt-2 pb-5">
          <Button className="w-full" loading={add.isPending || edit.isPending} disabled={name.trim() === ''} onClick={submit}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

function VisitSheet({ place, onClose }: { place: Place; onClose: () => void }) {
  const t = useT()
  const mark = useMarkVisited()
  const burst = useBurst()
  const today = todayLocal()
  const [day, setDay] = useState(today)
  const [toMemory, setToMemory] = useState(true)
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet open onClose={onClose} title={place.name}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('places.when')}</span>
          <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className={INPUT_CLASS} />
        </label>
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-[15px]">{t('places.toMemory')}</span>
          <Switch checked={toMemory} onChange={setToMemory} label={t('places.toMemory')} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          loading={mark.isPending}
          disabled={day === ''}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            mark.mutate(
              { id: place.id, day, caption: toMemory ? place.name : null },
              {
                onSuccess: () => {
                  burst({ x: r.left + r.width / 2, y: r.top }, 'hearts')
                  onClose()
                },
                onError: (err) => setError(err.message),
              },
            )
          }}
        >
          <Check size={18} aria-hidden />
          {t('places.beenAction')}
        </Button>
      </div>
    </Sheet>
  )
}
