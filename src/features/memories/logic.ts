import type { Memory } from './api'

/**
 * «В этот день»: воспоминания с тем же числом и месяцем в прошлые годы.
 *
 * 29 февраля в невисокосный год не всплывает - честнее промолчать, чем
 * показать его первого марта как «в этот день».
 */
export function onThisDay(memories: readonly Memory[], today: string): { memory: Memory; yearsAgo: number }[] {
  const md = today.slice(5)
  const year = Number(today.slice(0, 4))
  return memories
    .filter((m) => m.happenedOn.slice(5) === md && Number(m.happenedOn.slice(0, 4)) < year)
    .map((memory) => ({ memory, yearsAgo: year - Number(memory.happenedOn.slice(0, 4)) }))
    .sort((a, b) => a.yearsAgo - b.yearsAgo)
}

/** Лента по месяцам - в том порядке, в каком воспоминания уже отсортированы. */
export function byMonth(memories: readonly Memory[]): { month: string; items: Memory[] }[] {
  const groups: { month: string; items: Memory[] }[] = []
  for (const m of memories) {
    const month = m.happenedOn.slice(0, 7)
    const last = groups[groups.length - 1]
    if (last && last.month === month) last.items.push(m)
    else groups.push({ month, items: [m] })
  }
  return groups
}

export type Mosaic = 'one' | 'two' | 'three' | 'grid'

export function mosaicOf(count: number): Mosaic {
  if (count <= 1) return 'one'
  if (count === 2) return 'two'
  if (count === 3) return 'three'
  return 'grid'
}

/**
 * Пропорции одиночного снимка в ленте: как есть, но в рамках 4:5 - 16:9.
 * Вертикальная панорама иначе заняла бы три экрана, горизонтальная -
 * полоску в палец.
 */
export function singleAspect(width: number, height: number): number {
  return Math.min(Math.max(width / Math.max(height, 1), 4 / 5), 16 / 9)
}

/** Сколько ещё фото можно добавить: потолок держит и база (memory_photos_limit). */
export const MAX_PHOTOS = 12
