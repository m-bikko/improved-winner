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
  /**
   * Владелица подтвердила, что этот длинный цикл был настоящим, а не
   * пропущенной менструацией. Снимает подозрение в пропуске.
   */
  longConfirmed: boolean
}

// Списком, а не объединением: по объединению нельзя пройтись во время
// работы, а проверка перевода обязана перечислить все фазы и убедиться,
// что у каждой есть название и сводка
export const PHASES = ['menstrual', 'follicular', 'ovulation', 'luteal'] as const
export type Phase = (typeof PHASES)[number]

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

/**
 * Пороги задержки.
 *
 * Разделены не ради градаций, а потому что на разных сроках уместно разное.
 * Два дня - обычный разброс, и говорить о них значит пугать без повода.
 * Неделя - уже стоит назвать вслух. Две - тест, даже отрицательный,
 * перестаёт закрывать вопрос.
 */
export const DELAY = {
  /** Ниже этого молчим совсем. */
  quiet: 3,
  /** С этого дня стоит сказать про тест. */
  notable: 8,
  /** С этого - про врача, даже при отрицательном тесте. */
  long: 15,
} as const

export type DelayLevel = 'slight' | 'notable' | 'long' | 'absent'

export type Delay = {
  /** Сколько дней сверх ожидаемого. */
  days: number
  level: DelayLevel
  /** Дата, от которой считаем. */
  expectedOn: string
  /** Сколько дней прошло с начала последней менструации. */
  sinceLast: number
  /**
   * `measured` - считали от её собственного среднего.
   * `assumed` - среднего ещё нет, и мы считаем от верхней границы нормы.
   *
   * Разница должна быть видна человеку. Первые два цикла приложение не знает
   * её нормы, и объявлять задержку от двадцати восьми дней - выдавать
   * допущение за измерение. Тридцать пять - верх общепринятого коридора:
   * дальше него цикл выходит за норму у кого угодно, и это уже можно
   * сказать, ничего не придумывая.
   */
  basis: 'measured' | 'assumed'
}

/**
 * Задержка на сегодня. `null` - задержки нет или о ней рано говорить.
 *
 * Отдельно от `cycleDay()` сознательно: там прогноз, а тут вопрос
 * «не пора ли что-то делать», и отвечать на него надо даже когда прогноза
 * ещё нет. Ровно этот случай и был пропущен - при одной записи средней длины
 * нет, а значит не было и предупреждения, хотя восемнадцатый день задержки
 * виден на экране.
 */
export function delayOf(
  periods: Period[],
  today: string,
  lutealDays = 14,
  lhDates: readonly string[] = [],
): Delay | null {
  const sorted = [...periods]
    .filter((p) => p.startedOn <= today)
    .sort((a, b) => (a.startedOn < b.startedOn ? -1 : 1))
  const last = sorted[sorted.length - 1]
  if (!last) return null

  // Менструация идёт прямо сейчас - задержки нет по определению. Запись,
  // которую забыли закрыть, ловит отдельное предупреждение о длительном
  // кровотечении; подменять его задержкой было бы неверно вдвойне.
  if (last.endedOn === null) return null

  const stats = cycleStats(periods)
  // Тест на овуляцию точнее любой статистики: задержка считается от него
  const lhDate = lhAnchor(lhDates, last.startedOn, today)
  const measured = lhDate !== null || stats.usableCycle !== null
  const base = lhDate
    ? daysBetween(last.startedOn, shiftDays(lhDate, 1 + lutealDays))
    : measured
      ? Math.round(stats.usableCycle ?? 0)
      : NORMS.cycleMax
  const sinceLast = daysBetween(last.startedOn, today)
  const days = sinceLast - base

  if (sinceLast >= NORMS.absenceDays) {
    return {
      days,
      level: 'absent',
      expectedOn: shiftDays(last.startedOn, base),
      sinceLast,
      basis: measured ? 'measured' : 'assumed',
    }
  }
  if (days < DELAY.quiet) return null

  return {
    days,
    level: days >= DELAY.long ? 'long' : days >= DELAY.notable ? 'notable' : 'slight',
    expectedOn: shiftDays(last.startedOn, base),
    sinceLast,
    basis: measured ? 'measured' : 'assumed',
  }
}

/** Разница в днях между двумя локальными датами. */
export function daysBetween(fromIso: string, toIso: string): number {
  const ms = fromLocalISO(toIso).getTime() - fromLocalISO(fromIso).getTime()
  return Math.round(ms / 86_400_000)
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Медиана: при чётном числе - среднее двух средних, как percentile_cont в базе. */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  const hi = s[mid] ?? 0
  return s.length % 2 === 1 ? hi : ((s[mid - 1] ?? hi) + hi) / 2
}

/**
 * Границы подозрения на пропущенную менструацию.
 *
 * 42-70 - это два цикла из нормального коридора подряд. «Обычный» цикл,
 * с которым сравниваем, - до 41 дня: сорокадневный цикл бывает, и считать
 * его половиной пропуска нельзя. Допуск 8 дней - обычный разброс двух
 * циклов, сложенный вместе.
 */
export const GAP = { min: 42, max: 70, shortMax: 41, tolerance: 8 } as const

/** Цикл, похожий на два обычных подряд: скорее всего, менструацию не отметили. */
export type Gap = {
  /** Начало записи, после которой, похоже, пропущена менструация. */
  startedOn: string
  /** Начало следующей записи. */
  nextStart: string
  days: number
  /** Примерно когда была пропущенная: середина промежутка. */
  missedAround: string
}

type CycleEntry = { startedOn: string; days: number; longConfirmed: boolean }

/** Последние законченные циклы - окно, по которому считается всё остальное. */
function recentCycles(periods: Period[]): CycleEntry[] {
  return [...periods]
    .sort((a, b) => (a.startedOn < b.startedOn ? -1 : 1))
    .flatMap((p) =>
      p.cycleDays === null
        ? []
        : [{ startedOn: p.startedOn, days: p.cycleDays, longConfirmed: p.longConfirmed === true }],
    )
    .slice(-NORMS.window)
}

/**
 * Похож ли цикл на пропуск.
 *
 * Сравниваем с остальными циклами окна - обычными или подтверждёнными
 * длинными. Если их нет совсем, 42-70 дней уже подозрительны: при
 * единственном цикле такой длины вероятнее забытая отметка, чем цикл,
 * - и об этом спрашивают, а не решают молча.
 */
function isGap(c: CycleEntry, all: CycleEntry[]): boolean {
  if (c.longConfirmed || c.days < GAP.min || c.days > GAP.max) return false
  const others = all
    .filter((o) => o.startedOn !== c.startedOn)
    .filter((o) => o.days >= PLAUSIBLE.cycleMin && (o.days <= GAP.shortMax || o.longConfirmed))
    .map((o) => o.days)
  const typical = median(others)
  return typical === null || Math.abs(c.days - 2 * typical) <= GAP.tolerance
}

/** Последний положительный тест на овуляцию в цикле, начатом `since`, не позже `today`. */
export function lhAnchor(lhDates: readonly string[], since: string, today: string): string | null {
  const inCycle = lhDates.filter((d) => d > since && d <= today).sort()
  return inCycle[inCycle.length - 1] ?? null
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
   * Длина цикла для прогноза: МЕДИАНА правдоподобных циклов без пропусков.
   * null - считать не из чего, берётся умолчание.
   *
   * Медиана, а не среднее: один выброс - забытая отметка, болезнь,
   * перелёт - сдвигал среднее на неделю и тянул за собой весь прогноз.
   */
  usableCycle: number | null
  usablePeriod: number | null
  /** Сколько циклов легло в `usableCycle`. */
  cyclesUsed: number
  /** Разброс циклов, по которым считается прогноз. */
  usableSpread: number | null
  /** Циклы, похожие на пропущенную менструацию. В прогноз и предупреждения не идут. */
  gaps: Gap[]
}

/**
 * Средние по последним циклам.
 *
 * Берём окно, а не всю историю: цикл меняется со временем, и среднее
 * за два года говорит о прошлом, а не о ближайшем месяце.
 */
export function cycleStats(periods: Period[]): CycleStats {
  const sorted = [...periods].sort((a, b) => (a.startedOn < b.startedOn ? -1 : 1))
  const recent = recentCycles(periods)
  const gapped = recent.filter((c) => isGap(c, recent))
  // Пропуски не участвуют ни в прогнозе, ни в предупреждениях: «цикл
  // длиннее нормы» из-за забытой отметки пугал бы зря
  const cycles = recent.filter((c) => !gapped.includes(c)).map((c) => c.days)
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
    usableCycle: median(plausibleCycles),
    usablePeriod: average(plausibleLengths),
    cyclesUsed: plausibleCycles.length,
    usableSpread:
      plausibleCycles.length >= 2 ? Math.max(...plausibleCycles) - Math.min(...plausibleCycles) : null,
    gaps: gapped.map((c) => ({
      startedOn: c.startedOn,
      days: c.days,
      nextStart: shiftDays(c.startedOn, c.days),
      missedAround: shiftDays(c.startedOn, Math.round(c.days / 2)),
    })),
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
  /** Задержка, если о ней уже стоит говорить. Считает `delayOf()`. */
  delay: Delay | null
  /**
   * На чём держится прогноз: `lh` - положительный тест на овуляцию в этом
   * цикле, `history` - прошлые циклы, `default` - своих данных нет, 28 дней.
   */
  basis: 'lh' | 'history' | 'default'
  /** Дата положительного теста, от которого посчитано, если он есть. */
  lhDate: string | null
  /**
   * Честные границы следующего начала. Совпадают с `nextStart`, только когда
   * уверенность высокая; пока циклов мало, это диапазон в несколько дней.
   */
  nextFrom: string
  nextTo: string
  /** Прогноз пока приблизительный: меньше трёх циклов и нет теста. */
  approximate: boolean
}

/**
 * На сколько дней в обе стороны может ошибиться прогноз.
 *
 * С тестом на овуляцию - два дня: лютеиновая фаза почти постоянна.
 * По трём и больше циклам - половина их разброса, от одного до пяти.
 * По одному-двум - три дня, без своих данных - четыре.
 */
function marginOf(basis: CycleDay['basis'], stats: CycleStats): number {
  if (basis === 'lh') return 2
  if (stats.cyclesUsed >= 3) return Math.min(5, Math.max(1, Math.ceil((stats.usableSpread ?? 0) / 2)))
  return stats.cyclesUsed >= 1 ? 3 : 4
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
  lhDates: readonly string[] = [],
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
  const periodLength = Math.round(stats.usablePeriod ?? DEFAULT_PERIOD_DAYS)
  const day = daysBetween(last.startedOn, today) + 1

  // Тест на овуляцию - единственное место, где лютеиновая фаза даёт
  // точность: овуляция на следующий день после положительного теста,
  // а до менструации от неё почти всегда одно и то же число дней.
  // Без теста считаем как раньше: от длины цикла назад.
  const lhDate = lhAnchor(lhDates, last.startedOn, today)
  let cycleLength: number
  let nextStart: string
  let ovulation: string
  if (lhDate) {
    ovulation = shiftDays(lhDate, 1)
    nextStart = shiftDays(ovulation, lutealDays)
    cycleLength = daysBetween(last.startedOn, nextStart)
  } else {
    cycleLength = Math.round(stats.usableCycle ?? DEFAULT_CYCLE_DAYS)
    nextStart = shiftDays(last.startedOn, cycleLength)
    ovulation = shiftDays(nextStart, -lutealDays)
  }
  const basis: CycleDay['basis'] = lhDate ? 'lh' : stats.usableCycle !== null ? 'history' : 'default'
  const margin = marginOf(basis, stats)
  // Окно расширяется на неуверенность прогноза, но не больше чем на три дня
  // с каждой стороны: шире оно перестаёт что-либо значить
  const windowMargin = basis === 'lh' ? 0 : Math.min(margin, 3)

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
    // суток. Отсюда окно: пять дней до овуляции и один после - и шире на
    // неуверенность прогноза, пока она есть.
    fertileFrom: shiftDays(ovulation, -5 - windowMargin),
    fertileTo: shiftDays(ovulation, 1 + windowMargin),
    daysToNext: daysBetween(today, nextStart),
    bleeding,
    delay: delayOf(periods, today, lutealDays, lhDates),
    basis,
    lhDate,
    nextFrom: shiftDays(nextStart, -margin),
    nextTo: shiftDays(nextStart, margin),
    approximate: basis !== 'lh' && stats.cyclesUsed < 3,
  }
}

export type Warning = {
  id: string
  title: string
  body: string
  /**
   * Что с этим делать.
   *
   * Третья строка появилась потому, что первых двух не хватало: человек
   * узнавал, что число вышло за коридор, и оставался с этим один. Действие
   * здесь всегда его собственное и всегда выполнимое сегодня - записать,
   * измерить, взять с собой на приём. Лечения приложение не назначает.
   */
  action: string
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
export function warnings(
  periods: Period[],
  today: string,
  lutealDays = 14,
  lhDates: readonly string[] = [],
): Warning[] {
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
        action: tr('warn.cycleShortDo'),
      })
    } else if (avg > NORMS.cycleMax) {
      out.push({
        id: 'cycle-long',
        level: 'attention',
        title: tr('warn.cycleAvg', { n: avg, unit: trPlural('unit.day', avg) }),
        body: tr('warn.cycleRange', { min: NORMS.cycleMin, max: NORMS.cycleMax }),
        action: tr('warn.cycleLongDo'),
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
      action: tr('warn.irregularDo'),
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
        action: tr('warn.periodLongDo'),
      })
    } else if (avg < NORMS.periodMin) {
      out.push({
        id: 'period-short',
        level: 'note',
        title: tr('warn.periodAvg', { n: avg, unit: trPlural('unit.day', avg) }),
        body: tr('warn.periodShort', { min: NORMS.periodMin }),
        action: tr('warn.periodShortDo'),
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
        action: tr('warn.bleedingDo'),
      })
    }
  }

  // Задержка и отсутствие - через delayOf(), а не через собственное условие.
  //
  // Прежнее условие требовало средней длины цикла, а она появляется только
  // со второго цикла. То есть о задержке молчали ровно у той, кто начала
  // вести недавно, - и молчали до девяноста дней. Восемнадцатый день
  // задержки был виден на экране числом «День 47» и не сопровождался
  // ни словом.
  const delay = delayOf(periods, today, lutealDays, lhDates)
  if (delay !== null) {
    if (delay.level === 'absent') {
      out.push({
        id: 'absent',
        level: 'attention',
        title: tr('warn.absent', {
          n: delay.sinceLast,
          unit: trPlural('unit.day', delay.sinceLast),
        }),
        body: tr('warn.absentBody'),
        action: tr('warn.absentDo'),
      })
    } else {
      out.push({
        id: 'late',
        // До двух недель это наблюдение, дальше - повод показаться врачу.
        level: delay.level === 'long' ? 'attention' : 'note',
        title: tr('warn.late', {
          n: delay.days,
          unit: trPlural('unit.day', delay.days),
        }),
        body: tr(
          delay.level === 'slight'
            ? 'warn.lateBody'
            : delay.level === 'notable'
              ? 'warn.lateBodyTest'
              : 'warn.lateBodyLong',
        ),
        action: tr(delay.basis === 'measured' ? 'warn.lateDo' : 'warn.lateDoAssumed', {
          max: NORMS.cycleMax,
        }),
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
  lhDates: readonly string[] = [],
): Forecast[] {
  const sorted = [...periods].sort((a, b) => (a.startedOn < b.startedOn ? -1 : 1))
  const last = sorted[sorted.length - 1]
  if (!last) return []

  const stats = cycleStats(periods)
  const cycleLength = Math.round(stats.usableCycle ?? DEFAULT_CYCLE_DAYS)
  const periodLength = Math.round(stats.usablePeriod ?? DEFAULT_PERIOD_DAYS)

  // С тестом на овуляцию ближайшее начало считается от него, дальше -
  // обычным шагом: иначе календарь и карточка «Следующая» разошлись бы
  const lhDate = lhAnchor(lhDates, last.startedOn, '9999-12-31')
  const first = lhDate ? shiftDays(lhDate, 1 + lutealDays) : shiftDays(last.startedOn, cycleLength)

  // Будущие окна - с тем же запасом на неуверенность, что и текущее:
  // тест на овуляцию уточняет только свой цикл, а не следующие
  const windowMargin = Math.min(marginOf(stats.usableCycle !== null ? 'history' : 'default', stats), 3)

  const out: Forecast[] = []
  for (let i = 1; i <= count; i++) {
    const start = shiftDays(first, cycleLength * (i - 1))
    const nextStart = shiftDays(start, cycleLength)
    const ovulation = shiftDays(nextStart, -lutealDays)
    out.push({
      start,
      end: shiftDays(start, periodLength - 1),
      ovulation,
      fertileFrom: shiftDays(ovulation, -5 - windowMargin),
      fertileTo: shiftDays(ovulation, 1 + windowMargin),
    })
  }
  return out
}
