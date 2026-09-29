import type { ReactNode } from 'react'

/**
 * Где загораются звёзды - доли размера обёртки, по краям и чуть за ними.
 * Порядок перемешан: первые n точек должны лечь вокруг, а не с одной стороны.
 */
const SPOTS: readonly { x: number; y: number; size: number }[] = [
  { x: -8, y: 18, size: 18 },
  { x: 100, y: -10, size: 21 },
  { x: 92, y: 96, size: 15 },
  { x: 40, y: -18, size: 14 },
  { x: 6, y: 100, size: 16 },
  { x: 110, y: 46, size: 16 },
  { x: -14, y: 70, size: 14 },
  { x: 64, y: 112, size: 17 },
]

/** Длительности у всех разные - иначе звёзды мигали бы хором, а не «искрились». */
const DURATIONS = [3.1, 3.7, 2.9, 4.3, 3.4, 4.0, 3.2, 3.8]

/**
 * Мерцающие звёздочки вокруг того, что стоит отметить.
 *
 * По мотивам sparkles-text из Magic UI (MIT), но без JavaScript: оригинал
 * пересоздаёт звёзды таймером десять раз в секунду, и экран, на котором
 * стоит такой текст, перерисовывался бы всё время, пока открыт. Здесь
 * точки заданы заранее, а мерцание - CSS-анимация transform и opacity,
 * которую ведёт композитор.
 *
 * Звезда горит меньше половины цикла и гаснет - поэтому они вспыхивают по одной,
 * а не пульсируют все сразу. При «уменьшить движение» звёзд нет совсем:
 * это чистое украшение.
 */
export function Sparkles({
  children,
  count = 4,
  colors = ['var(--c-accent)', 'var(--t-amber)'],
  className = '',
}: {
  children: ReactNode
  count?: number
  colors?: readonly string[]
  className?: string
}) {
  const stars = SPOTS.slice(0, Math.min(count, SPOTS.length))
  return (
    <span className={`relative inline-flex ${className}`}>
      {children}
      {stars.map((s, i) => (
        <svg
          key={i}
          aria-hidden
          viewBox="0 0 21 21"
          className="sparkle pointer-events-none absolute"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            marginLeft: -s.size / 2,
            marginTop: -s.size / 2,
            fill: colors[i % colors.length],
            animationDuration: `${DURATIONS[i] ?? 3.5}s`,
            animationDelay: `${(i * 0.83) % 2.6}s`,
          }}
        >
          <path d="M9.825.844c.23-.629 1.12-.629 1.35 0l.687 1.876c.539 1.472.53 3.672 1.638 4.78 1.108 1.108 3.308 1.1 4.78 1.638l1.876.687c.63.23.63 1.12 0 1.35l-1.876.687c-1.472.539-3.672.53-4.78 1.638-1.108 1.108-1.1 3.308-1.638 4.78l-.687 1.876c-.23.63-1.12.63-1.35 0l-.687-1.876c-.539-1.472-.53-3.672-1.638-4.78-1.108-1.108-3.308-1.1-4.78-1.638l-1.876-.687c-.629-.23-.629-1.12 0-1.35l1.876-.687C4.192 8.6 6.392 8.608 7.5 7.5 8.608 6.392 8.6 4.192 9.138 2.72L9.825.844Z" />
        </svg>
      ))}
    </span>
  )
}
