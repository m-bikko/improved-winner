import type { Lang } from '@/lib/i18n/lang'
import { guessName, readHit, readHits, type GeoHit, type Point } from './logic'

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

export type Bounds = { west: number; south: number; east: number; north: number }

const searches = new Map<string, GeoHit[]>()

/**
 * Поиск по словам. `near` - что сейчас на карте: результаты оттуда идут
 * выше, но поиск им не ограничен, иначе из Алматы не найти Бали.
 */
export async function searchPlaces(query: string, lang: Lang, near: Bounds | null, signal: AbortSignal): Promise<GeoHit[]> {
  const key = `${lang}|${near ? [near.west, near.south, near.east, near.north].map((n) => n.toFixed(1)).join() : ''}|${query}`
  const known = searches.get(key)
  if (known) return known

  const params = new URLSearchParams({ format: 'jsonv2', limit: '6', q: query, 'accept-language': languages(lang) })
  if (near) params.set('viewbox', `${near.west},${near.north},${near.east},${near.south}`)
  const hits = readHits(await request('search', params, signal)).map((h) => ({ ...h, name: guessName(h) }))
  searches.set(key, hits)
  return hits
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
