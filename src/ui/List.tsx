import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { Card } from './Card'
import { IconBadge } from './IconBadge'
import type { Tone } from './tones'

/**
 * Сгруппированный список - строки в одной карточке с разделителями
 * от текста, а не от края. Как в Настройках iPhone: группа читается
 * одним блоком, а строки внутри не спорят рамками.
 */
export function ListGroup({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <Card
      as="div"
      // :not(.fixed) - строка может принести с собой шторку (Face ID в профиле),
      // и разделитель нарисовался бы ей линией по верхнему краю экрана
      className={`overflow-hidden [&>*+*:not(.fixed)]:border-t [&>*+*:not(.fixed)]:border-line ${className}`}
    >
      {children}
    </Card>
  )
}

type RowProps = {
  title: ReactNode
  subtitle?: ReactNode | undefined
  icon?: LucideIcon | undefined
  tone?: Tone | undefined
  /** Правый край: значение, счётчик, переключатель. */
  trailing?: ReactNode | undefined
  /** Шеврон по умолчанию есть у ссылки и у кнопки. */
  chevron?: boolean | undefined
  danger?: boolean | undefined
}

/**
 * Строка списка. Ссылка, кнопка или просто строка - по тому, что передано.
 *
 * Строка во всю ширину карточки и есть область нажатия: поля по краям
 * превратили бы её в кнопку с промахами.
 */
export function ListRow(
  props: RowProps & ({ to: string } | { onClick: () => void } | { static: true }),
) {
  const { title, subtitle, icon, tone = 'slate', trailing, danger } = props
  const interactive = !('static' in props)
  const chevron = props.chevron ?? interactive

  const body = (
    <>
      {icon && <IconBadge icon={icon} tone={danger ? 'rose' : tone} size="sm" />}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] font-medium ${danger ? 'text-danger' : ''}`}>
          {title}
        </span>
        {subtitle && <span className="mt-0.5 block truncate text-[13px] text-muted">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-sm text-muted">{trailing}</span>}
      {chevron && <ChevronRight size={18} aria-hidden className="shrink-0 text-muted/70" />}
    </>
  )
  const cls = 'flex w-full min-h-14 items-center gap-3 px-4 py-2.5 text-left'
  const press = 'transition-colors active:bg-raised'

  if ('to' in props) {
    return (
      <Link to={props.to} className={`${cls} ${press}`}>
        {body}
      </Link>
    )
  }
  if ('onClick' in props) {
    return (
      <button type="button" onClick={props.onClick} className={`${cls} ${press}`}>
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}
