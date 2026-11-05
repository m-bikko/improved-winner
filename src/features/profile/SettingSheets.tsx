import { useState, type FormEvent, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { haptic } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import { Button } from '@/ui/Button'
import { NumberField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'

/**
 * Одно число: год рождения, рост, калории. Поле сразу в фокусе, диапазон
 * проверяется при вводе, а не после нажатия «Сохранить».
 */
export function NumberSheet({
  title,
  value,
  suffix,
  min,
  max,
  unit,
  hint,
  placeholder,
  onSave,
  onClose,
}: {
  title: string
  value: number | null
  suffix?: string | undefined
  min: number
  max: number
  unit: string
  hint?: string | undefined
  placeholder?: string | undefined
  onSave: (value: number) => void
  onClose: () => void
}) {
  const t = useT()
  const [draft, setDraft] = useState<number | ''>(value ?? '')
  const outOfRange = draft !== '' && (draft < min || draft > max)
  const ready = draft !== '' && !outOfRange

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (draft === '' || outOfRange) return
    onSave(draft)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={title}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <NumberField
          label={title}
          hideLabel
          autoFocus
          value={draft}
          onValueChange={setDraft}
          suffix={suffix}
          max={max}
          placeholder={placeholder}
          invalid={outOfRange}
          hint={outOfRange ? t('profile.expected', { lo: min, hi: max, unit }) : hint}
        />
        <Button type="submit" disabled={!ready}>
          {t('common.save')}
        </Button>
      </form>
    </Sheet>
  )
}

/**
 * Выбор из списка. Нажатие сразу применяет и закрывает: как в системных настройках,
 * подтверждать тут нечего, а передумать можно тем же способом.
 */
export function ChoiceSheet<T extends string>({
  title,
  value,
  options,
  footer,
  onPick,
  onClose,
}: {
  title: string
  value: T | null
  options: readonly { value: T; label: string }[]
  footer?: ReactNode
  onPick: (value: T) => void
  onClose: () => void
}) {
  return (
    <Sheet open onClose={onClose} title={title}>
      <ul className="list-group overflow-hidden rounded-3xl bg-surface shadow-card">
        {options.map((o) => {
          const on = o.value === value
          return (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  haptic('tick')
                  onPick(o.value)
                  onClose()
                }}
                aria-pressed={on}
                className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-2.5 text-left text-base
                           transition-colors duration-150 active:bg-raised active:duration-0"
              >
                <span className={`min-w-0 flex-1 ${on ? 'font-semibold' : ''}`}>{o.label}</span>
                {on && <Check size={20} strokeWidth={2.6} className="shrink-0 text-accent" aria-hidden />}
              </button>
            </li>
          )
        })}
      </ul>
      {footer && <p className="mt-3 px-1 text-[13px] text-muted">{footer}</p>}
    </Sheet>
  )
}
