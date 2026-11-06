import { TONE_CLASS, type Tone } from './tones'

const SIZE = {
  sm: 'size-7 text-[13px]',
  md: 'size-9 text-[17px]',
  lg: 'size-14 text-[22px]',
} as const

/**
 * Круг с первой буквой имени.
 *
 * Фотографий у профилей нет, а белая буква на цвете человека узнаётся быстрее,
 * чем имя строкой: на главной и в сравнении дня человек видит «кто»
 * раньше, чем прочтёт. Как монограмма в «Контактах».
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
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white
                  ${SIZE[size]} ${t.solid} ${ring ? 'ring-[3px] ring-bg' : ''}`}
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
