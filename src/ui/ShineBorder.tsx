import type { CSSProperties } from 'react'

/**
 * Сияние, которое медленно обходит рамку карточки.
 *
 * По мотивам shine-border из Magic UI (MIT): радиальный градиент гуляет
 * по большому фону, а маска оставляет от него только полоску по краю.
 * Родитель должен быть `relative` со скруглением - рамка его наследует.
 *
 * Включать по событию, а не всегда: сияние, которое горит постоянно,
 * через день перестают замечать.
 */
export function ShineBorder({
  colors,
  width = 2,
  duration = 9,
}: {
  colors: readonly string[]
  width?: number
  duration?: number
}) {
  return (
    <span
      aria-hidden
      className="shine-border"
      style={
        {
          '--shine-width': `${width}px`,
          animationDuration: `${duration}s`,
          backgroundImage: `radial-gradient(transparent, transparent, ${colors.join(', ')}, transparent, transparent)`,
        } as CSSProperties
      }
    />
  )
}
