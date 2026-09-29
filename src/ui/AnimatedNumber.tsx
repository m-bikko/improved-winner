import { useEffect } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'

/**
 * Число, которое докручивается до значения, а не подменяется.
 *
 * При первом показе растёт от нуля, при изменении - от прежнего значения:
 * добавил завтрак - калории на главной «доехали» до новой суммы, и видно,
 * сколько прибавилось. При «уменьшить движение» значение ставится сразу.
 *
 * Ширину цифр держит вызывающий (`tabular-nums`), иначе строка дрожит.
 */
export function AnimatedNumber({
  value,
  className,
  format = (n) => String(Math.round(n)),
  duration = 0.9,
}: {
  value: number
  className?: string
  format?: (n: number) => string
  duration?: number
}) {
  const reduced = useReducedMotion()
  const mv = useMotionValue(reduced ? value : 0)
  const text = useTransform(mv, (v) => format(v))

  useEffect(() => {
    if (reduced) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [value, reduced, duration, mv])

  return <motion.span className={className}>{text}</motion.span>
}
