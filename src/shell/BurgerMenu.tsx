import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Apple,
  Sun,
  CalendarHeart,
  Droplet,
  ListChecks,
  Gift,
  LogOut,
  MessagesSquare,
  NotebookPen,
  Smile,
  User,
  X,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useT } from '@/lib/i18n'
import { APP_NAME } from '@/lib/appName'

export const NAV = [
  { to: '/today', key: 'nav.today', icon: Sun },
  { to: '/checkin', key: 'nav.checkin', icon: Smile },
  { to: '/topics', key: 'nav.topics', icon: MessagesSquare },
  { to: '/tasks', key: 'nav.tasks', icon: ListChecks },
  { to: '/diary', key: 'nav.diary', icon: NotebookPen },
  { to: '/foods', key: 'nav.foods', icon: Apple },
  { to: '/cycle', key: 'nav.cycle', icon: Droplet },
  { to: '/dates', key: 'nav.dates', icon: CalendarHeart },
  { to: '/wishlist', key: 'nav.wishlist', icon: Gift },
  { to: '/profile', key: 'nav.profile', icon: User },
] as const

export function BurgerMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { account, signOut } = useAuth()
  const t = useT()

  // Пока меню открыто, фон скроллиться не должен - иначе на телефоне
  // страница уезжает под шторкой и возвращается не туда
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <nav
        aria-label={t('nav.sections')}
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col
                    bg-surface pt-safe pb-safe shadow-xl transition-transform duration-200
                    ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-lg font-semibold">{account?.nickname ?? APP_NAME}</span>
          <button type="button" onClick={onClose} aria-label={t('nav.closeMenu')} className="p-2 text-muted">
            <X size={22} aria-hidden />
          </button>
        </div>

        <ul className="flex-1 px-3">
          {NAV.map(({ to, key, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={onClose}
                tabIndex={open ? 0 : -1}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-4 py-3.5 text-base transition-colors ${
                    isActive ? 'bg-raised font-medium text-accent' : 'text-ink'
                  }`
                }
              >
                <Icon size={20} aria-hidden />
                {t(key)}
              </NavLink>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => void signOut()}
          tabIndex={open ? 0 : -1}
          className="mx-3 mb-3 flex items-center gap-3 rounded-xl px-4 py-3.5 text-base text-muted"
        >
          <LogOut size={20} aria-hidden />
          {t('nav.signOut')}
        </button>
      </nav>
    </>
  )
}
