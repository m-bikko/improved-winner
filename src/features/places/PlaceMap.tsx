import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import { LoaderCircle, LocateFixed, Maximize, Minus, Plus, type LucideIcon } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { toneVar } from '@/ui/tones'
import { KIND_LOOK } from './look'
import type { Bounds, Place, PlaceKind, Point } from './logic'

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
// Подпись обязательна по условиям OSM и должна оставаться видимой
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'

/** Пока мест нет, показывать нечего: страна целиком, дальше помогут поиск и «Где я». */
const START: L.LatLngTuple = [48, 68]
const START_ZOOM = 4
/** Мельче этого масштаба «рядом с тем, что на карте» для поиска уже ничего не значит. */
const NEAR_MIN_ZOOM = 6

// Рисунок 36×44, а цель нажатия шире: пальцем по булавке попадают не в самый центр
const PIN: { size: L.PointTuple; anchor: L.PointTuple } = { size: [44, 48], anchor: [22, 48] }
const ME: { size: L.PointTuple; anchor: L.PointTuple } = { size: [20, 20], anchor: [10, 10] }

const calm = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Что сейчас на экране: центр и масштаб. */
export type MapView = Point & { zoom: number }

export type MapHandle = {
  flyTo: (point: Point, zoom?: number) => void
  flyToBounds: (bounds: Bounds) => void
  /** Показать все эти точки разом. */
  fit: (points: readonly Point[]) => void
  /** Что сейчас на карте - для поиска; null, если масштаб слишком мелкий. */
  near: () => Bounds | null
  zoom: () => number
}

function fitPoints(map: L.Map, points: readonly Point[]): void {
  const [first] = points
  if (!first) return
  if (points.length === 1) {
    map.setView([first.lat, first.lng], Math.max(map.getZoom(), 14), { animate: !calm() })
    return
  }
  map.fitBounds(L.latLngBounds(points.map((p): L.LatLngTuple => [p.lat, p.lng])), {
    // Булавка стоит над своей точкой: без запаса верхние обрезались бы краем
    padding: [56, 56],
    maxZoom: 15,
    animate: !calm(),
  })
}

/**
 * Карта OpenStreetMap на Leaflet.
 *
 * Обёртка своя, а не react-leaflet: от него здесь нужны были бы три строки,
 * а зависимостью он тянет ещё один слой и привязку к версии React.
 *
 * Булавки рисует React порталом в элемент, который Leaflet считает значком.
 * Так у булавки те же иконки и токены темы, что у всего приложения, а двигает
 * её по-прежнему Leaflet: своё положение React в DOM не трогает.
 *
 * `isolate` на контейнере - не украшение: у слоёв Leaflet z-index до 1000,
 * и без своего слоя они вылезали бы поверх шапки и нижней панели.
 */
export function PlaceMap({
  places = [],
  ready = false,
  selectedId = null,
  draft,
  initial,
  compact = false,
  onTap,
  onPin,
  onMoved,
  onLocateFailed,
  ref,
  children,
}: {
  places?: readonly Place[]
  /** Места загружены: один раз показать их все, если показывать больше нечего. */
  ready?: boolean
  selectedId?: string | null
  draft: Point | null
  /** С чего начать вместо показа всех мест. */
  initial?: MapView | null
  /** Маленькая карта внутри формы: без кнопки «показать все». */
  compact?: boolean
  onTap: (point: Point) => void
  onPin?: (place: Place) => void
  /** Карту передвинули. Здесь узнают, какой город на экране. */
  onMoved?: (view: MapView) => void
  onLocateFailed: () => void
  ref: Ref<MapHandle>
  children?: ReactNode
}) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  const [me, setMe] = useState<Point | null>(null)
  const [locating, setLocating] = useState(false)
  const [noTiles, setNoTiles] = useState(false)

  const tap = useRef(onTap)
  const moved = useRef(onMoved)
  useEffect(() => {
    tap.current = onTap
    moved.current = onMoved
  })

  useEffect(() => {
    if (!box.current) return
    const still = calm()
    const created = L.map(box.current, {
      center: initial ? [initial.lat, initial.lng] : START,
      zoom: initial ? initial.zoom : START_ZOOM,
      minZoom: 2,
      zoomControl: false,
      worldCopyJump: true,
      zoomAnimation: !still,
      fadeAnimation: !still,
      markerZoomAnimation: !still,
    })
    created.attributionControl.setPrefix(false)
    // Referer тайловому серверу обязателен по его правилам, поэтому политика
    // задана явно, а не оставлена на усмотрение браузера
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION, referrerPolicy: 'strict-origin-when-cross-origin' })
      .on('tileerror', () => setNoTiles(true))
      .on('tileload', () => setNoTiles(false))
      .addTo(created)
    // wrap: за линией перемены дат долгота уходит за 180, а база такую не примет
    created.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng.wrap()
      tap.current({ lat, lng })
    })
    const report = () => {
      const { lat, lng } = created.getCenter().wrap()
      moved.current?.({ lat, lng, zoom: created.getZoom() })
    }
    created.on('moveend', report)
    // Первое «где я» - сразу: карта могла открыться уже на нужном городе
    report()
    // Сама карта слышит только окно, а её контейнер меняется и без него
    const resize = new ResizeObserver(() => created.invalidateSize())
    resize.observe(box.current)
    setMap(created)
    return () => {
      resize.disconnect()
      created.remove()
      setMap(null)
    }
    // Начальный вид читается один раз: дальше карту двигает сам человек
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (point, zoom) => {
        if (!map) return
        map.flyTo([point.lat, point.lng], zoom ?? Math.max(map.getZoom(), 15), { animate: !calm(), duration: 0.8 })
      },
      flyToBounds: ({ west, south, east, north }) => {
        map?.flyToBounds([[south, west], [north, east]], { maxZoom: 14, animate: !calm(), duration: 0.8 })
      },
      fit: (points) => {
        if (map) fitPoints(map, points)
      },
      near: () => {
        if (!map || map.getZoom() < NEAR_MIN_ZOOM) return null
        const b = map.getBounds()
        return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }
      },
      zoom: () => map?.getZoom() ?? START_ZOOM,
    }),
    [map],
  )

  // Первый показ - все места сразу, если не на чем больше остановиться: вернувшись,
  // человек ждёт увидеть карту там, где её оставил. Дальше её двигает он сам
  const shown = useRef(Boolean(initial))
  useEffect(() => {
    if (!map || !ready || shown.current) return
    shown.current = true
    fitPoints(map, places)
  }, [map, ready, places])

  const locate = () => {
    if (!navigator.geolocation) {
      onLocateFailed()
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false)
        const point = { lat: coords.latitude, lng: coords.longitude }
        setMe(point)
        map?.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 14), { animate: !calm(), duration: 0.8 })
      },
      () => {
        setLocating(false)
        onLocateFailed()
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  return (
    <div className={`relative isolate overflow-hidden rounded-3xl bg-raised shadow-card ${compact ? 'h-52' : 'h-[46dvh] min-h-80'}`}>
      <div ref={box} role="region" aria-label={t('nav.places')} className="places-map absolute inset-0 isolate" />

      {map &&
        places.map((p) => (
          <Marker key={p.id} map={map} point={p} look={PIN} title={p.name} front={p.id === selectedId} onTap={() => onPin?.(p)}>
            <Pin kind={p.kind} selected={p.id === selectedId} />
          </Marker>
        ))}
      {map && me && (
        <Marker map={map} point={me} look={ME} title={t('places.locate')}>
          <span className="block size-full rounded-full bg-tone-sky shadow-card ring-[3px] ring-surface" />
        </Marker>
      )}
      {map && draft && (
        <Marker map={map} point={draft} look={PIN} title={t('places.draftPin')} front>
          <DraftPin />
        </Marker>
      )}

      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
        <div className="flex flex-col overflow-hidden rounded-2xl bg-surface shadow-card">
          <MapButton icon={Plus} label={t('places.zoomIn')} onClick={() => map?.zoomIn()} />
          <MapButton icon={Minus} label={t('places.zoomOut')} onClick={() => map?.zoomOut()} />
        </div>
        <MapButton
          icon={locating ? LoaderCircle : LocateFixed}
          spin={locating}
          label={t('places.locate')}
          onClick={locate}
          className="rounded-2xl bg-surface shadow-card"
        />
        {!compact && places.length > 0 && (
          <MapButton
            icon={Maximize}
            label={t('places.fit')}
            onClick={() => {
              if (map) fitPoints(map, places)
            }}
            className="rounded-2xl bg-surface shadow-card"
          />
        )}
      </div>

      {noTiles && (
        <p className="absolute inset-x-2 bottom-7 z-[9] mr-14 rounded-2xl bg-surface px-3 py-2 text-[13px] text-muted shadow-card">
          {t('places.noTiles')}
        </p>
      )}

      {children}
    </div>
  )
}

function Marker({
  map,
  point,
  look,
  title,
  front = false,
  onTap,
  children,
}: {
  map: L.Map
  point: Point
  look: { size: L.PointTuple; anchor: L.PointTuple }
  title: string
  front?: boolean
  onTap?: (() => void) | undefined
  children: ReactNode
}) {
  const [holder] = useState(() => document.createElement('div'))
  const marker = useRef<L.Marker | null>(null)
  const interactive = onTap !== undefined
  const tap = useRef(onTap)
  useEffect(() => {
    tap.current = onTap
  })

  useEffect(() => {
    const created = L.marker([point.lat, point.lng], {
      icon: L.divIcon({ html: holder, className: 'place-pin', iconSize: look.size, iconAnchor: look.anchor }),
      title,
      interactive,
      keyboard: interactive,
    }).addTo(map)
    created.on('click', () => tap.current?.())
    marker.current = created
    return () => {
      created.remove()
      marker.current = null
    }
  }, [map, holder, point.lat, point.lng, look, title, interactive])

  useEffect(() => {
    marker.current?.setZIndexOffset(front ? 1000 : 0)
  }, [front, point.lat, point.lng, title])

  return createPortal(children, holder)
}

function PinShape({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 36 44" className="block size-full drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)]" aria-hidden>
      <path
        d="M18 1.5C9 1.5 1.5 8.8 1.5 18c0 11 16.5 24.5 16.5 24.5S34.5 29 34.5 18C34.5 8.8 27 1.5 18 1.5Z"
        fill={fill}
        stroke="var(--c-surface)"
        strokeWidth="2.5"
      />
    </svg>
  )
}

function Pin({ kind, selected }: { kind: PlaceKind; selected: boolean }) {
  const { icon: Icon, tone } = KIND_LOOK[kind]
  return (
    <span className={`absolute bottom-0 left-1 block h-11 w-9 origin-bottom transition-transform duration-200 ${selected ? 'scale-125' : ''}`}>
      <PinShape fill={toneVar(tone)} />
      <Icon size={16} strokeWidth={2.4} aria-hidden className="absolute top-[10px] left-[10px] text-surface" />
    </span>
  )
}

/** Точка, которой ещё нет в списке: акцентная, с пульсом у острия. */
function DraftPin() {
  return (
    <span className="absolute bottom-0 left-1 block h-11 w-9 origin-bottom scale-110">
      <span className="absolute bottom-0 left-1/2 size-5 -translate-x-1/2 translate-y-1/2 rounded-full bg-accent/40 motion-safe:animate-ping" />
      <PinShape fill="var(--c-accent)" />
      <Plus size={18} strokeWidth={2.8} aria-hidden className="absolute top-[9px] left-[9px] text-accent-ink" />
    </span>
  )
}

function MapButton({
  icon: Icon,
  label,
  onClick,
  spin = false,
  className = '',
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  spin?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex size-11 items-center justify-center text-ink transition-colors active:bg-raised ${className}`}
    >
      <Icon size={19} aria-hidden className={spin ? 'animate-spin' : ''} />
    </button>
  )
}
