import { activeLocale } from '@/lib/i18n/lang'
import { diffDays, fromLocalISO, shiftDays } from '@/lib/date'

export const CURRENCIES = ['KZT', 'RUB', 'USD', 'EUR'] as const
export type Currency = (typeof CURRENCIES)[number]

export type Deposit = {
  id: string
  goalId: string
  userId: string
  /** Со знаком: минус - взяли из копилки. */
  amount: number
  date: string
  note: string | null
  createdAt: string
}

export type Goal = {
  id: string
  title: string
  icon: string
  target: number
  currency: Currency
  deadline: string | null
  createdBy: string
  createdAt: string
  archivedAt: string | null
  deposits: Deposit[]
}

export function savedOf(g: Goal): number {
  return round2(g.deposits.reduce((s, d) => s + d.amount, 0))
}

/** Чистый вклад человека: отложил минус взял. */
export function shareOf(g: Goal, userId: string): number {
  return round2(g.deposits.filter((d) => d.userId === userId).reduce((s, d) => s + d.amount, 0))
}

/** Доля от цели, 0..1. Больше единицы не бывает - перевыполнение рисуется полной банкой. */
export function progressOf(g: Goal): number {
  return Math.min(Math.max(savedOf(g) / g.target, 0), 1)
}

export function reached(g: Goal): boolean {
  return savedOf(g) >= g.target
}

/** Средний месяц - 30.44 дня: так помесячные суммы не скачут от длины месяца. */
const MONTH = 30.44

/**
 * Сколько откладывать в месяц, чтобы успеть к сроку.
 *
 * null - срока нет, цель уже достигнута или срок прошёл: во всех трёх
 * случаях «нужно N в месяц» было бы бессмысленной цифрой.
 */
export function perMonthNeeded(g: Goal, today: string): number | null {
  if (g.deadline === null || reached(g)) return null
  const days = diffDays(today, g.deadline)
  if (days <= 0) return null
  return Math.ceil((g.target - savedOf(g)) / Math.max(days / MONTH, 1))
}

/**
 * Когда наберётся при нынешнем темпе.
 *
 * Темп - сколько отложено с первого вклада, делённое на прошедшее время.
 * Нужны хотя бы две недели истории: по одному вкладу темп не посчитать,
 * а первый день дал бы «к следующему вторнику» от единственной крупной суммы.
 */
export function forecastDate(g: Goal, today: string): string | null {
  if (reached(g) || g.deposits.length === 0) return null
  const first = g.deposits.reduce((min, d) => (d.date < min ? d.date : min), g.deposits[0]?.date ?? today)
  const elapsed = diffDays(first, today)
  if (elapsed < 14) return null
  const saved = savedOf(g)
  if (saved <= 0) return null
  const perDay = saved / elapsed
  const left = Math.ceil((g.target - saved) / perDay)
  // Дальше десяти лет прогноз - не прогноз, а повод пересмотреть цель
  if (left > 3650) return null
  return shiftDays(today, left)
}

/** Успеваем ли к сроку при нынешнем темпе. null - нечего сравнивать. */
export function onTrack(g: Goal, today: string): boolean | null {
  if (g.deadline === null) return null
  const f = forecastDate(g, today)
  if (f === null) return null
  return f <= g.deadline
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Сумма с валютой по правилам языка: «12 500 ₸», «₸12,500».
 *
 * narrowSymbol, а не код валюты: по-английски без него вышло бы «KZT 12,500»,
 * и знак тенге превратился бы в три буквы. Копейки - только если они есть.
 */
export function formatMoney(n: number, currency: Currency): string {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n)
}

/** Знак валюты отдельно - для подписи у поля суммы. */
export function currencySymbol(currency: Currency): string {
  return (
    new Intl.NumberFormat(activeLocale(), { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? currency
  )
}

/** Быстрые суммы для поля вклада - круглые для своей валюты. */
export const QUICK: Record<Currency, readonly number[]> = {
  KZT: [5_000, 10_000, 20_000, 50_000],
  RUB: [1_000, 2_000, 5_000, 10_000],
  USD: [20, 50, 100, 200],
  EUR: [20, 50, 100, 200],
}

/** Месяц вклада - для группировки истории. */
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

/** Первое число месяца - чтобы подписать группу истории названием месяца. */
export function monthStart(month: string): Date {
  return fromLocalISO(`${month}-01`)
}

