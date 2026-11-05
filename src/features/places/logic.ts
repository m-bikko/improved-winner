/**
 * Чистая логика мест: виды, разбор ответов геокодера, ссылки на карту.
 *
 * Без DOM и без сети: проверка `check-places` гоняет это под Node
 * на настоящих формах ответа Nominatim.
 */

export const PLACE_KINDS = ['food', 'nature', 'culture', 'fun', 'trip', 'other'] as const
export type PlaceKind = (typeof PLACE_KINDS)[number]

export function isPlaceKind(value: string): value is PlaceKind {
  return (PLACE_KINDS as readonly string[]).includes(value)
}

export type Point = { lat: number; lng: number }

export type Place = Point & {
  id: string
  name: string
  kind: PlaceKind
  note: string | null
  address: string | null
  visitedOn: string | null
  memoryId: string | null
  createdBy: string
  createdAt: string
}

/** Что нашёл геокодер. Названия может не быть: у точки на улице его нет. */
export type GeoHit = Point & { name: string; address: string | null; kind: PlaceKind }

/** Те же границы, что в CHECK таблицы: длиннее база не примет. */
export const NAME_MAX = 120
export const NOTE_MAX = 500
export const ADDRESS_MAX = 300

/**
 * Одна ли это точка - до пятого знака, как уникальный индекс в базе.
 * Нужно, чтобы результат поиска вёл в уже добавленное место, а не в ошибку.
 */
export function samePoint(a: Point, b: Point): boolean {
  return a.lat.toFixed(5) === b.lat.toFixed(5) && a.lng.toFixed(5) === b.lng.toFixed(5)
}

const FOOD = new Set(['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'food_court', 'ice_cream', 'biergarten', 'bakery', 'confectionery', 'coffee', 'tea'])
const CULTURE = new Set(['museum', 'gallery', 'artwork', 'attraction', 'theatre', 'arts_centre', 'library', 'planetarium', 'place_of_worship', 'monument', 'memorial'])
const FUN = new Set(['cinema', 'nightclub', 'casino', 'theme_park', 'zoo', 'aquarium', 'water_park', 'amusement_arcade', 'bowling_alley', 'ice_rink', 'sports_centre', 'stadium'])
const NATURE = new Set(['park', 'garden', 'nature_reserve', 'viewpoint', 'picnic_site', 'beach_resort'])
const TRIP = new Set(['hotel', 'hostel', 'guest_house', 'motel', 'chalet', 'camp_site', 'alpine_hut', 'city', 'town', 'village', 'country', 'state', 'region', 'province', 'island', 'administrative'])

/**
 * Вид по тегам OSM. Только значение по умолчанию: человек видит его в форме
 * и меняет одним нажатием, поэтому точность тут важнее полноты, и всё
 * неочевидное честно уходит в «другое».
 */
export function kindFromOsm(category: string | null, type: string | null): PlaceKind {
  if (category === 'natural') return 'nature'
  if (category === 'historic') return 'culture'
  if (type === null) return 'other'
  if (FOOD.has(type)) return 'food'
  if (NATURE.has(type)) return 'nature'
  if (FUN.has(type)) return 'fun'
  if (CULTURE.has(type)) return 'culture'
  if (TRIP.has(type)) return 'trip'
  return 'other'
}

function text(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Один ответ Nominatim в наш вид. Всё проверяется: это чужой сервер, и его
 * ответ - данные, а не обещание. Без координат результат бесполезен: null.
 *
 * Адрес приходит строкой, которая начинается с названия:
 * «Кок-Тобе, Медеуский район, Алматы». Название в адресе отрезается, иначе
 * в списке оно стояло бы дважды подряд.
 */
export function readHit(raw: unknown): GeoHit | null {
  if (!isRecord(raw)) return null
  const lat = Number(text(raw, 'lat'))
  const lng = Number(text(raw, 'lon'))
  if (text(raw, 'lat') === null || text(raw, 'lon') === null) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null

  const name = text(raw, 'name') ?? ''
  const display = text(raw, 'display_name')
  const address = display !== null && name !== '' && display.startsWith(name) ? display.slice(name.length).replace(/^[,\s]+/, '') : display

  return {
    lat,
    lng,
    name: name.slice(0, NAME_MAX),
    address: address ? address.slice(0, ADDRESS_MAX) : null,
    kind: kindFromOsm(text(raw, 'category'), text(raw, 'type')),
  }
}

export function readHits(raw: unknown): GeoHit[] {
  if (!Array.isArray(raw)) return []
  return raw.map(readHit).filter((h): h is GeoHit => h !== null)
}

/**
 * Название для найденного адреса, у которого своего нет: первая часть адреса,
 * а если это номер дома - вместе с улицей. Искали словами, так что подписать
 * результат есть чем; точку с карты так не называем - там человек назовёт сам.
 */
export function guessName(hit: GeoHit): string {
  if (hit.name !== '') return hit.name
  const [first = '', second] = (hit.address ?? '').split(', ')
  const label = /^\d/.test(first) && second ? `${second}, ${first}` : first
  return label.slice(0, NAME_MAX)
}

export type Bounds = { west: number; south: number; east: number; north: number }

/** Город на экране: как называется и где кончается. Границы могут ещё не прийти. */
export type MapCity = { name: string; bounds: Bounds | null }

export function contains(bounds: Bounds, { lat, lng }: Point): boolean {
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east
}

/** boundingbox Nominatim: строки в порядке юг, север, запад, восток. */
export function readBounds(raw: unknown): Bounds | null {
  if (!isRecord(raw) || !Array.isArray(raw.boundingbox) || raw.boundingbox.length !== 4) return null
  const [south, north, west, east] = raw.boundingbox.map(Number) as [number, number, number, number]
  if (![south, north, west, east].every(Number.isFinite) || south >= north || west >= east) return null
  return { west, south, east, north }
}

/**
 * Название города из обратного геокодирования. Не поле name: внутри города оно
 * называет район, а нужен именно город. В открытой степи города нет - тогда
 * ближайшее, что есть: район, область.
 */
export function readCityName(raw: unknown): string | null {
  if (!isRecord(raw) || !isRecord(raw.address)) return null
  for (const key of ['city', 'town', 'village', 'municipality', 'county', 'state', 'country']) {
    const value = text(raw.address, key)
    if (value) return value
  }
  return null
}

/** Город из поиска: название, точка и границы. */
export function readCityHit(raw: unknown): (Point & { name: string; label: string; bounds: Bounds | null }) | null {
  const hit = readHit(raw)
  if (!hit) return null
  const name = hit.name || guessName(hit)
  return { lat: hit.lat, lng: hit.lng, name, label: hit.address ?? '', bounds: readBounds(raw) }
}

/**
 * Города для быстрого выбора. Координаты сверены по Nominatim. Названия в словаре,
 * а не здесь: у них есть формы на трёх языках (Өскемен, Oskemen, Усть-Каменогорск).
 * Остальной мир - поиском в той же шторке.
 */
export const CITIES = [
  { id: 'almaty', lat: 43.2364, lng: 76.9457 },
  { id: 'astana', lat: 51.1283, lng: 71.4305 },
  { id: 'shymkent', lat: 42.3147, lng: 69.5883 },
  { id: 'aktobe', lat: 50.2837, lng: 57.2298 },
  { id: 'karaganda', lat: 49.8422, lng: 73.1063 },
  { id: 'taraz', lat: 42.9016, lng: 71.3769 },
  { id: 'pavlodar', lat: 52.2858, lng: 76.9455 },
  { id: 'oskemen', lat: 49.9484, lng: 82.6275 },
  { id: 'semey', lat: 50.4044, lng: 80.2497 },
  { id: 'atyrau', lat: 47.1067, lng: 51.9139 },
  { id: 'kostanay', lat: 53.2147, lng: 63.6326 },
  { id: 'kyzylorda', lat: 44.8427, lng: 65.5036 },
  { id: 'oral', lat: 51.2041, lng: 51.3708 },
  { id: 'petropavl', lat: 54.8668, lng: 69.1335 },
  { id: 'aktau', lat: 43.6353, lng: 51.1682 },
  { id: 'turkistan', lat: 43.3019, lng: 68.2704 },
  { id: 'kokshetau', lat: 53.2852, lng: 69.3815 },
  { id: 'taldykorgan', lat: 45.0177, lng: 78.382 },
] as const

export const CITY_IDS = CITIES.map((c) => c.id)

export function osmViewUrl({ lat, lng }: Point): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
}

/** Маршрут до точки: откуда - спросит сам сайт. */
export function osmRouteUrl({ lat, lng }: Point): string {
  return `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}`
}
