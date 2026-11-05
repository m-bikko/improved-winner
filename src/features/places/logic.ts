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

export function osmViewUrl({ lat, lng }: Point): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
}

/** Маршрут до точки: откуда - спросит сам сайт. */
export function osmRouteUrl({ lat, lng }: Point): string {
  return `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}`
}
