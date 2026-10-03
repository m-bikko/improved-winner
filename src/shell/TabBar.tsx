import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { LayoutGrid, LogOut } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useT } from '@/lib/i18n'
import { Sheet } from '@/ui/Sheet'
import { IconBadge } from '@/ui/IconBadge'
import { ListGroup, ListRow } from '@/ui/List'
import { SPRING } from '@/ui/motion'
import { MORE, MORE_GROUPS, NESTED, TABS, type Section } from './sections'
import { useHasBaby } from '@/features/baby/api'

/**
 * Какая вкладка сейчас активна.
 *
 * Вложенный экран подсвечивает вкладку, из которой в него попадают:
 * итоги месяца - дневник, продукт - «Ещё». Иначе после перехода внутрь
 * панель не показывала бы, где человек находится.
 */
function activeTab(pathname: string): string {
  const nested = NESTED.find((n) => pathname.startsWith(n.prefix))
  if (nested) return nested.tab
  const tab = TABS.find((s) => pathname.startsWith(s.to))
  if (tab) return tab.to
  return MORE.some((s) => pathname.startsWith(s.to)) ? 'more' : ''
}

/**
 * Идёт ли сейчас набор текста.
 *
 * На Android окно сжимается под клавиатуру, и панель вкладок въезжает
 * прямо над ней, съедая треть оставшегося места. На iOS она уходит
 * под клавиатуру сама, но и там прятать её не вредно.
 */
function useTyping(): boolean {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const isText = (el: EventTarget | null): boolean =>
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement &&
        !['checkbox', 'radio', 'button', 'submit', 'range', 'file', 'color'].includes(el.type))
    const onIn = (e: FocusEvent) => setTyping(isText(e.target))
    const onOut = () => setTyping(false)
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
    }
  }, [])
  return typing
}

/**
 * Панель вкладок внизу.
 *
 * Раньше разделы жили в бургере в левом верхнем углу - в самой далёкой
 * для большого пальца точке экрана, и переход между дневником и главной
 * стоил два тапа через весь экран. Теперь главные разделы под пальцем
 * и в один тап, остальное - в «Ещё».
 *
 * Повторный тап по активной вкладке прокручивает экран наверх - этого
 * жеста ждут по привычке от любого телефонного приложения.
 */
export function TabBar() {
  const t = useT()
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const typing = useTyping()
  const active = activeTab(pathname)

  return (
    <>
      <nav
        aria-label={t('nav.sections')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-surface/85 pb-safe
                   backdrop-blur-xl backdrop-saturate-150 transition-transform duration-200"
        // --vv-gap опускает панель к низу ВИДИМОЙ области: на iOS после клавиатуры
        // раскладка и видимая область расходятся, и панель повисала посреди экрана
        style={{ transform: typing ? 'translateY(100%)' : 'translateY(var(--vv-gap, 0px))' }}
      >
        <ul className="mx-auto grid h-[var(--tabbar-h)] max-w-lg grid-cols-5 px-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                onClick={() => {
                  if (active === tab.to && pathname === tab.to) {
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                }}
                aria-current={active === tab.to ? 'page' : undefined}
                className="flex h-full flex-col items-center justify-center gap-0.5"
              >
                <TabIcon active={active === tab.to} icon={tab.icon} />
                <TabLabel active={active === tab.to}>{t(tab.key)}</TabLabel>
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className="flex h-full w-full flex-col items-center justify-center gap-0.5"
            >
              <TabIcon active={active === 'more'} icon={LayoutGrid} />
              <TabLabel active={active === 'more'}>{t('nav.more')}</TabLabel>
            </button>
          </li>
        </ul>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  )
}

function TabIcon({ active, icon: Icon }: { active: boolean; icon: typeof LayoutGrid }) {
  return (
    <span className="relative flex h-8 w-14 items-center justify-center">
      {active && (
        <motion.span
          layoutId="tab-pill"
          transition={SPRING}
          className="absolute inset-0 rounded-full bg-accent-soft"
          aria-hidden
        />
      )}
      {/* Иконка подпрыгивает в момент, когда вкладка стала активной.
          initial={false}: при открытии приложения ничего не прыгает */}
      <motion.span
        className="relative flex"
        initial={false}
        animate={active ? { scale: [1, 1.22, 0.94, 1], y: [0, -3, 0, 0] } : { scale: 1, y: 0 }}
        transition={{ duration: 0.45, times: [0, 0.35, 0.7, 1], ease: 'easeOut' }}
      >
        <Icon
          size={22}
          strokeWidth={active ? 2.4 : 1.9}
          aria-hidden
          className={`transition-colors ${active ? 'text-accent-soft-ink' : 'text-muted'}`}
        />
      </motion.span>
    </span>
  )
}

function TabLabel({ active, children }: { active: boolean; children: string }) {
  return (
    <span
      className={`max-w-full truncate px-0.5 text-[11px] leading-tight transition-colors ${
        active ? 'font-bold text-ink' : 'font-medium text-muted'
      }`}
    >
      {children}
    </span>
  )
}

/**
 * «Ещё» - остальные разделы плиткой.
 *
 * Плитка, а не список: восемь пунктов списком занимали бы весь экран,
 * а сетка три на три помещается в пол-экрана и узнаётся по цветам значков.
 */
function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const { account, signOut } = useAuth()
  const hasBaby = useHasBaby()
  const visible = (s: Section): boolean => s.gate !== 'baby' || hasBaby.data === true

  return (
    <Sheet open={open} onClose={onClose} title={account?.nickname ?? t('nav.more')}>
      {MORE_GROUPS.map((group) => (
        <section key={group.key} className="mb-4">
          <h3 className="mb-2 px-1 font-display text-[13px] font-bold text-muted">{t(group.key)}</h3>
          {/* stagger: плитки выходят волной вслед за шторкой */}
          <ul className="stagger grid grid-cols-3 gap-2.5">
            {group.items.filter(visible).map((s) => (
              <li key={s.to}>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    navigate(s.to)
                  }}
                  className="flex h-full w-full flex-col items-center gap-2 rounded-3xl bg-surface px-1.5
                             pt-4 pb-3 shadow-card transition-transform active:scale-95"
                >
                  <IconBadge icon={s.icon} tone={s.tone} size="lg" />
                  <span className="line-clamp-2 text-center text-[13px] leading-tight font-semibold">
                    {t(s.key)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <ListGroup className="mt-2">
        <ListRow
          title={t('nav.signOut')}
          icon={LogOut}
          danger
          chevron={false}
          onClick={() => void signOut()}
        />
      </ListGroup>
    </Sheet>
  )
}
