import { Delete } from 'lucide-react'
import { PIN_LENGTH } from '@/lib/accounts'

type Props = {
  title: string
  subtitle?: string
  value: string
  onChange: (next: string) => void
  error?: string | null
  /** Меняется при каждой неудаче — перезапускает анимацию встряски. */
  shakeKey?: number
  disabled?: boolean
  footer?: React.ReactNode
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/**
 * Цифровая клавиатура на 6 знаков.
 *
 * Своя, а не системный <input type="tel">: на телефоне нужна гарантия, что
 * клавиатура именно цифровая и не перекрывает точки ввода, а тап попадает
 * по-крупному. Заодно это единственный экран до входа, так что вес важен —
 * здесь нет ни одной зависимости.
 */
export function PinPad({
  title,
  subtitle,
  value,
  onChange,
  error,
  shakeKey = 0,
  disabled = false,
  footer,
}: Props) {
  const press = (digit: string) => {
    if (disabled || value.length >= PIN_LENGTH) return
    navigator.vibrate?.(8)
    onChange(value + digit)
  }

  const backspace = () => {
    if (disabled || value.length === 0) return
    navigator.vibrate?.(8)
    onChange(value.slice(0, -1))
  }

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>

      <div key={shakeKey} className={error ? 'animate-shake' : undefined}>
        <div className="flex gap-3" role="status" aria-label={`Введено ${value.length} из ${PIN_LENGTH}`}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`size-3 rounded-full transition-colors ${
                i < value.length ? 'bg-accent' : 'bg-line'
              }`}
            />
          ))}
        </div>
      </div>

      <p className="min-h-5 text-center text-sm text-danger" role="alert">
        {error}
      </p>

      <div className="grid w-full grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <PadButton key={k} onClick={() => press(k)} disabled={disabled}>
            {k}
          </PadButton>
        ))}
        <span />
        <PadButton onClick={() => press('0')} disabled={disabled}>
          0
        </PadButton>
        <PadButton onClick={backspace} disabled={disabled || value.length === 0} label="Стереть">
          <Delete size={22} aria-hidden />
        </PadButton>
      </div>

      {footer}
    </div>
  )
}

function PadButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      // Фиксированная высота, а не aspect-square: на трёх колонках квадрат
      // получается ~110px и пад уползает за экран вместе с «сменить пользователя»
      className="flex h-16 items-center justify-center rounded-2xl bg-raised text-2xl
                 font-medium ring-1 ring-line transition-[transform,background-color]
                 active:scale-95 active:bg-line disabled:opacity-30 disabled:active:scale-100"
    >
      {children}
    </button>
  )
}
