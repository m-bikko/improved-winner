import { useState, type ReactNode } from 'react'
import { motion, useMotionValue, useTransform, type PanInfo } from 'motion/react'

/**
 * Верхняя карточка колоды: тянется пальцем и поворачивается, по ходу
 * проступает «да» или «нет». Отпустил дальше порога - решение; не дотянул -
 * вернулась. Общая для имён малышу и идей для свиданий.
 *
 * Обёртка для `AnimatePresence`: карточка улетает в сторону решения.
 */
export function SwipeCard({
  children,
  onDecide,
  yes,
  no,
}: {
  children: ReactNode
  onDecide: (liked: boolean) => void
  yes: string
  no: string
}) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-14, 14])
  const yesOpacity = useTransform(x, [20, 110], [0, 1])
  const noOpacity = useTransform(x, [-110, -20], [1, 0])
  const [gone, setGone] = useState<1 | -1 | 0>(0)

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 110 || info.velocity.x > 600) {
      setGone(1)
      onDecide(true)
    } else if (info.offset.x < -110 || info.velocity.x < -600) {
      setGone(-1)
      onDecide(false)
    }
  }

  return (
    <motion.div
      className="absolute inset-0 touch-pan-y"
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={onDragEnd}
      initial={{ scale: 0.95, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ x: gone === 0 ? 0 : gone * 420, opacity: 0, rotate: gone * 18, transition: { duration: 0.3 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
    >
      {children}
      <motion.span
        style={{ opacity: yesOpacity }}
        className="pointer-events-none absolute top-6 left-6 -rotate-12 rounded-xl border-2 border-tone-green px-2.5 py-1 font-display text-lg font-extrabold text-tone-green"
      >
        {yes}
      </motion.span>
      <motion.span
        style={{ opacity: noOpacity }}
        className="pointer-events-none absolute top-6 right-6 rotate-12 rounded-xl border-2 border-tone-rose px-2.5 py-1 font-display text-lg font-extrabold text-tone-rose"
      >
        {no}
      </motion.span>
    </motion.div>
  )
}

/** Круглая кнопка под колодой: «нет», «да», «отменить», «добавить». */
export function RoundButton({
  label,
  onClick,
  disabled,
  accent = false,
  small = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  accent?: boolean
  small?: boolean
  children: ReactNode
}) {
  const look = small ? 'size-12 bg-surface text-muted' : accent ? 'size-16 bg-accent text-accent-ink' : 'size-16 bg-surface text-tone-rose'
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center rounded-full shadow-card transition-transform active:scale-90 disabled:opacity-40 ${look}`}
    >
      {children}
    </button>
  )
}
