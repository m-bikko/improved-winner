import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * Шторка снизу.
 *
 * Высота ограничена dvh, а не vh: на мобильном Safari vh считает по «свёрнутой»
 * панели браузера, из-за чего нижняя часть шторки уезжает под адресную строку.
 *
 * Клавиатура: содержимое скроллится внутри шторки, а сама она прижата к низу
 * окна. Так поле ввода остаётся над клавиатурой без хаков с visualViewport.
 */
export function Sheet({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[88dvh] flex-col rounded-t-2xl bg-bg pb-safe shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <span className="text-base font-medium">{title}</span>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="-mr-2 p-2 text-muted">
            <X size={20} aria-hidden />
          </button>
        </div>

        {/* overflow-x-hidden — страховка: один широкий нативный элемент внутри
            раздувал контейнер, и за экран уезжало всё содержимое шторки.
            Причину лечим в самих элементах, но пусть шторка не зависит
            от того, вспомню ли я об этом в следующий раз. */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  )
}
