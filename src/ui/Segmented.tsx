import { useId, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { SPRING } from './motion'

type Option<T extends string> = { value: T; label: ReactNode; icon?: LucideIcon | undefined }

/**
 * Переключатель из двух-четырёх вариантов.
 *
 * Раньше он был скопирован в шесть экранов, и каждая копия чуть отличалась
 * отступами. Подложка выбранного варианта переезжает пружиной - по движению
 * видно, куда ушёл выбор, а не просто что-то перекрасилось.
 *
 * `layoutId` берётся из useId: два переключателя на одном экране
 * не должны перетягивать подложку друг у друга.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
}: {
  value: T
  onChange: (next: T) => void
  options: readonly Option<T>[]
  ariaLabel?: string | undefined
  className?: string
}) {
  const id = useId()
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex gap-1 rounded-2xl bg-raised p-1 ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`relative flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl
                        px-2 text-sm font-semibold transition-colors ${
                          active ? 'text-ink' : 'text-muted'
                        }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={SPRING}
                className="absolute inset-0 rounded-xl bg-lifted shadow-card"
                aria-hidden
              />
            )}
            <span className="relative flex min-w-0 items-center gap-1.5">
              {Icon && <Icon size={16} aria-hidden />}
              <span className="truncate">{o.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
