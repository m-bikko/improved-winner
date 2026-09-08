import { useState } from 'react'
import { Mail, MailOpen, Plus, Trash2 } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { fromLocalISO, shiftDays, todayLocal } from '@/lib/date'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { useProfiles } from '@/features/profile/api'
import {
  useDeleteLetter,
  useLetters,
  useSaveLetter,
  type Letter,
  type LetterAudience,
} from './api'

function day(iso: string): string {
  return fromLocalISO(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Письма в будущее.
 *
 * Живут рядом с датами, а не отдельным разделом: и то и другое - это «что
 * будет», а меню и так из десяти пунктов.
 *
 * Чужого неотправленного письма тут не появится - его не отдаёт база.
 * Поэтому список честно показывает всё, что пришло, и свои неотправленные,
 * без единой проверки на клиенте.
 */
export function LettersTab() {
  const userId = useUserId()
  const letters = useLetters()
  const [editing, setEditing] = useState<Letter | 'new' | null>(null)

  if (letters.isError) {
    return <ErrorState error={letters.error} onRetry={() => void letters.refetch()} />
  }
  if (letters.isPending) return <Loading />

  const waiting = letters.data.filter((l) => l.deliveredAt === null)
  const arrived = letters.data
    .filter((l) => l.deliveredAt !== null)
    .sort((a, b) => (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? ''))

  return (
    <>
      {letters.data.length === 0 ? (
        <EmptyState
          title="Писем пока нет"
          hint="Написали сегодня - придёт в выбранный день. На годовщину, на день рождения или просто «через год посмотрим, что мы думали»."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {waiting.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 text-sm text-muted">В пути</h2>
              {waiting.map((l) => (
                <Card key={l.id} letter={l} userId={userId} onOpen={() => setEditing(l)} />
              ))}
            </section>
          )}

          {arrived.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 text-sm text-muted">Пришли</h2>
              {arrived.map((l) => (
                <Card key={l.id} letter={l} userId={userId} onOpen={null} />
              ))}
            </section>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setEditing('new')}
        aria-label="Новое письмо"
        className="fixed right-5 bottom-6 z-20 flex size-14 items-center justify-center
                   rounded-full bg-accent text-accent-ink shadow-lg
                   transition-transform active:scale-95"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Plus size={26} aria-hidden />
      </button>

      {editing && (
        <Editor letter={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  )
}

function Card({
  letter,
  userId,
  onOpen,
}: {
  letter: Letter
  userId: string
  onOpen: (() => void) | null
}) {
  const profiles = useProfiles()
  const sealed = letter.deliveredAt === null
  const mine = letter.authorId === userId
  const author = profiles.data?.find((p) => p.userId === letter.authorId)?.nickname ?? 'Партнёр'
  const Icon = sealed ? Mail : MailOpen

  const body = (
    <>
      <div className="flex items-center gap-2 text-sm text-muted">
        <Icon size={15} aria-hidden className={sealed ? 'text-accent' : ''} />
        {sealed ? `придёт ${day(letter.deliverOn)}` : `пришло ${day(letter.deliverOn)}`}
        {!mine && ` · ${author}`}
        {mine && letter.audience === 'both' && ' · обоим'}
      </div>
      <p className="mt-2 text-sm whitespace-pre-wrap">{letter.body}</p>
    </>
  )

  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl bg-surface p-4 text-left ring-1 ring-line"
    >
      {body}
    </button>
  ) : (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">{body}</div>
  )
}

function Editor({ letter, onClose }: { letter: Letter | null; onClose: () => void }) {
  const save = useSaveLetter()
  const remove = useDeleteLetter()
  const [body, setBody] = useState(letter?.body ?? '')
  // По умолчанию через год: письмо «на завтра» - это записка, а не письмо
  // в будущее, и предлагать завтрашний день значило бы подталкивать не к тому
  const [deliverOn, setDeliverOn] = useState(letter?.deliverOn ?? shiftDays(todayLocal(), 365))
  const [audience, setAudience] = useState<LetterAudience>(letter?.audience ?? 'partner')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (body.trim() === '') {
      setError('Пустое письмо отправлять незачем')
      return
    }
    if (deliverOn <= todayLocal()) {
      setError('День доставки должен быть в будущем')
      return
    }
    try {
      await save.mutateAsync({ ...(letter ? { id: letter.id } : {}), body, deliverOn, audience })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={letter ? 'Письмо' : 'Письмо в будущее'}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Что написать</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            autoFocus={!letter}
            placeholder="Прочитаешь это через год…"
            className="w-full min-w-0 resize-none rounded-xl bg-surface px-4 py-3 ring-1 ring-line
                       outline-none focus:ring-2 focus:ring-accent placeholder:text-muted"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">Кому</span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['partner', 'Партнёру'],
                ['both', 'Обоим'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAudience(id)}
                aria-pressed={audience === id}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  audience === id
                    ? 'bg-accent text-accent-ink'
                    : 'bg-raised text-ink ring-1 ring-line'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Field
          label="Когда придёт"
          type="date"
          value={deliverOn}
          min={shiftDays(todayLocal(), 1)}
          onChange={(e) => setDeliverOn(e.target.value)}
          hint="Утром выбранного дня. После отправки письмо уже не поправить"
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} loading={save.isPending}>
          {letter ? 'Сохранить' : 'Запечатать'}
        </Button>

        {letter && (
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => void remove.mutateAsync(letter.id).then(onClose)}
          >
            <Trash2 size={18} aria-hidden />
            Удалить
          </Button>
        )}
      </div>
    </Sheet>
  )
}
