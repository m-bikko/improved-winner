import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink',
  secondary: 'bg-raised text-ink ring-1 ring-line',
  ghost: 'text-muted',
  danger: 'text-danger ring-1 ring-danger/30',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: Props) {
  return (
    <button
      // Явный type: без него кнопка внутри формы сабмитит её при каждом клике
      type="button"
      disabled={disabled || loading}
      // min-h-12 — нижняя граница комфортной цели нажатия на телефоне
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base
                  font-medium transition-[transform,opacity] active:scale-[0.98]
                  disabled:opacity-40 disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && <LoaderCircle size={18} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
