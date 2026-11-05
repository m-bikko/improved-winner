import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { tr } from '@/lib/i18n'
import { toast } from '@/ui/Toast'

const WINDOW_MS = 5000

const pending = new Set<() => void>()

// Закрыли приложение, пока висит «Отменить», - значит, передумывать не стали
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const commit of [...pending]) commit()
  })
}

/**
 * Удаление с отменой: прощение вместо вопроса «вы уверены?».
 *
 * Запись исчезает из кэша сразу, а в базу удаление уходит через пять секунд, если
 * его не отменили. Подтверждения приучают нажимать не читая, а случайно смахнутая
 * строка дневника стоит одного нажатия на «Отменить».
 */
export function undoableDelete<T>(input: {
  qc: QueryClient
  queryKey: QueryKey
  remove: (data: T) => T
  commit: () => unknown
  text: string
}): void {
  const { qc, queryKey, remove, commit, text } = input
  const snapshot = qc.getQueryData<T>(queryKey)
  if (snapshot !== undefined) qc.setQueryData<T>(queryKey, remove(snapshot))

  const fire = () => {
    clearTimeout(timer)
    pending.delete(fire)
    void commit()
  }
  const timer = setTimeout(fire, WINDOW_MS)
  pending.add(fire)

  toast({
    text,
    ms: WINDOW_MS,
    action: {
      label: tr('common.undo'),
      onClick: () => {
        clearTimeout(timer)
        pending.delete(fire)
        if (snapshot !== undefined) qc.setQueryData<T>(queryKey, snapshot)
      },
    },
  })
}
