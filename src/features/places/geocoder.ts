import type { Lang } from '@/lib/i18n/lang'
import {
  contains,
  guessName,
  readBounds,
  readCityHit,
  readCityName,
  readHit,
  readHits,
  type Bounds,
  type GeoHit,
  type MapCity,
  type Point,
} from './logic'

const BASE = 'https://nominatim.openstreetmap.org'

/**
 * Публичный Nominatim бесплатен на условиях: не чаще запроса в секунду
 * и без подсказок на лету. Поэтому поиск идёт по нажатию, а не по вводу,
 * запросы выстраиваются в очередь с запасом к секунде, а повторный
 * одинаковый запрос сеть не трогает.
 *
 * Запрос уходит напрямую из браузера: так серверу виден настоящий Referer,
 * которого политика и требует, а свой посредник не добавил бы ничего, кроме
 * ещё одного места, где может лежать история поисков.
 */
const MIN_GAP_MS = 1100
let nextSlot = 0

function waitForSlot(signal: AbortSignal): Promise<void> {
  const now = Date.now()
  const delay = Math.max(0, nextSlot - now)
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS
  if (delay === 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, delay)
    signal.addEventListener('abort', () => {
      clearTimeout(id)
      reject(signal.reason)
    }, { once: true })
  })
}

async function request(path: 'search' | 'reverse', params: URLSearchParams, signal: AbortSignal): Promise<unknown> {
  await waitForSlot(signal)
  const res = await fetch(`${BASE}/${path}?${params}`, { signal, referrerPolicy: 'strict-origin-when-cross-origin' })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  return res.json()
}

/** Сначала свой язык, дальше то, что на карте Казахстана подписано чаще всего. */
function languages(lang: Lang): string {
  return [...new Set([lang, 'ru', 'en'])].join(',')
}

/** Где искать: строго в этих границах или только предпочитая их. */
export type SearchArea = { bounds: Bounds; strict: boolean }

const searches = new Map<string, GeoHit[]>()

/**
 * Поиск по словам. Адрес ищут там, куда смотрят: «Абая 10» есть в каждом городе,
 * и без области поиска он вёл бы куда угодно. Поэтому область - город на экране,
 * а строгая: «ничего не нашлось» в этом городе честнее адреса в другом. Выйти за неё -
 * отдельная кнопка «Искать везде».
 */
export async function searchPlaces(query: string, lang: Lang, area: SearchArea | null, signal: AbortSignal): Promise<GeoHit[]> {
  const place = area ? [area.bounds.west, area.bounds.south, area.bounds.east, area.bounds.north].map((n) => n.toFixed(2)).join() : ''
  const key = `${lang}|${place}|${area?.strict ?? ''}|${query}`
  const known = searches.get(key)
  if (known) return known

  const params = new URLSearchParams({ format: 'jsonv2', limit: '6', q: query, 'accept-language': languages(lang) })
  if (area) {
    const { west, north, east, south } = area.bounds
    params.set('viewbox', `${west},${north},${east},${south}`)
    if (area.strict) params.set('bounded', '1')
  }
  const hits = readHits(await request('search', params, signal)).map((h) => ({ ...h, name: guessName(h) }))
  searches.set(key, hits)
  return hits
}

const cityBounds = new Map<string, Bounds | null>()

/** Границы города по названию. Запоминаются: они не меняются, а запрос небесплатен. */
export async function boundsOfCity(name: string, lang: Lang, signal: AbortSignal): Promise<Bounds | null> {
  const key = `${lang}|${name}`
  const known = cityBounds.get(key)
  if (known !== undefined) return known
  const params = new URLSearchParams({ format: 'jsonv2', limit: '1', q: name, featureType: 'city', 'accept-language': languages(lang) })
  const raw = await request('search', params, signal)
  const bounds = Array.isArray(raw) ? readBounds(raw[0]) : null
  cityBounds.set(key, bounds)
  return bounds
}

/**
 * Какой город на экране. Название отдаётся сразу, как только известно: границы - это
 * второй запрос с паузой, а ждать секунду ради подписи незачем. Если границы города
 * не накрывают точку, поиск пойдёт по видимой части карты.
 */
export async function cityAt(point: Point, lang: Lang, signal: AbortSignal, onName: (name: string) => void): Promise<MapCity | null> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(point.lat),
    lon: String(point.lng),
    zoom: '10',
    'accept-language': languages(lang),
  })
  const name = readCityName(await request('reverse', params, signal))
  if (!name) return null
  onName(name)
  const bounds = await boundsOfCity(name, lang, signal)
  return { name, bounds: bounds && contains(bounds, point) ? bounds : null }
}

/** Города по названию: для шторки выбора города. */
export async function findCities(query: string, lang: Lang, signal: AbortSignal) {
  const params = new URLSearchParams({ format: 'jsonv2', limit: '6', q: query, featureType: 'city', 'accept-language': languages(lang) })
  const raw = await request('search', params, signal)
  return (Array.isArray(raw) ? raw : []).flatMap((item) => {
    const hit = readCityHit(item)
    return hit ? [hit] : []
  })
}

/**
 * Что находится в точке. `zoom` карты задаёт подробность ответа: нажатие
 * на город при мелком масштабе должно дать город, а не случайный дом в нём.
 * null - ничего не нашлось, для открытого поля это обычный ответ.
 */
export async function reversePlace(point: Point, zoom: number, lang: Lang, signal: AbortSignal): Promise<GeoHit | null> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(point.lat),
    lon: String(point.lng),
    zoom: String(Math.min(18, Math.max(3, Math.round(zoom)))),
    'accept-language': languages(lang),
  })
  return readHit(await request('reverse', params, signal))
}
