import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { LayoutGrid, type LucideIcon } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { SPRING } from '@/ui/motion'
import { MORE_ROOT, TABS, routeInfo } from './sections'

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
 * Панель вкладок: плавающая капсула из материала над контентом.
 *
 * Контент проходит под ней и виден сквозь неё, поэтому она читается как слой
 * управления, а не как отрезанная полоса экрана.
 *
 * Нажатие на активную вкладку ведёт к её корню, а на самом корне прокручивает наверх:
 * этого ждут по привычке от любого телефонного приложения.
 */
export function TabBar() {
  const t = useT()
  const { pathname } = useLocation()
  const typing = useTyping()
  const active = routeInfo(pathname).tab
  const tabs: { to: string; label: string; icon: LucideIcon }[] = [
    ...TABS.map((tab) => ({ to: tab.to, label: t(tab.key), icon: tab.icon })),
    { to: MORE_ROOT, label: t('nav.more'), icon: LayoutGrid },
  ]

  return (
    <nav
      aria-label={t('nav.sections')}
      className="fixed inset-x-3 z-40 mx-auto max-w-md transition-transform duration-200"
      style={{
        bottom: 'var(--tabbar-bottom)',
        // --vv-gap опускает панель к низу ВИДИМОЙ области: на iOS после клавиатуры
        // раскладка и видимая область расходятся, и панель повисала посреди экрана
        transform: typing ? 'translateY(calc(100% + 40px))' : 'translateY(var(--vv-gap, 0px))',
      }}
    >
      <ul className="material grid h-[var(--tabbar-h)] grid-cols-5 rounded-[31px] p-1">
        {tabs.map((tab) => {
          const on = active === tab.to
          return (
            <li key={tab.to}>
              {/* Link, а не NavLink: тот сам решает про aria-current по адресу и не знал бы,
                  что итоги месяца относятся к дневнику */}
              <Link
                to={tab.to}
                onClick={() => {
                  if (pathname === tab.to) window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                aria-current={on ? 'page' : undefined}
                className="group relative flex h-full flex-col items-center justify-center gap-0.5 rounded-[27px]"
              >
                {on && (
                  <motion.span
                    layoutId="tab-pill"
                    transition={SPRING}
                    className="absolute inset-0 rounded-[27px] bg-accent-soft"
                    aria-hidden
                  />
                )}
                <span className="relative flex transition-transform duration-200 group-active:scale-90 group-active:duration-75">
                  {/* Заливка вместо смены цвета одной линии: активная вкладка узнаётся
                      формой, а не только цветом */}
                  <tab.icon
                    size={23}
                    strokeWidth={on ? 2.3 : 1.9}
                    fill={on ? 'currentColor' : 'none'}
                    fillOpacity={on ? 0.18 : 0}
                    aria-hidden
                    className={on ? 'text-accent-soft-ink' : 'text-muted'}
                  />
                </span>
                <span
                  className={`relative max-w-full truncate px-0.5 text-[10.5px] leading-tight font-semibold ${
                    on ? 'text-accent-soft-ink' : 'text-muted'
                  }`}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
