import { diffDays, shiftDays } from '@/lib/date'
import { QUESTIONS, QUESTION_BY_ID, type Question } from './bank'
import type { Answer, Progress } from './api'

/**
 * С этого дня идёт расписание: первый вопрос из списка - в этот день,
 * дальше по порядку и по кругу.
 *
 * Новые вопросы дописываются в КОНЕЦ списка. Тогда номер дня внутри первого
 * круга не меняется, и вопрос, заданный вчера, вчерашним и остаётся. А если
 * за день между ответами всё же вышла версия с другим порядком, вопрос дня
 * берётся из первого ответа (см. dayOf) - база не даст ответить на разные.
 */
export const EPOCH = '2026-10-02'

export function scheduledQuestion(date: string): Question {
  const n = QUESTIONS.length
  const index = ((diffDays(EPOCH, date) % n) + n) % n
  const q = QUESTIONS[index]
  if (!q) throw new Error('QUESTIONS is empty')
  return q
}

export type Day = {
  date: string
  questionId: string
  /** null - id из версии, которой у этого клиента нет. */
  question: Question | null
  mine: Answer | null
  /** Виден только после своего ответа - это держит RLS, а не экран. */
  theirs: Answer | null
  partnerAnswered: boolean
}

/**
 * Состояние одного дня.
 *
 * Вопрос дня, на который уже кто-то ответил, берётся из ответа, а не из
 * расписания: второй должен отвечать на тот же вопрос, что и первый, даже
 * если между ответами вышло обновление.
 */
export function dayOf(
  date: string,
  userId: string,
  answers: readonly Answer[],
  progress: readonly Progress[],
): Day {
  const onDate = progress.filter((p) => p.date === date)
  const questionId = onDate[0]?.questionId ?? scheduledQuestion(date).id
  return {
    date,
    questionId,
    question: QUESTION_BY_ID.get(questionId) ?? null,
    mine: answers.find((a) => a.date === date && a.userId === userId) ?? null,
    theirs: answers.find((a) => a.date === date && a.userId !== userId) ?? null,
    partnerAnswered: onDate.some((p) => p.userId !== userId),
  }
}

/**
 * Сколько дней подряд ответили оба.
 *
 * Сегодня, пока не ответили оба, серию не обрывает: день ещё идёт.
 * Иначе утром каждого дня серия показывала бы ноль.
 */
export function jointStreak(progress: readonly Progress[], userId: string, partnerId: string, today: string): number {
  if (partnerId === '') return 0
  const who = new Map<string, Set<string>>()
  for (const p of progress) {
    const set = who.get(p.date) ?? new Set<string>()
    set.add(p.userId)
    who.set(p.date, set)
  }
  const both = (d: string) => {
    const s = who.get(d)
    return s !== undefined && s.has(userId) && s.has(partnerId)
  }
  let day = both(today) ? today : shiftDays(today, -1)
  let n = 0
  while (both(day)) {
    n++
    day = shiftDays(day, -1)
  }
  return n
}

/**
 * Дни для архива: всё, где кто-то ответил, плюс последняя неделя целиком -
 * пропущенный вчера вопрос должен быть виден, чтобы на него ответить.
 * Сегодняшний день сюда не входит: он наверху экрана.
 */
export function archiveDates(progress: readonly Progress[], today: string, recentDays = 7): string[] {
  const dates = new Set<string>()
  for (const p of progress) if (p.date < today) dates.add(p.date)
  for (let i = 1; i <= recentDays; i++) {
    const d = shiftDays(today, -i)
    // Не раньше начала расписания: до него вопросов не было
    if (d >= EPOCH) dates.add(d)
  }
  return [...dates].sort((a, b) => (a < b ? 1 : -1))
}
