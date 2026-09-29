import { tr } from '@/lib/i18n'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { CircleAlert, LoaderCircle } from 'lucide-react'

type Props = { children: ReactNode }
type State = { error: Error | null; resetting: boolean }

/**
 * Полный сброс клиентского состояния.
 *
 * Раньше кнопка чистила только IndexedDB - и против главной причины поломки
 * не помогала вовсе. Service Worker продолжал отдавать старую сборку, приложение
 * падало снова, а нажатие «сбросить кэш» выглядело как насмешка.
 *
 * localStorage НЕ трогаем намеренно: там лежит сессия и очередь неотправленных
 * записей дневника. Разлогинить человека и потерять внесённую еду ради починки
 * рендера - плохой размен.
 */
async function hardReset(): Promise<void> {
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    await Promise.all(registrations.map((r) => r.unregister()))
  } catch {
    /* приватный режим, отключённые SW - не повод останавливаться */
  }

  try {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  } catch {
    /* см. выше */
  }

  try {
    indexedDB.deleteDatabase('keyval-store')
  } catch {
    /* см. выше */
  }

  // reload(true) давно не работает, но снятый SW уже не сможет перехватить
  // запрос, поэтому обычной перезагрузки достаточно
  window.location.reload()
}

/**
 * Ловит падения рендера, чтобы вместо белого экрана был текст ошибки.
 *
 * В PWA это не мелочь: приложение живёт на домашнем экране, консоли под рукой
 * нет, и белый экран не даёт ни пользователю, ни мне ни малейшей зацепки.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, resetting: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render crashed:', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error, resetting } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <CircleAlert size={28} aria-hidden />
        </span>
        <p className="font-display text-xl font-extrabold">{tr('err.broke')}</p>
        <p className="text-sm break-words text-muted">{error.message}</p>

        <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              this.setState({ resetting: true })
              void hardReset()
            }}
            disabled={resetting}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-5
                       font-semibold text-accent-ink disabled:opacity-60"
          >
            {resetting && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
            {tr('err.updateHard')}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex min-h-12 items-center justify-center rounded-2xl bg-raised px-5 font-semibold text-ink"
          >
            {tr('err.reload')}
          </button>
        </div>

        <p className="mt-2 max-w-xs text-xs text-muted">
          {tr('err.hint')}
        </p>
      </div>
    )
  }
}
