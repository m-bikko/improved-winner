import type { LucideIcon } from 'lucide-react'
import { TONE_CLASS, type Tone } from './tones'

const SIZE = {
  sm: { box: 'size-8 rounded-[10px]', icon: 16 },
  md: { box: 'size-10 rounded-xl', icon: 19 },
  lg: { box: 'size-12 rounded-2xl', icon: 22 },
} as const

/**
 * Цветной значок раздела: мягкая подложка и иконка того же тона.
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
  const t = TONE_CLASS[tone]
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center ${s.box} ${t.soft} ${t.fg} ${className}`}
    >
      <Icon size={s.icon} strokeWidth={2.1} />
    </span>
  )
}
