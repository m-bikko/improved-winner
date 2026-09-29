/**
 * Переключатель вкл/выкл в духе iOS.
 *
 * Вместо чекбокса: на телефоне квадратик в 16 пикселей - цель, в которую
 * не попасть, и его состояние плохо читается издалека. Здесь трек в полпальца
 * и бегунок, который видно боковым зрением.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  /** Для скринридера, если рядом нет видимой подписи, связанной с кнопкой. */
  label: string
  disabled?: boolean | undefined
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // after: - невидимая область нажатия до 44px: трек 30px в высоту
      // меньше комфортной цели для пальца, а растягивать сам трек некрасиво
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200
                  after:absolute after:-inset-[7px] after:content-['']
                  disabled:opacity-40 ${checked ? 'bg-accent' : 'bg-line'}`}
    >
      <span
        aria-hidden
        className={`absolute top-[3px] left-[3px] size-6 rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.22)]
                    transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`}
      />
    </button>
  )
}
