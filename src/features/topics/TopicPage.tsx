import { formatDayMonth, formatTime } from '@/lib/date'
import { tr, useT } from '@/lib/i18n'
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CircleCheck, CircleDot, MessagesSquare, RotateCcw, Send, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Tag } from '@/ui/Chip'
import { INPUT_CLASS } from '@/ui/Field'
import { IconBadge } from '@/ui/IconBadge'
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

// Своей шапки с «назад» у экранов темы больше нет: её рисует оболочка
// для всех вложенных маршрутов. Две стрелки «назад» друг под другом
// выглядели бы как два разных пути
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
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Card as="section" className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <IconBadge icon={MessagesSquare} tone="indigo" size="md" />
          <h2 className="font-display text-[17px] font-bold">{t('topic.new')}</h2>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('topic.titlePlaceholder')}
          aria-label={t('topic.titlePlaceholder')}
          autoFocus
          className={`${INPUT_CLASS} text-lg font-semibold`}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('topic.bodyPlaceholder')}
          aria-label={t('topic.bodyPlaceholder')}
          rows={6}
          className={`${INPUT_CLASS} resize-none`}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={() => void submit()} disabled={!title.trim()} loading={create.isPending}>
          {t('topic.create')}
        </Button>
      </Card>
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
  const draftRef = useRef<HTMLTextAreaElement>(null)

  const send = async () => {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    // Высоту выставляет onInput, а при очистке программно он не срабатывает:
    // без сброса поле так и осталось бы растянутым под отправленный абзац
    if (draftRef.current) draftRef.current.style.height = ''
    try {
      await addComment.mutateAsync({ topicId: topic.id, body })
    } catch (e) {
      setDraft(body) // не теряем набранное
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const isOpen = topic.status === 'open'

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Card as="section" className="p-4">
        <Tag icon={isOpen ? CircleDot : CircleCheck} tone={isOpen ? 'accent' : 'neutral'}>
          {t(isOpen ? 'topic.discussion' : 'topic.closed')}
        </Tag>
        <h2 className="mt-2.5 font-display text-[22px] leading-tight font-extrabold tracking-tight">
          {topic.title}
        </h2>
        {topic.body && (
          <p className="mt-2 whitespace-pre-wrap text-[15px] text-ink/90">{topic.body}</p>
        )}
        <p className="mt-3 text-[13px] text-muted">
          {nicknames.get(topic.createdBy) ?? t('topic.someone')} · {formatWhen(topic.createdAt)}
        </p>
      </Card>

      {topic.status === 'closed' && topic.resolution && (
        <Card as="section" className="p-4">
          <p className="flex items-center gap-2 font-display text-[17px] font-bold">
            <CircleCheck size={18} className="shrink-0 text-carbs" aria-hidden />
            {t('topic.resolution')}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-[15px]">{topic.resolution}</p>
          {topic.closedBy && (
            <p className="mt-3 text-[13px] text-muted">
              {nicknames.get(topic.closedBy) ?? t('topic.someone')}
              {topic.closedAt && ` · ${formatWhen(topic.closedAt)}`}
            </p>
          )}
        </Card>
      )}

      {comments.length > 0 && (
        <div className="flex flex-col gap-2 pt-2">
          {comments.map((comment) => {
            const mine = comment.authorId === userId
            return (
              <div
                key={comment.id}
                // Один «хвостовой» угол у стороны автора - как в мессенджере:
                // чей пузырь, видно по форме раньше, чем по цвету
                className={`max-w-[85%] rounded-3xl px-4 py-2.5 ${
                  mine
                    ? 'self-end rounded-br-lg bg-accent text-accent-ink'
                    : 'self-start rounded-bl-lg bg-surface shadow-card'
                }`}
              >
                {!mine && (
                  <p className="text-[13px] font-semibold text-muted">
                    {nicknames.get(comment.authorId) ?? t('topic.partner')}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-[15px]">{comment.body}</p>
                <p
                  className={`mt-1 text-[13px] tabular-nums ${
                    mine ? 'text-right text-accent-ink/75' : 'text-muted'
                  }`}
                >
                  {formatWhen(comment.createdAt)}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {error && <p className="px-1 text-sm text-danger">{error}</p>}

      {/* Поле ответа - сразу под последним сообщением, отправка справа под
          большим пальцем. Не липкое к низу: на iOS липкий блок с полем ввода
          при открытой клавиатуре уезжает под неё, а решать это для одного
          экрана, где разговоров несколько в месяц, дороже, чем прокрутить */}
      <Card className="flex items-end gap-2 p-2">
        <textarea
          ref={draftRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('topic.writePlaceholder')}
          aria-label={t('topic.writePlaceholder')}
          rows={1}
          onInput={(e) => {
            // Растёт под текст: фиксированная высота в разговоре на несколько
            // абзацев превращает поле в щёлочку
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`
          }}
          className={`${INPUT_CLASS} max-h-40 min-h-12 min-w-0 flex-1 resize-none`}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!draft.trim()}
          aria-label={t('topic.send')}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent
                     text-accent-ink shadow-[0_6px_16px_-6px_var(--c-accent)] transition-transform
                     active:scale-90 disabled:opacity-40 disabled:shadow-none disabled:active:scale-100"
        >
          <Send size={20} aria-hidden />
        </button>
      </Card>

      {/* Удаление здесь, внизу, а не иконкой в шапке: там оно стояло бы
          вплотную к «обновить», и промах пальцем стирал бы тему целиком -
          подтверждения у удаления нет */}
      <div className="mt-3 flex flex-col gap-2">
        {isOpen ? (
          <Button variant="soft" onClick={() => setClosing(true)}>
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
        {topic.createdBy === userId && (
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => {
              void remove.mutateAsync(topic.id).then(() => navigate('/topics', { replace: true }))
            }}
          >
            <Trash2 size={18} aria-hidden />
            {t('topic.delete')}
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
            aria-label={t('topic.resolution')}
            rows={5}
            autoFocus
            className={`${INPUT_CLASS} resize-none`}
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

/** «Сегодня, 14:30» / «3 сентября». Точное время нужно только для свежего. */
function formatWhen(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const time = formatTime(date)
  if (sameDay) return tr('topic.todayAt', { time })
  return tr('topic.dateAt', {
    date: formatDayMonth(date),
    time,
  })
}
