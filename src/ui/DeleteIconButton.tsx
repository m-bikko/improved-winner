import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { haptic } from '@/lib/haptics'
import { tr } from '@/lib/i18n'

/**
 * Значок удаления для того, что не вернуть: голосовая записка, кадр дня.
 *
 * То же правило, что у `Button variant="danger"`: первое нажатие только взводит.
 * Значок раскрывается в подпись на месте, поэтому ни окно с вопросом, ни прицеливание
 * заново не нужны, а случайное касание ничего не стоит.
 */
export function DeleteIconButton({
  onDelete,
  label,
  size = 16,
  onPhoto = false,
  className = '',
}: {
  onDelete: () => void
  label: string
  size?: number
  /** Лежит поверх снимка: нужна своя подложка, чтобы значок читался на любом кадре. */
  onPhoto?: boolean
  className?: string
}) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(id)
  }, [armed])

  return (
    <button
      type="button"
      aria-label={armed ? tr('common.tapToConfirm') : label}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onDelete()
          return
        }
        haptic('warning')
        setArmed(true)
      }}
      className={`flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full transition-colors duration-150 ${
        armed
          ? 'bg-danger px-3 text-[13px] font-semibold whitespace-nowrap text-white'
          : onPhoto
            ? 'bg-black/45 text-white'
            : 'text-muted'
      } ${className}`}
    >
      <Trash2 size={size} aria-hidden />
      {armed && tr('common.tapToConfirm')}
    </button>
  )
}
