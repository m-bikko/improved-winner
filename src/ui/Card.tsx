import type { HTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { motion } from 'motion/react'
import { PRESS, SPRING } from './motion'

type CardTag = 'div' | 'section' | 'article' | 'li'

/**
 * Карточка - основная поверхность приложения.
 *
 * Без рамки: раньше каждая карточка обводилась `ring-1 ring-line`, и экран
 * из одинаковых обведённых прямоугольников читался как таблица. Глубину
 * теперь даёт тень, а в тёмной теме - ступень светлоты.
 *
 * Отступы внутри НЕ ставятся: у списков строка во всю ширину и есть область
 * нажатия, у текстовых блоков - p-4. Решает тот, кто знает содержимое.
 */
export function Card({
  as: Tag = 'div',
  className = '',
  children,
  ...rest
}: { as?: CardTag; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`rounded-3xl bg-surface shadow-card ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

const MotionLink = motion.create(Link)

/**
 * Карточка-ссылка с пружинным нажатием.
 *
 * Пропсы перечислены явно, а не пробрасываются все от Link: у motion
 * свои onAnimationStart и onDrag, и с DOM-версиями они не совместимы.
 */
export function CardLink({
  to,
  className = '',
  children,
  ariaLabel,
}: {
  to: LinkProps['to']
  className?: string
  children: ReactNode
  ariaLabel?: string | undefined
}) {
  return (
    <MotionLink
      to={to}
      aria-label={ariaLabel}
      whileTap={PRESS}
      transition={SPRING}
      className={`block rounded-3xl bg-surface shadow-card ${className}`}
    >
      {children}
    </MotionLink>
  )
}

/**
 * Подпись над группой карточек.
 *
 * Мелкая и приглушённая намеренно: она называет группу, а не спорит
 * за внимание с содержимым.
 */
export function SectionTitle({
  children,
  action,
  className = '',
}: {
  children: ReactNode
  action?: ReactNode | undefined
  className?: string
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 px-1 ${className}`}>
      <h2 className="font-display text-[15px] font-bold tracking-tight text-muted">{children}</h2>
      {action}
    </div>
  )
}
