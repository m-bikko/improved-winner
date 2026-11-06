/**
 * Тона разделов - для значков и аватаров, не для данных.
 *
 * Классы выписаны целиком, а не собраны строкой: Tailwind находит утилиты
 * по тексту исходников, и `bg-tone-${tone}-soft` он бы не увидел.
 */
export type Tone =
  | 'rose'
  | 'amber'
  | 'violet'
  | 'sky'
  | 'green'
  | 'teal'
  | 'orange'
  | 'slate'
  | 'indigo'
  | 'plum'
  | 'accent'

export const TONE_CLASS: Record<Tone, { soft: string; fg: string; solid: string }> = {
  rose: { soft: 'bg-tone-rose-soft', fg: 'text-tone-rose', solid: 'bg-tone-rose-solid' },
  amber: { soft: 'bg-tone-amber-soft', fg: 'text-tone-amber', solid: 'bg-tone-amber-solid' },
  violet: { soft: 'bg-tone-violet-soft', fg: 'text-tone-violet', solid: 'bg-tone-violet-solid' },
  sky: { soft: 'bg-tone-sky-soft', fg: 'text-tone-sky', solid: 'bg-tone-sky-solid' },
  green: { soft: 'bg-tone-green-soft', fg: 'text-tone-green', solid: 'bg-tone-green-solid' },
  teal: { soft: 'bg-tone-teal-soft', fg: 'text-tone-teal', solid: 'bg-tone-teal-solid' },
  orange: { soft: 'bg-tone-orange-soft', fg: 'text-tone-orange', solid: 'bg-tone-orange-solid' },
  slate: { soft: 'bg-tone-slate-soft', fg: 'text-tone-slate', solid: 'bg-tone-slate-solid' },
  indigo: { soft: 'bg-tone-indigo-soft', fg: 'text-tone-indigo', solid: 'bg-tone-indigo-solid' },
  plum: { soft: 'bg-tone-plum-soft', fg: 'text-tone-plum', solid: 'bg-tone-plum-solid' },
  accent: { soft: 'bg-accent-soft', fg: 'text-accent-soft-ink', solid: 'bg-accent' },
}

/** CSS-переменная тона - для SVG и градиентов, куда классы Tailwind не дотянутся. */
export function toneVar(tone: Tone): string {
  return tone === 'accent' ? 'var(--c-accent)' : `var(--t-${tone})`
}
