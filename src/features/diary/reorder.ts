import { MEALS, type DiaryEntry, type Meal } from './types'

function isMeal(value: string): value is Meal {
  return (MEALS as readonly string[]).includes(value)
}

/**
 * Переставляет запись в плоском списке дня.
 *
 * Список плоский, а приём пищи — свойство записи, поэтому одна и та же операция
 * покрывает и перенос между приёмами, и смену порядка внутри одного. Порядок
 * секций на экране получается фильтрацией того же списка, так что двигать
 * достаточно его.
 *
 * `overId` приходит от dnd-kit и бывает двух видов: id другой записи или
 * название приёма пищи, когда бросают в пустую секцию.
 */
export function moveEntry(
  entries: readonly DiaryEntry[],
  activeId: string,
  overId: string,
): DiaryEntry[] {
  const from = entries.findIndex((e) => e.id === activeId)
  const active = entries[from]
  if (!active) return [...entries]

  const rest = [...entries.slice(0, from), ...entries.slice(from + 1)]

  if (isMeal(overId)) {
    if (active.meal === overId) return [...entries]
    rest.splice(endOfMeal(rest, overId), 0, { ...active, meal: overId })
    return rest
  }

  const to = rest.findIndex((e) => e.id === overId)
  const target = rest[to]
  if (!target) return [...entries]

  rest.splice(to, 0, { ...active, meal: target.meal })
  return rest
}

/**
 * Куда вставить запись, брошенную в пустую секцию.
 *
 * Если в приёме уже что-то есть — после последней его записи. Если пусто, то
 * позиция определяется порядком приёмов пищи: иначе перенос в пустой ужин
 * поставил бы запись в начало списка, и она визуально прыгнула бы в завтрак.
 */
function endOfMeal(entries: readonly DiaryEntry[], meal: Meal): number {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]?.meal === meal) return i + 1
  }

  const rank = MEALS.indexOf(meal)
  const laterIndex = entries.findIndex((e) => MEALS.indexOf(e.meal) > rank)
  return laterIndex === -1 ? entries.length : laterIndex
}

export type ReorderUpdate = { id: string; meal: Meal; sortOrder: number }

/**
 * Что именно изменилось: только те записи, у которых поехал приём пищи или
 * позиция. Отправлять весь день целиком значило бы переписать updated_at
 * у строк, которых человек не трогал.
 */
export function diffOrder(
  before: readonly DiaryEntry[],
  after: readonly DiaryEntry[],
): ReorderUpdate[] {
  const previous = new Map(before.map((e) => [e.id, e]))
  const counters: Record<Meal, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }
  const updates: ReorderUpdate[] = []

  for (const entry of after) {
    const sortOrder = counters[entry.meal]++
    const old = previous.get(entry.id)
    if (!old) continue
    if (old.meal !== entry.meal || old.sortOrder !== sortOrder) {
      updates.push({ id: entry.id, meal: entry.meal, sortOrder })
    }
  }
  return updates
}
