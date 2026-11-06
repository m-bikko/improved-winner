import { useMemo, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useHasBaby } from '@/features/baby/api'
import { useT } from '@/lib/i18n'
import { Button } from '@/ui/Button'
import { ListGroup, ListRow } from '@/ui/List'
import { SearchInput } from '@/ui/SearchInput'
import { useRecentSections } from './recent'
import { MORE, MORE_GROUPS, type Section } from './sections'

/**
 * «Ещё» - разделы списком, как в Настройках iPhone.
 *
 * Здесь была сетка из тридцати ярких плиток: подписи не влезали и рвались переносами
 * («Воспомина-ния»), а тридцать цветных квадратов разного размера смысла спорили
 * друг с другом. Строка читается целиком, глаз идёт по одной вертикали, а поиск
 * и недавние разделы сверху закрывают то, ради чего нужна была плотная сетка.
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
          <Rows items={found} />
        ) : (
          <p className="py-8 text-center text-[15px] text-muted">{t('more.noResults')}</p>
        )
      ) : (
        <>
          {recent.length > 0 && <Group title={t('more.recent')} items={recent} />}
          {MORE_GROUPS.map((group) => (
            <Group key={group.key} title={t(group.key)} items={group.items.filter(visible)} />
          ))}
          <Button variant="danger" onClick={() => void signOut()}>
            <LogOut size={18} aria-hidden />
            {t('nav.signOut')}
          </Button>
        </>
      )}
    </div>
  )
}

function Group({ title, items }: { title: string; items: readonly Section[] }) {
  return (
    <section>
      <h2 className="mb-1.5 px-4 text-[13px] font-medium text-muted">{title}</h2>
      <Rows items={items} />
    </section>
  )
}

function Rows({ items }: { items: readonly Section[] }) {
  const t = useT()
  return (
    <ListGroup>
      {items.map((s) => (
        <ListRow key={s.to} to={s.to} icon={s.icon} tone={s.tone} title={t(s.key)} />
      ))}
    </ListGroup>
  )
}
