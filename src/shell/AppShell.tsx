import { useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { APP_NAME } from '@/lib/appName'
import { BurgerMenu, NAV } from './BurgerMenu'
import { HeaderActionProvider, useHeaderActionSlot } from './HeaderAction'

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
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  // Разделы вне меню: попасть в них можно только ссылкой изнутри, но
  // заголовок им всё равно нужен - иначе в шапке висит название приложения
  const title =
    NAV.find((n) => pathname.startsWith(n.to))?.label ??
    (pathname.startsWith('/year')
      ? 'Год в цифрах'
      : pathname.startsWith('/notifications')
        ? 'Уведомления'
        : APP_NAME)
  const action = useHeaderActionSlot()

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 pt-safe backdrop-blur-sm">
        <div className="flex h-14 items-center gap-1 px-2">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Открыть меню"
            className="p-3 text-ink"
          >
            <Menu size={22} aria-hidden />
          </button>
          <h1 className="flex-1 text-lg font-semibold tracking-tight">{title}</h1>
          {action}
        </div>
      </header>

      <BurgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="pb-safe">{children}</main>
    </div>
  )
}
