import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Выбираемый чип.
 *
 * Выбранный заливается мягким тоном акцента с тонкой обводкой того же тона:
 * одной сменой заливки на сером фоне выбор терялся среди сорока соседей.
 * Состояние продублировано `aria-pressed` - цветом одним о нём не говорят.
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
  // Палец не меньше от того, что чип маленький: sm добирает высоту до 44 невидимой
  // областью нажатия, md сразу 44
  const pad =
    size === 'sm'
      ? "relative min-h-10 px-3 py-1.5 text-sm after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-['']"
      : 'min-h-11 px-3.5 py-2 text-[15px]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset
                  transition-[background-color,color,transform] duration-150 active:scale-95 active:duration-75
                  disabled:opacity-40 disabled:active:scale-100 ${pad} ${
                    selected
                      ? 'bg-accent-soft text-accent-soft-ink ring-accent/35'
                      : 'bg-raised text-ink ring-transparent'
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
