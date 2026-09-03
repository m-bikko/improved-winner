import { Component, type ErrorInfo, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Ловит падения рендера, чтобы вместо белого экрана был текст ошибки.
 *
 * В PWA это не мелочь: приложение живёт на домашнем экране, и белый экран без
 * единой подсказки не даёт ни пользователю, ни мне ни малейшей зацепки —
 * консоли под рукой на телефоне нет.
 *
 * Кнопка «Сбросить кэш» здесь по делу: самая вероятная причина падения —
 * данные в IndexedDB, сохранённые прошлой версией и уже несовместимые
 * с текущей формой.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Падение рендера:', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <CircleAlert size={28} className="text-danger" aria-hidden />
        <p className="text-base">Что-то сломалось</p>
        <p className="text-sm break-words text-muted">{error.message}</p>
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-accent px-5 py-3 text-accent-ink"
          >
            Перезагрузить
          </button>
          <button
            type="button"
            onClick={() => {
              void indexedDB.deleteDatabase('keyval-store')
              window.location.reload()
            }}
            className="px-5 py-3 text-sm text-muted underline"
          >
            Сбросить кэш и перезагрузить
          </button>
        </div>
      </div>
    )
  }
}
