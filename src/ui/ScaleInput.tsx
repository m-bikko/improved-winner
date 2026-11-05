import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { haptic } from '@/lib/haptics'

/**
 * Шкала от 1 до N: нажать на значение или вести пальцем вдоль неё.
 *
 * Раньше это был ряд из десяти кнопок по 29 пикселей: попасть в «7» и не задеть «8»
 * было отдельной задачей, а экран таких рядов - пять. Теперь цель - вся высота ряда,
 * значение идёт за пальцем непрерывно, а вертикальная прокрутка остаётся за браузером.
 */
export function ScaleInput({
  value,
  onChange,
  label,
  max = 10,
}: {
  value: number | null
  onChange: (value: number) => void
  label: string
  max?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const current = useRef(value)
  current.current = value

  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    const next = Math.min(max, Math.max(1, Math.ceil(((clientX - rect.left) / rect.width) * max)))
    if (next !== current.current) {
      current.current = next
      haptic('tick')
      onChange(next)
    }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pick(e.clientX)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    onChange(Math.min(max, Math.max(1, (value ?? 0) + step)))
  }

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      data-sheet-lock
      data-no-pull
      className="grid h-11 touch-pan-y select-none items-center gap-[3px] rounded-xl"
      style={{ gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: max }, (_, k) => k + 1).map((n) => {
        const on = value === n
        const under = value !== null && n < value
        return (
          <span
            key={n}
            aria-hidden
            className={`flex h-9 items-center justify-center rounded-[10px] text-[14px] font-bold tabular-nums transition-colors duration-100 ${
              on ? 'bg-accent text-accent-ink' : under ? 'bg-accent-soft text-accent-soft-ink' : 'bg-raised text-muted'
            }`}
          >
            {n}
          </span>
        )
      })}
    </div>
  )
}
