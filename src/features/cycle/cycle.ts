/**
 * Вся арифметика цикла.
 *
 * В базе лежат только введённые руками даты - начало и конец менструации.
 * Длина цикла, фаза, прогноз, фертильное окно и предупреждения считаются
 * здесь и нигде не хранятся: производное состояние, которое можно хранить,
 * однажды разойдётся с источником, и заметить это будет нечем.
 *
 * Оговорка, которая должна быть видна в коде так же, как в интерфейсе:
 * **это оценка по календарю, а не измерение.** Овуляция вычисляется назад
 * от предполагаемого следующего начала, и в реальном цикле она гуляет.
 * Как способ предохранения календарный метод не работает - в интерфейсе
 * это сказано прямо, и убирать оттуда нельзя.
 */
import { fromLocalISO, shiftDays } from '@/lib/date'
import { tr, trPlural } from '@/lib/i18n'

export type Period = {
  id: string
  startedOn: string
  endedOn: string | null
  note: string | null
  /** Длина менструации в днях. null, пока она идёт. */
  periodDays: number | null
  /** Расстояние до следующего начала. null у самой свежей записи. */
  cycleDays: number | null
}

export type Phase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal'

/**
 * Нормы.
 *
 * Взяты по общепринятым ориентирам: цикл 21-35 дней, менструация 2-8 дней,
 * разброс между соседними циклами до 9 дней, отсутствие менструации
 * 90 дней и дольше - повод показаться врачу.
 *
 * Числа собраны в одном месте не ради аккуратности, а чтобы предупреждения
 * нельзя было незаметно рассогласовать с текстом, который их объясняет.
 */
export const NORMS = {
  cycleMin: 21,
  cycleMax: 35,
  periodMin: 2,
  periodMax: 8,
  /** Разброс между соседними циклами, выше которого цикл считают нерегулярным. */
  spreadMax: 9,
  /** Сколько дней без менструации - уже повод к врачу. */
  absenceDays: 90,
  /** Сколько последних циклов берём для средних. */
  window: 6,
} as const

/**
 * Границы правдоподобия - это НЕ нормы здоровья, и путать их нельзя.
 *
 * NORMS отвечает на вопрос «стоит ли показаться врачу»: цикл 21-35, менструация
 * 2-8. PLAUSIBLE отвечает на другой - «это вообще похоже на измерение или это
 * промах по кнопке». Границы здесь шире: сорокадневный цикл выходит за норму,
 * но он реален, и прогноз обязан считаться с ним, а не подменять его двадцатью
 * восемью.
 *
 * Появились не из теории. Человек отметил один день менструации, приложение
 * посчитало «среднюю длину» по одному наблюдению, получило единицу - и стало
 * рисовать этой единицей все будущие менструации. Две однодневные отметки
 * подряд дали бы «средний цикл 1 день» и развалили бы прогноз целиком.
 *
 * Отсюда правило: в среднее для ПРОГНОЗА идут только правдоподобные значения.
 * В предупреждения - все, какие есть, иначе однодневная менструация перестала
 * бы о себе сообщать.
 */
export const PLAUSIBLE = {
  cycleMin: 15,
  cycleMax: 60,
  periodMin: 2,
  periodMax: 12,
} as const

export const DEFAULT_CYCLE_DAYS = 28
export const DEFAULT_PERIOD_DAYS = 5

/** Разница в днях между двумя локальными датами. */
export function daysBetween(fromIso: string, toIso: string): number {
  const ms = fromLocalISO(toIso).getTime() - fromLocalISO(fromIso).getTime()
  return Math.round(ms / 86_400_000)
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export type CycleStats = {
  /** Средняя длина цикла по последним завершённым. null - данных нет. */
  avgCycle: number | null
  /** Средняя длина менструации. */
  avgPeriod: number | null
  /** Разброс между самым коротким и самым длинным циклом в окне. */
  spread: number | null
  /** Сколько завершённых циклов легло в среднее. */
  cyclesCounted: number
  /**
   * То же среднее, но по значениям, прошедшим проверку на правдоподобие.
   * Именно оно идёт в прогноз. null - считать не из чего, берётся умолчание.
   */
  usableCycle: number | null
  usablePeriod: number | null
}

/**
 * Средние по последним циклам.
 *
 * Берём окно, а не всю историю: цикл меняется со временем, и среднее
 * за два года говорит о прошлом, а не о ближайшем месяце.
 */
export function cycleStats(periods: Period[]): CycleStats {
  const sorted = [...periods].sort((a, b) => (a.startedOn < b.startedOn ? -1 : 1))
  const cycles = sorted
    .map((p) => p.cycleDays)
    .filter((d): d is number => d !== null)
    .slice(-NORMS.window)
  const lengths = sorted
    .map((p) => p.periodDays)
    .filter((d): d is number => d !== null)
    .slice(-NORMS.window)

  const plausibleCycles = cycles.filter(
    (d) => d >= PLAUSIBLE.cycleMin && d <= PLAUSIBLE.cycleMax,
  )
  const plausibleLengths = lengths.filter(
    (d) => d >= PLAUSIBLE.periodMin && d <= PLAUSIBLE.periodMax,
  )

  return {
    avgCycle: average(cycles),
    avgPeriod: average(lengths),
    spread: cycles.length >= 2 ? Math.max(...cycles) - Math.min(...cycles) : null,
    cyclesCounted: cycles.length,
    usableCycle: average(plausibleCycles),
    usablePeriod: average(plausibleLengths),
  }
}

export type CycleDay = {
  /** День цикла, считая от начала последней менструации. Первый день - 1. */
  day: number
  phase: Phase
  /** Предполагаемая длина текущего цикла: среднее или значение по умолчанию. */
  cycleLength: number
  /** Предполагаемая длина менструации - по среднему, а не по константе. */
  periodLength: number
  /** Дата предполагаемого начала следующей менструации. */
  nextStart: string
  /** Дата предполагаемой овуляции. */
  ovulation: string
  /** Фертильное окно - оценка, не измерение. */
  fertileFrom: string
  fertileTo: string
  /** Сколько дней осталось до следующей менструации. Отрицательное - задержка. */
  daysToNext: number
  /** Идёт ли менструация прямо сейчас. */
  bleeding: boolean
}

/**
 * Где мы сегодня.
 *
 * Овуляция считается НАЗАД от предполагаемого следующего начала, а не вперёд
 * от прошлого. Лютеиновая фаза устойчивее фолликулярной: при цикле в 24 дня
 * и в 34 дня она примерно одинаковая, а расходятся именно первые дни.
 * Отсчёт вперёд «14 дней от начала» ошибался бы ровно на разницу.
 */
export function cycleDay(
  periods: Period[],
  today: string,
  lutealDays: number,
): CycleDay | null {
  // Последняя ИЗ НАЧАВШИХСЯ, а не просто последняя.
  //
  // Дата начала в базе не ограничена будущим - и не может быть ограничена:
  // часовой пояс базы UTC, и в час ночи по месту честная сегодняшняя дата
  // выглядела бы завтрашней. Значит запись с началом в будущем возможна,
  // и человек создаёт её одной опечаткой в истории.
  //
  // Без этого фильтра счётчик показывал «День 0», а при опечатке на неделю
  // показал бы «День -6». Число, которого не бывает, на главном экране -
  // это не мелочь: оно обесценивает всё остальное, что там написано.
  const sorted = [...periods]
    .filter((p) => p.startedOn <= today)
    .sort((a, b) => (a.startedOn < b.startedOn ? -1 : 1))
  const last = sorted[sorted.length - 1]
  if (!last) return null

  const stats = cycleStats(periods)
  const cycleLength = Math.round(stats.usableCycle ?? DEFAULT_CYCLE_DAYS)
  const periodLength = Math.round(stats.usablePeriod ?? DEFAULT_PERIOD_DAYS)

  const day = daysBetween(last.startedOn, today) + 1
  const nextStart = shiftDays(last.startedOn, cycleLength)
  const ovulation = shiftDays(nextStart, -lutealDays)

  const bleeding =
    last.endedOn === null
      ? today >= last.startedOn
      : today >= last.startedOn && today <= last.endedOn

  const ovulationDay = daysBetween(last.startedOn, ovulation) + 1

  let phase: Phase
  if (bleeding || day <= periodLength) phase = 'menstrual'
  else if (day < ovulationDay - 1) phase = 'follicular'
  else if (day <= ovulationDay + 1) phase = 'ovulation'
  else phase = 'luteal'

  return {
    day,
    phase,
    cycleLength,
    periodLength,
    nextStart,
    ovulation,
    // Сперматозоиды живут в половых путях до пяти суток, яйцеклетка - около
    // суток. Отсюда окно: пять дней до овуляции и один после.
    fertileFrom: shiftDays(ovulation, -5),
    fertileTo: shiftDays(ovulation, 1),
    daysToNext: daysBetween(today, nextStart),
    bleeding,
  }
}

export type Warning = {
  id: string
  title: string
  body: string
  /** `attention` - стоит показать врачу. `note` - просто наблюдение. */
  level: 'attention' | 'note'
}

/**
 * Предупреждения по нормам.
 *
 * Формулировки намеренно осторожные: приложение не ставит диагнозов и не может
 * их ставить. Оно умеет одно - заметить, что число вышло за общепринятый
 * коридор, и сказать, что об этом стоит поговорить с врачом. Всё, что звучало
 * бы как объяснение причины, отсюда убрано сознательно.
 */
export function warnings(periods: Period[], today: string): Warning[] {
  const out: Warning[] = []
  const stats = cycleStats(periods)
  const sorted = [...periods].sort((a, b) => (a.startedOn < b.startedOn ? -1 : 1))
  const last = sorted[sorted.length - 1]

  if (stats.avgCycle !== null && stats.cyclesCounted >= 2) {
    const avg = Math.round(stats.avgCycle)
    if (avg < NORMS.cycleMin) {
      out.push({
        id: 'cycle-short',
        level: 'attention',
        title: tr('warn.cycleAvg', { n: avg, unit: trPlural('unit.day', avg) }),
        body: tr('warn.cycleRange', { min: NORMS.cycleMin, max: NORMS.cycleMax }),
      })
    } else if (avg > NORMS.cycleMax) {
      out.push({
        id: 'cycle-long',
        level: 'attention',
        title: tr('warn.cycleAvg', { n: avg, unit: trPlural('unit.day', avg) }),
        body: tr('warn.cycleRange', { min: NORMS.cycleMin, max: NORMS.cycleMax }),
      })
    }
  }

  if (stats.spread !== null && stats.spread > NORMS.spreadMax) {
    out.push({
      id: 'irregular',
      level: 'attention',
      title: tr('warn.spread', {
        n: stats.spread,
        unit: trPlural('unit.day', stats.spread),
      }),
      body: tr('warn.spreadBody', { max: NORMS.spreadMax }),
    })
  }

  if (stats.avgPeriod !== null) {
    const avg = Math.round(stats.avgPeriod)
    if (avg > NORMS.periodMax) {
      out.push({
        id: 'period-long',
        level: 'attention',
        title: tr('warn.periodAvg', { n: avg, unit: trPlural('unit.day', avg) }),
        body: tr('warn.periodLong', { max: NORMS.periodMax }),
      })
    } else if (avg < NORMS.periodMin) {
      out.push({
        id: 'period-short',
        level: 'note',
        title: tr('warn.periodAvg', { n: avg, unit: trPlural('unit.day', avg) }),
        body: tr('warn.periodShort', { min: NORMS.periodMin }),
      })
    }
  }

  // Текущее кровотечение, которое длится слишком долго. Смотрим на идущую
  // прямо сейчас запись, а не на среднее: тут важно «сколько уже», а не «обычно».
  if (last && last.endedOn === null) {
    const going = daysBetween(last.startedOn, today) + 1
    if (going > NORMS.periodMax) {
      out.push({
        id: 'bleeding-long',
        level: 'attention',
        title: tr('warn.bleeding', { n: going }),
        body: tr('warn.bleedingBody', { max: NORMS.periodMax }),
      })
    }
  }

  if (last) {
    const since = daysBetween(last.startedOn, today)
    if (since >= NORMS.absenceDays) {
      out.push({
        id: 'absent',
        level: 'attention',
        title: tr('warn.absent', { n: since, unit: trPlural('unit.day', since) }),
        body: tr('warn.absentBody'),
      })
    } else if (stats.avgCycle !== null && since > Math.round(stats.avgCycle) + 7) {
      out.push({
        id: 'late',
        level: 'note',
        title: tr('warn.late', {
          n: since - Math.round(stats.avgCycle),
          unit: trPlural('unit.day', since - Math.round(stats.avgCycle)),
        }),
        body: tr('warn.lateBody'),
      })
    }
  }

  return out
}

/** Один предсказанный цикл: где будет менструация и где фертильное окно. */
export type Forecast = {
  start: string
  end: string
  fertileFrom: string
  fertileTo: string
  ovulation: string
}

/**
 * Прогноз на несколько циклов вперёд.
 *
 * Календарю мало «следующей»: открыв октябрь в сентябре, человек должен
 * увидеть, что там ожидается, а не пустую сетку. Дальше третьего-четвёртого
 * цикла прогноз всё равно расходится с жизнью, поэтому счётчик ограничен
 * вызывающим, а не растёт сам.
 */
export function forecast(
  periods: Period[],
  lutealDays: number,
  count: number,
): Forecast[] {
  const sorted = [...periods].sort((a, b) => (a.startedOn < b.startedOn ? -1 : 1))
  const last = sorted[sorted.length - 1]
  if (!last) return []

  const stats = cycleStats(periods)
  const cycleLength = Math.round(stats.usableCycle ?? DEFAULT_CYCLE_DAYS)
  const periodLength = Math.round(stats.usablePeriod ?? DEFAULT_PERIOD_DAYS)

  const out: Forecast[] = []
  for (let i = 1; i <= count; i++) {
    const start = shiftDays(last.startedOn, cycleLength * i)
    const nextStart = shiftDays(start, cycleLength)
    const ovulation = shiftDays(nextStart, -lutealDays)
    out.push({
      start,
      end: shiftDays(start, periodLength - 1),
      ovulation,
      fertileFrom: shiftDays(ovulation, -5),
      fertileTo: shiftDays(ovulation, 1),
    })
  }
  return out
}
