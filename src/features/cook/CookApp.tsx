import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChefHat, LoaderCircle, Lock, LogOut } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useLang, useT } from '@/lib/i18n'
import { LANGS } from '@/lib/i18n/lang'
import { leaveCookMode } from '@/lib/mode'
import { APP_NAME } from '@/lib/appName'
import { Button } from '@/ui/Button'
import { FoodsPage } from '@/features/foods/FoodsPage'
import { FoodEditPage } from '@/features/foods/FoodEditPage'
import { signInCook, useCookContext } from './api'
import { CookDiary } from './CookDiary'

/**
 * Приложение повара.
 *
 * Свой вход - по ссылке, без PIN; своя оболочка - без вкладок пары, без
 * уведомлений и подписок на push. Внутри два раздела: дневник владельца
 * (только смотреть) и справочник продуктов - те же экраны, что у пары, а что
 * повар может менять, решает база (свои продукты - да, чужие - только смотреть).
 */
export function CookApp() {
  const { status } = useAuth()
  const [secret] = useState(() => decodeURIComponent(window.location.hash.slice(1)))
  const [signing, setSigning] = useState(secret !== '')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!secret) return
    let active = true
    // Секрет из адресной строки убираем сразу: в истории и на экране его
    // быть не должно, даже если вход не удался
    window.history.replaceState(null, '', '/cook')
    void signInCook(secret).then((ok) => {
      if (!active) return
      setFailed(!ok)
      setSigning(false)
    })
    return () => {
      active = false
    }
  }, [secret])

  const context = useCookContext(status === 'authed' && !signing)

  if (signing || status === 'loading' || (status === 'authed' && context.isPending)) return <Spinner />
  if (failed || status === 'anonymous' || context.isError || context.data === null) return <Locked />
  if (!context.data) return <Spinner />

  return (
    <Shell ownerName={context.data.ownerName}>
      <Routes>
        <Route path="/cook" element={<CookDiary ownerId={context.data.ownerId} ownerName={context.data.ownerName} />} />
        <Route path="/foods" element={<FoodsPage />} />
        <Route path="/foods/new" element={<FoodEditPage />} />
        <Route path="/foods/:id" element={<FoodEditPage />} />
        <Route path="*" element={<Navigate to="/cook" replace />} />
      </Routes>
    </Shell>
  )
}

function Spinner() {
  const t = useT()
  return (
    <div className="flex min-h-dvh items-center justify-center text-muted">
      <LoaderCircle size={22} className="animate-spin" aria-label={t('common.loading')} />
    </div>
  )
}

/** Ссылки нет, она отозвана или выпущена новая: дальше только к владельцу. */
function Locked() {
  const t = useT()
  const { signOut } = useAuth()
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-raised text-muted">
        <Lock size={28} aria-hidden />
      </span>
      <h1 className="font-display text-2xl font-extrabold">{t('cook.lockedTitle')}</h1>
      <p className="text-[15px] text-muted">{t('cook.lockedHint')}</p>
      <Button
        variant="ghost"
        onClick={() => {
          void signOut().finally(() => {
            leaveCookMode()
            window.location.replace('/today')
          })
        }}
      >
        {t('cook.notCook')}
      </Button>
    </div>
  )
}

/**
 * Оболочка: шапка с двумя разделами, языком и «назад» на карточке продукта.
 * Панели вкладок нет, поэтому её высота - ноль: кнопки, поднятые над ней
 * у пары (FAB, «Сохранить»), у повара стоят у нижнего края.
 */
function Shell({ ownerName, children }: { ownerName: string; children: ReactNode }) {
  const t = useT()
  const { lang, setLang } = useLang()
  const { signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const nested = location.pathname.startsWith('/foods/')

  const tab = (to: string, label: string) => (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold transition-colors ${
          isActive ? 'bg-surface text-ink shadow-card' : 'text-muted'
        }`
      }
    >
      {label}
    </NavLink>
  )

  return (
    <div className="min-h-dvh bg-bg pb-safe" style={{ '--tabbar-h': '0px' } as CSSProperties}>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 pt-safe backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-2.5">
          {nested ? (
            <button
              type="button"
              onClick={() => navigate('/foods')}
              aria-label={t('common.back')}
              className="-ml-2 flex size-10 items-center justify-center rounded-full text-ink active:bg-raised"
            >
              <ChevronLeft size={22} aria-hidden />
            </button>
          ) : (
            <span className="flex size-9 items-center justify-center rounded-xl bg-tone-amber-soft text-tone-amber">
              <ChefHat size={19} aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[17px] leading-tight font-extrabold">{t('cook.title', { name: ownerName })}</p>
            <p className="truncate text-[12px] text-muted">{APP_NAME}</p>
          </div>
          <div className="flex shrink-0 rounded-xl bg-raised p-0.5" role="group" aria-label={t('lang.title')}>
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`rounded-lg px-2 py-1 text-[12px] font-bold uppercase ${lang === l ? 'bg-surface text-ink shadow-card' : 'text-muted'}`}
              >
                {l === 'kk' ? 'kz' : l}
              </button>
            ))}
          </div>
          {/* Выйти из режима повара: если ссылку открыли на телефоне пары,
              обратно в своё приложение - отсюда. Повар просто откроет ссылку снова */}
          <button
            type="button"
            onClick={() => {
              void signOut().finally(() => {
                leaveCookMode()
                window.location.replace('/today')
              })
            }}
            aria-label={t('cook.exit')}
            className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-raised"
          >
            <LogOut size={17} aria-hidden />
          </button>
        </div>
        {!nested && (
          <nav className="mx-auto flex max-w-2xl gap-1 px-4 pb-2.5">
            <div className="flex w-full gap-1 rounded-2xl bg-raised p-1">
              {tab('/cook', t('cook.diary'))}
              {tab('/foods', t('cook.foods'))}
            </div>
          </nav>
        )}
      </header>
      <main className="pt-3 pb-24">{children}</main>
    </div>
  )
}
