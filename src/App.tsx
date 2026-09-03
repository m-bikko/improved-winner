import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { LoginScreen } from '@/auth/LoginScreen'
import { CACHE_BUSTER, persister, queryClient } from '@/lib/queryClient'
import { AppShell } from '@/shell/AppShell'
import { Placeholder } from '@/shell/Placeholder'

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, buster: CACHE_BUSTER }}
    >
      <AuthProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}

/**
 * Разделяет приложение на «до входа» и «после».
 *
 * На состояние loading отдельный экран нужен обязательно: getSession читает
 * localStorage асинхронно, и без него при каждом запуске PWA на долю секунды
 * мелькал бы PIN-пад у уже авторизованного человека.
 */
function Gate() {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        <LoaderCircle size={22} className="animate-spin" aria-label="Загрузка" />
      </div>
    )
  }

  if (status === 'anonymous') return <LoginScreen />

  return (
    <AppShell>
      <Routes>
        <Route path="/topics" element={<Placeholder stage="Темы — этап 7" />} />
        <Route path="/diary" element={<Placeholder stage="Дневник — этап 4" />} />
        <Route path="/foods" element={<Placeholder stage="Продукты — этап 3" />} />
        <Route path="/profile" element={<Placeholder stage="Профиль — этап 6" />} />
        <Route path="*" element={<Navigate to="/diary" replace />} />
      </Routes>
    </AppShell>
  )
}
