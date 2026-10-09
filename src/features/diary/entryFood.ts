import { Cookie, Moon, Sun, Sunrise, type LucideIcon } from 'lucide-react'
import type { Food } from '@/features/foods/types'
import type { Tone } from '@/ui/tones'
import type { DiaryEntry, Meal } from './types'

/** Значок и цвет приёма пищи - общие для дневника пары и экрана повара. */
export const MEAL_ICON: Record<Meal, { icon: LucideIcon; tone: Tone }> = {
  breakfast: { icon: Sunrise, tone: 'amber' },
  lunch: { icon: Sun, tone: 'orange' },
  dinner: { icon: Moon, tone: 'indigo' },
  snack: { icon: Cookie, tone: 'plum' },
}

/** Заархивированный продукт восстанавливаем из снимка записи. */
export function entryAsFood(entry: DiaryEntry): Food {
  return {
    id: entry.foodId ?? entry.id,
    kind: 'product',
    name: entry.name,
    brand: entry.brand,
    nameNorm: entry.name.toLowerCase(),
    kcal100: entry.kcal100,
    protein100: entry.protein100,
    fat100: entry.fat100,
    carbs100: entry.carbs100,
    yieldGrams: null,
    ingredientsCount: 0,
    ingredientsGrams: 0,
    // Снимок записи фотографию не хранит: она живёт в справочнике, а запись
    // должна оставаться читаемой и без него
    imagePath: null,
    // У снимка кода нет и быть не может: он восстанавливается из записи
    // дневника, а не из карточки продукта
    barcode: null,
    createdBy: null,
  }
}

