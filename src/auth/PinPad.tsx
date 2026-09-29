import { useT } from '@/lib/i18n'
import { Delete } from 'lucide-react'
import { PIN_LENGTH } from '@/lib/accounts'

type Props = {
  title: string
  subtitle?: string
  value: string
  onChange: (next: string) => void
  error?: string | null
  /** Меняется при каждой неудаче - перезапускает анимацию встряски. */
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
 * по-крупному. Заодно это единственный экран до входа, так что вес важен -
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
  const t = useT()
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
    <div className="flex w-full max-w-xs flex-col items-center gap-7">
      <div className="text-center">
        <h1 className="font-display text-[26px] font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>

      <div key={shakeKey} className={error ? 'animate-shake' : undefined}>
        <div className="flex gap-4" role="status" aria-label={t('pin.entered', { n: value.length, total: PIN_LENGTH })}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`size-3.5 rounded-full transition-[background-color,transform] duration-150 ${
                i < value.length ? 'scale-110 bg-accent' : 'bg-line'
              }`}
            />
          ))}
        </div>
      </div>

      <p className="-my-2 min-h-5 text-center text-sm text-danger" role="alert">
        {error}
      </p>

      <div className="grid w-full grid-cols-3 gap-x-5 gap-y-3.5">
        {KEYS.map((k) => (
          <PadButton key={k} onClick={() => press(k)} disabled={disabled}>
            {k}
          </PadButton>
        ))}
        <span />
        <PadButton onClick={() => press('0')} disabled={disabled}>
          0
        </PadButton>
        <PadButton onClick={backspace} disabled={disabled || value.length === 0} label={t('pin.erase')}>
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
      // Фиксированный размер, а не aspect-square по ширине колонки: на трёх
      // колонках квадрат получается ~110px и пад уползает за экран вместе
      // с «сменить пользователя». Круг 72px - как у системного набора
      className="mx-auto flex size-[72px] items-center justify-center rounded-full bg-surface
                 font-display text-[28px] font-bold shadow-card transition-[transform,background-color]
                 active:scale-90 active:bg-raised disabled:opacity-30 disabled:active:scale-100"
    >
      {children}
    </button>
  )
}
