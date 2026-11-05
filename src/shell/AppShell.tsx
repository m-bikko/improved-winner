import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { ChevronLeft, LoaderCircle } from 'lucide-react'
import { MotionConfig, motion, useTransform } from 'motion/react'
import { APP_NAME } from '@/lib/appName'
import { useT } from '@/lib/i18n'
import { useSyncLang } from '@/lib/i18n/sync'
import { useProfiles } from '@/features/profile/api'
import { useUserId } from '@/auth/AuthProvider'
import { useAppBadge } from '@/lib/badge'
import { useViewportShift } from '@/lib/viewportShift'
import { BurstProvider } from '@/ui/Burst'
import { SPRING } from '@/ui/motion'
import { ToastHost } from '@/ui/Toast'
import { HeaderActionProvider, useHeaderActionSlot } from './HeaderAction'
import { RefreshButton } from './RefreshButton'
import { TabBar } from './TabBar'
import { rememberSection } from './recent'
import { routeInfo } from './sections'
import { PULL_THRESHOLD, usePullToRefresh } from './usePullToRefresh'
import { useEdgeBack } from './useEdgeBack'

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
        {/* Разлёт сердец и искр - один слой на всё приложение, см. Burst.tsx */}
        <BurstProvider>
          <Chrome>{children}</Chrome>
          <ToastHost />
        </BurstProvider>
      </HeaderActionProvider>
    </MotionConfig>
  )
}

/** Прокручена ли страница дальше `past` - шапка становится материалом только тогда. */
function useScrolledPast(past: number): boolean {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > past)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [past])
  return scrolled
}

/**
 * Где была прокрутка на каждом экране.
 *
 * Новый экран открывается сверху, а при возврате человек ждёт увидеть список там,
 * где его оставил: тридцать разделов и длинные ленты без этого приходилось бы
 * прокручивать заново после каждого «назад».
 */
function useScrollMemory(pathname: string): void {
  const type = useNavigationType()
  const memory = useRef(new Map<string, number>())
  const here = useRef(pathname)

  useEffect(() => {
    const onScroll = () => memory.current.set(here.current, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    here.current = pathname
    const saved = type === 'POP' ? (memory.current.get(pathname) ?? 0) : 0
    window.scrollTo(0, saved)
    // Данные могли ещё не отрисоваться: один кадр спустя высота уже настоящая
    if (saved > 0) requestAnimationFrame(() => window.scrollTo(0, saved))
  }, [pathname, type])
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
  const info = routeInfo(pathname)
  const large = info.depth === 0
  const title = info.title ? t(info.title) : APP_NAME
  useScrollMemory(pathname)

  // Заголовок в шапке появляется, когда крупный ушёл под неё
  const scrolled = useScrolledPast(large ? 34 : 2)

  const parent = info.parent
  const back = useCallback(() => {
    // idx кладёт сам react-router: > 0 значит, что есть куда вернуться
    // внутри приложения. Иначе экран открыт напрямую - идём к родителю
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(parent ?? '/today', { replace: true })
  }, [navigate, parent])

  const edgeX = useEdgeBack(parent !== null, back)
  const edgeShadow = useTransform(edgeX, [0, 40], ['0 0 0 rgb(0 0 0 / 0)', '-10px 0 30px rgb(0 0 0 / 0.14)'])

  const { pull, spinning } = usePullToRefresh()
  const pullOpacity = useTransform(pull, [8, PULL_THRESHOLD * 0.7], [0, 1])
  const pullRotate = useTransform(pull, [0, PULL_THRESHOLD], [0, 300])

  // Вглубь - экран приходит справа, обратно - слева. Между вкладками движения нет
  // вовсе: это не переход в пространстве, а смена места, и задержка там ни к чему.
  const direction = useRef(0)
  const previous = useRef({ depth: info.depth, pathname })
  if (previous.current.pathname !== pathname) {
    direction.current = Math.sign(info.depth - previous.current.depth)
    previous.current = { depth: info.depth, pathname }
  }

  useEffect(() => {
    if (info.depth === 1) rememberSection(`/${pathname.split('/')[1] ?? ''}`)
  }, [info.depth, pathname])

  const action = useHeaderActionSlot()

  return (
    <div className="relative min-h-dvh">
      <header className="sticky top-0 z-30 pt-safe" style={{ transform: 'translateY(var(--vv-top, 0px))' }}>
        {/* Материал появляется только когда под шапкой есть что размывать */}
        <div aria-hidden className="scroll-edge" style={{ opacity: scrolled ? undefined : 0 }} />
        <div className="relative mx-auto grid h-11 max-w-2xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-1.5">
          <div className="flex min-w-0 justify-start">
            {parent !== null && info.parentKey && (
              <button
                type="button"
                onClick={back}
                aria-label={`${t('common.back')}: ${t(info.parentKey)}`}
                className="flex h-11 min-w-11 items-center pr-2 text-accent transition-opacity duration-150 active:opacity-40 active:duration-0"
              >
                <ChevronLeft size={28} strokeWidth={2.2} className="shrink-0" aria-hidden />
                <span className="-ml-1 truncate text-[17px]">{t(info.parentKey)}</span>
              </button>
            )}
          </div>
          {large ? (
            <p
              aria-hidden
              className={`max-w-[58vw] truncate text-center text-[17px] font-semibold transition-opacity duration-150 ${
                scrolled ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {title}
            </p>
          ) : (
            <h1 className="max-w-[58vw] truncate text-center text-[17px] font-semibold">{title}</h1>
          )}
          <div className="flex min-w-0 items-center justify-end gap-0.5">
            <RefreshButton />
            {action}
          </div>
        </div>
      </header>

      {/* Индикатор обновления идёт за пальцем из-под шапки */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 z-20 flex justify-center pt-safe"
        style={{ top: 0, y: pull, opacity: spinning ? 1 : pullOpacity }}
      >
        <motion.span
          className="material -mt-2 flex size-9 items-center justify-center rounded-full text-muted"
          style={spinning ? {} : { rotate: pullRotate }}
        >
          <LoaderCircle size={20} strokeWidth={2.4} className={spinning ? 'animate-spin' : ''} />
        </motion.span>
      </motion.div>

      {/* Сдвиг от свайпа назад - на этом слое, переход между экранами - на следующем */}
      <motion.div style={{ x: edgeX, boxShadow: edgeShadow }} className="relative min-h-dvh bg-bg">
        {large && !isCustomTitle(pathname) && <h1 className="mx-auto -mt-10 max-w-2xl px-4 pr-24 pb-1.5 type-large">{title}</h1>}
        <main className="relative pb-tabbar">
          <motion.div
            key={pathname}
            initial={direction.current === 0 ? false : { x: direction.current * 44, opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            transition={SPRING}
          >
            {children}
          </motion.div>
        </main>
      </motion.div>

      <TabBar />
    </div>
  )
}

/** Экран сам рисует крупный заголовок: у главной это приветствие, а не «Сегодня». */
function isCustomTitle(pathname: string): boolean {
  return pathname.startsWith('/today')
}
