import type { LucideIcon } from 'lucide-react'
import { TONE_CLASS, type Tone } from './tones'

const SIZE = {
  sm: { box: 'size-[29px] rounded-[7px]', icon: 18 },
  md: { box: 'size-9 rounded-[9px]', icon: 21 },
  lg: { box: 'size-12 rounded-[12px]', icon: 27 },
} as const

/**
 * Значок раздела: белый глиф на цветном квадрате, как в Настройках iPhone.
 *
 * У каждого раздела свой тон, и один и тот же - на главной, в «Ещё»
 * и в шапке раздела. Так раздел узнаётся по цвету раньше, чем по слову.
 */
export function IconBadge({
  icon: Icon,
  tone,
  size = 'md',
  className = '',
}: {
  icon: LucideIcon
  tone: Tone
  size?: keyof typeof SIZE
  className?: string
}) {
  const s = SIZE[size]
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center text-white ${s.box} ${TONE_CLASS[tone].solid} ${className}`}
    >
      <Icon size={s.icon} strokeWidth={2.1} />
    </span>
  )
}
