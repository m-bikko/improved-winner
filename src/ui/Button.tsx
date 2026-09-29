import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink shadow-[0_6px_16px_-6px_var(--c-accent)]',
  secondary: 'bg-raised text-ink',
  // Второе по важности действие: заметно, но не спорит с главным
  soft: 'bg-accent-soft text-accent-soft-ink',
  ghost: 'text-muted',
  danger: 'bg-danger-soft text-danger',
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
      // min-h-12 - нижняя граница комфортной цели нажатия на телефоне
      className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base
                  font-semibold transition-[transform,opacity] duration-150 active:scale-[0.97]
                  disabled:opacity-40 disabled:shadow-none disabled:active:scale-100
                  ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && <LoaderCircle size={18} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
