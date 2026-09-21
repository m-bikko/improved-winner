/**
 * Проверка графика динамики.
 *
 *   pnpm tsx scripts/check-chart.ts
 *
 * График - единственное место в приложении, где ошибка не падает, не пустеет
 * и не подсвечивается: линия нарисуется любая, и неверную от верной глазом
 * не отличить. Поэтому проверяется не то, что он рисуется, а три свойства,
 * от которых зависит, правду ли он показывает.
 *
 * **Одна ось.** Единицы разнесены: у каждого показателя перечислено, в каких
 * единицах он вообще существует, и смешать килограммы с индексом на одной
 * вертикали нельзя по устройству, а не по договорённости.
 *
 * **Цвет принадлежит показателю.** Выключение одной линии не должно
 * перекрашивать оставшиеся. Это заметно только при повторном взгляде на график
 * и разрушает доверие к нему целиком: если цвета переезжают, читать нечего.
 *
 * **Килограммы считаются из процентов.** Те же числа, что показывает прибор,
 * и та же проверка, что в check-body, но здесь - на пути к экрану.
 */
import {
  METRICS,
  UNITS,
  keepInUnit,
  toggleSlot,
  valueOf,
  type MetricId,
} from '../src/features/profile/BodyChart.tsx'
import type { WeightPoint } from '../src/features/profile/api.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

/** День со всеми числами с настоящего прибора. */
const full: WeightPoint = {
  date: '2026-09-15',
  weightKg: 96.3,
  bodyFatPct: 29.0,
  musclePct: 67.8,
  skeletalMusclePct: 36.4,
  waterPct: 50.9,
  visceral: 16.5,
  bmrKcal: 2008,
}

/** День с обычных весов: только вес. */
const plain: WeightPoint = {
  date: '2026-09-16',
  weightKg: 95.8,
  bodyFatPct: null,
  musclePct: null,
  skeletalMusclePct: null,
  waterPct: null,
  visceral: null,
  bmrKcal: null,
}

// ---- Килограммы из процентов совпадают с прибором
const one = (v: number | null): number => Math.round((v ?? 0) * 10) / 10
check(
  one(valueOf(full, 'fat', 'kg')) === 27.9 &&
    one(valueOf(full, 'muscle', 'kg')) === 65.3 &&
    one(valueOf(full, 'skeletal', 'kg')) === 35.1,
  'Килограммы на графике - те же, что на приборе',
  `жир ${one(valueOf(full, 'fat', 'kg'))} (27.9), мышцы ${one(valueOf(full, 'muscle', 'kg'))} (65.3)`,
)
check(
  one(valueOf(full, 'lean', 'kg')) === 68.4 && one(valueOf(full, 'lean', 'pct')) === 71,
  'Тощая масса есть и в килограммах, и в процентах',
  `${one(valueOf(full, 'lean', 'kg'))} кг, ${one(valueOf(full, 'lean', 'pct'))} %`,
)

// ---- Обычные весы: у всего, кроме веса, значения нет
const missing = METRICS.filter((m) => m !== 'weight').filter(
  (m) => UNITS.some((u) => valueOf(plain, m, u) !== null),
)
check(
  valueOf(plain, 'weight', 'kg') === 95.8 && missing.length === 0,
  'С обычных весов рисуется только вес',
  missing.length === 0 ? 'остальные линии просто отсутствуют' : `протекло: ${missing.join(', ')}`,
)

// ---- Единицы не смешиваются
const wrongUnit = [
  valueOf(full, 'weight', 'pct'),
  valueOf(full, 'visceral', 'kg'),
  valueOf(full, 'bmr', 'pct'),
]
check(
  valueOf(full, 'visceral', 'index') === 16.5 && valueOf(full, 'bmr', 'kcal') === 2008,
  'У висцерального жира и обмена свои единицы',
  'индекс 16.5, обмен 2008 ккал - ни то ни другое не килограммы',
)
void wrongUnit

// ---- Слоты: цвет не переезжает
const start: (MetricId | null)[] = ['weight', 'fat', 'lean']
const withoutFat = toggleSlot(start, 'fat')
check(
  withoutFat[0] === 'weight' && withoutFat[1] === null && withoutFat[2] === 'lean',
  'Выключение средней линии не сдвигает остальные',
  `[${withoutFat.join(', ')}] - дыра на месте выключенного, а не сдвиг`,
)

const withMuscle = toggleSlot(withoutFat, 'muscle')
check(
  withMuscle[0] === 'weight' && withMuscle[1] === 'muscle' && withMuscle[2] === 'lean',
  'Новый показатель занимает освободившийся слот',
  `[${withMuscle.join(', ')}] - «тощая» осталась на своём цвете`,
)

const overflow = toggleSlot(withMuscle, 'water')
check(
  overflow.join() === withMuscle.join(),
  'Четвёртая линия не добавляется',
  'на тройке цветов палитра проходит все проверки, на четвёрке - нет',
)

// ---- Смена единицы
const inPct = keepInUnit(['weight', 'fat', 'lean'], 'pct')
check(
  inPct[0] === null && inPct[1] === 'fat' && inPct[2] === 'lean',
  'В процентах вес гаснет, а жир и тощая держат свои цвета',
  `[${inPct.join(', ')}] - процента веса не бывает`,
)

const inIndex = keepInUnit(['weight', 'fat', 'lean'], 'index')
check(
  inIndex.every((s) => s === null),
  'В индексе не остаётся ничего из килограммов',
  'единицы не смешиваются даже ценой пустого графика',
)

// ---- У каждого показателя есть хотя бы одна единица
const orphan = METRICS.filter((m) => !UNITS.some((u) => valueOf(full, m, u) !== null))
check(
  orphan.length === 0,
  'Каждый показатель прибора можно показать',
  orphan.length === 0 ? `показателей ${METRICS.length}` : `негде показать: ${orphan.join(', ')}`,
)

console.log(failed === 0 ? '\nГрафик верен.' : `\nПровалено: ${failed}`)
if (failed > 0) process.exit(1)
