import { useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { APP_NAME } from '@/lib/appName'
import { useT } from '@/lib/i18n'
import { useSyncLang } from '@/lib/i18n/sync'
import { useProfiles } from '@/features/profile/api'
import { useUserId } from '@/auth/AuthProvider'
import { useAppBadge } from '@/lib/badge'
import { BurgerMenu, NAV } from './BurgerMenu'
import { HeaderActionProvider, useHeaderActionSlot } from './HeaderAction'
import { RefreshButton } from './RefreshButton'

/**
 * Оболочка приложения: шапка с бургером и область контента.
 *
 * Разделы прячутся в бургер, а не в нижнюю панель - так просил пользователь.
 * Шапка sticky, потому что кнопка меню должна быть достижима и после того,
 * как список тем или продуктов уехал вниз на пару экранов.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <HeaderActionProvider>
      <Chrome>{children}</Chrome>
    </HeaderActionProvider>
  )
}

function Chrome({ children }: { children: ReactNode }) {
  const t = useT()
  // Язык из профиля главнее того, что лежит в localStorage
  const userId = useUserId()
  const profiles = useProfiles()
  useSyncLang(profiles.data?.find((p) => p.userId === userId)?.language)
  // Здесь, а не в отдельном экране: бейдж относится ко всему приложению
  useAppBadge(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  // Частные маршруты проверяются ДО меню: «/cycle/report» начинается
  // с «/cycle» и без этого показывал бы заголовок раздела
  const EXTRA = [
    ['/cycle/report', 'title.cycleReport'],
    ['/cycle/library', 'title.cycleLibrary'],
    ['/notifications', 'title.notifications'],
    ['/month', 'title.month'],
    ['/year', 'title.year'],
  ] as const
  const extra = EXTRA.find(([path]) => pathname.startsWith(path))?.[1]
  const nav = NAV.find((n) => pathname.startsWith(n.to))?.key
  const title = extra ? t(extra) : nav ? t(nav) : APP_NAME

  const action = useHeaderActionSlot()

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 pt-safe backdrop-blur-sm">
        <div className="flex h-14 items-center gap-1 px-2">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t('common.openMenu')}
            className="p-3 text-ink"
          >
            <Menu size={22} aria-hidden />
          </button>
          <h1 className="flex-1 text-lg font-semibold tracking-tight">{title}</h1>
          {/* Обновление левее кнопки экрана: та относится к разделу и должна
              оставаться на привычном месте у самого края */}
          <RefreshButton />
          {action}
        </div>
      </header>

      <BurgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="pb-safe">{children}</main>
    </div>
  )
}
