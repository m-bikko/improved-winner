import { useId } from 'react'
import { fromLocalISO } from '@/lib/date'
import type { WeightPoint } from './api'

const WIDTH = 320
const HEIGHT = 110
const PAD_X = 8
const PAD_Y = 14

/**
 * Динамика веса.
 *
 * Одна серия, изменение во времени — значит линия, и легенда не нужна:
 * заголовок над графиком её и называет. Никакой библиотеки: это меньше
 * тридцати строк SVG, а любая графическая библиотека утяжелила бы бандл
 * сильнее, чем весь остальной раздел.
 *
 * Цвет линии — отдельный токен --color-chart, а не цвет кнопок: оба значения
 * прогнаны через валидатор палитры, каждое на своей подложке.
 *
 * Под графиком идёт список последних взвешиваний. Это и есть табличное
 * представление тех же данных: точные числа для тех, кому линия не читается.
 */
export function WeightChart({ points }: { points: WeightPoint[] }) {
  const gradientId = useId()

  if (points.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        {points.length === 0
          ? 'Отмечай вес — здесь появится динамика.'
          : 'Ещё одно взвешивание, и появится график.'}
      </p>
    )
  }

  const values = points.map((p) => p.weightKg)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // Плоская линия при одинаковом весе не должна вырождаться в деление на ноль
  const span = max - min || 1

  const times = points.map((p) => fromLocalISO(p.date).getTime())
  const tMin = times[0] ?? 0
  const tMax = times[times.length - 1] ?? 1
  const tSpan = tMax - tMin || 1

  const x = (i: number) => PAD_X + (((times[i] ?? 0) - tMin) / tSpan) * (WIDTH - PAD_X * 2)
  const y = (v: number) => PAD_Y + (1 - (v - min) / span) * (HEIGHT - PAD_Y * 2)

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.weightKg).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)},${HEIGHT} L${x(0).toFixed(1)},${HEIGHT} Z`

  const last = points[points.length - 1]
  const first = points[0]
  const delta = last && first ? last.weightKg - first.weightKg : 0

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold">{last?.weightKg.toFixed(1)} кг</span>
        <span className="text-sm text-muted">
          {delta === 0 ? 'без изменений' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} кг за период`}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`Динамика веса: с ${first?.weightKg.toFixed(1)} до ${last?.weightKg.toFixed(1)} кг`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-chart)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--color-chart)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Точка только на последнем значении: маркер на каждом дне превратил бы
            линию в частокол, а важно именно «где я сейчас» */}
        <circle
          cx={x(points.length - 1)}
          cy={y(last?.weightKg ?? min)}
          r="4"
          fill="var(--color-chart)"
          stroke="var(--color-surface)"
          strokeWidth="2"
        />
      </svg>

      <div className="flex justify-between text-xs text-muted">
        <span>{min.toFixed(1)} кг</span>
        <span>{max.toFixed(1)} кг</span>
      </div>
    </div>
  )
}
