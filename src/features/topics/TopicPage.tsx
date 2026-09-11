import { activeLocale, tr, useT } from '@/lib/i18n'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, CircleCheck, RotateCcw, Send, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/ui/Button'
import { Sheet } from '@/ui/Sheet'
import { ErrorState, Loading } from '@/ui/States'
import { useProfiles } from '@/features/profile/api'
import {
  useAddComment,
  useCloseTopic,
  useComments,
  useCreateTopic,
  useDeleteTopic,
  useReopenTopic,
  useTopic,
  useTopicRealtime,
} from './api'

export function TopicPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'

  const topic = useTopic(isNew ? undefined : id)
  const comments = useComments(isNew ? undefined : id)
  const profiles = useProfiles()
  useTopicRealtime(isNew ? undefined : id)

  if (isNew) return <NewTopic />
  if (topic.isError) return <ErrorState error={topic.error} onRetry={() => void topic.refetch()} />
  if (!topic.isSuccess) return <Loading />

  return (
    <TopicDetail
      topic={topic.data}
      comments={comments.data ?? []}
      nicknames={new Map((profiles.data ?? []).map((p) => [p.userId, p.nickname]))}
    />
  )
}

function NewTopic() {
  const t = useT()
  const navigate = useNavigate()
  const create = useCreateTopic()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      const newId = await create.mutateAsync({ title, body })
      navigate(`/topics/${newId}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <Header title={t('topic.new')} />
      <div className="flex flex-col gap-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('topic.titlePlaceholder')}
          autoFocus
          className="w-full rounded-xl bg-surface px-4 py-3 text-lg ring-1 ring-line outline-none
                     focus:ring-2 focus:ring-accent placeholder:text-muted"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('topic.bodyPlaceholder')}
          rows={6}
          className="w-full resize-none rounded-xl bg-surface px-4 py-3 ring-1 ring-line outline-none
                     focus:ring-2 focus:ring-accent placeholder:text-muted"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={() => void submit()} disabled={!title.trim()} loading={create.isPending}>
          {t('topic.create')}
        </Button>
      </div>
    </div>
  )
}

type TopicData = ReturnType<typeof useTopic>['data']
type CommentData = ReturnType<typeof useComments>['data']

function TopicDetail({
  topic,
  comments,
  nicknames,
}: {
  topic: NonNullable<TopicData>
  comments: NonNullable<CommentData>
  nicknames: Map<string, string>
}) {
  const t = useT()
  const navigate = useNavigate()
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const addComment = useAddComment()
  const closeTopic = useCloseTopic()
  const reopen = useReopenTopic()
  const remove = useDeleteTopic()

  const [draft, setDraft] = useState('')
  const [closing, setClosing] = useState(false)
  const [resolution, setResolution] = useState('')
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    try {
      await addComment.mutateAsync({ topicId: topic.id, body })
    } catch (e) {
      setDraft(body) // не теряем набранное
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4 pb-4">
      <Header
        title={t(topic.status === 'open' ? 'topic.discussion' : 'topic.closed')}
        action={
          topic.createdBy === userId ? (
            <button
              type="button"
              onClick={() => {
                void remove.mutateAsync(topic.id).then(() => navigate('/topics', { replace: true }))
              }}
              aria-label={t('topic.delete')}
              className="p-2 text-muted"
            >
              <Trash2 size={18} aria-hidden />
            </button>
          ) : null
        }
      />

      <h1 className="text-xl font-semibold">{topic.title}</h1>
      {topic.body && <p className="mt-2 whitespace-pre-wrap text-ink/90">{topic.body}</p>}
      <p className="mt-2 text-xs text-muted">
        {nicknames.get(topic.createdBy) ?? t('topic.someone')} · {formatWhen(topic.createdAt)}
      </p>

      {topic.status === 'closed' && topic.resolution && (
        <div className="mt-4 rounded-xl bg-raised px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-carbs">
            <CircleCheck size={15} aria-hidden />
            {t('topic.resolution')}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap">{topic.resolution}</p>
          {topic.closedBy && (
            <p className="mt-2 text-xs text-muted">
              {nicknames.get(topic.closedBy) ?? t('topic.someone')}
              {topic.closedAt && ` · ${formatWhen(topic.closedAt)}`}
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {comments.map((comment) => {
          const mine = comment.authorId === userId
          return (
            <div
              key={comment.id}
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                mine ? 'self-end bg-accent text-accent-ink' : 'self-start bg-surface ring-1 ring-line'
              }`}
            >
              {!mine && (
                <p className="text-xs text-muted">{nicknames.get(comment.authorId) ?? t('topic.partner')}</p>
              )}
              <p className="whitespace-pre-wrap">{comment.body}</p>
              <p className={`mt-1 text-xs ${mine ? 'text-accent-ink/70' : 'text-muted'}`}>
                {formatWhen(comment.createdAt)}
              </p>
            </div>
          )
        })}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-5 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('topic.writePlaceholder')}
          rows={1}
          onInput={(e) => {
            // Растёт под текст: фиксированная высота в разговоре на несколько
            // абзацев превращает поле в щёлочку
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`
          }}
          className="max-h-40 min-h-12 flex-1 resize-none rounded-xl bg-surface px-4 py-3
                     ring-1 ring-line outline-none focus:ring-2 focus:ring-accent
                     placeholder:text-muted"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!draft.trim()}
          aria-label={t('topic.send')}
          className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent
                     text-accent-ink disabled:opacity-40"
        >
          <Send size={18} aria-hidden />
        </button>
      </div>

      <div className="mt-6">
        {topic.status === 'open' ? (
          <Button variant="secondary" onClick={() => setClosing(true)}>
            <CircleCheck size={18} aria-hidden />
            {t('topic.close')}
          </Button>
        ) : (
          <Button
            variant="secondary"
            loading={reopen.isPending}
            onClick={() =>
              void reopen.mutateAsync({ id: topic.id, previousResolution: topic.resolution })
            }
          >
            <RotateCcw size={18} aria-hidden />
            {t('topic.reopen')}
          </Button>
        )}
      </div>

      <Sheet open={closing} onClose={() => setClosing(false)} title={t('topic.resolution')}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            {t('topic.resolutionHint')}
          </p>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder={t('topic.resolutionPlaceholder')}
            rows={5}
            autoFocus
            className="w-full resize-none rounded-xl bg-surface px-4 py-3 ring-1 ring-line
                       outline-none focus:ring-2 focus:ring-accent placeholder:text-muted"
          />
          <Button
            disabled={!resolution.trim()}
            loading={closeTopic.isPending}
            onClick={() => {
              void closeTopic
                .mutateAsync({ id: topic.id, resolution, userId })
                .then(() => setClosing(false))
            }}
          >
            {t('topic.close')}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

function Header({ title, action }: { title: string; action?: React.ReactNode }) {
  const t = useT()
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-1 py-2">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label={t('food.back')}
        className="-ml-2 p-2 text-muted"
      >
        <ChevronLeft size={22} aria-hidden />
      </button>
      <span className="flex-1 text-base font-medium">{title}</span>
      {action}
    </div>
  )
}

/** «Сегодня, 14:30» / «3 сентября». Точное время нужно только для свежего. */
function formatWhen(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString(activeLocale(), { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return tr('topic.todayAt', { time })
  return tr('topic.dateAt', {
    date: date.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'long' }),
    time,
  })
}
