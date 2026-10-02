import { Clapperboard, Film, Globe, Popcorn, Tv, type LucideIcon } from 'lucide-react'
import type { Tone } from '@/ui/tones'

export const WATCH_KINDS = ['movie', 'series', 'cartoon', 'documentary', 'other'] as const
export type WatchKind = (typeof WATCH_KINDS)[number]

export const KIND_ICON: Record<WatchKind, LucideIcon> = {
  movie: Film,
  series: Tv,
  cartoon: Clapperboard,
  documentary: Globe,
  other: Popcorn,
}

export const STATUSES = ['want', 'watching', 'watched'] as const
export type WatchStatus = (typeof STATUSES)[number]

export type Rating = { userId: string; stars: number; comment: string | null }

export type WatchItem = {
  id: string
  title: string
  kind: WatchKind
  year: number | null
  note: string | null
  status: WatchStatus
  watchedOn: string | null
  addedBy: string
  createdAt: string
  /** Кто хочет посмотреть. */
  wants: string[]
  /** Видимые оценки: своя и - если своя есть - второго. */
  ratings: Rating[]
  /** Кто оценил, без самих оценок: чтобы сказать «оценка ждёт твою». */
  ratedBy: string[]
}

export function bothWant(item: WatchItem, a: string, b: string): boolean {
  return b !== '' && item.wants.includes(a) && item.wants.includes(b)
}

/**
 * Кандидаты на «что смотрим сегодня»: из списка «хотим» - сначала то, что
 * хотят оба; если такого нет - всё, что хочет хоть кто-то.
 */
export function tonightPool(items: readonly WatchItem[], a: string, b: string): WatchItem[] {
  const want = items.filter((i) => i.status === 'want')
  const both = want.filter((i) => bothWant(i, a, b))
  return both.length > 0 ? both : want.filter((i) => i.wants.length > 0)
}

/**
 * Совпадение вкусов по фильмам, которые оценили оба: 100% - оценки
 * одинаковые, 0% - одна единица, другая пятёрка. null - сравнивать нечего.
 */
export function tasteMatch(items: readonly WatchItem[], a: string, b: string): number | null {
  const pairs = items
    .map((i) => [i.ratings.find((r) => r.userId === a), i.ratings.find((r) => r.userId === b)] as const)
    .filter((p): p is readonly [Rating, Rating] => p[0] !== undefined && p[1] !== undefined)
  if (pairs.length === 0) return null
  const score = pairs.reduce((s, [x, y]) => s + (1 - Math.abs(x.stars - y.stars) / 4), 0) / pairs.length
  return Math.round(score * 100)
}

/**
 * Пары тонов для «постера» - по названию, а не случайно: одна и та же
 * карточка на двух телефонах и после перезагрузки выглядит одинаково.
 * Тона из палитры приложения, а не произвольные цвета - постеры не спорят
 * с остальным экраном и сами перекрашиваются в тёмной теме.
 */
const POSTER_TONES: readonly (readonly [Tone, Tone])[] = [
  ['indigo', 'plum'],
  ['sky', 'violet'],
  ['rose', 'amber'],
  ['teal', 'green'],
  ['orange', 'rose'],
  ['violet', 'sky'],
  ['plum', 'orange'],
  ['green', 'sky'],
]

export function posterTones(title: string): readonly [Tone, Tone] {
  let h = 0
  for (const ch of title) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  return POSTER_TONES[h % POSTER_TONES.length] ?? ['indigo', 'plum']
}
