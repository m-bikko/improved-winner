import { tr } from '@/lib/i18n'
import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

/**
 * Уведомление о новой версии.
 *
 * Сейчас стратегия 'autoUpdate' (почему - в vite.config.ts): новая версия
 * встаёт сама, и этот тост показывается только если воркер всё-таки ждёт.
 *
 * Плюс страховка: если ленивый чанк всё-таки не доехал (обновление приехало
 * между загрузкой страницы и переходом по разделу), перезагружаем страницу
 * сами - иначе раздел просто не откроется и выглядеть это будет как поломка.
 *
 * Текст берётся через tr(), а не через useT(): компонент рендерится СНАРУЖИ
 * LangProvider - как и граница ошибок, и ровно по той же причине. Хук там
 * роняет всё приложение в белый экран.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (error) => console.error('Service Worker registration failed:', error),
    // Браузер сам ищет новую версию только при навигации, а приложение
    // на домашнем экране месяцами не навигирует: его сворачивают и
    // разворачивают. Поэтому спрашиваем при каждом возвращении на экран -
    // так выкаченное исправление доезжает без ручного «обнови страницу»
    onRegisteredSW: (_url, registration) => {
      if (!registration) return
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => {})
      })
    },
  })

  useEffect(() => {
    const onImportError = (event: PromiseRejectionEvent) => {
      const message = String(event.reason?.message ?? event.reason ?? '')
      if (/dynamically imported module|Importing a module script failed/i.test(message)) {
        window.location.reload()
      }
    }
    window.addEventListener('unhandledrejection', onImportError)
    return () => window.removeEventListener('unhandledrejection', onImportError)
  }, [])

  if (!needRefresh) return null

  return (
    <div
      role="status"
      // Над панелью вкладок: у нижнего края её бы закрыла панель
      className="fixed inset-x-3 bottom-above-tabbar z-50 mx-auto flex max-w-lg items-center gap-3
                 rounded-2xl bg-surface px-4 py-3 shadow-float"
    >
      <RefreshCw size={18} className="shrink-0 text-accent" aria-hidden />
      <span className="flex-1 text-sm">{tr('update.available')}</span>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink"
      >
        {tr('common.refresh')}
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        className="px-2 py-2 text-sm text-muted"
      >
        {tr('update.later')}
      </button>
    </div>
  )
}
