import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useHasBaby } from '@/features/baby/api'
import { useT } from '@/lib/i18n'
import { Button } from '@/ui/Button'
import { SearchInput } from '@/ui/SearchInput'
import { TONE_CLASS } from '@/ui/tones'
import { useRecentSections } from './recent'
import { MORE, MORE_GROUPS, type Section } from './sections'

/**
 * «Ещё» - разделы как значки на домашнем экране.
 *
 * Раньше это была шторка с плитками: у раздела не было своего адреса, и из него
 * нельзя было вернуться назад - только снова открыть шторку. Теперь это экран:
 * у него есть прокрутка, которая сохраняется, поиск по названию и недавние разделы
 * наверху. Четыре колонки вместо трёх: все разделы умещаются почти на одном экране,
 * а значок в своём цвете находится глазами раньше, чем прочитано слово.
 */
export function MorePage() {
  const t = useT()
  const { signOut } = useAuth()
  const hasBaby = useHasBaby()
  const recentPaths = useRecentSections()
  const [query, setQuery] = useState('')

  const visible = (s: Section): boolean => s.gate !== 'baby' || hasBaby.data === true
  const needle = query.trim().toLocaleLowerCase()

  const found = useMemo(
    () => (needle ? MORE.filter(visible).filter((s) => t(s.key).toLocaleLowerCase().includes(needle)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [needle, hasBaby.data, t],
  )
  const recent = recentPaths.flatMap((to) => MORE.filter((s) => s.to === to && visible(s)))

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-1">
      <SearchInput value={query} onChange={setQuery} placeholder={t('more.search')} />

      {found ? (
        found.length > 0 ? (
          <Grid items={found} />
        ) : (
          <p className="py-8 text-center text-[15px] text-muted">{t('more.noResults')}</p>
        )
      ) : (
        <>
          {recent.length > 0 && (
            <section>
              <h2 className="mb-2.5 px-1 type-headline">{t('more.recent')}</h2>
              <Grid items={recent} />
            </section>
          )}
          {MORE_GROUPS.map((group) => {
            const items = group.items.filter(visible)
            return (
              <section key={group.key}>
                <h2 className="mb-2.5 px-1 type-headline">{t(group.key)}</h2>
                <Grid items={items} />
              </section>
            )
          })}
          <Button variant="danger" className="mt-2" onClick={() => void signOut()}>
            <LogOut size={18} aria-hidden />
            {t('nav.signOut')}
          </Button>
        </>
      )}
    </div>
  )
}

function Grid({ items }: { items: readonly Section[] }) {
  const t = useT()
  return (
    <ul className="grid grid-cols-4 gap-x-1.5 gap-y-4">
      {items.map((s) => {
        const Icon = s.icon
        return (
          <li key={s.to}>
            <Link to={s.to} className="group flex flex-col items-center gap-1.5 rounded-2xl">
              <span
                className={`flex size-[60px] items-center justify-center rounded-[17px] text-surface shadow-card
                            transition-transform duration-200 group-active:scale-90 group-active:duration-75
                            ${TONE_CLASS[s.tone].solid}`}
              >
                <Icon size={28} strokeWidth={2} aria-hidden />
              </span>
              <span className="line-clamp-2 text-center text-[12px] leading-[1.2] font-medium hyphens-auto">{t(s.key)}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
