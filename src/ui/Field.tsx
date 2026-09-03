import { useId, type InputHTMLAttributes } from 'react'

type BaseProps = {
  label: string
  hint?: string | undefined
  suffix?: string | undefined
  /** Подпись остаётся для скринридера, но не занимает места в макете. */
  hideLabel?: boolean | undefined
}

const INPUT_CLASS =
  'w-full rounded-xl bg-surface px-4 py-3 ring-1 ring-line outline-none ' +
  'focus:ring-2 focus:ring-accent placeholder:text-muted'

export function Field({
  label,
  hint,
  suffix,
  hideLabel,
  ...rest
}: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className={hideLabel ? 'sr-only' : 'text-sm text-muted'}>{label}</span>
      <span className="relative flex items-center">
        <input id={id} className={`${INPUT_CLASS} ${suffix ? 'pr-12' : ''}`} {...rest} />
        {suffix && <span className="absolute right-4 text-sm text-muted">{suffix}</span>}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}

type NumberProps = BaseProps & {
  value: number | ''
  onValueChange: (value: number | '') => void
  min?: number
  max?: number
  placeholder?: string
}

/**
 * Числовое поле для граммов и КБЖУ.
 *
 * inputMode="decimal" вместо type="number": на телефоне даёт цифровую
 * клавиатуру, но не тащит за собой спиннеры, скролл-колесом-меняется-значение
 * и валидацию браузера, которая на дробных с запятой ведёт себя по-разному.
 *
 * Запятая принимается наравне с точкой — на русской раскладке её набирают чаще.
 */
export function NumberField({
  label,
  hint,
  suffix,
  hideLabel,
  value,
  onValueChange,
  min = 0,
  max,
  placeholder,
}: NumberProps) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className={hideLabel ? 'sr-only' : 'text-sm text-muted'}>{label}</span>
      <span className="relative flex items-center">
        <input
          id={id}
          inputMode="decimal"
          value={value === '' ? '' : String(value)}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value.replace(',', '.').trim()
            if (raw === '') return onValueChange('')
            if (!/^\d*\.?\d*$/.test(raw)) return
            const parsed = Number(raw)
            if (Number.isNaN(parsed)) return
            if (max !== undefined && parsed > max) return
            if (parsed < min) return
            onValueChange(parsed)
          }}
          className={`${INPUT_CLASS} ${suffix ? 'pr-12' : ''}`}
        />
        {suffix && <span className="absolute right-4 text-sm text-muted">{suffix}</span>}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}
