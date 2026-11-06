/**
 * Порядок записей в дневнике при перетаскивании.
 *
 *   pnpm tsx scripts/check-reorder.ts
 *
 * Поломка здесь молчаливая: запись просто остаётся на месте, и выглядит это как
 * «не попал пальцем». Так и было: сверху вниз запись вставлялась ПЕРЕД целью, поэтому
 * сдвинуть её вниз на одну строку или поставить последней в приёме было нельзя.
 */
import { moveEntry } from '../src/features/diary/reorder.ts'
import type { DiaryEntry, Meal } from '../src/features/diary/types.ts'

let failed = 0

const entry = (id: string, meal: Meal): DiaryEntry => ({
  id,
  userId: 'u',
  date: '2026-11-06',
  meal,
  foodId: null,
  grams: 100,
  name: id,
  brand: null,
  servingLabel: null,
  kcal100: 0,
  protein100: 0,
  fat100: 0,
  carbs100: 0,
  kcal: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
  sortOrder: 0,
  createdBy: null,
})

const day = [entry('a', 'breakfast'), entry('b', 'breakfast'), entry('c', 'breakfast'), entry('d', 'lunch'), entry('e', 'lunch')]

const CASES: { note: string; active: string; over: string; order: string; meal?: [string, Meal] }[] = [
  { note: 'вниз на одну строку', active: 'b', over: 'c', order: 'a c b d e' },
  { note: 'вниз на две строки', active: 'a', over: 'c', order: 'b c a d e' },
  { note: 'вверх на одну строку', active: 'b', over: 'a', order: 'b a c d e' },
  { note: 'вверх на две строки', active: 'c', over: 'a', order: 'c a b d e' },
  { note: 'на себя: ничего не меняется', active: 'b', over: 'b', order: 'a b c d e' },
  { note: 'в другой приём сверху: перед целью', active: 'b', over: 'd', order: 'a c b d e', meal: ['b', 'lunch'] },
  { note: 'в другой приём снизу: перед целью', active: 'd', over: 'b', order: 'a d b c e', meal: ['d', 'breakfast'] },
  { note: 'в приём целиком: в его конец', active: 'a', over: 'lunch', order: 'b c d e a', meal: ['a', 'lunch'] },
  { note: 'в свой же приём: ничего не меняется', active: 'a', over: 'breakfast', order: 'a b c d e' },
  { note: 'в пустой приём: на своё место в дне', active: 'a', over: 'dinner', order: 'b c d e a', meal: ['a', 'dinner'] },
]

for (const c of CASES) {
  const next = moveEntry(day, c.active, c.over)
  const order = next.map((e) => e.id).join(' ')
  const mealOk = c.meal ? next.find((e) => e.id === c.meal?.[0])?.meal === c.meal[1] : true
  const ok = order === c.order && mealOk
  if (!ok) failed++
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${c.note}${ok ? '' : `: ${order}, ждали ${c.order}`}`)
}

// Два одинаковых шага подряд: запись не должна качаться туда-обратно
const once = moveEntry(day, 'b', 'c')
const settled = moveEntry(once, 'b', 'b')
const stable = settled.map((e) => e.id).join(' ') === 'a c b d e'
if (!stable) failed++
console.log(`  ${stable ? 'OK  ' : 'FAIL'} после шага цель на себе: порядок держится`)

if (failed > 0) {
  console.error(`\n${failed} кейсов упало`)
  process.exit(1)
}
console.log('\nПорядок записей считается верно.')
