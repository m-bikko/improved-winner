import type { Database } from '@/types/db'

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type Meal = (typeof MEALS)[number]

export type DiaryEntry = {
  id: string
  userId: string
  date: string
  meal: Meal
  foodId: string | null
  grams: number
  name: string
  brand: string | null
  servingLabel: string | null
  /** Снимок на 100 г - именно на 100 г, чтобы правка граммовки не врала. */
  kcal100: number
  protein100: number
  fat100: number
  carbs100: number
  /** Абсолютные значения за порцию, посчитаны базой. */
  kcal: number
  protein: number
  fat: number
  carbs: number
  sortOrder: number
  /** Кто внёс. Пусто у старых записей; не совпадает с userId - внёс повар. */
  createdBy: string | null
}

type Row = Database['public']['Tables']['diary_entries']['Row']

export function entryFromRow(row: Row): DiaryEntry {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    meal: row.meal as Meal,
    foodId: row.food_id,
    grams: row.grams,
    name: row.name_snapshot,
    brand: row.brand_snapshot,
    servingLabel: row.serving_label_snapshot,
    kcal100: row.kcal_100,
    protein100: row.protein_100,
    fat100: row.fat_100,
    carbs100: row.carbs_100,
    kcal: row.kcal ?? 0,
    protein: row.protein ?? 0,
    fat: row.fat ?? 0,
    carbs: row.carbs ?? 0,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
  }
}

export type Totals = { kcal: number; protein: number; fat: number; carbs: number }

export function sumEntries(entries: readonly DiaryEntry[]): Totals {
  const total = { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  for (const e of entries) {
    total.kcal += e.kcal
    total.protein += e.protein
    total.fat += e.fat
    total.carbs += e.carbs
  }
  return total
}
