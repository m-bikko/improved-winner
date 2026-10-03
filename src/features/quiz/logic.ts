import { TOT_PAIRS } from './pairs'

export type TotAnswer = { roundId: string; userId: string; pairId: string; pick: 0 | 1; guess: 0 | 1 }

export type Round = {
  id: string
  pairs: string[]
  createdBy: string
  createdAt: string
  /** Видимые ответы: свои всегда, второго - когда свой раунд пройден. */
  answers: TotAnswer[]
  /** Сколько пар ответил каждый - без самих ответов. */
  answered: Record<string, number>
}

export const ROUND_SIZE = 10

/**
 * Пары для нового раунда: сначала те, что ещё не встречались, по порядку
 * банка со случайным сдвигом; когда банк пройден - по кругу снова.
 * Перемешивает вызывающий (random), чтобы функция оставалась проверяемой.
 */
export function pickPairs(used: ReadonlySet<string>, random: () => number = Math.random): string[] {
  const fresh = TOT_PAIRS.filter((p) => !used.has(p.id)).map((p) => p.id)
  const pool = fresh.length >= ROUND_SIZE ? fresh : TOT_PAIRS.map((p) => p.id)
  const copy = [...pool]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const a = copy[i]
    const b = copy[j]
    if (a !== undefined && b !== undefined) {
      copy[i] = b
      copy[j] = a
    }
  }
  return copy.slice(0, ROUND_SIZE)
}

export function doneBy(round: Round, userId: string): boolean {
  return userId !== '' && (round.answered[userId] ?? 0) >= round.pairs.length
}

/** Следующая пара, на которую я ещё не ответил. */
export function nextPair(round: Round, userId: string): string | null {
  const mine = new Set(round.answers.filter((a) => a.userId === userId).map((a) => a.pairId))
  return round.pairs.find((p) => !mine.has(p)) ?? null
}

export type Score = {
  /** Мои догадки о его выборе, которые сбылись. */
  myGuesses: number
  /** Его догадки обо мне, которые сбылись. */
  theirGuesses: number
  /** Пары, где мы выбрали одно и то же. */
  same: number
  total: number
}

/** Итог раунда - только когда видны ответы обоих. */
export function scoreOf(round: Round, me: string, partner: string): Score | null {
  if (!doneBy(round, me) || !doneBy(round, partner)) return null
  const of = (who: string, pair: string) => round.answers.find((a) => a.userId === who && a.pairId === pair)
  let myGuesses = 0
  let theirGuesses = 0
  let same = 0
  for (const pair of round.pairs) {
    const m = of(me, pair)
    const t = of(partner, pair)
    if (!m || !t) return null
    if (m.guess === t.pick) myGuesses++
    if (t.guess === m.pick) theirGuesses++
    if (m.pick === t.pick) same++
  }
  return { myGuesses, theirGuesses, same, total: round.pairs.length }
}
