/**
 * Недели беременности (от первого дня последней менструации, как считают
 * акушеры) и вехи визитов. Тексты - в словарях: `preg.size|baby|mom|partner.<неделя>`
 * и `preg.cp|cpHint.<id>`; полноту проверяет check-i18n.
 *
 * Длина до 19 недели - от темени до копчика, с 20-й - до пяток (так её
 * и меряют), поэтому на 20-й скачок. Вес до 8 недели не указывают.
 * Это средние из распространённых справочников, а не норма для конкретного
 * малыша, - экран так и говорит.
 */
export type WeekInfo = { week: number; lengthCm: number | null; weightG: number | null }

export const WEEKS: readonly WeekInfo[] = [
  { week: 4, lengthCm: 0.1, weightG: null },
  { week: 5, lengthCm: 0.2, weightG: null },
  { week: 6, lengthCm: 0.5, weightG: null },
  { week: 7, lengthCm: 1.0, weightG: null },
  { week: 8, lengthCm: 1.6, weightG: 1 },
  { week: 9, lengthCm: 2.3, weightG: 2 },
  { week: 10, lengthCm: 3.1, weightG: 4 },
  { week: 11, lengthCm: 4.1, weightG: 7 },
  { week: 12, lengthCm: 5.4, weightG: 14 },
  { week: 13, lengthCm: 7.4, weightG: 23 },
  { week: 14, lengthCm: 8.7, weightG: 43 },
  { week: 15, lengthCm: 10.1, weightG: 70 },
  { week: 16, lengthCm: 11.6, weightG: 100 },
  { week: 17, lengthCm: 13.0, weightG: 140 },
  { week: 18, lengthCm: 14.2, weightG: 190 },
  { week: 19, lengthCm: 15.3, weightG: 240 },
  { week: 20, lengthCm: 25.6, weightG: 300 },
  { week: 21, lengthCm: 26.7, weightG: 360 },
  { week: 22, lengthCm: 27.8, weightG: 430 },
  { week: 23, lengthCm: 28.9, weightG: 500 },
  { week: 24, lengthCm: 30.0, weightG: 600 },
  { week: 25, lengthCm: 34.6, weightG: 660 },
  { week: 26, lengthCm: 35.6, weightG: 760 },
  { week: 27, lengthCm: 36.6, weightG: 875 },
  { week: 28, lengthCm: 37.6, weightG: 1000 },
  { week: 29, lengthCm: 38.6, weightG: 1150 },
  { week: 30, lengthCm: 39.9, weightG: 1300 },
  { week: 31, lengthCm: 41.1, weightG: 1500 },
  { week: 32, lengthCm: 42.4, weightG: 1700 },
  { week: 33, lengthCm: 43.7, weightG: 1900 },
  { week: 34, lengthCm: 45.0, weightG: 2150 },
  { week: 35, lengthCm: 46.2, weightG: 2400 },
  { week: 36, lengthCm: 47.4, weightG: 2600 },
  { week: 37, lengthCm: 48.6, weightG: 2850 },
  { week: 38, lengthCm: 49.8, weightG: 3100 },
  { week: 39, lengthCm: 50.7, weightG: 3300 },
  { week: 40, lengthCm: 51.2, weightG: 3450 },
]

/** Вехи визитов: с какой по какую неделю. Сроки уточняет врач - экран говорит это. */
export const CHECKPOINTS: readonly { id: string; fromWeek: number; toWeek: number }[] = [
  { id: 'first_visit', fromWeek: 6, toWeek: 12 },
  { id: 'first_screening', fromWeek: 11, toWeek: 13 },
  { id: 'second_screening', fromWeek: 18, toWeek: 21 },
  { id: 'glucose_test', fromWeek: 24, toWeek: 28 },
  { id: 'rh_antibodies', fromWeek: 28, toWeek: 30 },
  { id: 'maternity_leave', fromWeek: 29, toWeek: 30 },
  { id: 'third_ultrasound', fromWeek: 30, toWeek: 34 },
  { id: 'ctg', fromWeek: 32, toWeek: 40 },
  { id: 'birth_plan', fromWeek: 34, toWeek: 36 },
  { id: 'hospital_bag', fromWeek: 35, toWeek: 37 },
  { id: 'due_date', fromWeek: 40, toWeek: 40 },
  { id: 'post_term_check', fromWeek: 41, toWeek: 42 },
]
