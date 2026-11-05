import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { LangProvider, useT } from '@/lib/i18n'
import { LoginScreen } from '@/auth/LoginScreen'
import { CACHE_BUSTER, persister, queryClient } from '@/lib/queryClient'
import { AppShell } from '@/shell/AppShell'
import { ErrorBoundary } from '@/shell/ErrorBoundary'
import { UpdatePrompt } from '@/shell/UpdatePrompt'
import { FoodsPage } from '@/features/foods/FoodsPage'
import { FoodEditPage } from '@/features/foods/FoodEditPage'
import { DiaryPage } from '@/features/diary/DiaryPage'
import { MonthPage } from '@/features/month/MonthPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { NotificationsPage } from '@/features/profile/NotificationsPage'
import { CheckinPage } from '@/features/checkin/CheckinPage'
import { CyclePage } from '@/features/cycle/CyclePage'
import { CycleReportPage } from '@/features/cycle/ReportPage'
import { CycleLibraryPage } from '@/features/cycle/CycleLibraryPage'
import { DatesPage } from '@/features/dates/DatesPage'
import { WishlistPage } from '@/features/wishlist/WishlistPage'
import { YearPage } from '@/features/year/YearPage'
import { TasksPage } from '@/features/tasks/TasksPage'
import { TopicsPage } from '@/features/topics/TopicsPage'
import { TopicPage } from '@/features/topics/TopicPage'
import { TodayPage } from '@/features/today/TodayPage'
import { QuestionPage } from '@/features/question/QuestionPage'
import { ChallengesPage } from '@/features/challenges/ChallengesPage'
import { SavingsPage } from '@/features/savings/SavingsPage'
import { WatchPage } from '@/features/watch/WatchPage'
import { MemoriesPage } from '@/features/memories/MemoriesPage'
import { PrepPage } from '@/features/prep/PrepPage'
import { MeetingsPage } from '@/features/meetings/MeetingsPage'
import { VoicePage } from '@/features/voice/VoicePage'
import { QuizPage } from '@/features/quiz/QuizPage'
import { NamesPage } from '@/features/names/NamesPage'
import { PregnancyPage } from '@/features/pregnancy/PregnancyPage'
import { AgreementsPage } from '@/features/agreements/AgreementsPage'
import { PulsePage } from '@/features/pulse/PulsePage'
import { ShotsPage } from '@/features/shots/ShotsPage'
import { IdeasPage } from '@/features/ideas/IdeasPage'
import { PlacesPage } from '@/features/places/PlacesPage'
import { PausePage } from '@/features/pause/PausePage'
import { StoryPage } from '@/features/story/StoryPage'
import { WeekPage } from '@/features/week/WeekPage'
import { HealthPage } from '@/features/health/HealthPage'
import { BabyPage } from '@/features/baby/BabyPage'
import { CookApp } from '@/features/cook/CookApp'
import { isCookMode } from '@/lib/mode'

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, buster: CACHE_BUSTER }}
    >
      <ErrorBoundary>
        {/* Язык снаружи авторизации: экран входа рисуется раньше профиля */}
        <LangProvider>
          <AuthProvider>
            <BrowserRouter>
              {/* Повар - своё приложение со своим входом по ссылке, без PIN */}
              {isCookMode ? <CookApp /> : <Gate />}
            </BrowserRouter>
          </AuthProvider>
        </LangProvider>
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
  const t = useT()
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        <LoaderCircle size={22} className="animate-spin" aria-label={t('common.loading')} />
      </div>
    )
  }

  if (status === 'anonymous') return <LoginScreen />

  return (
    <AppShell>
      <Routes>
        <Route path="/today" element={<TodayPage />} />
        <Route path="/topics" element={<TopicsPage />} />
        <Route path="/topics/:id" element={<TopicPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/cycle" element={<CyclePage />} />
        <Route path="/cycle/report" element={<CycleReportPage />} />
        <Route path="/cycle/library" element={<CycleLibraryPage />} />
        <Route path="/dates" element={<DatesPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/year" element={<YearPage />} />
        <Route path="/question" element={<QuestionPage />} />
        <Route path="/challenges" element={<ChallengesPage />} />
        <Route path="/savings" element={<SavingsPage />} />
        <Route path="/watch" element={<WatchPage />} />
        <Route path="/memories" element={<MemoriesPage />} />
        <Route path="/prep" element={<PrepPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/voice" element={<VoicePage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/names" element={<NamesPage />} />
        <Route path="/pregnancy" element={<PregnancyPage />} />
        <Route path="/agreements" element={<AgreementsPage />} />
        <Route path="/pulse" element={<PulsePage />} />
        <Route path="/shots" element={<ShotsPage />} />
        <Route path="/ideas" element={<IdeasPage />} />
        <Route path="/places" element={<PlacesPage />} />
        <Route path="/pause" element={<PausePage />} />
        <Route path="/story" element={<StoryPage />} />
        <Route path="/week" element={<WeekPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/baby" element={<BabyPage />} />
        <Route path="/checkin" element={<CheckinPage />} />
        <Route path="/diary" element={<DiaryPage />} />
        <Route path="/month" element={<MonthPage />} />
        <Route path="/foods" element={<FoodsPage />} />
        <Route path="/foods/new" element={<FoodEditPage />} />
        <Route path="/foods/:id" element={<FoodEditPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </AppShell>
  )
}
