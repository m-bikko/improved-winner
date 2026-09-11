import { useT } from '@/lib/i18n'
import { useEffect } from 'react'
import { X } from 'lucide-react'

/**
 * Просмотр картинки во весь экран.
 *
 * Отдельно от шторки: шторка прижата к низу и ограничена по высоте, а тут
 * нужна вся площадь. Закрывается тапом по фону, крестиком и Escape -
 * из полноэкранного просмотра человек выходит первым, что придёт в голову.
 */
export function PhotoViewer({
  url,
  alt,
  onClose,
}: {
  url: string
  alt: string
  onClose: () => void
}) {
  const t = useT()
  useEffect(() => {
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
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    >
      <img
        src={url}
        alt={alt}
        // Клик по самой картинке не закрывает: человек мог целиться в неё,
        // чтобы рассмотреть, и закрытие в ответ выглядело бы промахом
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-xl object-contain"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        className="absolute top-4 right-4 rounded-full bg-black/50 p-2.5 text-white pt-safe"
      >
        <X size={22} aria-hidden />
      </button>
    </div>
  )
}
