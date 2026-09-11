import type { ReactNode } from 'react'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useT } from '@/lib/i18n'

export function Loading({ label }: { label?: string }) {
  const t = useT()
  return (
    <div className="flex justify-center py-16 text-muted">
      <LoaderCircle size={22} className="animate-spin" aria-label={label ?? t('common.loading')} />
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  // `| undefined` явно: под exactOptionalPropertyTypes «необязательное»
  // и «может быть undefined» - разные вещи, а вызывающий код передаёт
  // условное значение
  hint?: string | undefined
  action?: ReactNode | undefined
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
      <p className="text-base text-ink">{title}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {action}
    </div>
  )
}

/**
 * Ошибка запроса.
 *
 * Текст показываем как есть: пользователей двое, оба разберутся, а «что-то
 * пошло не так» не даёт ни им, ни мне ни малейшей зацепки при разборе.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT()
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
      <CircleAlert size={24} className="text-danger" aria-hidden />
      <p className="text-sm text-muted">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-sm text-accent underline">
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}
