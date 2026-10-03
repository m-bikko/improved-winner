import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Check, Lock, MessagesSquare, Pencil } from 'lucide-react'
import { dynamicKey, useT } from '@/lib/i18n'
import { fromLocalISO, monthName, todayLocal } from '@/lib/date'
import { usePair, type Pair } from '@/features/profile/pair'
import { useCreateTopic } from '@/features/topics/api'
import { Aurora } from '@/ui/Aurora'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card, SectionTitle } from '@/ui/Card'
import { INPUT_CLASS } from '@/ui/Field'
import { ShineBorder } from '@/ui/ShineBorder'
import { ErrorState, Loading } from '@/ui/States'
import { TONE_CLASS, toneVar } from '@/ui/tones'
import { PULSE_AREAS } from './areas'
import { useSavePulse, usePulse, type PulseEntry } from './api'
import { average, gaps, monthOf, revealedMonths } from './logic'

/**
 * Разговор месяца.
 *
 * Пять оценок от 1 до 10 раз в месяц - вслепую, как вопрос дня: чужие
 * открываются после своих (держит RLS). После раскрытия - оценки рядом,
 * и области, где они разошлись на три и больше, подсвечены как повод
 * поговорить: одной кнопкой из них заводится тема.
 */
export function PulsePage() {
  const t = useT()
  const pair = usePair()
  const pulse = usePulse()
  const month = monthOf(todayLocal())
  const [editing, setEditing] = useState(false)

  if (pulse.isError) return <ErrorState error={pulse.error} onRetry={() => void pulse.refetch()} />
  if (pulse.isPending || pair.isPending) return <Loading />

  const { entries, progress } = pulse.data
  const mine = entries.find((e) => e.userId === pair.userId && e.month === month) ?? null
  const theirs = entries.find((e) => e.userId === pair.partnerId && e.month === month) ?? null
  const partnerDone = progress.some((p) => p.userId === pair.partnerId && p.month === month)
  const history = revealedMonths(entries, pair.userId, pair.partnerId).filter((m) => m !== month)
  const label = `${monthName(fromLocalISO(month).getMonth())}`

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Hero pair={pair} label={label} mine={mine !== null} partnerDone={partnerDone} revealed={mine !== null && theirs !== null} />

      {mine === null || editing ? (
        <Form
          pair={pair}
          month={month}
          existing={mine}
          onDone={() => setEditing(false)}
          revealsNow={partnerDone}
        />
      ) : theirs ? (
        <Compare pair={pair} mine={mine} theirs={theirs} />
      ) : (
        <>
          <Mine entry={mine} pair={pair} onEdit={() => setEditing(true)} />
          <Card className="flex items-center gap-3 p-4">
            <Avatar name={pair.partnerName} tone={pair.partnerTone} size="md" />
            <p className="min-w-0 flex-1 text-sm text-muted">{t('pl.waiting', { name: pair.partnerName })}</p>
            <Lock size={18} aria-hidden className="shrink-0 text-muted" />
          </Card>
        </>
      )}

      {history.length > 0 && (
        <>
          <SectionTitle className="mt-3">{t('pl.history')}</SectionTitle>
          <History months={history} entries={entries} pair={pair} />
        </>
      )}
    </div>
  )
}

function Hero({
  pair,
  label,
  mine,
  partnerDone,
  revealed,
}: {
  pair: Pair
  label: string
  mine: boolean
  partnerDone: boolean
  revealed: boolean
}) {
  const t = useT()
  const a = toneVar(pair.myTone)
  const b = toneVar(pair.partnerTone)
  return (
    <section
      className="relative isolate overflow-hidden rounded-[28px] bg-surface p-5 shadow-card"
      style={{ '--pair-a': a, '--pair-b': b } as CSSProperties}
    >
      {revealed && <ShineBorder colors={[a, 'var(--c-accent)', b]} />}
      <Aurora colors={[a, b, 'var(--t-violet)']} />
      <p className="text-[13px] font-semibold text-muted first-letter:uppercase">{label}</p>
      <p className="mt-1 font-display text-[22px] leading-tight font-extrabold tracking-tight">{t('pl.title')}</p>
      <p className="mt-1.5 text-sm text-muted">{t('pl.subtitle')}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { name: pair.myName, tone: pair.myTone, done: mine },
          ...(pair.partnerId !== '' ? [{ name: pair.partnerName, tone: pair.partnerTone, done: partnerDone }] : []),
        ].map((p) => (
          <span key={p.name} className="flex items-center gap-2 rounded-full bg-surface/75 py-1 pr-3 pl-1 text-[13px] backdrop-blur">
            <Avatar name={p.name} tone={p.tone} size="sm" />
            <span className="font-semibold">{p.name}</span>
            <span className="text-muted">· {p.done ? t('qd.ready') : t('qd.thinking')}</span>
            {p.done && <Check size={14} strokeWidth={2.6} aria-hidden className="text-tone-green" />}
          </span>
        ))}
      </div>
    </section>
  )
}

/** Пять шкал от 1 до 10 и заметка. Своё можно править, пока второй не ответил. */
function Form({
  pair,
  month,
  existing,
  onDone,
  revealsNow,
}: {
  pair: Pair
  month: string
  existing: PulseEntry | null
  onDone: () => void
  revealsNow: boolean
}) {
  const t = useT()
  const save = useSavePulse()
  const burst = useBurst()
  const [scores, setScores] = useState<(number | null)[]>(existing?.scores ?? PULSE_AREAS.map(() => null))
  const [note, setNote] = useState(existing?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const complete = scores.every((s) => s !== null)

  const submit = (el: HTMLElement) => {
    setError(null)
    if (!complete) return setError(t('pl.allFive'))
    const r = el.getBoundingClientRect()
    save.mutate(
      { userId: pair.userId, month, scores: scores.map((s) => s ?? 1), note, existing: existing !== null },
      {
        onSuccess: () => {
          burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, revealsNow ? 'hearts' : 'sparks')
          onDone()
        },
        onError: (e) => setError(e.message),
      },
    )
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-5">
        {PULSE_AREAS.map((area, i) => {
          const Icon = area.icon
          return (
            <div key={area.id}>
              <div className="flex items-center gap-2">
                <Icon size={17} aria-hidden className="text-tone-violet" />
                <span className="text-[15px] font-semibold">{t(dynamicKey('pl.area', area.id))}</span>
              </div>
              <p className="mt-0.5 text-[13px] text-muted">{t(dynamicKey('pl.hint', area.id))}</p>
              <div className="mt-2 grid grid-cols-10 gap-1" role="radiogroup" aria-label={t(dynamicKey('pl.area', area.id))}>
                {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => {
                  const on = scores[i] === n
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setScores((s) => s.map((x, j) => (j === i ? n : x)))}
                      className={`flex aspect-square items-center justify-center rounded-xl text-[14px] font-bold tabular-nums transition-[transform,background-color] active:scale-90 ${
                        on
                          ? 'bg-accent text-accent-ink'
                          : scores[i] !== null && n < (scores[i] ?? 0)
                            ? 'bg-accent-soft text-accent-soft-ink'
                            : 'bg-raised text-muted'
                      }`}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('pl.note')}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={t('pl.notePlaceholder')}
            className={`${INPUT_CLASS} resize-none [field-sizing:content] min-h-20`}
          />
        </label>
        <p className="flex items-center gap-1.5 text-[13px] text-muted">
          <Lock size={14} aria-hidden />
          {t('qd.blindHint')}
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={(e) => submit(e.currentTarget)} loading={save.isPending} disabled={!complete}>
          {existing ? t('common.save') : t('pl.submit')}
        </Button>
      </div>
    </Card>
  )
}

function Mine({ entry, pair, onEdit }: { entry: PulseEntry; pair: Pair; onEdit: () => void }) {
  const t = useT()
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5">
        <Avatar name={pair.myName} tone={pair.myTone} size="sm" />
        <span className="min-w-0 flex-1 text-[15px] font-semibold">{pair.myName}</span>
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-9 items-center gap-1.5 rounded-full bg-raised px-3 text-[13px] font-semibold text-muted transition-transform active:scale-95"
        >
          <Pencil size={14} aria-hidden />
          {t('common.edit')}
        </button>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {PULSE_AREAS.map((area, i) => (
          <li key={area.id} className="flex items-center justify-between text-sm">
            <span className="text-muted">{t(dynamicKey('pl.area', area.id))}</span>
            <span className="font-bold tabular-nums">{entry.scores[i]}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * Рядом: по каждой области две полосы цветами людей. Разошлись на три
 * и больше - область подсвечена, и из неё одной кнопкой заводится тема.
 */
function Compare({ pair, mine, theirs }: { pair: Pair; mine: PulseEntry; theirs: PulseEntry }) {
  const t = useT()
  const navigate = useNavigate()
  const createTopic = useCreateTopic()
  const differ = new Set(gaps(mine, theirs))

  const discuss = (areaIndex: number) => {
    const area = PULSE_AREAS[areaIndex]
    if (!area) return
    createTopic.mutate(
      {
        title: t('pl.topicTitle', { area: t(dynamicKey('pl.area', area.id)) }),
        body: t('pl.topicBody', {
          me: pair.myName,
          mine: mine.scores[areaIndex] ?? 0,
          partner: pair.partnerName,
          theirs: theirs.scores[areaIndex] ?? 0,
        }),
      },
      { onSuccess: (id) => navigate(`/topics/${id}`) },
    )
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <SectionTitle>{t('pl.together')}</SectionTitle>
        <span className="text-[13px] text-muted tabular-nums">
          {average(mine.scores)} · {average(theirs.scores)}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {PULSE_AREAS.map((area, i) => {
          const gap = differ.has(i)
          return (
            <motion.li
              key={area.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`rounded-2xl p-3 ${gap ? 'bg-tone-amber-soft' : 'bg-raised'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold">{t(dynamicKey('pl.area', area.id))}</span>
                {gap && (
                  <button
                    type="button"
                    onClick={() => discuss(i)}
                    disabled={createTopic.isPending}
                    className="flex min-h-8 items-center gap-1 rounded-full bg-surface px-2.5 text-[12px] font-semibold text-tone-amber transition-transform active:scale-95"
                  >
                    <MessagesSquare size={13} aria-hidden />
                    {t('pl.discuss')}
                  </button>
                )}
              </div>
              {[
                { tone: pair.myTone, score: mine.scores[i] ?? 0 },
                { tone: pair.partnerTone, score: theirs.scores[i] ?? 0 },
              ].map((row, k) => (
                <div key={k} className="mt-1.5 flex items-center gap-2">
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface">
                    <span className={`block h-full rounded-full ${TONE_CLASS[row.tone].solid}`} style={{ width: `${row.score * 10}%` }} />
                  </span>
                  <span className="w-5 text-right text-[13px] font-bold tabular-nums">{row.score}</span>
                </div>
              ))}
            </motion.li>
          )
        })}
      </ul>
      {(mine.note || theirs.note) && (
        <div className="mt-4 flex flex-col gap-2">
          {[
            { e: mine, name: pair.myName, tone: pair.myTone },
            { e: theirs, name: pair.partnerName, tone: pair.partnerTone },
          ]
            .filter((x) => x.e.note)
            .map((x) => (
              <div key={x.name} className="flex gap-2.5">
                <Avatar name={x.name} tone={x.tone} size="sm" />
                <p className="min-w-0 flex-1 pt-0.5 text-[15px] leading-relaxed whitespace-pre-wrap">{x.e.note}</p>
              </div>
            ))}
        </div>
      )}
    </Card>
  )
}

/** История: по месяцу - среднее каждого и линия общей средней за полгода. */
function History({ months, entries, pair }: { months: string[]; entries: PulseEntry[]; pair: Pair }) {
  const of = (who: string, m: string) => entries.find((e) => e.userId === who && e.month === m)
  const points = months
    .slice(0, 6)
    .reverse()
    .map((m) => {
      const a = of(pair.userId, m)
      const b = of(pair.partnerId, m)
      return a && b ? (average(a.scores) + average(b.scores)) / 2 : 0
    })
  const w = 280
  const h = 60
  const path = points.map((p, i) => `${(i / Math.max(points.length - 1, 1)) * w},${h - ((p - 1) / 9) * h}`).join(' ')

  return (
    <Card className="p-4">
      {points.length > 1 && (
        <svg viewBox={`-6 -6 ${w + 12} ${h + 12}`} className="mb-3 h-16 w-full" aria-hidden>
          <polyline points={path} fill="none" stroke="var(--c-accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <ul className="flex flex-col gap-1.5">
        {months.map((m) => {
          const a = of(pair.userId, m)
          const b = of(pair.partnerId, m)
          if (!a || !b) return null
          return (
            <li key={m} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 first-letter:uppercase">
                {monthName(fromLocalISO(m).getMonth())} {fromLocalISO(m).getFullYear()}
              </span>
              <span className={`font-bold tabular-nums ${TONE_CLASS[pair.myTone].fg}`}>{average(a.scores)}</span>
              <span className={`font-bold tabular-nums ${TONE_CLASS[pair.partnerTone].fg}`}>{average(b.scores)}</span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
