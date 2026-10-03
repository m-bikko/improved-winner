import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Baby as BabyIcon, Check, Droplets, Milk, Moon, Plus, Ruler, Stethoscope, Syringe, Trash2 } from 'lucide-react'
import { activeLocale, useT } from '@/lib/i18n'
import { formatDayLabel, formatDayMonthYear, formatTime, fromLocalISO, todayLocal, toLocalISO } from '@/lib/date'
import { useNow } from '@/lib/useNow'
import { usePair, type Pair } from '@/features/profile/pair'
import { useBabyNames, useMatches } from '@/features/names/api'
import { Aurora } from '@/ui/Aurora'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card, SectionTitle } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Field, INPUT_CLASS, NumberField } from '@/ui/Field'
import { IconBadge } from '@/ui/IconBadge'
import { Segmented } from '@/ui/Segmented'
import { Sheet } from '@/ui/Sheet'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { mmss } from '@/features/shots/logic'
import {
  useAddBaby,
  useAddGrowth,
  useBaby,
  useDeleteCheckup,
  useDeleteEvent,
  useSaveCheckup,
  useStartEvent,
  useStopEvent,
  useToggleCheckup,
  type Baby,
  type BabyEvent,
  type Checkup,
} from './api'
import { ageOf, sinceLabel } from './logic'

/** Начало окна событий - полночь позавчера: ключ стабилен весь день. */
function sinceIso(today: string): string {
  const d = fromLocalISO(today)
  d.setDate(d.getDate() - 2)
  return d.toISOString()
}

/**
 * Малыш.
 *
 * Дневник первых месяцев на двоих: кормления (с подсказкой, с какой груди
 * начинать), сон, подгузники - одной кнопкой; рост и вес; прививки и
 * визиты. Таймер, начатый на одном телефоне, идёт и на втором.
 */
export function BabyPage() {
  const t = useT()
  const pair = usePair()
  const today = todayLocal()
  const data = useBaby(sinceIso(today))
  const [born, setBorn] = useState(false)
  const [pick, setPick] = useState<string | null>(null)

  if (data.isError) return <ErrorState error={data.error} onRetry={() => void data.refetch()} />
  if (data.isPending || pair.isPending) return <Loading />

  const babies = data.data.babies
  if (babies.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
        <EmptyState
          icon={BabyIcon}
          tone="teal"
          title={t('bb.emptyTitle')}
          hint={t('bb.emptyHint')}
          action={<Button onClick={() => setBorn(true)}>{t('bb.born')}</Button>}
        />
        {born && <BornSheet onClose={() => setBorn(false)} />}
      </div>
    )
  }

  const baby = babies.find((b) => b.id === pick) ?? babies[0]
  if (!baby) return null
  const events = data.data.events.filter((e) => e.babyId === baby.id)

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {babies.length > 1 && (
        <div className="flex gap-2">
          {babies.map((b) => (
            <Chip key={b.id} selected={b.id === baby.id} onClick={() => setPick(b.id)}>
              {b.name ?? t('bb.noName')}
            </Chip>
          ))}
        </div>
      )}
      <Hero baby={baby} today={today} />
      <Running events={events} />
      <Quick baby={baby} events={events} />
      <Day events={events} today={today} pair={pair} />
      <GrowthBlock baby={baby} growth={data.data.growth} today={today} />
      <Checkups baby={baby} list={data.data.checkups} today={today} />
    </div>
  )
}

function Hero({ baby, today }: { baby: Baby; today: string }) {
  const t = useT()
  const age = ageOf(baby.bornOn, today)
  const value =
    age.months === 0
      ? `${age.days} ${t.plural('unit.day', age.days)}`
      : age.days === 0
        ? `${age.months} ${t.plural('unit.month', age.months)}`
        : `${age.months} ${t.plural('unit.month', age.months)} ${age.days} ${t.plural('unit.day', age.days)}`
  return (
    <section className="relative isolate overflow-hidden rounded-[28px] bg-surface p-5 shadow-card">
      <Aurora colors={['var(--t-teal)', 'var(--t-sky)', 'var(--c-accent)']} />
      <p className="text-[13px] font-semibold text-muted">{t('bb.bornOn', { date: formatDayMonthYear(fromLocalISO(baby.bornOn)) })}</p>
      <p className="mt-1 font-display text-[32px] leading-tight font-extrabold">{baby.name ?? t('bb.noName')}</p>
      <p className="mt-1 font-display text-lg font-extrabold text-tone-teal">{value}</p>
    </section>
  )
}

/** Идущие кормление и сон: живой таймер и «закончить». У бутылочки - объём. */
function Running({ events }: { events: BabyEvent[] }) {
  const t = useT()
  const running = events.filter((e) => e.endedAt === null && e.kind !== 'diaper')
  const now = useNow(1000, running.length > 0)
  const stop = useStopEvent()
  const [ml, setMl] = useState<number | ''>('')
  if (running.length === 0) return null
  return (
    <>
      {running.map((e) => {
        const seconds = (now - new Date(e.startedAt).getTime()) / 1000
        const label = e.kind === 'sleep' ? t('bb.sleeping') : t('bb.feeding', { side: t(e.side === 'left' ? 'bb.left' : e.side === 'right' ? 'bb.right' : 'bb.bottle') })
        return (
          <Card key={e.id} className="flex flex-col gap-3 p-4 outline-2 outline-tone-teal/40">
            <div className="flex items-center gap-3">
              <IconBadge icon={e.kind === 'sleep' ? Moon : Milk} tone={e.kind === 'sleep' ? 'indigo' : 'teal'} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-muted">{label}</p>
                <p className="font-display text-[30px] leading-none font-extrabold tabular-nums">
                  {seconds >= 3600 ? sinceLabel(seconds / 60) : mmss(seconds)}
                </p>
              </div>
            </div>
            {e.side === 'bottle' && <NumberField label={t('bb.amount')} suffix={t('bb.ml')} value={ml} onValueChange={setMl} max={500} />}
            <Button
              variant="secondary"
              loading={stop.isPending}
              onClick={() => stop.mutate({ id: e.id, startedAt: e.startedAt, amountMl: e.side === 'bottle' && ml !== '' ? ml : null }, { onSuccess: () => setMl('') })}
            >
              {e.kind === 'sleep' ? t('bb.stopSleep') : t('bb.stopFeed')}
            </Button>
          </Card>
        )
      })}
    </>
  )
}

/**
 * Три большие кнопки. Кормление предлагает начать с другой груди, чем
 * в прошлый раз, - это то, что обычно забывают ночью.
 */
function Quick({ baby, events }: { baby: Baby; events: BabyEvent[] }) {
  const t = useT()
  const start = useStartEvent()
  const burst = useBurst()
  const [sheet, setSheet] = useState<'feed' | 'diaper' | null>(null)
  const feeding = events.some((e) => e.kind === 'feed' && e.endedAt === null)
  const sleeping = events.some((e) => e.kind === 'sleep' && e.endedAt === null)
  const lastBreast = events.find((e) => e.kind === 'feed' && (e.side === 'left' || e.side === 'right'))
  const nextSide = lastBreast?.side === 'left' ? 'right' : lastBreast?.side === 'right' ? 'left' : null

  const big = (icon: typeof Milk, label: string, onClick: () => void, disabled: boolean, tone: string) => {
    const Icon = icon
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex flex-col items-center gap-2 rounded-3xl bg-surface p-4 shadow-card transition-transform active:scale-95 disabled:opacity-40`}
      >
        <span className={`flex size-12 items-center justify-center rounded-2xl ${tone}`}>
          <Icon size={24} aria-hidden />
        </span>
        <span className="text-sm text-muted">{label}</span>
      </button>
    )
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5">
        {big(Milk, t('bb.feed'), () => setSheet('feed'), feeding, 'bg-tone-teal-soft text-tone-teal')}
        {big(Moon, t('bb.sleep'), () => start.mutate({ babyId: baby.id, kind: 'sleep' }), sleeping, 'bg-tone-indigo-soft text-tone-indigo')}
        {big(Droplets, t('bb.diaper'), () => setSheet('diaper'), false, 'bg-tone-amber-soft text-tone-amber')}
      </div>
      {sheet === 'feed' && (
        <Sheet open onClose={() => setSheet(null)} title={t('bb.feed')}>
          <div className="flex flex-col gap-2.5">
            {nextSide && <p className="text-sm text-muted">{t('bb.nextSide', { side: t(nextSide === 'left' ? 'bb.left' : 'bb.right') })}</p>}
            {(['left', 'right', 'bottle'] as const).map((side) => (
              <Button
                key={side}
                variant={side === nextSide ? 'primary' : 'secondary'}
                onClick={() => start.mutate({ babyId: baby.id, kind: 'feed', side }, { onSuccess: () => setSheet(null) })}
              >
                {t(side === 'left' ? 'bb.left' : side === 'right' ? 'bb.right' : 'bb.bottle')}
              </Button>
            ))}
          </div>
        </Sheet>
      )}
      {sheet === 'diaper' && (
        <Sheet open onClose={() => setSheet(null)} title={t('bb.diaper')}>
          <div className="flex flex-col gap-2.5">
            {(['wet', 'dirty', 'mixed'] as const).map((d) => (
              <Button
                key={d}
                variant="secondary"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  start.mutate(
                    { babyId: baby.id, kind: 'diaper', diaper: d },
                    {
                      onSuccess: () => {
                        burst({ x: r.left + r.width / 2, y: r.top }, 'hearts')
                        setSheet(null)
                      },
                    },
                  )
                }}
              >
                {t(d === 'wet' ? 'bb.wet' : d === 'dirty' ? 'bb.dirty' : 'bb.mixed')}
              </Button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}

/** Сегодня: сколько кормлений, сна и подгузников, когда было последнее кормление, и лента. */
function Day({ events, today, pair }: { events: BabyEvent[]; today: string; pair: Pair }) {
  const t = useT()
  const now = useNow(60_000)
  const remove = useDeleteEvent()
  const todays = events.filter((e) => toLocalISO(new Date(e.startedAt)) === today)
  const feeds = todays.filter((e) => e.kind === 'feed').length
  const diapers = todays.filter((e) => e.kind === 'diaper').length
  const sleepMin = todays
    .filter((e) => e.kind === 'sleep')
    .reduce((sum, e) => sum + ((e.endedAt ? new Date(e.endedAt).getTime() : now) - new Date(e.startedAt).getTime()) / 60_000, 0)
  const lastFeed = events.find((e) => e.kind === 'feed')
  const describe = (e: BabyEvent): string => {
    if (e.kind === 'diaper') return t(e.diaper === 'wet' ? 'bb.wet' : e.diaper === 'dirty' ? 'bb.dirty' : 'bb.mixed')
    const minutes = e.endedAt ? Math.max(1, Math.round((new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()) / 60_000)) : null
    const base =
      e.kind === 'sleep'
        ? t('bb.sleep')
        : `${t('bb.feed')} · ${t(e.side === 'left' ? 'bb.left' : e.side === 'right' ? 'bb.right' : 'bb.bottle')}${e.amountMl ? `, ${e.amountMl} ${t('bb.ml')}` : ''}`
    return minutes === null ? `${base} · ${t('bb.now')}` : `${base} · ${minutes} ${t('unit.min')}`
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5">
        <Stat value={String(feeds)} label={t('bb.feedsToday')} />
        <Stat value={sinceLabel(sleepMin)} label={t('bb.sleepToday')} />
        <Stat value={String(diapers)} label={t('bb.diapersToday')} />
      </div>
      {lastFeed && lastFeed.endedAt !== null && (
        <p className="px-1 text-sm text-muted">
          {(now - new Date(lastFeed.startedAt).getTime()) / 60_000 < 1
            ? t('bb.lastFeedNow')
            : t('bb.lastFeed', { ago: sinceLabel((now - new Date(lastFeed.startedAt).getTime()) / 60_000) })}
        </p>
      )}
      {todays.length > 0 && (
        <Card className="overflow-hidden [&>*+*]:border-t [&>*+*]:border-line">
          {todays.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-muted">{formatTime(new Date(e.startedAt))}</span>
              <span className="min-w-0 flex-1 truncate text-[15px]">{describe(e)}</span>
              <Avatar name={pair.nameOf(e.createdBy)} tone={pair.toneOf(e.createdBy)} size="sm" />
              <button type="button" onClick={() => remove.mutate(e.id)} aria-label={t('common.delete')} className="flex size-8 items-center justify-center text-muted/70">
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
          ))}
        </Card>
      )}
    </>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card className="flex flex-col items-center gap-1 p-3 text-center">
      <span className="font-display text-[22px] leading-none font-extrabold tabular-nums">{value}</span>
      <span className="text-[12px] leading-tight text-muted">{label}</span>
    </Card>
  )
}

function GrowthBlock({ baby, growth, today }: { baby: Baby; growth: { id: string; date: string; weightG: number | null; heightCm: number | null; headCm: number | null }[]; today: string }) {
  const t = useT()
  const add = useAddGrowth()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(today)
  const [weight, setWeight] = useState<number | ''>('')
  const [height, setHeight] = useState<number | ''>('')
  const [head, setHead] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const points = [
    ...(baby.weightG || baby.heightCm ? [{ id: 'birth', date: baby.bornOn, weightG: baby.weightG, heightCm: baby.heightCm, headCm: null }] : []),
    ...growth,
  ]
  const last = points[points.length - 1]
  const kg = (g: number) => new Intl.NumberFormat(activeLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(g / 1000)
  return (
    <>
      <SectionTitle
        className="mt-3"
        action={
          <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 text-sm font-semibold text-accent">
            <Plus size={16} aria-hidden />
            {t('bb.measure')}
          </button>
        }
      >
        {t('bb.growth')}
      </SectionTitle>
      {points.length === 0 ? (
        <Card className="p-4 text-sm text-muted">{t('bb.noGrowth')}</Card>
      ) : (
        <Card className="overflow-hidden [&>*+*]:border-t [&>*+*]:border-line">
          {[...points].reverse().map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <IconBadge icon={Ruler} tone={p === last ? 'teal' : 'slate'} size="sm" />
              <span className="min-w-0 flex-1 text-[15px]">{p.id === 'birth' ? t('bb.atBirth') : formatDayLabel(p.date)}</span>
              <span className="text-sm font-semibold tabular-nums">
                {[p.weightG ? `${kg(p.weightG)} ${t('bb.kg')}` : null, p.heightCm ? `${p.heightCm} ${t('bb.cm')}` : null, p.headCm ? `${t('bb.headShort')} ${p.headCm} ${t('bb.cm')}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          ))}
        </Card>
      )}
      {open && (
        <Sheet open onClose={() => setOpen(false)} title={t('bb.measure')}>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">{t('bb.date')}</span>
              <input type="date" value={date} max={today} min={baby.bornOn} onChange={(e) => setDate(e.target.value)} className={INPUT_CLASS} />
            </label>
            <NumberField label={t('bb.weight')} suffix={t('bb.g')} value={weight} onValueChange={setWeight} max={30000} />
            <NumberField label={t('bb.height')} suffix={t('bb.cm')} value={height} onValueChange={setHeight} max={130} />
            <NumberField label={t('bb.head')} suffix={t('bb.cm')} value={head} onValueChange={setHead} max={60} />
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button
              loading={add.isPending}
              disabled={weight === '' && height === '' && head === ''}
              onClick={() =>
                add.mutate(
                  { babyId: baby.id, date, weightG: weight, heightCm: height, headCm: head },
                  {
                    onSuccess: () => {
                      setOpen(false)
                      setWeight('')
                      setHeight('')
                      setHead('')
                    },
                    onError: (e) => setError(e.message),
                  },
                )
              }
            >
              {t('common.save')}
            </Button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function Checkups({ baby, list, today }: { baby: Baby; list: Checkup[]; today: string }) {
  const t = useT()
  const toggle = useToggleCheckup()
  const remove = useDeleteCheckup()
  const [open, setOpen] = useState(false)
  return (
    <>
      <SectionTitle
        className="mt-3"
        action={
          <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 text-sm font-semibold text-accent">
            <Plus size={16} aria-hidden />
            {t('common.add')}
          </button>
        }
      >
        {t('bb.checkups')}
      </SectionTitle>
      {list.length === 0 ? (
        <Card className="p-4 text-sm text-muted">{t('bb.noCheckups')}</Card>
      ) : (
        <Card className="overflow-hidden [&>*+*]:border-t [&>*+*]:border-line">
          {list.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => toggle.mutate({ id: c.id, value: !c.done })}
                aria-pressed={c.done}
                aria-label={c.title}
                className={`flex size-8 shrink-0 items-center justify-center rounded-full ${c.done ? 'bg-tone-green text-white' : 'bg-raised text-muted'}`}
              >
                {c.done ? <Check size={16} strokeWidth={3} aria-hidden /> : c.kind === 'vaccine' ? <Syringe size={15} aria-hidden /> : <Stethoscope size={15} aria-hidden />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold ${c.done ? 'text-muted line-through decoration-muted/50' : ''}`}>{c.title}</p>
                <p className="text-[13px] text-muted">
                  {formatDayLabel(c.date)}
                  {c.note ? ` · ${c.note}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => remove.mutate(c.id)} aria-label={t('common.delete')} className="flex size-8 items-center justify-center text-muted/70">
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
          ))}
        </Card>
      )}
      <p className="px-2 text-[12px] text-muted">{t('bb.calendarNote')}</p>
      {open && <CheckupSheet baby={baby} today={today} onClose={() => setOpen(false)} />}
    </>
  )
}

function CheckupSheet({ baby, today, onClose }: { baby: Baby; today: string; onClose: () => void }) {
  const t = useT()
  const save = useSaveCheckup()
  const [kind, setKind] = useState<'vaccine' | 'doctor'>('vaccine')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet open onClose={onClose} title={t('bb.addCheckup')}>
      <div className="flex flex-col gap-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'vaccine', label: t('bb.vaccine') },
            { value: 'doctor', label: t('bb.doctor') },
          ]}
        />
        <Field label={t('bb.what')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={kind === 'vaccine' ? t('bb.vaccineHint') : t('bb.doctorHint')} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('bb.date')}</span>
          <input type="date" value={date} min={baby.bornOn} onChange={(e) => setDate(e.target.value)} className={INPUT_CLASS} />
        </label>
        <Field label={t('hl.medNote')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          loading={save.isPending}
          disabled={title.trim() === ''}
          onClick={() => save.mutate({ babyId: baby.id, date, kind, title, note }, { onSuccess: onClose, onError: (e) => setError(e.message) })}
        >
          {t('common.save')}
        </Button>
      </div>
    </Sheet>
  )
}

/**
 * «Малыш родился»: имя (подсказки - из имён, что понравились обоим), пол,
 * дата и замеры. Беременность база закрывает сама.
 */
export function BornSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const add = useAddBaby()
  const burst = useBurst()
  const names = useBabyNames()
  const matches = useMatches()
  const today = todayLocal()
  const [name, setName] = useState('')
  const [sex, setSex] = useState<'m' | 'f' | ''>('')
  const [bornOn, setBornOn] = useState(today)
  const [weight, setWeight] = useState<number | ''>('')
  const [height, setHeight] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const byKey = new Map((names.data ?? []).map((n) => [n.key, n]))
  const liked = (matches.data ?? [])
    .map((m) => byKey.get(m.key))
    .filter((n): n is NonNullable<typeof n> => n !== undefined && (sex === '' || n.gender === sex || n.gender === 'u'))
    .slice(0, 8)

  return (
    <Sheet open onClose={onClose} title={t('bb.born')}>
      <div className="flex flex-col gap-4">
        <Segmented
          value={sex}
          onChange={setSex}
          options={[
            { value: 'f', label: t('nm.girl') },
            { value: 'm', label: t('nm.boy') },
            { value: '', label: t('bb.skip') },
          ]}
        />
        <Field label={t('bb.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        {liked.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {liked.map((n) => (
              <Chip key={n.key} size="sm" selected={name === n.name} onClick={() => setName(n.name)}>
                {n.name}
              </Chip>
            ))}
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('bb.date')}</span>
          <input type="date" value={bornOn} max={today} onChange={(e) => setBornOn(e.target.value)} className={INPUT_CLASS} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={t('bb.weight')} suffix={t('bb.g')} value={weight} onValueChange={setWeight} max={7000} />
          <NumberField label={t('bb.height')} suffix={t('bb.cm')} value={height} onValueChange={setHeight} max={70} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          loading={add.isPending}
          disabled={bornOn === ''}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            add.mutate(
              { name, sex: sex === '' ? null : sex, bornOn, weightG: weight, heightCm: height },
              {
                onSuccess: () => {
                  burst({ x: r.left + r.width / 2, y: r.top }, 'hearts')
                  onClose()
                  navigate('/baby')
                },
                onError: (err) => setError(err.message),
              },
            )
          }}
        >
          <BabyIcon size={18} aria-hidden />
          {t('bb.save')}
        </Button>
      </div>
    </Sheet>
  )
}
