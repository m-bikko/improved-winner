import { daysBetween, type CycleDay } from './cycle'

/**
 * Настроение пузырька на экране цикла.
 *
 * Не шестая фаза, а то, как фазу удобно прочитать с первого взгляда:
 * у лютеиновой два разных настроения (спокойное начало и чувствительные
 * последние дни), а фертильное окно захватывает конец фолликулярной -
 * и для тех, кто планирует ребёнка, именно оно главное в цикле.
 */
export const BUBBLE_MOODS = ['tender', 'rising', 'radiant', 'peak', 'calm', 'sensitive', 'waiting'] as const
export type BubbleMood = (typeof BUBBLE_MOODS)[number]

/** Последние дни перед менструацией, которые считаются «чувствительными». */
const SENSITIVE_DAYS = 5

export function bubbleMood(state: CycleDay, today: string): BubbleMood {
  // Задержка важнее фазы: цикл уже вышел за расчёт, и говорить
  // о «спокойной лютеиновой» было бы неправдой
  if (state.delay) return 'waiting'
  if (state.bleeding || state.phase === 'menstrual') return 'tender'
  if (today === state.ovulation) return 'peak'
  if (today >= state.fertileFrom && today <= state.fertileTo) return 'radiant'
  if (state.phase === 'follicular') return 'rising'
  return state.daysToNext <= SENSITIVE_DAYS ? 'sensitive' : 'calm'
}

/** Три тона пузырька: глубина, основной и блик. */
export type Palette = readonly [Rgb, Rgb, Rgb]
type Rgb = readonly [number, number, number]

const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
]

export const PALETTES: Record<BubbleMood, Palette> = {
  tender: [hex('#8c1c3d'), hex('#e0506f'), hex('#ffa3b6')],
  rising: [hex('#c9552f'), hex('#ff9a6a'), hex('#ffd999')],
  radiant: [hex('#b52f74'), hex('#ff7db4'), hex('#ffe08a')],
  peak: [hex('#b0206a'), hex('#ff6aa8'), hex('#ffd66b')],
  calm: [hex('#5641ad'), hex('#9a85f0'), hex('#d6caff')],
  sensitive: [hex('#4a3789'), hex('#8c6fcb'), hex('#eeaacd')],
  waiting: [hex('#3c67a6'), hex('#7eb0e8'), hex('#d8eaff')],
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

/**
 * Окрас на сегодня.
 *
 * Не ступенька на границе фаз, а плавный переход по дням: пузырёк
 * от бордового первых дней через персиковый к розово-золотому окну,
 * лиловому спокойствию и сливовому концу цикла. Опорные точки стоят
 * на границах фаз, между ними - смешение по номеру дня. Так цвет
 * меняется каждый день понемногу, а не раз в неделю скачком.
 */
export function bubblePalette(state: CycleDay, today: string): Palette {
  const mood = bubbleMood(state, today)
  if (mood === 'waiting') return PALETTES.waiting

  const dayOf = (iso: string): number => state.cycleLength - daysBetween(iso, state.nextStart) + 1
  const stops: { day: number; palette: Palette }[] = [
    { day: 1, palette: PALETTES.tender },
    { day: state.periodLength + 1, palette: PALETTES.rising },
    { day: dayOf(state.fertileFrom), palette: PALETTES.radiant },
    { day: dayOf(state.ovulation), palette: PALETTES.peak },
    { day: dayOf(state.fertileTo) + 1, palette: PALETTES.calm },
    { day: Math.max(dayOf(state.fertileTo) + 2, state.cycleLength - SENSITIVE_DAYS + 1), palette: PALETTES.sensitive },
    { day: state.cycleLength + 1, palette: PALETTES.tender },
  ]
  const day = state.day
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    // При коротком цикле окно начинается раньше конца менструации, и точки
    // идут не по порядку. Такой отрезок пропускаем: смешение по нему было бы
    // бессмыслицей, а цвет возьмётся из настроения ниже
    if (!a || !b || b.day <= a.day) continue
    if (day >= a.day && day < b.day) {
      // От точки к точке целиком и со сглаживанием: в опорный день цвет
      // ровно свой (день овуляции - чистый «пик»), а между ними каждый день
      // сдвигается понемногу. Раньше цвет держался до середины фазы и потом
      // прыгал на границе - за один день менялся на половину палитры
      const x = (day - a.day) / (b.day - a.day)
      const t = x * x * (3 - 2 * x)
      return [
        mix(a.palette[0], b.palette[0], t),
        mix(a.palette[1], b.palette[1], t),
        mix(a.palette[2], b.palette[2], t),
      ]
    }
  }
  return PALETTES[mood]
}

/**
 * Характер движения: насколько пузырёк «живой» сам по себе.
 * В первые дни он тяжелее и медленнее, в окно - самый прыгучий.
 */
export const ENERGY: Record<BubbleMood, { wobble: number; speed: number; glow: number }> = {
  tender: { wobble: 0.6, speed: 0.55, glow: 0.35 },
  rising: { wobble: 1.0, speed: 1.0, glow: 0.45 },
  radiant: { wobble: 1.25, speed: 1.2, glow: 0.8 },
  peak: { wobble: 1.4, speed: 1.3, glow: 1.0 },
  calm: { wobble: 0.75, speed: 0.7, glow: 0.4 },
  sensitive: { wobble: 1.1, speed: 0.9, glow: 0.4 },
  waiting: { wobble: 0.6, speed: 0.6, glow: 0.35 },
}

/** Сколько вариантов фразы у каждого настроения - ключи `bubble.<mood>.<n>`. */
export const PHRASES: Record<BubbleMood, number> = {
  tender: 4,
  rising: 4,
  radiant: 3,
  peak: 2,
  calm: 4,
  sensitive: 4,
  waiting: 2,
}

/** Номер фразы на сегодня: день цикла, чтобы весь день она была одна. */
export function phraseIndex(mood: BubbleMood, day: number): number {
  return ((day % PHRASES[mood]) + PHRASES[mood]) % PHRASES[mood]
}
