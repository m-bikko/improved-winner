import { useEffect, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { haptic } from '@/lib/haptics'
import { tr } from '@/lib/i18n'

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger'

// Четыре уровня, как у системных кнопок. Заливка цветом - только у одного действия на экране
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink',
  secondary: 'bg-raised text-ink',
  soft: 'bg-accent-soft text-accent-soft-ink',
  ghost: 'text-accent',
  danger: 'bg-danger-soft text-danger',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  loading?: boolean
  /**
   * Опасное действие срабатывает со второго нажатия: первое только взводит кнопку
   * на три секунды. Случайный тап по «Удалить» в шторке стоил записи, а окно
   * с вопросом ломало бы поток. Отказаться - `confirm={false}`, если есть отмена.
   */
  confirm?: boolean
  children: ReactNode
}

const ARM_MS = 3000

export function Button({
  variant = 'primary',
  loading = false,
  confirm = variant === 'danger',
  disabled,
  children,
  className = '',
  onClick,
  'aria-label': ariaLabel,
  ...rest
}: Props) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), ARM_MS)
    return () => clearTimeout(id)
  }, [armed])

  const press = (e: MouseEvent<HTMLButtonElement>) => {
    if (confirm && !armed) {
      haptic('warning')
      setArmed(true)
      return
    }
    setArmed(false)
    onClick?.(e)
  }

  return (
    <button
      // Явный type: без него кнопка внутри формы сабмитит её при каждом клике
      type="button"
      disabled={disabled || loading}
      // 50 пунктов - высота крупной системной кнопки. Нажатие отзывается
      // мгновенно (duration-0), возврат мягкий
      className={`flex min-h-[50px] items-center justify-center gap-2 rounded-[14px] px-5 text-[17px]
                  font-semibold transition-[opacity,background-color,color] duration-200
                  active:opacity-60 active:duration-0 disabled:opacity-35
                  ${armed ? 'whitespace-nowrap bg-danger text-white' : VARIANTS[variant]} ${className}`}
      onClick={press}
      // Пока кнопка взведена, скринридер обязан слышать то же, что написано на ней
      aria-label={armed ? undefined : ariaLabel}
      {...rest}
    >
      {loading && <LoaderCircle size={18} className="animate-spin" aria-hidden />}
      {armed ? tr('common.tapToConfirm') : children}
    </button>
  )
}
