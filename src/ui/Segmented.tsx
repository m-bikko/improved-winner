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
      className={`flex rounded-[10px] bg-raised p-0.5 ${className}`}
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
            // Сам сегмент 32 пункта, как системный; область нажатия добрана до 44
            className={`relative flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg
                        px-2 text-[13px] font-semibold transition-colors after:absolute after:inset-x-0 after:-inset-y-1.5
                        after:content-[''] ${active ? 'text-ink' : 'text-ink/80'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={SPRING}
                className="absolute inset-0 rounded-lg bg-lifted shadow-[0_1px_3px_rgb(0_0_0/0.14),0_0_0_0.5px_rgb(0_0_0/0.04)]"
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
