/**
 * Открытый справочник продуктов.
 *
 * Единственный внешний сервис во всём приложении, и обращение к нему
 * происходит ровно один раз на продукт: распознанный код сохраняется рядом
 * с записью, и в следующий раз продукт находится в своей базе - без сети
 * и без чужого сервера.
 *
 * Наружу уходит только сам код. Ни кто спрашивает, ни что он ест, ни когда -
 * ничего этого в запросе нет, и `fields` сужает ответ до четырёх чисел
 * и названия.
 *
 * Ответу не доверяем: данные в справочнике заполняют люди, и там встречается
 * и пустое, и явно неверное. Всё, что не проходит проверку на разумность,
 * отбрасывается - лучше пустое поле, чем «9000 ккал на 100 г», записанные
 * в дневник как факт.
 */

const ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product'

export type LookedUp = {
  name: string
  brand: string | null
  kcal100: number | null
  protein100: number | null
  fat100: number | null
  carbs100: number | null
}

/** Верхние границы те же, что в CHECK у таблицы: база всё равно не примет больше. */
function sane(value: unknown, max: number): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0 || n > max) return null
  return Math.round(n * 10) / 10
}

type Response = {
  status?: number
  product?: {
    product_name?: string
    product_name_ru?: string
    brands?: string
    nutriments?: Record<string, unknown>
  }
}

export async function lookupBarcode(code: string): Promise<LookedUp | null> {
  const fields = 'product_name,product_name_ru,brands,nutriments'
  const res = await fetch(`${ENDPOINT}/${code}.json?fields=${fields}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return null

  const body = (await res.json()) as Response
  const p = body.product
  if (!p) return null

  // Русское название предпочтительнее: продукты местные, и «Молоко 3.2%»
  // читается лучше, чем «Milk 3.2%»
  const name = (p.product_name_ru ?? p.product_name ?? '').trim()
  if (name === '') return null

  const n = p.nutriments ?? {}
  return {
    name,
    brand: (p.brands ?? '').split(',')[0]?.trim() || null,
    kcal100: sane(n['energy-kcal_100g'], 900),
    protein100: sane(n['proteins_100g'], 100),
    fat100: sane(n['fat_100g'], 100),
    carbs100: sane(n['carbohydrates_100g'], 100),
  }
}
