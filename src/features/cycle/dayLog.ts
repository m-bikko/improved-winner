/**
 * Словарь отметок по дням.
 *
 * Ключи совпадают со значениями, которые разрешает CHECK в базе. Совпадение
 * не случайно и не должно расходиться: предлагать в интерфейсе то, что база
 * откажется принять, - та же ошибка, что была бы с напоминаниями задач.
 */

export const FLOW = ['spotting', 'light', 'medium', 'heavy'] as const
export type Flow = (typeof FLOW)[number]
export const MOODS = ['great', 'ok', 'low', 'irritable', 'anxious'] as const
export type Mood = (typeof MOODS)[number]
/** Шкала боли в четыре ступени: различить больше человек через месяц не сможет. */
export const SYMPTOMS = [
  'cramps',
  'headache',
  'bloating',
  'breast-tenderness',
  'acne',
  'back-pain',
  'fatigue',
  'insomnia',
  'nausea',
  'cravings',
] as const
export type Symptom = (typeof SYMPTOMS)[number]
export type DayLog = {
  date: string
  flow: Flow | null
  pain: number | null
  mood: Mood | null
  symptoms: Symptom[]
  note: string | null
  /** Положительный тест на овуляцию (ЛГ) в этот день. */
  lhPositive: boolean
}

export function emptyLog(date: string): DayLog {
  return { date, flow: null, pain: null, mood: null, symptoms: [], note: null, lhPositive: false }
}

/** Есть ли в отметке хоть что-то. База пустые не принимает - и правильно. */
export function isEmpty(log: DayLog): boolean {
  return (
    log.flow === null &&
    log.pain === null &&
    log.mood === null &&
    log.symptoms.length === 0 &&
    (log.note === null || log.note.trim() === '') &&
    !log.lhPositive
  )
}

/** Боль хранится числом 0-3 - ключи подписей по тому же порядку. */
export const PAIN_KEYS = ['pain.none', 'pain.mild', 'pain.moderate', 'pain.severe'] as const
