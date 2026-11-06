import type { HTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { motion } from 'motion/react'
import { PRESS, SPRING } from './motion'

type CardTag = 'div' | 'section' | 'article' | 'li'

/**
 * Карточка - основная поверхность приложения.
 *
 * Плоская: белая группа на сером фоне, как в системных приложениях. Ни рамки, ни тени:
 * группу отделяет от фона сама разница светлоты, а тридцать теней на экране шумели бы.
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
    <Tag className={`rounded-3xl bg-surface ${className}`} {...rest}>
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
      className={`block rounded-3xl bg-surface ${className}`}
    >
      {children}
    </MotionLink>
  )
}

/**
 * Заголовок группы.
 *
 * Чёрным и полужирным, как заголовки разделов в «Здоровье»: на длинном экране за него
 * цепляется взгляд. Серая мелкая подпись называла группу, но не помогала её найти.
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
      <h2 className="text-[20px] leading-[25px] font-bold">{children}</h2>
      {action}
    </div>
  )
}
