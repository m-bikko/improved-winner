/**
 * Проверка пузырька настроения на экране цикла.
 *
 *   pnpm tsx scripts/check-bubble.ts
 *
 * Главное, что здесь нельзя перепутать, - фертильное окно: пузырёк прямо
 * говорит «благоприятный день, если вы планируете ребёнка», и сказать это
 * не в тот день хуже, чем промолчать. Остальное - что каждый день цикла
 * получает настроение, а цвет меняется плавно, без скачков посреди фазы.
 *
 * Без базы: только арифметика над cycleDay().
 */
import { cycleDay, type Period } from '../src/features/cycle/cycle.ts'
import { shiftDays } from '../src/lib/date.ts'
import { bubbleMood, bubblePalette, PHRASES, phraseIndex, BUBBLE_MOODS } from '../src/features/cycle/bubbleMood.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

// Ровные циклы по 28 дней, менструация 5 дней, последняя началась 1 сентября
const starts = ['2026-06-09', '2026-07-07', '2026-08-04', '2026-09-01']
const periods: Period[] = starts.map((s, i) => ({
  id: `p${i}`,
  startedOn: s,
  endedOn: shiftDays(s, 4),
  note: null,
  periodDays: 5,
  cycleDays: i < starts.length - 1 ? 28 : null,
}))
const LUTEAL = 14

const dayOf = (n: number): string => shiftDays('2026-09-01', n - 1)
const moodOn = (n: number): string => {
  const state = cycleDay(periods, dayOf(n), LUTEAL)
  return state ? bubbleMood(state, dayOf(n)) : 'none'
}

const state1 = cycleDay(periods, dayOf(1), LUTEAL)
if (!state1) throw new Error('cycleDay не посчитал день')

check(moodOn(1) === 'tender' && moodOn(5) === 'tender', 'Менструация - бережные дни', `день 1: ${moodOn(1)}, день 5: ${moodOn(5)}`)
check(moodOn(7) === 'rising', 'После менструации - подъём', `день 7: ${moodOn(7)}`)

// Следующее начало 29 сентября, овуляция за 14 дней - 15 сентября (день 15),
// окно - с 10 по 16 сентября
const ovulationDay = 15
check(moodOn(ovulationDay) === 'peak', 'День овуляции - пик', `день ${ovulationDay}: ${moodOn(ovulationDay)}`)
const window = [10, 11, 12, 13, 14, 16].map(moodOn)
check(window.every((m) => m === 'radiant'), 'Остальное окно - благоприятные дни', window.join(', '))
check(moodOn(9) === 'rising' && moodOn(17) !== 'radiant', 'Вне окна о зачатии не говорит', `день 9: ${moodOn(9)}, день 17: ${moodOn(17)}`)
check(moodOn(20) === 'calm', 'Середина лютеиновой - спокойствие', `день 20: ${moodOn(20)}`)
check(moodOn(25) === 'sensitive' && moodOn(28) === 'sensitive', 'Последние дни - чувствительные', `день 25: ${moodOn(25)}, день 28: ${moodOn(28)}`)

const late = cycleDay(periods, dayOf(40), LUTEAL)
check(
  late !== null && bubbleMood(late, dayOf(40)) === 'waiting',
  'Заметная задержка - ожидание, а не фаза',
  `день 40: ${late ? bubbleMood(late, dayOf(40)) : 'нет'}`,
)

// Цвет плывёт по дням: соседние дни не прыгают сильно, а за цикл меняется заметно
let maxStep = 0
let span = 0
const first = bubblePalette(state1, dayOf(1))[1]
for (let n = 1; n < 28; n++) {
  const a = cycleDay(periods, dayOf(n), LUTEAL)
  const b = cycleDay(periods, dayOf(n + 1), LUTEAL)
  if (!a || !b) continue
  const ca = bubblePalette(a, dayOf(n))[1]
  const cb = bubblePalette(b, dayOf(n + 1))[1]
  maxStep = Math.max(maxStep, Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]))
  span = Math.max(span, Math.hypot(ca[0] - first[0], ca[1] - first[1], ca[2] - first[2]))
}
check(span > 0.3, 'За цикл цвет меняется заметно', `наибольшее отличие от первого дня ${span.toFixed(2)}`)
check(maxStep < 0.45, 'Соседние дни без резких скачков', `наибольший шаг за день ${maxStep.toFixed(2)}`)

const phrasesOk = BUBBLE_MOODS.every((m) =>
  [0, 1, 17, 28, 59].every((d) => {
    const i = phraseIndex(m, d)
    return i >= 0 && i < PHRASES[m]
  }),
)
check(phrasesOk, 'Номер фразы всегда в пределах', 'для любого дня и настроения')

console.log(failed === 0 ? '\nПузырёк верен.' : `\nПровалено: ${failed}`)
if (failed > 0) process.exit(1)
