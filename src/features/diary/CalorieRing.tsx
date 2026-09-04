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
 * Дуга-мера.
 *
 * Вынесена отдельно, потому что кольцо рисуется в двух размерах - крупным
 * в раскрытом виде и мелким в свёрнутом, - а правила у него одни: незаполненная
 * часть это светлая ступень той же гаммы, что и заливка, и дуга упирается
 * в полный круг. Второй виток поверх первого читался бы как «меньше».
 */
export function RingArc({ size, ratio }: { size: number; ratio: number }) {
  const stroke = Math.max(3, size * STROKE_RATIO)
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const filled = Math.min(ratio, 1)

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
          stroke={isOver(ratio) ? 'var(--color-danger)' : 'var(--color-accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled)}
          className="transition-[stroke-dashoffset] duration-500"
        />
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
  const ratio = ratioOf(totals, goals)
  const percent = Math.round(ratio * 100)
  const left = goals.kcal - totals.kcal
  const over = isOver(ratio)

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: FULL_SIZE, height: FULL_SIZE }}>
        <div
          role="img"
          aria-label={`Съедено ${Math.round(totals.kcal)} из ${goals.kcal} ккал, ${percent} процентов нормы`}
        >
          <RingArc size={FULL_SIZE} ratio={ratio} />
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-5xl font-semibold ${over ? 'text-danger' : 'text-ink'}`}>
            {percent}
            <span className="text-2xl font-normal text-muted">%</span>
          </span>
          <span className="mt-0.5 text-sm text-muted">
            {Math.round(totals.kcal)} / {goals.kcal} ккал
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
  const ratio = ratioOf(totals, goals)
  const percent = Math.round(ratio * 100)
  const left = goals.kcal - totals.kcal
  const over = isOver(ratio)

  return (
    <div className="flex items-center gap-3">
      <div
        className="shrink-0"
        role="img"
        aria-label={`${percent} процентов дневной нормы`}
      >
        <RingArc size={MINI_SIZE} ratio={ratio} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className={`text-2xl font-semibold ${over ? 'text-danger' : 'text-ink'}`}>
            {percent}%
          </span>
          <span className="truncate text-sm text-muted">
            {Math.round(totals.kcal)} / {goals.kcal} ккал
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
    return `Перебор на ${Math.round(-left)} ккал`
  }
  if (ratio >= 0.95) {
    return goal === 'gain' ? 'Норма набрана' : 'Норма закрыта'
  }
  const rounded = Math.round(left)
  return goal === 'gain' ? `Добрать ещё ${rounded} ккал` : `Осталось ${rounded} ккал`
}
