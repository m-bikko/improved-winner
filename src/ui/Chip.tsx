import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Выбираемый чип.
 *
 * Выбранный залит цветом акцента целиком: состояние видно издалека и среди сорока
 * соседей, а мягкая подложка терялась. Состояние продублировано `aria-pressed` -
 * цветом одним о нём не говорят.
 *
 * Сам чип 32-36 пунктов, а область нажатия добрана до 44 невидимым слоем: ряды чипов
 * остаются плотными, а палец не промахивается.
 */
export function Chip({
  selected,
  onClick,
  icon: Icon,
  children,
  disabled,
  size = 'md',
}: {
  selected: boolean
  onClick: () => void
  icon?: LucideIcon | undefined
  children: ReactNode
  disabled?: boolean | undefined
  size?: 'sm' | 'md'
}) {
  const pad =
    size === 'sm'
      ? "min-h-8 px-3 py-1 text-[15px] after:-inset-y-1.5"
      : "min-h-9 px-3.5 py-1.5 text-[15px] after:-inset-y-1"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`relative inline-flex items-center gap-1.5 rounded-full font-medium
                  transition-[background-color,color,opacity] duration-150 after:absolute after:inset-x-0 after:content-['']
                  active:opacity-60 active:duration-0 disabled:opacity-40 ${pad} ${
                    selected ? 'bg-accent text-accent-ink' : 'bg-raised text-ink'
                  }`}
    >
      {Icon && <Icon size={16} aria-hidden strokeWidth={selected ? 2.4 : 2} />}
      {children}
    </button>
  )
}

/**
 * Неинтерактивный чип - метка состояния в сводках («Спокойно», «Бодро»).
 */
export function Tag({
  icon: Icon,
  children,
  tone = 'neutral',
}: {
  icon?: LucideIcon | undefined
  children: ReactNode
  tone?: 'neutral' | 'accent'
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium ${
        tone === 'accent' ? 'bg-accent-soft text-accent-soft-ink' : 'bg-raised text-ink'
      }`}
    >
      {Icon && <Icon size={13} aria-hidden className="shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  )
}
