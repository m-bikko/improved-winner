import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck, CircleDot, Plus } from 'lucide-react'
import { SearchInput } from '@/ui/SearchInput'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { useTopics, type TopicStatus } from './api'

export function TopicsPage() {
  const [tab, setTab] = useState<TopicStatus>('open')
  const [query, setQuery] = useState('')
  const topics = useTopics(query)

  const visible = (topics.data ?? []).filter((t) => t.status === tab)

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3 pb-28">
      {/* Два таба, а не горизонтальные колонки с перетаскиванием: канбан
          на телефоне - это боль, а статусов всего два */}
      <div className="mb-3 flex gap-1 rounded-xl bg-raised p-1">
        <Tab active={tab === 'open'} onClick={() => setTab('open')}>
          Открыто
        </Tab>
        <Tab active={tab === 'closed'} onClick={() => setTab('closed')}>
          Закрыто
        </Tab>
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Поиск по темам" />

      {topics.isPending && <Loading />}
      {topics.isError && <ErrorState error={topics.error} onRetry={() => void topics.refetch()} />}

      {topics.isSuccess && visible.length === 0 && (
        <EmptyState
          title={
            query
              ? 'Ничего не нашлось'
              : tab === 'open'
                ? 'Открытых тем нет'
                : 'Закрытых тем пока нет'
          }
          hint={
            query
              ? undefined
              : tab === 'open'
                ? 'Заведи тему, когда есть что обсудить, но не сейчас.'
                : 'Сюда попадают темы, по которым вы к чему-то пришли.'
          }
        />
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {visible.map((topic) => (
          <li key={topic.id}>
            <Link
              to={`/topics/${topic.id}`}
              className="block rounded-xl bg-surface px-4 py-3 ring-1 ring-line active:bg-raised"
            >
              <span className="flex items-start gap-2">
                {topic.status === 'open' ? (
                  <CircleDot size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                ) : (
                  <CircleCheck size={16} className="mt-0.5 shrink-0 text-carbs" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{topic.title}</span>
                  {topic.status === 'closed' && topic.resolution && (
                    <span className="mt-1 line-clamp-2 block text-sm text-muted">
                      {topic.resolution}
                    </span>
                  )}
                  {topic.status === 'open' && topic.body && (
                    <span className="mt-1 line-clamp-2 block text-sm text-muted">{topic.body}</span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        to="/topics/new"
        aria-label="Новая тема"
        className="fixed right-5 bottom-6 z-20 flex size-14 items-center justify-center
                   rounded-full bg-accent text-accent-ink shadow-lg
                   transition-transform active:scale-95"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Plus size={26} aria-hidden />
      </Link>
    </div>
  )
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
        active ? 'bg-surface text-ink shadow-sm' : 'text-muted'
      }`}
    >
      {children}
    </button>
  )
}
