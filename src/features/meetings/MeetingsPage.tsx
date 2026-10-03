import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Clapperboard, Gift, HeartHandshake, Images, Lightbulb, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { formatDayMonth, fromLocalISO, shiftDays, todayLocal } from '@/lib/date'
import { usePair, type Pair } from '@/features/profile/pair'
import { useWishes } from '@/features/wishlist/api'
import { useWatch } from '@/features/watch/api'
import { AnimatedNumber } from '@/ui/AnimatedNumber'
import { Aurora } from '@/ui/Aurora'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card, SectionTitle } from '@/ui/Card'
import { Fab } from '@/ui/Fab'
import { Field, INPUT_CLASS } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { ShineBorder } from '@/ui/ShineBorder'
import { Sparkles } from '@/ui/Sparkles'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { toneVar } from '@/ui/tones'
import {
  useAddItem,
  useDeleteItem,
  useDeleteMeeting,
  useMeetingToMemory,
  useMeetings,
  useSaveMeeting,
  useToggleItem,
} from './api'
import { memoryCaption, nextMeeting, stateOf, type Meeting } from './logic'

/**
 * До встречи.
 *
 * Пара живёт порознь, и главная дата на горизонте - следующая встреча.
 * Наверху счётчик, ниже - общий план на эти дни (можно взять из вишлиста
 * и из «Смотрим вместе»), после встречи - одним нажатием воспоминание
 * в ленту с тем, что из плана успели.
 */
export function MeetingsPage() {
  const t = useT()
  const pair = usePair()
  const meetings = useMeetings()
  const today = todayLocal()
  const [editing, setEditing] = useState<Meeting | 'new' | null>(null)

  if (meetings.isError) return <ErrorState error={meetings.error} onRetry={() => void meetings.refetch()} />
  if (meetings.isPending || pair.isPending) return <Loading />

  const list = meetings.data
  const next = nextMeeting(list, today)
  const later = list.filter((m) => m.startsOn > today && m.id !== next?.id).sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1))
  const past = list.filter((m) => m.endsOn < today)
  const fresh = (m: Meeting) => list.find((x) => x.id === m.id) ?? m

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {next ? (
        <>
          <Countdown meeting={next} pair={pair} today={today} onEdit={() => setEditing(next)} />
          <Plan meeting={next} />
        </>
      ) : (
        <EmptyState
          icon={HeartHandshake}
          tone="rose"
          title={t('mt.emptyTitle')}
          hint={t('mt.emptyHint')}
          action={<Button onClick={() => setEditing('new')}>{t('mt.new')}</Button>}
        />
      )}

      {later.length > 0 && (
        <>
          <SectionTitle className="mt-3">{t('mt.later')}</SectionTitle>
          {later.map((m) => (
            <MeetingRow key={m.id} meeting={m} onOpen={() => setEditing(m)} />
          ))}
        </>
      )}

      {past.length > 0 && (
        <>
          <SectionTitle className="mt-3">{t('mt.past')}</SectionTitle>
          {past.map((m) => (
            <PastMeeting key={m.id} meeting={m} onOpen={() => setEditing(m)} />
          ))}
        </>
      )}

      <Fab onClick={() => setEditing('new')} label={t('mt.new')} />
      {editing && <MeetingSheet meeting={editing === 'new' ? null : fresh(editing)} today={today} onClose={() => setEditing(null)} />}
    </div>
  )
}

function range(m: Meeting): string {
  return m.startsOn === m.endsOn
    ? formatDayMonth(fromLocalISO(m.startsOn))
    : `${formatDayMonth(fromLocalISO(m.startsOn))} - ${formatDayMonth(fromLocalISO(m.endsOn))}`
}

/**
 * Счётчик. До встречи - крупное число дней (меньше трёх - искрится), во
 * время встречи - «вы вместе, день 2 из 5» и сияние по рамке в цветах пары.
 */
function Countdown({ meeting, pair, today, onEdit }: { meeting: Meeting; pair: Pair; today: string; onEdit: () => void }) {
  const t = useT()
  const state = stateOf(meeting, today)
  const a = toneVar(pair.myTone)
  const b = toneVar(pair.partnerTone)

  const number =
    state.kind === 'upcoming' ? (
      <span className="flex items-baseline gap-2">
        <AnimatedNumber value={state.days} className="font-display text-[56px] leading-none font-extrabold tracking-tight tabular-nums" />
        <span className="font-display text-xl font-extrabold">{t.plural('unit.day', state.days)}</span>
      </span>
    ) : null

  return (
    <section
      className="relative isolate overflow-hidden rounded-[28px] bg-surface p-5 shadow-card"
      style={{ '--pair-a': a, '--pair-b': b } as CSSProperties}
    >
      {state.kind === 'now' && <ShineBorder colors={[a, 'var(--c-accent)', b]} />}
      <Aurora colors={[a, b, 'var(--c-accent)']} />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold text-muted">
          {state.kind === 'now' ? t('mt.together') : t('mt.until')}
        </p>
        <button
          type="button"
          onClick={onEdit}
          aria-label={t('common.edit')}
          className="-mt-1.5 -mr-1.5 flex size-10 items-center justify-center rounded-full text-muted transition-colors active:bg-raised"
        >
          <Pencil size={17} aria-hidden />
        </button>
      </div>

      <div className="mt-1">
        {state.kind === 'upcoming' ? (
          state.days <= 3 ? (
            <Sparkles count={5} colors={[a, 'var(--t-amber)', b]}>
              {number}
            </Sparkles>
          ) : (
            number
          )
        ) : state.kind === 'now' ? (
          <p className="font-display text-[34px] leading-tight font-extrabold tracking-tight">
            {t('mt.dayOf', { n: state.day, of: state.of })}
          </p>
        ) : null}
      </div>

      <p className="mt-3 text-[15px] font-semibold">{range(meeting)}</p>
      {meeting.place && (
        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
          <MapPin size={14} aria-hidden />
          {meeting.place}
        </p>
      )}
      {meeting.note && <p className="mt-2 text-sm text-muted">{meeting.note}</p>}
    </section>
  )
}

/** План на встречу: галочки, свой пункт и пункты из вишлиста и фильмов. */
function Plan({ meeting }: { meeting: Meeting }) {
  const t = useT()
  const add = useAddItem()
  const toggle = useToggleItem()
  const remove = useDeleteItem()
  const burst = useBurst()
  const [draft, setDraft] = useState('')
  const [picking, setPicking] = useState(false)
  const done = meeting.items.filter((i) => i.done).length

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4">
        <SectionTitle>{t('mt.plan')}</SectionTitle>
        {meeting.items.length > 0 && (
          <span className="text-[13px] font-semibold text-muted tabular-nums">
            {done}/{meeting.items.length}
          </span>
        )}
      </div>

      <ul className="mt-2 flex flex-col">
        {meeting.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                toggle.mutate({ id: item.id, done: !item.done })
                if (!item.done) burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 'sparks')
              }}
              className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"
            >
              <span
                aria-hidden
                className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                  item.done ? 'bg-tone-green text-white' : 'bg-raised text-muted'
                }`}
              >
                {item.done ? (
                  <Check size={16} strokeWidth={3} />
                ) : item.source === 'wish' ? (
                  <Gift size={14} />
                ) : item.source === 'watch' ? (
                  <Clapperboard size={14} />
                ) : item.source === 'idea' ? (
                  <Lightbulb size={14} />
                ) : null}
              </span>
              <span className={`min-w-0 flex-1 text-[15px] ${item.done ? 'text-muted line-through decoration-muted/50' : ''}`}>
                {item.title}
              </span>
            </button>
            <button
              type="button"
              onClick={() => remove.mutate(item.id)}
              aria-label={t('common.delete')}
              className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted/70 transition-colors active:bg-raised"
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <form
        className="flex items-center gap-2 border-t border-line p-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim() === '') return
          add.mutate({ meetingId: meeting.id, title: draft, source: null }, { onSuccess: () => setDraft('') })
        }}
      >
        <Field label={t('mt.addItem')} hideLabel value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('mt.itemPlaceholder')} maxLength={200} />
        <button
          type="submit"
          aria-label={t('mt.addItem')}
          disabled={draft.trim() === '' || add.isPending}
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-ink transition-transform active:scale-95 disabled:opacity-40"
        >
          <Plus size={20} aria-hidden />
        </button>
      </form>
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="flex w-full items-center justify-center gap-2 border-t border-line py-3 text-sm font-semibold text-accent transition-colors active:bg-raised"
      >
        <Gift size={16} aria-hidden />
        {t('mt.fromLists')}
      </button>

      {picking && <PickSheet meeting={meeting} onClose={() => setPicking(false)} />}
    </Card>
  )
}

/**
 * Из вишлиста и «Смотрим вместе» - одним тапом в план. Уже добавленное
 * отмечено: встреча короткая, два одинаковых пункта ни к чему.
 */
function PickSheet({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const t = useT()
  const wishes = useWishes()
  const watch = useWatch()
  const add = useAddItem()
  const taken = new Set(meeting.items.map((i) => i.title.trim().toLowerCase()))
  const wishList = (wishes.data ?? []).filter((w) => ['visit', 'try', 'food', 'together', 'watch'].includes(w.category))
  const films = (watch.data ?? []).filter((w) => w.status === 'want')

  const row = (title: string, source: 'wish' | 'watch', key: string) => {
    const has = taken.has(title.trim().toLowerCase())
    return (
      <li key={key}>
        <button
          type="button"
          disabled={has || add.isPending}
          onClick={() => add.mutate({ meetingId: meeting.id, title, source })}
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors active:bg-raised disabled:opacity-50"
        >
          {source === 'wish' ? <Gift size={17} aria-hidden className="shrink-0 text-tone-orange" /> : <Clapperboard size={17} aria-hidden className="shrink-0 text-tone-sky" />}
          <span className="min-w-0 flex-1 truncate text-[15px]">{title}</span>
          {has ? <Check size={17} aria-hidden className="text-tone-green" /> : <Plus size={17} aria-hidden className="text-muted" />}
        </button>
      </li>
    )
  }

  return (
    <Sheet open onClose={onClose} title={t('mt.fromLists')}>
      <div className="flex flex-col gap-4">
        <section>
          <SectionTitle>{t('nav.wishlist')}</SectionTitle>
          {wishList.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted">{t('mt.nothingHere')}</p>
          ) : (
            <ul className="mt-1">{wishList.map((w) => row(w.title, 'wish', w.id))}</ul>
          )}
        </section>
        <section>
          <SectionTitle>{t('nav.watch')}</SectionTitle>
          {films.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted">{t('mt.nothingHere')}</p>
          ) : (
            <ul className="mt-1">{films.map((f) => row(f.title, 'watch', f.id))}</ul>
          )}
        </section>
      </div>
    </Sheet>
  )
}

function MeetingRow({ meeting, onOpen }: { meeting: Meeting; onOpen: () => void }) {
  const t = useT()
  return (
    <Card as="article" className="p-0">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 p-4 text-left active:opacity-70">
        <HeartHandshake size={20} aria-hidden className="shrink-0 text-tone-rose" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{range(meeting)}</span>
          {meeting.place && <span className="block truncate text-[13px] text-muted">{meeting.place}</span>}
        </span>
        {meeting.items.length > 0 && (
          <span className="text-[13px] text-muted">{t('mt.items', { n: meeting.items.length })}</span>
        )}
      </button>
    </Card>
  )
}

/** Прошедшая встреча: что успели - и одним нажатием в ленту воспоминаний. */
function PastMeeting({ meeting, onOpen }: { meeting: Meeting; onOpen: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const toMemory = useMeetingToMemory()
  const done = meeting.items.filter((i) => i.done).length
  const [error, setError] = useState<string | null>(null)

  return (
    <Card as="article" className="p-4">
      <button type="button" onClick={onOpen} className="block w-full text-left active:opacity-70">
        <span className="block text-[15px] font-semibold">{range(meeting)}</span>
        <span className="mt-0.5 block text-[13px] text-muted">
          {[meeting.place, meeting.items.length > 0 ? t('mt.doneOf', { n: done, total: meeting.items.length }) : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </button>
      {meeting.memoryId === null ? (
        <Button
          variant="soft"
          className="mt-3 w-full"
          loading={toMemory.isPending}
          onClick={() =>
            toMemory.mutate(
              { meeting, caption: memoryCaption(meeting, t('mt.memoryPrefix', { dates: range(meeting) })) },
              { onSuccess: () => navigate('/memories'), onError: (e) => setError(e.message) },
            )
          }
        >
          <Images size={18} aria-hidden />
          {t('mt.toMemory')}
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => navigate('/memories')}
          className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-accent"
        >
          <Images size={14} aria-hidden />
          {t('mt.inMemories')}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  )
}

function MeetingSheet({ meeting, today, onClose }: { meeting: Meeting | null; today: string; onClose: () => void }) {
  const t = useT()
  const save = useSaveMeeting()
  const remove = useDeleteMeeting()
  const burst = useBurst()
  const [startsOn, setStartsOn] = useState(meeting?.startsOn ?? shiftDays(today, 7))
  const [endsOn, setEndsOn] = useState(meeting?.endsOn ?? shiftDays(today, 9))
  const [place, setPlace] = useState(meeting?.place ?? '')
  const [note, setNote] = useState(meeting?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = async (el: HTMLElement) => {
    setError(null)
    if (endsOn < startsOn) return setError(t('mt.badDates'))
    const r = el.getBoundingClientRect()
    try {
      await save.mutateAsync({ ...(meeting ? { id: meeting.id } : {}), startsOn, endsOn, place, note })
      if (!meeting) burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 'hearts')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={meeting ? t('mt.edit') : t('mt.new')}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm text-muted">{t('mt.from')}</span>
            <input
              type="date"
              value={startsOn}
              onChange={(e) => {
                const v = e.target.value || startsOn
                setStartsOn(v)
                if (endsOn < v) setEndsOn(v)
              }}
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm text-muted">{t('mt.to')}</span>
            <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value || endsOn)} className={INPUT_CLASS} />
          </label>
        </div>
        <Field label={t('mt.place')} value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t('mt.placePlaceholder')} maxLength={120} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('mt.note')}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={t('mt.notePlaceholder')}
            className={`${INPUT_CLASS} resize-none`}
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={(e) => void submit(e.currentTarget)} loading={save.isPending}>
          {meeting ? t('common.save') : t('mt.create')}
        </Button>
        {meeting && (
          <Button variant="danger" loading={remove.isPending} onClick={() => void remove.mutateAsync(meeting.id).then(onClose)}>
            <Trash2 size={18} aria-hidden />
            {t('common.delete')}
          </Button>
        )}
      </div>
    </Sheet>
  )
}
