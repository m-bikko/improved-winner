import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Handshake, HeartHandshake, MessagesSquare, Pause as PauseIcon, Wind } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { formatDayLabel, formatTime, toLocalISO } from '@/lib/date'
import { useNow } from '@/lib/useNow'
import { usePair, type Pair } from '@/features/profile/pair'
import { useCreateTopic } from '@/features/topics/api'
import { useCreateAgreement } from '@/features/agreements/api'
import { Aurora } from '@/ui/Aurora'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card, SectionTitle } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Field, INPUT_CLASS } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { ErrorState, Loading } from '@/ui/States'
import { mmss } from '@/features/shots/logic'
import { useClosePause, useEndEarly, usePauses, useStartPause, useWriteNotes, type Pause } from './api'

type Length = '20' | '60' | '120' | 'evening'

/** Конец паузы по выбору. «До вечера» - до 20:00 сегодня, пока до него больше часа. */
function endsAtFor(length: Length, now: Date): Date | null {
  if (length === 'evening') {
    const evening = new Date(now)
    evening.setHours(20, 0, 0, 0)
    return evening.getTime() - now.getTime() > 60 * 60_000 ? evening : null
  }
  return new Date(now.getTime() + Number(length) * 60_000)
}

/**
 * Пауза в ссоре.
 *
 * Без паузы - объяснение и выбор срока. Во время паузы - спокойный экран
 * с дыханием и отсчётом; закончить раньше может только тот, кто просил.
 * После - три строки вслепую, а когда написали оба - мир, тема или
 * договорённость.
 */
export function PausePage() {
  const pair = usePair()
  const pauses = usePauses()
  const now = useNow(1000)

  if (pauses.isError) return <ErrorState error={pauses.error} onRetry={() => void pauses.refetch()} />
  if (pauses.isPending || pair.isPending) return <Loading />

  const open = pauses.data.find((p) => p.closedAt === null)
  const history = pauses.data.filter((p) => p.closedAt !== null)

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {!open ? (
        <Ask />
      ) : new Date(open.endsAt).getTime() > now ? (
        <Active pause={open} pair={pair} now={now} />
      ) : (
        <Talk pause={open} pair={pair} />
      )}
      {history.length > 0 && <History list={history} pair={pair} />}
    </div>
  )
}

function Ask() {
  const t = useT()
  const start = useStartPause()
  const now = new Date()
  const options = (['20', '60', '120', 'evening'] as const).filter((l) => endsAtFor(l, now) !== null)
  const [length, setLength] = useState<Length>('60')
  const [error, setError] = useState<string | null>(null)
  const label: Record<Length, string> = {
    '20': t('ps.len20'),
    '60': t('ps.len60'),
    '120': t('ps.len120'),
    evening: t('ps.lenEvening'),
  }

  return (
    <section className="relative isolate overflow-hidden rounded-[28px] bg-surface p-6 shadow-card">
      <Aurora colors={['var(--t-sky)', 'var(--t-teal)', 'var(--t-indigo)']} />
      <span className="flex size-14 items-center justify-center rounded-2xl bg-tone-sky-soft text-tone-sky">
        <Wind size={28} aria-hidden />
      </span>
      <h2 className="mt-4 font-display text-2xl font-extrabold">{t('ps.title')}</h2>
      <p className="mt-2 text-[15px] leading-snug text-muted">{t('ps.intro')}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {options.map((l) => (
          <Chip key={l} selected={length === l} onClick={() => setLength(l)}>
            {label[l]}
          </Chip>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <Button
        className="mt-5 w-full"
        loading={start.isPending}
        onClick={() => {
          const end = endsAtFor(options.includes(length) ? length : '60', new Date())
          if (end) start.mutate(end.toISOString(), { onError: (e) => setError(e.message) })
        }}
      >
        <PauseIcon size={18} aria-hidden className="fill-current" />
        {t('ps.ask')}
      </Button>
      <p className="mt-3 text-center text-[13px] text-muted">{t('ps.askHint')}</p>
    </section>
  )
}

/**
 * Идёт пауза: круг дышит - вдох четыре секунды, выдох шесть. Медленный
 * выдох успокаивает лучше всего остального на экране.
 */
function Active({ pause, pair, now }: { pause: Pause; pair: Pair; now: number }) {
  const t = useT()
  const reduce = useReducedMotion()
  const end = useEndEarly()
  const mine = pause.startedBy === pair.userId
  const left = (new Date(pause.endsAt).getTime() - now) / 1000
  const inhale = now % 10_000 < 4_000
  const until = formatTime(new Date(pause.endsAt))

  return (
    <section className="relative isolate flex flex-col items-center overflow-hidden rounded-[28px] bg-surface px-6 pt-8 pb-6 text-center shadow-card">
      <Aurora colors={['var(--t-sky)', 'var(--t-teal)', 'var(--t-indigo)']} />
      <div className="relative flex size-48 items-center justify-center">
        <motion.span
          aria-hidden
          className="absolute inset-4 rounded-full bg-tone-sky-soft"
          {...(reduce ? {} : { animate: { scale: [1, 1.3, 1.3, 1] } })}
          transition={{ duration: 10, times: [0, 0.4, 0.42, 1], repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          aria-hidden
          className="absolute inset-12 rounded-full bg-tone-teal-soft"
          {...(reduce ? {} : { animate: { scale: [1, 1.22, 1.22, 1] } })}
          transition={{ duration: 10, times: [0, 0.4, 0.42, 1], repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="relative font-display text-lg font-extrabold text-tone-sky">{inhale ? t('ps.inhale') : t('ps.exhale')}</span>
      </div>
      <p className="mt-4 font-display text-[40px] leading-none font-extrabold tabular-nums">{mmss(left)}</p>
      <p className="mt-2 text-[15px] font-semibold">
        {mine ? t('ps.mineUntil', { time: until }) : t('ps.theirsUntil', { name: pair.partnerName, time: until })}
      </p>
      <p className="mt-2 max-w-sm text-sm text-muted">{mine ? t('ps.mineHint') : t('ps.theirsHint')}</p>
      {mine && (
        <Button variant="secondary" className="mt-5" loading={end.isPending} onClick={() => end.mutate(pause.id)}>
          {t('ps.endEarly')}
        </Button>
      )}
    </section>
  )
}

/** После паузы: три строки, ожидание второго, а потом - что дальше. */
function Talk({ pause, pair }: { pause: Pause; pair: Pair }) {
  const t = useT()
  const mine = pause.notes.find((n) => n.userId === pair.userId)
  const theirs = pause.notes.find((n) => n.userId === pair.partnerId)
  const [editing, setEditing] = useState(false)

  return (
    <>
      <Card className="p-5">
        <p className="font-display text-xl font-extrabold">{mine && theirs ? t('ps.openTitle') : t('ps.overTitle')}</p>
        <p className="mt-1 text-sm text-muted">{mine && theirs ? t('ps.openHint') : t('ps.overHint')}</p>
      </Card>

      {!mine || editing ? (
        <NotesForm pause={pause} pair={pair} initial={mine ?? null} onDone={() => setEditing(false)} />
      ) : (
        <NotesCard name={pair.myName} tone={pair.myTone} note={mine} onEdit={theirs ? undefined : () => setEditing(true)} />
      )}

      {mine && !editing && (
        theirs ? (
          <NotesCard name={pair.partnerName} tone={pair.partnerTone} note={theirs} />
        ) : (
          <Card className="flex items-center gap-3 p-4">
            <Avatar name={pair.partnerName} tone={pair.partnerTone} size="sm" />
            <p className="text-sm text-muted">{t('ps.waiting', { name: pair.partnerName })}</p>
          </Card>
        )
      )}

      {mine && theirs && !editing ? <Outcome pause={pause} pair={pair} /> : <PeaceLink pause={pause} />}
    </>
  )
}

function NotesForm({ pause, pair, initial, onDone }: { pause: Pause; pair: Pair; initial: { feel: string; when: string | null; need: string } | null; onDone: () => void }) {
  const t = useT()
  const write = useWriteNotes()
  const [feel, setFeel] = useState(initial?.feel ?? '')
  const [when, setWhen] = useState(initial?.when ?? '')
  const [need, setNeed] = useState(initial?.need ?? '')
  const [error, setError] = useState<string | null>(null)
  const area = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      <textarea value={value} onChange={(e) => set(e.target.value)} maxLength={300} rows={2} placeholder={placeholder} className={`${INPUT_CLASS} resize-none py-3`} />
    </label>
  )
  return (
    <Card className="flex flex-col gap-4 p-5">
      {area(t('ps.feel'), feel, setFeel, t('ps.feelHint'))}
      {area(t('ps.when'), when, setWhen, t('ps.whenHint'))}
      {area(t('ps.need'), need, setNeed, t('ps.needHint'))}
      <p className="text-[13px] text-muted">{t('ps.blind')}</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button
        loading={write.isPending}
        disabled={feel.trim() === '' || need.trim() === ''}
        onClick={() =>
          write.mutate(
            { pauseId: pause.id, userId: pair.userId, feel, when, need, isNew: initial === null },
            { onSuccess: onDone, onError: (e) => setError(e.message) },
          )
        }
      >
        {t('common.done')}
      </Button>
    </Card>
  )
}

function NotesCard({
  name,
  tone,
  note,
  onEdit,
}: {
  name: string
  tone: Pair['myTone']
  note: { feel: string; when: string | null; need: string }
  onEdit?: (() => void) | undefined
}) {
  const t = useT()
  const line = (label: string, text: string) => (
    <p className="text-[15px] leading-snug">
      <span className="text-muted">{label} </span>
      {text}
    </p>
  )
  return (
    <Card className="flex flex-col gap-2 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Avatar name={name} tone={tone} size="sm" />
        <span className="min-w-0 flex-1 font-semibold">{name}</span>
        {onEdit && (
          <button type="button" onClick={onEdit} className="text-sm font-semibold text-accent">
            {t('common.edit')}
          </button>
        )}
      </div>
      {line(t('ps.feel'), note.feel)}
      {note.when && line(t('ps.when'), note.when)}
      {line(t('ps.need'), note.need)}
    </Card>
  )
}

/** Строки открыты: мир, тема для обсуждения или договорённость. */
function Outcome({ pause, pair }: { pause: Pause; pair: Pair }) {
  const t = useT()
  const navigate = useNavigate()
  const close = useClosePause()
  const createTopic = useCreateTopic()
  const burst = useBurst()
  const [sheet, setSheet] = useState<'topic' | 'agreement' | null>(null)

  const body = pause.notes
    .map((n) => `${pair.nameOf(n.userId)}: ${[n.feel, n.when, n.need].filter(Boolean).join(' / ')}`)
    .join('\n')

  return (
    <>
      <SectionTitle className="mt-2">{t('ps.next')}</SectionTitle>
      <div className="grid gap-2.5">
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            close.mutate({ id: pause.id, outcome: 'peace' }, { onSuccess: () => burst({ x: r.left + r.width / 2, y: r.top }, 'hearts') })
          }}
          className="flex items-center gap-3 rounded-3xl bg-accent p-4 text-left text-accent-ink shadow-card active:scale-[0.98]"
        >
          <HeartHandshake size={24} aria-hidden />
          <span>
            <span className="block font-display text-lg font-extrabold">{t('ps.peace')}</span>
            <span className="block text-sm opacity-85">{t('ps.peaceHint')}</span>
          </span>
        </button>
        <Button variant="secondary" onClick={() => setSheet('topic')}>
          <MessagesSquare size={18} aria-hidden />
          {t('ps.toTopic')}
        </Button>
        <Button variant="secondary" onClick={() => setSheet('agreement')}>
          <Handshake size={18} aria-hidden />
          {t('ps.toAgreement')}
        </Button>
      </div>
      {sheet === 'topic' && (
        <TitleSheet
          title={t('ps.toTopic')}
          withResolution={false}
          loading={createTopic.isPending || close.isPending}
          onClose={() => setSheet(null)}
          onSave={(title) =>
            createTopic.mutate(
              { title, body },
              {
                onSuccess: (topicId) =>
                  close.mutate({ id: pause.id, outcome: 'topic', topicId }, { onSuccess: () => navigate(`/topics/${topicId}`) }),
              },
            )
          }
        />
      )}
      {sheet === 'agreement' && <AgreementSheet pause={pause} pair={pair} onClose={() => setSheet(null)} />}
    </>
  )
}

function AgreementSheet({ pause, pair, onClose }: { pause: Pause; pair: Pair; onClose: () => void }) {
  const t = useT()
  const create = useCreateAgreement()
  const close = useClosePause()
  return (
    <TitleSheet
      title={t('ps.toAgreement')}
      withResolution
      loading={create.isPending || close.isPending}
      onClose={onClose}
      onSave={(title, resolution) =>
        create.mutate(
          { title, resolution, userId: pair.userId },
          { onSuccess: () => close.mutate({ id: pause.id, outcome: 'agreement' }, { onSuccess: onClose }) },
        )
      }
    />
  )
}

function TitleSheet({
  title,
  withResolution,
  loading,
  onClose,
  onSave,
}: {
  title: string
  withResolution: boolean
  loading: boolean
  onClose: () => void
  onSave: (title: string, resolution: string) => void
}) {
  const t = useT()
  const [name, setName] = useState('')
  const [resolution, setResolution] = useState('')
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <Field label={t('ps.topicTitle')} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
        {withResolution && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">{t('ps.agreedOn')}</span>
            <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} maxLength={1000} className={`${INPUT_CLASS} resize-none py-3`} />
          </label>
        )}
        <Button loading={loading} disabled={name.trim() === '' || (withResolution && resolution.trim() === '')} onClick={() => onSave(name, resolution)}>
          {t('common.save')}
        </Button>
      </div>
    </Sheet>
  )
}

/** Помирились и без строк - тоже исход. */
function PeaceLink({ pause }: { pause: Pause }) {
  const t = useT()
  const close = useClosePause()
  return (
    <button
      type="button"
      onClick={() => close.mutate({ id: pause.id, outcome: 'peace' })}
      className="py-2 text-center text-sm font-semibold text-muted"
    >
      {t('ps.peaceNoWords')}
    </button>
  )
}

function History({ list, pair }: { list: Pause[]; pair: Pair }) {
  const t = useT()
  const outcome = (p: Pause) =>
    p.outcome === 'peace' ? t('ps.outPeace') : p.outcome === 'topic' ? t('ps.outTopic') : t('ps.outAgreement')
  return (
    <>
      <SectionTitle className="mt-3">{t('ps.history')}</SectionTitle>
      <Card className="overflow-hidden [&>*+*]:border-t [&>*+*]:border-line">
        {list.map((p) => {
          const minutes = Math.max(1, Math.round((new Date(p.endsAt).getTime() - new Date(p.startedAt).getTime()) / 60_000))
          return (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={pair.nameOf(p.startedBy)} tone={pair.toneOf(p.startedBy)} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{formatDayLabel(toLocalISO(new Date(p.startedAt)))}</p>
                <p className="text-[13px] text-muted">
                  {minutes} {t('unit.min')} · {outcome(p)}
                </p>
              </div>
            </div>
          )
        })}
      </Card>
    </>
  )
}
