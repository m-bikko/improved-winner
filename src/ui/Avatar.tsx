import { TONE_CLASS, type Tone } from './tones'

const SIZE = {
  sm: 'size-7 text-xs',
  md: 'size-10 text-base',
  lg: 'size-14 text-xl',
} as const

/**
 * Круг с первой буквой имени.
 *
 * Фотографий у профилей нет, а буква в своём цвете узнаётся быстрее,
 * чем имя строкой: на главной и в сравнении дня человек видит «кто»
 * раньше, чем прочтёт.
 */
export function Avatar({
  name,
  tone,
  size = 'md',
  ring = false,
}: {
  name: string
  tone: Tone
  size?: keyof typeof SIZE
  /** Обводка цветом фона - когда аватары стоят внахлёст. */
  ring?: boolean
}) {
  const t = TONE_CLASS[tone]
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-extrabold
                  ${SIZE[size]} ${t.soft} ${t.fg} ${ring ? 'ring-[3px] ring-bg' : ''}`}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

/**
 * Постоянный тон человека.
 *
 * По порядку идентификаторов, а не «я» и «партнёр»: иначе у каждого
 * на телефоне свой цвет был бы у разных людей, и цвет перестал бы
 * означать человека.
 */
export function personTone(userId: string, allIds: readonly string[]): Tone {
  const sorted = [...allIds].sort()
  return sorted.indexOf(userId) === 0 ? 'sky' : 'rose'
}
