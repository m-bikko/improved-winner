import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Building2,
  CalendarPlus,
  Check,
  Dices,
  Heart,
  Images,
  Mountain,
  Plus,
  Sofa,
  Undo2,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react'
import { dynamicKey, useLang, useT } from '@/lib/i18n'
import { formatDayLabel, todayLocal } from '@/lib/date'
import { usePair } from '@/features/profile/pair'
import { useMeetings } from '@/features/meetings/api'
import { nextMeeting } from '@/features/meetings/logic'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card, SectionTitle } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Field, INPUT_CLASS } from '@/ui/Field'
import { Segmented } from '@/ui/Segmented'
import { Sheet } from '@/ui/Sheet'
import { Sparkles } from '@/ui/Sparkles'
import { ErrorState, Loading } from '@/ui/States'
import { RoundButton, SwipeCard } from '@/ui/SwipeCard'
import { Switch } from '@/ui/Switch'
import { TONE_CLASS, type Tone } from '@/ui/tones'
import {
  IDEA_CATEGORIES,
  useAddIdea,
  useAddToMeeting,
  useIdeaMatches,
  useIdeaVote,
  useIdeaVotes,
  useIdeas,
  useIdeasDone,
  useMarkDone,
  useUndoDone,
  type Idea,
  type IdeaCategory,
} from './api'

const CATEGORY: Record<IdeaCategory, { icon: LucideIcon; tone: Tone; gradient: string }> = {
  distance: { icon: Video, tone: 'violet', gradient: 'from-tone-violet-soft' },
  home: { icon: Sofa, tone: 'amber', gradient: 'from-tone-amber-soft' },
  city: { icon: Building2, tone: 'sky', gradient: 'from-tone-sky-soft' },
  trip: { icon: Mountain, tone: 'green', gradient: 'from-tone-green-soft' },
}

function useIdeaText(): { title: (i: Idea) => string; hint: (i: Idea) => string | null } {
  const { lang } = useLang()
  return {
    title: (i) => i.title ?? i.texts[lang] ?? i.texts.ru ?? '',
    hint: (i) => (i.title ? null : (i.hints[lang] ?? i.hints.ru)),
  }
}

/**
 * Идеи для свиданий.
 *
 * Каждый листает банк сам: вправо - хочу, влево - нет. Идеи, которые
 * захотели оба, - список «хотим вместе»: оттуда берут в план встречи,
 * случайную - кнопкой «что сделаем?», сделанную отмечают и записывают
 * в воспоминания. Чужое «нет» не видно никому.
 */
export function IdeasPage() {
  const t = useT()
  const [tab, setTab] = useState<'deck' | 'together'>('deck')
  const matches = useIdeaMatches()
  const done = useIdeasDone()
  const open = (matches.data ?? []).filter((m) => !(done.data ?? []).some((d) => d.key === m.key)).length

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'deck', label: t('id.deck') },
          { value: 'together', label: open > 0 ? `${t('id.together')} · ${open}` : t('id.together') },
        ]}
      />
      {tab === 'deck' ? <Deck onShowTogether={() => setTab('together')} /> : <Together />}
    </div>
  )
}

function Deck({ onShowTogether }: { onShowTogether: () => void }) {
  const t = useT()
  const pair = usePair()
  const ideas = useIdeas()
  const votes = useIdeaVotes()
  const burst = useBurst()
  const text = useIdeaText()
  const [cats, setCats] = useState<Set<IdeaCategory>>(new Set())
  const [history, setHistory] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [matched, setMatched] = useState<string | null>(null)

  const vote = useIdeaVote((key) => {
    setMatched(key)
    burst({ x: window.innerWidth / 2, y: window.innerHeight / 2.4 }, 'hearts')
  })

  const deck = useMemo(
    () => (ideas.data ?? []).filter((i) => votes.data?.[i.key] === undefined && (cats.size === 0 || cats.has(i.category))),
    [ideas.data, votes.data, cats],
  )

  if (ideas.isError) return <ErrorState error={ideas.error} onRetry={() => void ideas.refetch()} />
  if (ideas.isPending || votes.isPending || pair.isPending) return <Loading />

  const top = deck[0]
  const liked = Object.values(votes.data ?? {}).filter(Boolean).length
  const matchedIdea = matched ? ideas.data.find((i) => i.key === matched) : undefined

  const decide = (key: string, yes: boolean) => {
    setHistory((h) => [...h, key])
    vote.mutate({ userId: pair.userId, key, liked: yes })
  }
  const undo = () => {
    const last = history[history.length - 1]
    if (!last) return
    setHistory((h) => h.slice(0, -1))
    vote.mutate({ userId: pair.userId, key: last, liked: null })
  }

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2">
          {IDEA_CATEGORIES.map((c) => (
            <Chip
              key={c}
              icon={CATEGORY[c].icon}
              selected={cats.has(c)}
              onClick={() =>
                setCats((s) => {
                  const next = new Set(s)
                  if (next.has(c)) next.delete(c)
                  else next.add(c)
                  return next
                })
              }
            >
              {t(dynamicKey('id.cat', c))}
            </Chip>
          ))}
        </div>
      </div>

      <div className="relative h-[320px]">
        <AnimatePresence initial={false}>
          {top ? (
            <>
              {deck[1] && <IdeaCard key={deck[1].key + '-under'} idea={deck[1]} under />}
              <SwipeCard key={top.key} yes={t('id.yes')} no={t('id.no')} onDecide={(yes) => decide(top.key, yes)}>
                <IdeaCard idea={top} />
              </SwipeCard>
            </>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center rounded-[28px] bg-surface p-6 text-center shadow-card"
            >
              <p className="font-display text-lg font-extrabold">{t('id.deckDone')}</p>
              <p className="mt-1 text-sm text-muted">{t('id.deckDoneHint')}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-4">
        <RoundButton label={t('nm.undo')} onClick={undo} disabled={history.length === 0} small>
          <Undo2 size={20} aria-hidden />
        </RoundButton>
        <RoundButton label={t('id.no')} onClick={() => top && decide(top.key, false)} disabled={!top}>
          <X size={28} aria-hidden />
        </RoundButton>
        <RoundButton label={t('id.yes')} onClick={() => top && decide(top.key, true)} disabled={!top} accent>
          <Heart size={28} aria-hidden className="fill-current" />
        </RoundButton>
        <RoundButton label={t('id.add')} onClick={() => setAdding(true)} small>
          <Plus size={20} aria-hidden />
        </RoundButton>
      </div>
      <p className="text-center text-[13px] text-muted">
        {t('nm.left', { n: deck.length })} · {t('id.liked', { n: liked })}
      </p>

      <AnimatePresence>
        {matchedIdea && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <Card className="flex items-center gap-3 p-4">
              <Heart size={20} aria-hidden className="shrink-0 fill-accent text-accent" />
              <div className="min-w-0 flex-1">
                <Sparkles count={3}>
                  <span className="font-display text-[15px] font-extrabold">{t('id.match')}</span>
                </Sparkles>
                <p className="truncate text-sm text-muted">{text.title(matchedIdea)}</p>
              </div>
              <Button variant="soft" onClick={onShowTogether}>
                {t('id.toList')}
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {adding && <AddSheet onClose={() => setAdding(false)} />}
    </>
  )
}

/** Карточка идеи: цвет и значок - по категории. */
function IdeaCard({ idea, under = false }: { idea: Idea; under?: boolean }) {
  const t = useT()
  const pair = usePair()
  const text = useIdeaText()
  const c = CATEGORY[idea.category]
  const Icon = c.icon
  const hint = text.hint(idea)
  return (
    <div
      className={`absolute inset-0 flex flex-col rounded-[28px] bg-gradient-to-b ${c.gradient} to-surface p-6 shadow-card ${
        under ? 'scale-[0.95] opacity-60' : ''
      }`}
    >
      <span className="flex items-center gap-1.5 self-start rounded-full bg-surface/70 px-3 py-1 text-[12px] font-semibold text-muted">
        <Icon size={14} aria-hidden />
        {t(dynamicKey('id.cat', idea.category))}
      </span>
      <div className="flex flex-1 flex-col justify-center">
        <p className="font-display text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance">{text.title(idea)}</p>
        {hint && <p className="mt-3 text-[15px] leading-snug text-muted">{hint}</p>}
        {idea.createdBy && <p className="mt-3 text-[13px] text-muted">{t('id.customBy', { name: pair.nameOf(idea.createdBy) })}</p>}
      </div>
    </div>
  )
}

/**
 * Хотим вместе: совпадения, которые ещё не сделаны. «Что сделаем?» -
 * случайная из них; дальше - в план встречи или «сделали».
 */
function Together() {
  const t = useT()
  const ideas = useIdeas()
  const matches = useIdeaMatches()
  const done = useIdeasDone()
  const meetings = useMeetings()
  const undo = useUndoDone()
  const text = useIdeaText()
  const today = todayLocal()
  const [picked, setPicked] = useState<string | null>(null)
  const [marking, setMarking] = useState<Idea | null>(null)
  const rows = useRef<Record<string, HTMLLIElement | null>>({})

  if (matches.isError) return <ErrorState error={matches.error} onRetry={() => void matches.refetch()} />
  if (ideas.isError) return <ErrorState error={ideas.error} onRetry={() => void ideas.refetch()} />
  if (done.isError) return <ErrorState error={done.error} onRetry={() => void done.refetch()} />
  if (ideas.isPending || matches.isPending || done.isPending) return <Loading />

  const byKey = new Map(ideas.data.map((i) => [i.key, i]))
  const doneKeys = new Set(done.data.map((d) => d.key))
  const open = matches.data.filter((m) => !doneKeys.has(m.key)).map((m) => byKey.get(m.key)).filter((i): i is Idea => i !== undefined)
  const next = nextMeeting(meetings.data ?? [], today)

  const pick = () => {
    if (open.length === 0) return
    const choices = open.length > 1 ? open.filter((i) => i.key !== picked) : open
    const idea = choices[Math.floor(Math.random() * choices.length)]
    if (!idea) return
    setPicked(idea.key)
    rows.current[idea.key]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <>
      {open.length === 0 ? (
        <Card className="p-5 text-center">
          <p className="font-display text-lg font-extrabold">{t('id.emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted">{t('id.emptyHint')}</p>
        </Card>
      ) : (
        <>
          <button
            type="button"
            onClick={pick}
            className="flex items-center gap-3 rounded-3xl bg-accent p-4 text-left text-accent-ink shadow-card transition-transform active:scale-[0.98]"
          >
            <span className="flex size-11 items-center justify-center rounded-2xl bg-white/20">
              <Dices size={22} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-extrabold">{t('id.pick')}</span>
              <span className="block text-sm opacity-85">{t('id.pickHint', { n: open.length })}</span>
            </span>
          </button>
          {!next && <p className="px-1 text-[13px] text-muted">{t('id.noMeetingHint')}</p>}
          <ul className="flex flex-col gap-2.5">
            {open.map((idea) => {
              const c = CATEGORY[idea.category]
              const Icon = c.icon
              const inPlan = next?.items.some((it) => it.source === 'idea' && it.title === text.title(idea)) ?? false
              const isPicked = picked === idea.key
              const title = <span className="font-semibold">{text.title(idea)}</span>
              return (
                <li
                  key={idea.key}
                  ref={(el) => {
                    rows.current[idea.key] = el
                  }}
                  className={`rounded-3xl bg-surface p-4 shadow-card ${isPicked ? 'outline-2 outline-offset-2 outline-accent' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${TONE_CLASS[c.tone].soft} ${TONE_CLASS[c.tone].fg}`}>
                      <Icon size={18} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      {isPicked ? <Sparkles count={3}>{title}</Sparkles> : title}
                      {text.hint(idea) && <p className="mt-0.5 text-sm text-muted">{text.hint(idea)}</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <ToPlan idea={idea} meetingId={next?.id ?? null} inPlan={inPlan} />
                    <Button variant="soft" className="flex-1" onClick={() => setMarking(idea)}>
                      <Check size={17} aria-hidden />
                      {t('id.done')}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {done.data.length > 0 && (
        <>
          <SectionTitle className="mt-3">
            {t('id.doneList')} · {done.data.length}
          </SectionTitle>
          <Card className="overflow-hidden [&>*+*]:border-t [&>*+*]:border-line">
            {done.data.map((d) => {
              const idea = byKey.get(d.key)
              if (!idea) return null
              return (
                <div key={d.key} className="flex items-center gap-3 px-4 py-3">
                  <Check size={18} aria-hidden className="shrink-0 text-tone-green" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{text.title(idea)}</p>
                    <p className="flex items-center gap-1 text-[13px] text-muted">
                      {formatDayLabel(d.doneOn)}
                      {d.memoryId && (
                        <>
                          {' · '}
                          <Images size={13} aria-hidden />
                          {t('id.inMemories')}
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => undo.mutate(d.key)}
                    aria-label={t('id.undoDone')}
                    className="flex size-9 items-center justify-center rounded-full text-muted active:bg-raised"
                  >
                    <Undo2 size={17} aria-hidden />
                  </button>
                </div>
              )
            })}
          </Card>
        </>
      )}

      {marking && <DoneSheet idea={marking} today={today} onClose={() => setMarking(null)} />}
    </>
  )
}

function ToPlan({ idea, meetingId, inPlan }: { idea: Idea; meetingId: string | null; inPlan: boolean }) {
  const t = useT()
  const text = useIdeaText()
  const add = useAddToMeeting()
  if (meetingId === null) return null
  if (inPlan) {
    return (
      <span className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-raised px-3 text-sm font-semibold text-muted">
        <Check size={16} aria-hidden />
        {t('id.inPlan')}
      </span>
    )
  }
  return (
    <Button variant="secondary" className="flex-1" loading={add.isPending} onClick={() => add.mutate({ meetingId, title: text.title(idea) })}>
      <CalendarPlus size={17} aria-hidden />
      {t('id.toPlan')}
    </Button>
  )
}

function DoneSheet({ idea, today, onClose }: { idea: Idea; today: string; onClose: () => void }) {
  const t = useT()
  const text = useIdeaText()
  const mark = useMarkDone()
  const burst = useBurst()
  const [day, setDay] = useState(today)
  const [toMemory, setToMemory] = useState(true)
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet open onClose={onClose} title={text.title(idea)}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('id.when')}</span>
          <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className={INPUT_CLASS} />
        </label>
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-[15px]">{t('id.toMemory')}</span>
          <Switch checked={toMemory} onChange={setToMemory} label={t('id.toMemory')} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          loading={mark.isPending}
          disabled={day === ''}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            mark.mutate(
              { key: idea.key, doneOn: day, caption: toMemory ? text.title(idea) : null },
              {
                onSuccess: () => {
                  burst({ x: r.left + r.width / 2, y: r.top }, 'hearts')
                  onClose()
                },
                onError: (err) => setError(err.message),
              },
            )
          }}
        >
          <Check size={18} aria-hidden />
          {t('id.done')}
        </Button>
      </div>
    </Sheet>
  )
}

function AddSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const pair = usePair()
  const add = useAddIdea()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<IdeaCategory>('city')
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet open onClose={onClose} title={t('id.add')}>
      <div className="flex flex-col gap-4">
        <Field label={t('id.title')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus placeholder={t('id.titleHint')} />
        <div className="grid grid-cols-2 gap-2">
          {IDEA_CATEGORIES.map((c) => (
            <Chip key={c} icon={CATEGORY[c].icon} selected={category === c} onClick={() => setCategory(c)}>
              {t(dynamicKey('id.cat', c))}
            </Chip>
          ))}
        </div>
        <p className="text-[13px] text-muted">{t('id.addHint')}</p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          loading={add.isPending}
          disabled={title.trim() === ''}
          onClick={() => add.mutate({ userId: pair.userId, title, category }, { onSuccess: onClose, onError: (e) => setError(e.message) })}
        >
          {t('common.add')}
        </Button>
      </div>
    </Sheet>
  )
}
