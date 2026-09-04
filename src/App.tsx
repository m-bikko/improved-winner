import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { LoginScreen } from '@/auth/LoginScreen'
import { CACHE_BUSTER, persister, queryClient } from '@/lib/queryClient'
import { AppShell } from '@/shell/AppShell'
import { ErrorBoundary } from '@/shell/ErrorBoundary'
import { UpdatePrompt } from '@/shell/UpdatePrompt'
import { FoodsPage } from '@/features/foods/FoodsPage'
import { FoodEditPage } from '@/features/foods/FoodEditPage'
import { DiaryPage } from '@/features/diary/DiaryPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { TasksPage } from '@/features/tasks/TasksPage'
import { TopicsPage } from '@/features/topics/TopicsPage'
import { TopicPage } from '@/features/topics/TopicPage'

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, buster: CACHE_BUSTER }}
    >
      <ErrorBoundary>
        <AuthProvider>
          <BrowserRouter>
            <Gate />
          </BrowserRouter>
        </AuthProvider>
      </ErrorBoundary>
      {/* СНАРУЖИ границы ошибок, а не внутри. Внутри она рендерит экран ошибки
          вместо детей, и тост об обновлении на этом экране не появлялся бы -
          то есть ровно там, где он нужнее всего: сломанную версию чинит
          как раз обновление. */}
      <UpdatePrompt />
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
        <Route path="/topics" element={<TopicsPage />} />
        <Route path="/topics/:id" element={<TopicPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/diary" element={<DiaryPage />} />
        <Route path="/foods" element={<FoodsPage />} />
        <Route path="/foods/new" element={<FoodEditPage />} />
        <Route path="/foods/:id" element={<FoodEditPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/diary" replace />} />
      </Routes>
    </AppShell>
  )
}
