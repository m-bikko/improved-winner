import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { MotionConfig, motion } from 'motion/react'
import { APP_NAME } from '@/lib/appName'
import { useT } from '@/lib/i18n'
import { useSyncLang } from '@/lib/i18n/sync'
import { useProfiles } from '@/features/profile/api'
import { useUserId } from '@/auth/AuthProvider'
import { useAppBadge } from '@/lib/badge'
import { useViewportShift } from '@/lib/viewportShift'
import { HeaderActionProvider, useHeaderActionSlot } from './HeaderAction'
import { RefreshButton } from './RefreshButton'
import { TabBar } from './TabBar'
import { MORE, NESTED, TABS } from './sections'

/**
 * Оболочка приложения: шапка, область контента и панель вкладок внизу.
 *
 * Раньше разделы прятались в бургер - так просили вначале. После того как
 * приложением начали пользоваться каждый день с телефона, бургер в левом
 * верхнем углу оказался самым неудобным местом для самого частого действия,
 * и навигация переехала вниз, под большой палец.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    // reducedMotion="user": при системной настройке «уменьшить движение»
    // motion сам выключает сдвиги и масштаб, оставляя только прозрачность
    <MotionConfig reducedMotion="user">
      <HeaderActionProvider>
        <Chrome>{children}</Chrome>
      </HeaderActionProvider>
    </MotionConfig>
  )
}

/** Первый сегмент пути - раздел. По нему решаем, сменился ли экран «по-крупному». */
function sectionOf(pathname: string): string {
  return pathname.split('/')[1] ?? ''
}

/** Прокручена ли страница - шапке нужна линия снизу только тогда. */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return scrolled
}

function Chrome({ children }: { children: ReactNode }) {
  const t = useT()
  const navigate = useNavigate()
  // Язык из профиля главнее того, что лежит в localStorage
  const userId = useUserId()
  const profiles = useProfiles()
  useSyncLang(profiles.data?.find((p) => p.userId === userId)?.language)
  // Здесь, а не в отдельном экране: бейдж относится ко всему приложению
  useAppBadge(true)
  // Шапка и панель вкладок держатся за видимую область, а не за раскладку:
  // на iOS после клавиатуры они разъезжались (см. viewportShift.ts)
  useViewportShift()

  const { pathname } = useLocation()
  const section = sectionOf(pathname)
  const scrolled = useScrolled()

  // Смена раздела начинается сверху. Внутри раздела - нет: вернувшись
  // из темы в список, человек ждёт увидеть список там же, где оставил
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [section])

  const nested = NESTED.find((n) => pathname.startsWith(n.prefix))
  const top = [...TABS, ...MORE].find((s) => pathname.startsWith(s.to))
  const title = nested?.title ? t(nested.title) : top ? t(top.key) : APP_NAME

  const back = () => {
    // idx кладёт сам react-router: > 0 значит, что есть куда вернуться
    // внутри приложения. Иначе экран открыт напрямую - идём к родителю
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(nested?.parent ?? '/today', { replace: true })
  }

  const action = useHeaderActionSlot()

  return (
    <div className="relative min-h-dvh">
      {/* Сияние у верха - тёплое пятно, которое делает фон не плоским.
          Уезжает вместе со страницей и не мешает читать ниже первого экрана */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80"
        style={{ background: 'radial-gradient(120% 70% at 50% -20%, var(--c-glow), transparent 70%)' }}
      />

      <header
        className={`sticky top-0 z-30 pt-safe backdrop-blur-xl transition-[background-color,border-color]
                    duration-200 border-b ${
                      scrolled ? 'border-line/70 bg-bg/85' : 'border-transparent bg-bg/0'
                    }`}
        style={{ transform: 'translateY(var(--vv-top, 0px))' }}
      >
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-1 px-3">
          {nested && (
            <button
              type="button"
              onClick={back}
              aria-label={t('common.back')}
              className="-ml-1 flex size-10 items-center justify-center rounded-full text-ink
                         transition-transform active:scale-90"
            >
              <ChevronLeft size={26} aria-hidden />
            </button>
          )}
          <h1
            className={`min-w-0 flex-1 truncate font-display font-extrabold tracking-tight ${
              nested ? 'text-xl' : 'pl-1 text-[26px]'
            }`}
          >
            {title}
          </h1>
          {/* Обновление левее кнопки экрана: та относится к разделу и должна
              оставаться на привычном месте у самого края */}
          <RefreshButton />
          {action}
        </div>
      </header>

      <main className="relative pb-tabbar">
        {/* Лёгкое появление при смене раздела. Ключ - раздел, а не путь:
            переход внутри раздела не должен мигать всем экраном.
            Только прозрачность, без сдвига: transform на обёртке делает её
            контейнером для position: fixed, и FAB со шторками внутри экрана
            на время анимации уезжали бы вместе с ней */}
        <motion.div
          key={section}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </main>

      <TabBar />
    </div>
  )
}
