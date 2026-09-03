import { useEffect, useState } from 'react'
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react'
import { supabase } from './lib/supabase'
import { env } from './lib/env'

const projectRef = new URL(env.supabaseUrl).hostname.split('.')[0] ?? '—'

type Status = { state: 'checking' } | { state: 'ok'; detail: string } | { state: 'fail'; detail: string }

/**
 * Временный экран этапа 0: подтверждает, что сборка, переменные окружения и
 * подключение к Supabase живы на реальном деплое. Заменяется на роутинг и
 * экран входа на этапе 2.
 */
export default function App() {
  const [status, setStatus] = useState<Status>({ state: 'checking' })

  useEffect(() => {
    let cancelled = false
    supabase.auth
      .getSession()
      .then(({ error }) => {
        if (cancelled) return
        setStatus(
          error ? { state: 'fail', detail: error.message } : { state: 'ok', detail: projectRef },
        )
      })
      .catch((e: unknown) => {
        if (!cancelled) setStatus({ state: 'fail', detail: String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Love promises</h1>

      {status.state === 'checking' && (
        <p className="flex items-center gap-2 text-muted">
          <LoaderCircle size={18} className="animate-spin" aria-hidden />
          Проверяю подключение
        </p>
      )}

      {status.state === 'ok' && (
        <p className="flex items-center gap-2 text-carbs">
          <CircleCheck size={18} aria-hidden />
          Supabase отвечает · проект {status.detail}
        </p>
      )}

      {status.state === 'fail' && (
        <p className="flex items-center gap-2 text-danger">
          <CircleAlert size={18} aria-hidden />
          {status.detail}
        </p>
      )}

      <p className="text-sm text-muted">Этап 0 — каркас</p>
    </main>
  )
}
