import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react'
import { Check, Images, LoaderCircle, MapPin, MapPinned, Move, Navigation, Pencil, Trash2, Undo2, X } from 'lucide-react'
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
import { useAddPlace, useDeletePlace, useEditPlace, useMarkVisited, useMovePlace, usePlaces, useUnmarkVisited } from './api'
import { reversePlace, searchPlaces, type Bounds } from './geocoder'
import { PLACE_KINDS, NAME_MAX, NOTE_MAX, osmRouteUrl, samePoint, type GeoHit, type Place, type PlaceKind, type Point } from './logic'
import { KIND_LOOK } from './look'
import { PlaceMap, type MapHandle } from './PlaceMap'

type Tab = 'want' | 'been'

/** Точка, которую только что поставили, - ещё не место, а кандидат. */
type Draft = GeoHit & { looking: boolean }

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
 * Карта показывает то же, что список под ней: вкладку и выбранный вид.
 */
export function PlacesPage() {
  const t = useT()
  const { lang } = useLang()
  const places = usePlaces()
  const move = useMovePlace()
  const map = useRef<MapHandle>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const reverse = useRef<AbortController | null>(null)

  const [tab, setTab] = useState<Tab>('want')
  const [kind, setKind] = useState<PlaceKind | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [moving, setMoving] = useState<Place | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState<{ draft: Draft } | { place: Place } | null>(null)
  const [visiting, setVisiting] = useState<Place | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => () => reverse.current?.abort(), [])

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
    reversePlace(point, map.current?.zoom() ?? 16, lang, control.signal)
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
    if (known && !moving) {
      dropDraft()
      openPlace(known)
      return
    }
    reverse.current?.abort()
    setDraft({ ...hit, looking: false })
    map.current?.flyTo(hit, 16)
  }

  const startMove = (place: Place) => {
    setOpenId(null)
    dropDraft()
    setNotice(null)
    setMoving(place)
    toTop()
  }

  const cancelMove = () => {
    setMoving(null)
    dropDraft()
  }

  const saveMove = () => {
    if (!moving || !draft) return
    move.mutate(
      { id: moving.id, lat: draft.lat, lng: draft.lng, address: draft.address },
      {
        onSuccess: () => cancelMove(),
        onError: (e) => setNotice(e.message),
      },
    )
  }

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1 pb-16">
      <PlaceSearch inputRef={searchInput} near={() => map.current?.near() ?? null} onPick={pickHit} />

      <PlaceMap
        ref={map}
        places={shown}
        ready={places.isSuccess}
        selectedId={openId ?? moving?.id ?? null}
        draft={draft}
        onTap={tapMap}
        onPin={openPlace}
        onLocateFailed={() => setNotice(t('places.locateFailed'))}
      >
        {moving && (
          <div className="absolute top-2 left-2 z-10 mr-16 flex max-w-[calc(100%-4.5rem)] items-center gap-1 rounded-2xl bg-surface py-1 pr-1 pl-3 shadow-float">
            <p className="min-w-0 flex-1 text-[13px] font-medium">{t('places.movePrompt', { name: moving.name })}</p>
            <button type="button" aria-label={t('common.cancel')} onClick={cancelMove} className="flex size-10 shrink-0 items-center justify-center text-muted">
              <X size={18} aria-hidden />
            </button>
          </div>
        )}
        {draft && (
          <DraftCard
            draft={draft}
            action={moving ? t('places.saveMove') : t('common.add')}
            busy={move.isPending}
            onAction={() => (moving ? saveMove() : setForm({ draft }))}
            onDismiss={moving ? undefined : dropDraft}
          />
        )}
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

      {!moving && (
        <Fab
          label={t('places.add')}
          onClick={() => {
            toTop()
            searchInput.current?.focus()
          }}
        />
      )}

      {opened && (
        <PlaceSheet
          place={opened}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setOpenId(null)
            setForm({ place: opened })
          }}
          onMove={() => startMove(opened)}
          onVisit={() => {
            setOpenId(null)
            setVisiting(opened)
          }}
        />
      )}

      {form && (
        <PlaceForm
          {...form}
          onClose={() => setForm(null)}
          onAdded={() => {
            setForm(null)
            dropDraft()
            setTab('want')
            setKind(null)
          }}
        />
      )}

      {visiting && <VisitSheet place={visiting} onClose={() => setVisiting(null)} />}
    </div>
  )
}

/**
 * Поиск по адресам и названиям. Запрос уходит по кнопке, а не по вводу:
 * условие публичного геокодера, и незачем слать ему каждую букву.
 */
function PlaceSearch({
  inputRef,
  near,
  onPick,
}: {
  inputRef: Ref<HTMLInputElement>
  near: () => Bounds | null
  onPick: (hit: GeoHit) => void
}) {
  const t = useT()
  const { lang } = useLang()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [hits, setHits] = useState<GeoHit[] | null>(null)
  const current = useRef<AbortController | null>(null)

  useEffect(() => () => current.current?.abort(), [])

  const reset = () => {
    current.current?.abort()
    setBusy(false)
    setFailed(false)
    setHits(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const text = query.trim()
    if (text.length < 2) return
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    reset()
    const control = new AbortController()
    current.current = control
    setBusy(true)
    try {
      const found = await searchPlaces(text, lang, near(), control.signal)
      if (!control.signal.aborted) setHits(found)
    } catch {
      if (!control.signal.aborted) setFailed(true)
    } finally {
      if (!control.signal.aborted) setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={(e) => void submit(e)} role="search" className="flex items-center gap-2">
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
      {hits?.length === 0 && <p className="px-1 text-sm text-muted">{t('places.searchEmpty')}</p>}
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
      <p className="px-1 text-[12px] text-muted">{t('places.mapHint')}</p>
    </div>
  )
}

function DraftCard({
  draft,
  action,
  busy,
  onAction,
  onDismiss,
}: {
  draft: Draft
  action: string
  busy: boolean
  onAction: () => void
  onDismiss: (() => void) | undefined
}) {
  const t = useT()
  const title = draft.name || draft.address || `${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}`
  return (
    <div className="absolute inset-x-2 bottom-6 z-10 flex items-center gap-2 rounded-2xl bg-surface py-2 pr-2 pl-3 shadow-float">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold">
          {draft.looking && <LoaderCircle size={14} aria-label={t('common.loading')} className="shrink-0 animate-spin text-muted" />}
          <span className="truncate">{title}</span>
        </p>
        {draft.name && draft.address && <p className="truncate text-[12px] text-muted">{draft.address}</p>}
      </div>
      <Button loading={busy} disabled={draft.looking} onClick={onAction} className="min-h-11 shrink-0 px-4 text-[15px]">
        {action}
      </Button>
      {onDismiss && (
        <button type="button" aria-label={t('common.cancel')} onClick={onDismiss} className="flex size-11 shrink-0 items-center justify-center text-muted">
          <X size={18} aria-hidden />
        </button>
      )}
    </div>
  )
}

function PlaceSheet({
  place,
  onClose,
  onEdit,
  onMove,
  onVisit,
}: {
  place: Place
  onClose: () => void
  onEdit: () => void
  onMove: () => void
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
          <ListRow onClick={onMove} icon={Move} tone="slate" title={t('places.move')} />
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

function PlaceForm(props: ({ draft: Draft } | { place: Place }) & { onClose: () => void; onAdded: () => void }) {
  const t = useT()
  const add = useAddPlace()
  const edit = useEditPlace()
  const start = 'place' in props ? props.place : props.draft
  const [name, setName] = useState(start.name)
  const [kind, setKind] = useState<PlaceKind>(start.kind)
  const [note, setNote] = useState('place' in props ? (props.place.note ?? '') : '')
  const [error, setError] = useState<string | null>(null)
  const fail = (e: Error) => setError(e.message)

  const submit = () => {
    setError(null)
    if ('place' in props) {
      edit.mutate({ id: props.place.id, name, kind, note }, { onSuccess: props.onClose, onError: fail })
      return
    }
    const { lat, lng, address } = props.draft
    add.mutate({ lat, lng, address, name, kind, note }, { onSuccess: props.onAdded, onError: fail })
  }

  return (
    <Sheet open onClose={props.onClose} title={'place' in props ? t('common.edit') : t('places.add')}>
      <div className="flex flex-col gap-4">
        {start.address && (
          <p className="flex items-start gap-2 text-sm text-muted">
            <MapPin size={16} aria-hidden className="mt-0.5 shrink-0" />
            {start.address}
          </p>
        )}
        <Field
          label={t('places.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('places.namePlaceholder')}
          maxLength={NAME_MAX}
          autoFocus={start.name === ''}
        />
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
        <Button loading={add.isPending || edit.isPending} disabled={name.trim() === ''} onClick={submit}>
          {t('common.save')}
        </Button>
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
