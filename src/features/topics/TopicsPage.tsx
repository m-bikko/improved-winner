import { useT } from '@/lib/i18n'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, CircleCheck, CircleDot, MessagesSquare } from 'lucide-react'
import { SearchInput } from '@/ui/SearchInput'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { useTopics, type TopicStatus } from './api'
import { Segmented } from '@/ui/Segmented'
import { Fab } from '@/ui/Fab'
import { Card } from '@/ui/Card'
import { IconBadge } from '@/ui/IconBadge'

export function TopicsPage() {
  const t = useT()
  const [tab, setTab] = useState<TopicStatus>('open')
  const [query, setQuery] = useState('')
  const topics = useTopics(query)

  const visible = (topics.data ?? []).filter((t) => t.status === tab)

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {/* Два таба, а не горизонтальные колонки с перетаскиванием: канбан
          на телефоне - это боль, а статусов всего два */}
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'open', label: t('topic.tabOpen'), icon: CircleDot },
          { value: 'closed', label: t('topic.tabClosed'), icon: CircleCheck },
        ]}
      />

      <SearchInput value={query} onChange={setQuery} placeholder={t('topic.search')} />

      {topics.isPending && <Loading />}
      {topics.isError && <ErrorState error={topics.error} onRetry={() => void topics.refetch()} />}

      {topics.isSuccess && visible.length === 0 && (
        <EmptyState
          icon={MessagesSquare}
          tone="indigo"
          title={
            query
              ? t('pick.nothingFound')
              : tab === 'open'
                ? t('topic.noOpen')
                : t('topic.noClosed')
          }
          hint={
            query
              ? undefined
              : tab === 'open'
                ? t('topic.hintOpen')
                : t('topic.hintClosed')
          }
        />
      )}

      {/* Одна карточка со строками, а не карточка на тему: тем за месяц
          единицы, и стопка отдельных плашек с тенями читалась бы тяжелее,
          чем сам список */}
      {visible.length > 0 && (
        <Card as="div" className="overflow-hidden">
          <ul className="divide-y divide-line">
            {visible.map((topic) => {
              const preview = topic.status === 'closed' ? topic.resolution : topic.body
              return (
                <li key={topic.id}>
                  <Link
                    to={`/topics/${topic.id}`}
                    className="flex min-h-14 items-start gap-3 px-4 py-3.5 transition-colors active:bg-raised"
                  >
                    <IconBadge
                      icon={topic.status === 'open' ? MessagesSquare : CircleCheck}
                      tone="indigo"
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 self-center">
                      <span className="block text-[15px] font-semibold">{topic.title}</span>
                      {preview && (
                        <span className="mt-0.5 line-clamp-2 text-[13px] text-muted">
                          {preview}
                        </span>
                      )}
                    </span>
                    <ChevronRight size={18} aria-hidden className="mt-1.5 shrink-0 text-muted/70" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Fab to="/topics/new" label={t('topic.new')} />
    </div>
  )
}
