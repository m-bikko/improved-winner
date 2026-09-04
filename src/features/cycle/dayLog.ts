/**
 * Словарь отметок по дням.
 *
 * Ключи совпадают со значениями, которые разрешает CHECK в базе. Совпадение
 * не случайно и не должно расходиться: предлагать в интерфейсе то, что база
 * откажется принять, - та же ошибка, что была бы с напоминаниями задач.
 */

export const FLOW = ['spotting', 'light', 'medium', 'heavy'] as const
export type Flow = (typeof FLOW)[number]
export const FLOW_LABELS: Record<Flow, string> = {
  spotting: 'Мазня',
  light: 'Слабо',
  medium: 'Средне',
  heavy: 'Обильно',
}

export const MOODS = ['great', 'ok', 'low', 'irritable', 'anxious'] as const
export type Mood = (typeof MOODS)[number]
export const MOOD_LABELS: Record<Mood, string> = {
  great: 'Отлично',
  ok: 'Нормально',
  low: 'Упадок',
  irritable: 'Раздражение',
  anxious: 'Тревога',
}

/** Шкала боли в четыре ступени: различить больше человек через месяц не сможет. */
export const PAIN_LABELS: Record<number, string> = {
  0: 'Нет',
  1: 'Слабая',
  2: 'Средняя',
  3: 'Сильная',
}

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
export const SYMPTOM_LABELS: Record<Symptom, string> = {
  cramps: 'Спазмы',
  headache: 'Голова',
  bloating: 'Вздутие',
  'breast-tenderness': 'Грудь',
  acne: 'Кожа',
  'back-pain': 'Поясница',
  fatigue: 'Усталость',
  insomnia: 'Сон',
  nausea: 'Тошнота',
  cravings: 'Тяга к еде',
}

export type DayLog = {
  date: string
  flow: Flow | null
  pain: number | null
  mood: Mood | null
  symptoms: Symptom[]
  note: string | null
}

export function emptyLog(date: string): DayLog {
  return { date, flow: null, pain: null, mood: null, symptoms: [], note: null }
}

/** Есть ли в отметке хоть что-то. База пустые не принимает - и правильно. */
export function isEmpty(log: DayLog): boolean {
  return (
    log.flow === null &&
    log.pain === null &&
    log.mood === null &&
    log.symptoms.length === 0 &&
    (log.note === null || log.note.trim() === '')
  )
}
