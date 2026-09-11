import { tr, useT } from '@/lib/i18n'
import type { GoalDirection, Macros } from '@/lib/nutrition'

const STROKE_RATIO = 0.078

/** Насколько можно перебрать норму, прежде чем это перестанет быть «чуть-чуть». */
const OVER_TOLERANCE = 1.05

type Props = {
  totals: Macros
  goals: Macros
  goalDirection: GoalDirection
}

export function ratioOf(totals: Macros, goals: Macros): number {
  return goals.kcal > 0 ? totals.kcal / goals.kcal : 0
}

export function isOver(ratio: number): boolean {
  return ratio > OVER_TOLERANCE
}

/**
 * Длины двух дуг кольца в долях окружности.
 *
 * Вынесено из разметки, чтобы на это можно было поставить проверку: поломка
 * здесь молчаливая. Кольцо, перестав рисовать перебор, выглядит совершенно
 * исправным - просто закрытым ровно на сто процентов, - и заметить подмену
 * можно только сравнив с числом в центре.
 */
export function ringArcs(ratio: number): { filled: number; excess: number } {
  return {
    filled: Math.min(Math.max(ratio, 0), 1),
    // Больше одного лишнего витка не рисуем: двести процентов и триста
    // выглядели бы одинаково полными, а разницу показывает число в центре.
    excess: Math.min(Math.max(ratio - 1, 0), 1),
  }
}

/**
 * Дуга-мера.
 *
 * Вынесена отдельно, потому что кольцо рисуется в двух размерах - крупным
 * в раскрытом виде и мелким в свёрнутом, - а правила у него одни: незаполненная
 * часть это светлая ступень той же гаммы, что и заливка.
 *
 * Перебор идёт ВТОРЫМ витком поверх полного круга, а не вместо него.
 *
 * Раньше здесь стоял довод «второй виток читался бы как меньше», и он верен -
 * но только если рисовать перебором один короткий отрезок, а полный круг
 * убирать. Тогда 110% выглядели бы как 10%. Если же полный круг остаётся
 * на месте, а перебор ложится сверху от двенадцати часов, читается ровно
 * то, что произошло: норму закрыл и пошёл дальше. Видно и сам факт,
 * и насколько.
 *
 * Больше одного лишнего витка не рисуем: двести процентов и триста выглядели
 * бы одинаково полными, а разницу всё равно показывает число в центре.
 */
export function RingArc({ size, ratio }: { size: number; ratio: number }) {
  const stroke = Math.max(3, size * STROKE_RATIO)
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const { filled, excess } = ringArcs(ratio)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {/* −90°, чтобы отсчёт шёл от двенадцати часов, а не от трёх */}
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-track)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled)}
          className="transition-[stroke-dashoffset] duration-500"
        />
        {excess > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-danger)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - excess)}
            className="transition-[stroke-dashoffset] duration-500"
          />
        )}
      </g>
    </svg>
  )
}

const FULL_SIZE = 180

/**
 * Кольцо дневной нормы в раскрытом виде.
 *
 * В центре ровно одно крупное число - процент. Калории и остаток идут ниже
 * мелким: два больших числа рядом соревнуются за внимание и оба проигрывают.
 *
 * Смысл «хорошо» зависит от цели: при наборе недобор нормы - это промах,
 * при похудении перебор. Поэтому подпись под кольцом разная.
 */
export function CalorieRing({ totals, goals, goalDirection }: Props) {
  const t = useT()
  const ratio = ratioOf(totals, goals)
  const percent = Math.round(ratio * 100)
  const left = goals.kcal - totals.kcal
  const over = isOver(ratio)

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: FULL_SIZE, height: FULL_SIZE }}>
        <div
          role="img"
          aria-label={
            t('ring.eaten', {
              n: Math.round(totals.kcal),
              goal: goals.kcal,
              percent,
            }) + (over ? t('ring.overBy', { n: Math.round(-left) }) : '')
          }
        >
          <RingArc size={FULL_SIZE} ratio={ratio} />
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-5xl font-semibold ${over ? 'text-danger' : 'text-ink'}`}>
            {percent}
            <span className="text-2xl font-normal text-muted">%</span>
          </span>
          <span className="mt-0.5 text-sm text-muted">
            {Math.round(totals.kcal)} / {goals.kcal} {t('unit.kcal')}
          </span>
        </div>
      </div>

      <p className={`mt-1 text-sm ${over ? 'text-danger' : 'text-muted'}`}>
        {hint(left, ratio, goalDirection)}
      </p>
    </div>
  )
}

const MINI_SIZE = 52

/**
 * Свёрнутый вид: то же кольцо, но мелкое и с числами сбоку.
 *
 * Процент вынесен наружу, а не внутрь: в круге на пятьдесят пикселей он был бы
 * нечитаемым, а сам круг всё равно показывает заполненность формой.
 */
export function CalorieRingMini({ totals, goals, goalDirection }: Props) {
  const t = useT()
  const ratio = ratioOf(totals, goals)
  const percent = Math.round(ratio * 100)
  const left = goals.kcal - totals.kcal
  const over = isOver(ratio)

  return (
    <div className="flex items-center gap-3">
      <div
        className="shrink-0"
        role="img"
        aria-label={
          t('ring.percentOfDay', { percent }) +
          (over ? t('ring.overBy', { n: Math.round(-left) }) : '')
        }
      >
        <RingArc size={MINI_SIZE} ratio={ratio} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className={`text-2xl font-semibold ${over ? 'text-danger' : 'text-ink'}`}>
            {percent}%
          </span>
          <span className="truncate text-sm text-muted">
            {Math.round(totals.kcal)} / {goals.kcal} {t('unit.kcal')}
          </span>
        </p>
        <p className={`truncate text-xs ${over ? 'text-danger' : 'text-muted'}`}>
          {hint(left, ratio, goalDirection)}
        </p>
      </div>
    </div>
  )
}

function hint(left: number, ratio: number, goal: GoalDirection): string {
  if (ratio > OVER_TOLERANCE) {
    return tr('ring.over', { n: Math.round(-left) })
  }
  if (ratio >= 0.95) {
    return tr(goal === 'gain' ? 'ring.reached' : 'ring.closed')
  }
  const rounded = Math.round(left)
  return goal === 'gain' ? tr('ring.toGo', { n: rounded }) : tr('ring.left', { n: rounded })
}
