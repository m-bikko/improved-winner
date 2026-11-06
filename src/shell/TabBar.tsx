import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Ellipsis, type LucideIcon } from 'lucide-react'
import { useT } from '@/lib/i18n'
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
 * Панель вкладок на нижнем краю, как в любом приложении на iPhone.
 *
 * Плавающая полупрозрачная капсула с цветной таблеткой была красивее на макете и хуже
 * в руке: сквозь неё проступали цвета содержимого, подписи читались плохо, а края
 * отнимали цель у пальца. Здесь вся ширина экрана - область нажатия, а выбранная
 * вкладка отличается цветом и заливкой значка.
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
    { to: MORE_ROOT, label: t('nav.more'), icon: Ellipsis },
  ]

  return (
    <nav
      aria-label={t('nav.sections')}
      className="material fixed inset-x-0 bottom-0 z-40 pb-safe shadow-[0_-0.5px_0_var(--c-material-edge)] transition-transform duration-200"
      style={{
        // --vv-gap опускает панель к низу ВИДИМОЙ области: на iOS после клавиатуры
        // раскладка и видимая область расходятся, и панель повисала посреди экрана
        transform: typing ? 'translateY(100%)' : 'translateY(var(--vv-gap, 0px))',
      }}
    >
      <ul className="mx-auto grid h-[var(--tabbar-h)] max-w-2xl grid-cols-5">
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
                className={`flex h-full flex-col items-center justify-center gap-px transition-opacity duration-200
                            active:opacity-50 active:duration-0 ${on ? 'text-accent' : 'text-muted'}`}
              >
                {/* Выбранная вкладка узнаётся и формой, а не только цветом. Заливка лёгкая:
                    у линейных значков сплошная съела бы детали */}
                <tab.icon
                  size={25}
                  strokeWidth={on ? 2.2 : 1.8}
                  fill={on ? 'currentColor' : 'none'}
                  fillOpacity={on ? 0.2 : 0}
                  aria-hidden
                />
                <span className="max-w-full truncate px-0.5 text-[10px] leading-3 font-medium">{tab.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
