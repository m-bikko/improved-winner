/**
 * Состав тела.
 *
 * Всё, что даёт биоимпеданс, и границы, с которыми эти числа сравнивают.
 *
 * Два правила, которым подчинён весь файл.
 *
 * Первое: килограммы считаются, а не хранятся. Прибор измеряет вес
 * и сопротивление; проценты он выводит по своей модели, а килограммы - из
 * процентов и веса. Хранить их значило бы держать третью копию одного числа.
 *
 * Второе: границы здесь - ориентиры, а не диагнозы. Шкалы биоимпеданса
 * у разных производителей расходятся на единицы процентов, и одно и то же тело
 * на двух приборах попадает в разные полосы. Поэтому подписи осторожные,
 * а сравнивать имеет смысл прежде всего с собой месяц назад - для этого
 * и считается тренд.
 */
import type { Sex } from './nutrition'

export type Composition = {
  weightKg: number
  bodyFatPct: number | null
  musclePct: number | null
  skeletalMusclePct: number | null
  waterPct: number | null
  visceral: number | null
  bmrKcal: number | null
}

/**
 * Полоса, в которую попало число. Порядок - от нехватки к избытку.
 *
 * Списком, а не объединением: по объединению нельзя пройтись во время работы,
 * а проверка перевода обязана перечислить все полосы и убедиться, что у каждой
 * есть подпись. Ключ собирается на лету - `dynamicKey('band', band)`.
 */
export const BANDS = ['low', 'healthy', 'high', 'veryHigh'] as const
export type Band = (typeof BANDS)[number]

/**
 * Чего не хватает для тренда состава.
 *
 * Эти строки возвращает функция в базе, и возвращает она не «почему»,
 * а готовый ключ словаря - как `gap` у измеренного расхода. Список живёт
 * здесь, а не рядом с компонентом, по той же причине, что и всё остальное
 * в этом файле: компонент тянет за собой клиент Supabase, а проверке
 * перевода нужен только список.
 */
export const BODY_GAPS = ['body.none', 'body.fewMeasures', 'body.shortSpan'] as const
export type BodyGap = (typeof BODY_GAPS)[number]

/** Килограммы из процента. null - процента нет, и считать нечего. */
export function partKg(weightKg: number, pct: number | null): number | null {
  if (pct === null) return null
  return Math.round(weightKg * pct) / 100
}

/**
 * Тощая масса: всё, что не жир.
 *
 * Именно к ней привязывают норму белка - жировая ткань в его потреблении
 * почти не участвует. При 29 % жира разница с расчётом по общему весу
 * составляет около двадцати граммов в день, и это не округление.
 */
export function leanKg(weightKg: number, bodyFatPct: number | null): number | null {
  if (bodyFatPct === null) return null
  return Math.round(weightKg * (100 - bodyFatPct)) / 100
}

/** Индекс массы тела. Для полноты картины, а не как показатель сам по себе. */
export function bmi(weightKg: number, heightCm: number | null): number | null {
  if (!heightCm || heightCm < 50) return null
  const m = heightCm / 100
  return Math.round((weightKg / (m * m)) * 10) / 10
}

/**
 * Полоса для процента жира.
 *
 * Ориентиры распространённые, мужские и женские разные: у женщин
 * физиологическая доля жира выше, и общая шкала для обоих полов
 * систематически врёт одному из них.
 *
 * Пол неизвестен - полосы нет. Показывать одну шкалу «на всякий случай»
 * хуже, чем не показывать ничего.
 */
export function fatBand(pct: number, sex: Sex | null): Band | null {
  if (sex === null) return null
  if (sex === 'male') {
    if (pct < 8) return 'low'
    if (pct < 20) return 'healthy'
    if (pct < 25) return 'high'
    return 'veryHigh'
  }
  if (pct < 21) return 'low'
  if (pct < 33) return 'healthy'
  if (pct < 39) return 'high'
  return 'veryHigh'
}

/**
 * Полоса для висцерального жира.
 *
 * Это индекс, а не килограммы: безразмерная шкала прибора. Одинаковая
 * для обоих полов - так её и публикуют производители.
 */
export function visceralBand(value: number): Band {
  if (value < 10) return 'healthy'
  if (value < 15) return 'high'
  return 'veryHigh'
}

/** Полоса для воды. Низкая - повод пить больше, и только. */
export function waterBand(pct: number, sex: Sex | null): Band | null {
  if (sex === null) return null
  const min = sex === 'male' ? 50 : 45
  const max = sex === 'male' ? 65 : 60
  if (pct < min) return 'low'
  if (pct > max) return 'high'
  return 'healthy'
}

/**
 * Что показывать рядом с числом и каким цветом.
 *
 * `low` у воды и у жира означают разное по смыслу, но одинаковое по действию:
 * это повод посмотреть внимательнее, а не повод для тревоги. Красным
 * отмечается только `veryHigh`.
 */
export function bandTone(band: Band): 'ok' | 'warn' | 'danger' {
  if (band === 'healthy') return 'ok'
  if (band === 'veryHigh') return 'danger'
  return 'warn'
}
