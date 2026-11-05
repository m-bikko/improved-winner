/**
 * Тактильный отклик - только на значимое: фиксация, успех, предупреждение.
 * Отклик на всё подряд приучает его не замечать.
 *
 * На Android - Vibration API. На iOS его нет, но с iOS 18 переключатель
 * `<input switch>` отзывается системным откликом при нажатии, в том числе
 * программном внутри жеста. Там, где не сработает ни то ни другое, просто тихо.
 */
export type HapticKind = 'tick' | 'commit' | 'success' | 'warning' | 'error'

const PATTERN: Record<HapticKind, number | number[]> = {
  tick: 6,
  commit: 10,
  success: [10, 40, 14],
  warning: [16, 50, 16],
  error: [30, 50, 30],
}

let toggle: HTMLLabelElement | null = null

function iosTick(): void {
  if (!toggle) {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.tabIndex = -1
    toggle = document.createElement('label')
    toggle.setAttribute('aria-hidden', 'true')
    toggle.style.display = 'none'
    toggle.append(input)
    document.body.append(toggle)
  }
  toggle.click()
}

export function haptic(kind: HapticKind = 'tick'): void {
  // До первого нажатия браузер всё равно откажет, да ещё и выругается в консоль
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return
  if (typeof navigator.vibrate === 'function') navigator.vibrate(PATTERN[kind])
  else iosTick()
}
