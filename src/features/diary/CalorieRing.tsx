import type { Macros } from '@/lib/nutrition'
import type { GoalDirection } from '@/lib/nutrition'

const SIZE = 180
const STROKE = 14
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Насколько можно перебрать норму, прежде чем это перестанет быть «чуть-чуть». */
const OVER_TOLERANCE = 1.05

type Props = {
  totals: Macros
  goals: Macros
  goalDirection: GoalDirection
}

/**
 * Кольцо дневной нормы.
 *
 * Форма выбрана по задаче «одно отношение к пределу» — это мера, а не диаграмма
 * из двух долей. Отсюда и оформление: незаполненная часть кольца это светлая
 * ступень той же гаммы, что и заливка, а не нейтральный серый, поэтому состояние
 * читается по кольцу целиком, а не только по закрашенной дуге.
 *
 * В центре ровно одно крупное число — процент. Калории и остаток идут ниже
 * мелким: два больших числа рядом соревнуются за внимание и оба проигрывают.
 *
 * Смысл «хорошо» зависит от цели: при наборе недобор нормы — это промах,
 * при похудении перебор. Поэтому подпись под кольцом разная.
 */
export function CalorieRing({ totals, goals, goalDirection }: Props) {
  const ratio = goals.kcal > 0 ? totals.kcal / goals.kcal : 0
  const percent = Math.round(ratio * 100)
  const left = goals.kcal - totals.kcal
  const over = ratio > OVER_TOLERANCE

  // Дуга упирается в полный круг: за 100% кольцо больше не растёт, о переборе
  // говорят цвет и число. Второй виток поверх первого читался бы как «меньше».
  const filled = Math.min(ratio, 1)
  const stroke = over ? 'var(--color-danger)' : 'var(--color-accent)'

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`Съедено ${Math.round(totals.kcal)} из ${goals.kcal} ккал, ${percent} процентов нормы`}
        >
          {/* −90° — чтобы отсчёт шёл от двенадцати часов, а не от трёх */}
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="var(--color-track)"
              strokeWidth={STROKE}
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={stroke}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - filled)}
              className="transition-[stroke-dashoffset] duration-500"
            />
          </g>
        </svg>

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
