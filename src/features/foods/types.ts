import type { Database } from '@/types/db'

export type FoodKind = 'product' | 'dish'

/**
 * Продукт или блюдо в том виде, в каком с ним работает приложение.
 *
 * Отдельно от сгенерированного типа вью, потому что Postgres не умеет выводить
 * NOT NULL через вью и помечает там nullable вообще всё. Тащить эти null через
 * все компоненты — значит писать `?? 0` в каждом расчёте КБЖУ. Инварианты
 * известны из схемы, поэтому проверяем их один раз на границе, в fromRow.
 */
export type Food = {
  id: string
  kind: FoodKind
  name: string
  brand: string | null
  nameNorm: string
  kcal100: number
  protein100: number
  fat100: number
  carbs100: number
  /** Только у блюд: готовый вес после приготовления. */
  yieldGrams: number | null
  ingredientsCount: number
  ingredientsGrams: number
}

export type Serving = {
  id: string
  foodId: string
  label: string
  grams: number
  sortOrder: number
}

type FoodRow = Database['public']['Views']['foods_v']['Row']
type ServingRow = Database['public']['Tables']['food_servings']['Row']

export function foodFromRow(row: FoodRow): Food {
  if (!row.id || !row.name || (row.kind !== 'product' && row.kind !== 'dish')) {
    throw new Error(`Строка foods_v повреждена: ${JSON.stringify(row)}`)
  }
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    brand: row.brand,
    nameNorm: row.name_norm ?? row.name.toLowerCase(),
    kcal100: row.kcal_100 ?? 0,
    protein100: row.protein_100 ?? 0,
    fat100: row.fat_100 ?? 0,
    carbs100: row.carbs_100 ?? 0,
    yieldGrams: row.yield_grams,
    ingredientsCount: row.ingredients_count ?? 0,
    ingredientsGrams: row.ingredients_grams ?? 0,
  }
}

export function servingFromRow(row: ServingRow): Serving {
  return {
    id: row.id,
    foodId: row.food_id,
    label: row.label,
    grams: row.grams,
    sortOrder: row.sort_order,
  }
}

/** КБЖУ конкретной порции. Одна формула на всё приложение. */
export function portionOf(food: Food, grams: number) {
  const k = grams / 100
  return {
    kcal: food.kcal100 * k,
    protein: food.protein100 * k,
    fat: food.fat100 * k,
    carbs: food.carbs100 * k,
  }
}
