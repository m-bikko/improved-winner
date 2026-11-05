import { haptic } from '@/lib/haptics'

/**
 * Переключатель вкл/выкл в духе iOS: трек и бегунок, который видно боковым
 * зрением. При нажатии бегунок вытягивается в сторону движения - отклик
 * появляется ещё до того, как палец отпущен.
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
      onClick={() => {
        haptic('tick')
        onChange(!checked)
      }}
      // after: - невидимая область нажатия до 44px: трек 31px в высоту
      // меньше комфортной цели для пальца, а растягивать сам трек некрасиво
      className={`group relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200
                  after:absolute after:-inset-[7px] after:content-['']
                  disabled:opacity-40 ${checked ? 'bg-accent' : 'bg-fill'}`}
    >
      <span
        aria-hidden
        className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.25)]
                    transition-[left,width] duration-200 ease-[cubic-bezier(0.3,0.8,0.3,1)]
                    group-active:w-[33px] ${
                      checked ? 'left-[22px] group-active:left-[16px]' : 'left-[2px]'
                    }`}
      />
    </button>
  )
}
