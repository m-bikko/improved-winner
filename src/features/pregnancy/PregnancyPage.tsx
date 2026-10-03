import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Baby, CalendarCheck, ChevronLeft, ChevronRight, Ellipsis, Footprints, Heart, Milk, Plus, Ruler, Stethoscope, Timer, Trash2, Weight } from 'lucide-react'
import { dynamicKey, useT } from '@/lib/i18n'
import { BornSheet } from '@/features/baby/BabyPage'
import { useHasBaby } from '@/features/baby/api'
import { formatDayMonth, formatDayMonthYear, fromLocalISO, todayLocal } from '@/lib/date'
import { activeLocale } from '@/lib/i18n/lang'
import { usePair, type Pair } from '@/features/profile/pair'
import { useCycleSettings, useCycleShared, usePeriods } from '@/features/cycle/api'
import { Aurora } from '@/ui/Aurora'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card, CardLink, SectionTitle } from '@/ui/Card'
import { Field, INPUT_CLASS } from '@/ui/Field'
import { IconBadge } from '@/ui/IconBadge'
import { Segmented } from '@/ui/Segmented'
import { Sheet } from '@/ui/Sheet'
import { Sparkles } from '@/ui/Sparkles'
import { ErrorState, Loading } from '@/ui/States'
import { toneVar } from '@/ui/tones'
import {
  useDeleteVisit,
  useEndPregnancy,
  usePregnancy,
  useSaveKicks,
  useSaveVisit,
  useStartPregnancy,
  useUpdateLmp,
  type KickSession,
  type Pregnancy,
  type Visit,
} from './api'
import { BORN_FROM, CONTRACTIONS_FROM, KICKS_FROM, checkpointState, gestation, weekInfo } from './logic'
import { CHECKPOINTS } from './weeks'

/**
 * Режим беременности - продолжение подготовки к зачатию.
 *
 * Общий для двоих: срок и неделя, размер малыша и что происходит на этой
 * неделе - с ним, с будущей мамой и подсказка второму, вехи визитов и свои
 * визиты к врачу, позже - счёт шевелений и таймер схваток. Пока режим
 * включён, рассылки цикла молчат (это держит база).
 *
 * Медицинских назначений здесь нет: средние из справочников и «сроки
 * уточнит врач» - экран говорит это прямо.
 */
export function PregnancyPage() {
  const t = useT()
  const pair = usePair()
  const data = usePregnancy()
  const today = todayLocal()
  const [settings, setSettings] = useState(false)
  const [born, setBorn] = useState(false)

  if (data.isError) return <ErrorState error={data.error} onRetry={() => void data.refetch()} />
  if (data.isPending || pair.isPending) return <Loading />

  const g = data.data.pregnancy
  if (!g || g.endedOn !== null) {
    return (
      <>
        <BabyLink />
        <Start pair={pair} today={today} />
      </>
    )
  }

  const state = gestation(g.lmp, today)

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Hero pregnancy={g} pair={pair} today={today} onSettings={() => setSettings(true)} />
      <WeekCard current={state.week} pair={pair} motherId={g.motherId} />
      <Checkpoints week={state.week} />
      <Visits visits={data.data.visits} today={today} />
      {state.week >= KICKS_FROM && <Kicks sessions={data.data.kicks} />}
      {state.week >= CONTRACTIONS_FROM && <Contractions />}
      {state.week >= BORN_FROM && (
        <button
          type="button"
          onClick={() => setBorn(true)}
          className="flex items-center gap-3 rounded-3xl bg-accent p-4 text-left text-accent-ink shadow-card active:scale-[0.98]"
        >
          <Baby size={24} aria-hidden />
          <span>
            <span className="block font-display text-lg font-extrabold">{t('bb.born')}</span>
            <span className="block text-sm opacity-85">{t('pg.bornHint')}</span>
          </span>
        </button>
      )}
      <Card className="flex gap-3 p-4">
        <IconBadge icon={Stethoscope} tone="teal" size="sm" />
        <p className="text-sm text-muted">{t('pg.disclaimer')}</p>
      </Card>
      {settings && <SettingsSheet pregnancy={g} today={today} onClose={() => setSettings(false)} onBorn={() => setBorn(true)} />}
      {born && <BornSheet onClose={() => setBorn(false)} />}
    </div>
  )
}

/** После рождения сюда заходят по привычке - ведём в дневник малыша. */
function BabyLink() {
  const t = useT()
  const has = useHasBaby()
  if (has.data !== true) return null
  return (
    <div className="mx-auto max-w-2xl px-4 pt-1">
      <CardLink to="/baby" className="flex items-center gap-3 p-4">
        <IconBadge icon={Milk} tone="teal" size="md" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t('nav.baby')}</span>
          <span className="block text-sm text-muted">{t('pg.toBaby')}</span>
        </span>
        <ChevronRight size={18} aria-hidden className="shrink-0 text-muted/70" />
      </CardLink>
    </div>
  )
}

/**
 * Включение режима. Срок - от первого дня последней менструации: по умолчанию
 * берётся из цикла, если он виден, иначе дату вводят сами.
 */
function Start({ pair, today }: { pair: Pair; today: string }) {
  const t = useT()
  const start = useStartPregnancy()
  const burst = useBurst()
  const settings = useCycleSettings()
  const shared = useCycleShared(pair.partnerId)
  // Чей цикл: свой, если отслеживается, иначе открытый партнёршей
  const own = settings.data?.trackingEnabled ?? false
  const defaultMother = own
    ? pair.userId
    : shared.data === true
      ? pair.partnerId
      : pair.partner?.sex === 'female'
        ? pair.partnerId
        : pair.userId
  const [mother, setMother] = useState(defaultMother)
  const periods = usePeriods(mother)
  const lastStart = [...(periods.data ?? [])].sort((a, b) => (a.startedOn < b.startedOn ? 1 : -1))[0]?.startedOn
  const [lmp, setLmp] = useState<string>('')
  const value = lmp || lastStart || today
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setMother(defaultMother), [defaultMother])

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-surface p-5 shadow-card">
        <Aurora colors={[toneVar(pair.myTone), toneVar(pair.partnerTone), 'var(--t-plum)']} />
        <Baby aria-hidden size={128} strokeWidth={1.3} className="pointer-events-none absolute -right-5 -bottom-6 -rotate-12 text-ink opacity-[0.06]" />
        <p className="font-display text-[24px] leading-tight font-extrabold tracking-tight">{t('pg.startTitle')}</p>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{t('pg.startText')}</p>
      </section>
      <Card className="flex flex-col gap-4 p-4">
        {pair.partnerId !== '' && (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">{t('pg.mother')}</span>
            <Segmented
              value={mother}
              onChange={setMother}
              options={[
                { value: pair.userId, label: pair.myName },
                { value: pair.partnerId, label: pair.partnerName },
              ]}
            />
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('pg.lmp')}</span>
          <input type="date" value={value} max={today} onChange={(e) => setLmp(e.target.value)} className={INPUT_CLASS} />
          <span className="text-[13px] text-muted">{lastStart && !lmp ? t('pg.lmpFromCycle') : t('pg.lmpHint')}</span>
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          loading={start.isPending}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            start.mutate(
              { motherId: mother, lmp: value },
              {
                onSuccess: () => burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 'hearts'),
                onError: (err) => setError(err.message),
              },
            )
          }}
        >
          <Baby size={18} aria-hidden />
          {t('pg.start')}
        </Button>
      </Card>
    </div>
  )
}

function Hero({ pregnancy, pair, today, onSettings }: { pregnancy: Pregnancy; pair: Pair; today: string; onSettings: () => void }) {
  const t = useT()
  const s = gestation(pregnancy.lmp, today)
  const a = toneVar(pair.myTone)
  const b = toneVar(pair.partnerTone)
  return (
    <section
      className="relative isolate overflow-hidden rounded-[28px] bg-surface p-5 shadow-card"
      style={{ '--pair-a': a, '--pair-b': b } as CSSProperties}
    >
      <Aurora colors={[a, b, 'var(--t-plum)']} />
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-surface/75 px-3 py-1 text-[12px] font-semibold backdrop-blur">
          {t(dynamicKey('pg.trimester', String(s.trimester)))}
        </span>
        <button
          type="button"
          onClick={onSettings}
          aria-label={t('pg.settings')}
          className="-mt-1.5 -mr-1.5 flex size-10 items-center justify-center rounded-full text-muted transition-colors active:bg-raised"
        >
          <Ellipsis size={20} aria-hidden />
        </button>
      </div>
      <p className="mt-2 font-display text-[40px] leading-none font-extrabold tracking-tight">
        {t('pg.weekN', { n: s.week })}
      </p>
      <p className="mt-1 text-[15px] text-muted">{t('pg.dayN', { n: s.day + 1 })}</p>

      {/* Шкала срока: 40 недель, отметки триместров */}
      <div className="relative mt-4 h-2.5 rounded-full bg-surface/70">
        <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--pair-a)] to-[var(--pair-b)]" style={{ width: `${s.progress * 100}%` }} />
        {[14 / 40, 28 / 40].map((p) => (
          <span key={p} aria-hidden className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded bg-ink/15" style={{ left: `${p * 100}%` }} />
        ))}
      </div>
      <p className="mt-3 text-sm">
        <span className="text-muted">{t('pg.due')}</span>{' '}
        <span className="font-semibold">{formatDayMonthYear(fromLocalISO(s.dueDate))}</span>
        {s.daysLeft > 0 && <span className="text-muted"> · {t('pg.daysLeft', { n: s.daysLeft, unit: t.plural('unit.day', s.daysLeft) })}</span>}
      </p>
    </section>
  )
}

/**
 * Неделя: размер малыша (сравнение, длина, вес) и три коротких текста -
 * малыш, будущая мама и подсказка второму. Листается вперёд и назад:
 * интересно заглянуть, что будет через месяц.
 */
function WeekCard({ current, pair, motherId }: { current: number; pair: Pair; motherId: string }) {
  const t = useT()
  const [week, setWeek] = useState(Math.min(Math.max(current, 4), 40))
  const info = weekInfo(week)
  const other = motherId === pair.userId ? pair.partnerName : pair.myName
  const otherTone = motherId === pair.userId ? pair.partnerTone : pair.myTone

  if (!info) {
    return <Card className="p-4 text-sm text-muted">{t('pg.tooEarly')}</Card>
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-2 pt-2">
        <button
          type="button"
          aria-label={t('pg.prevWeek')}
          disabled={week <= 4}
          onClick={() => setWeek((w) => w - 1)}
          className="flex size-10 items-center justify-center rounded-full text-muted transition-colors active:bg-raised disabled:opacity-30"
        >
          <ChevronLeft size={22} aria-hidden />
        </button>
        <p className="min-w-0 flex-1 text-center text-[13px] font-semibold text-muted">
          {week === current ? t('pg.thisWeek') : t('pg.weekN', { n: week })}
        </p>
        <button
          type="button"
          aria-label={t('pg.nextWeek')}
          disabled={week >= 40}
          onClick={() => setWeek((w) => w + 1)}
          className="flex size-10 items-center justify-center rounded-full text-muted transition-colors active:bg-raised disabled:opacity-30"
        >
          <ChevronRight size={22} aria-hidden />
        </button>
      </div>

      <div className="px-5 pt-1 pb-4 text-center">
        <p className="text-sm text-muted">{t('pg.sizeOf')}</p>
        {week === current ? (
          <Sparkles count={4} colors={['var(--t-plum)', 'var(--t-amber)', 'var(--c-accent)']} className="mt-1">
            <p className="font-display text-[26px] leading-tight font-extrabold">{t(dynamicKey('preg.size', String(week)))}</p>
          </Sparkles>
        ) : (
          <p className="mt-1 font-display text-[26px] leading-tight font-extrabold">{t(dynamicKey('preg.size', String(week)))}</p>
        )}
        <div className="mt-3 flex justify-center gap-4 text-sm text-muted">
          {info.lengthCm !== null && (
            <span className="flex items-center gap-1.5">
              <Ruler size={15} aria-hidden />
              {t('pg.cm', { n: num(info.lengthCm) })}
            </span>
          )}
          {info.weightG !== null && (
            <span className="flex items-center gap-1.5">
              <Weight size={15} aria-hidden />
              {info.weightG >= 1000 ? t('pg.kg', { n: num(info.weightG / 1000) }) : t('pg.g', { n: info.weightG })}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-line p-4">
        <Line icon={<Baby size={16} aria-hidden />} title={t('pg.baby')} text={t(dynamicKey('preg.baby', String(week)))} />
        <Line icon={<Heart size={15} aria-hidden />} title={t('pg.mom')} text={t(dynamicKey('preg.mom', String(week)))} />
        <div className="rounded-2xl bg-accent-soft p-3">
          <div className="flex items-center gap-2">
            <Avatar name={other} tone={otherTone} size="sm" />
            {/* Своё имя в падеже не угадать: второму - «тебе», маме - имя через двоеточие */}
            <span className="text-[13px] font-semibold text-accent-soft-ink">
              {motherId === pair.userId ? t('pg.forPartner', { name: other }) : t('pg.forYou')}
            </span>
          </div>
          <p className="mt-1.5 text-[15px] leading-relaxed">{t(dynamicKey('preg.partner', String(week)))}</p>
        </div>
      </div>
    </Card>
  )
}

/** Число по правилам языка: «5,4» по-русски, «5.4» по-английски. */
function num(n: number): string {
  return new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: 2 }).format(n)
}

function Line({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
        {icon}
        {title}
      </p>
      <p className="mt-0.5 text-[15px] leading-relaxed">{text}</p>
    </div>
  )
}

/** Вехи визитов относительно текущей недели. Сроки уточняет врач. */
function Checkpoints({ week }: { week: number }) {
  const t = useT()
  return (
    <Card className="overflow-hidden">
      <div className="px-4 pt-4">
        <SectionTitle>{t('pg.checkpoints')}</SectionTitle>
      </div>
      <ul className="mt-2 flex flex-col">
        {CHECKPOINTS.map((c) => {
          const s = checkpointState(week, c.fromWeek, c.toWeek)
          return (
            <li key={c.id} className={`flex gap-3 px-4 py-2.5 ${s === 'done' ? 'opacity-55' : ''}`}>
              <span
                aria-hidden
                className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                  s === 'now' ? 'bg-accent ring-4 ring-accent/20' : s === 'soon' ? 'bg-tone-amber' : s === 'done' ? 'bg-tone-green' : 'bg-raised'
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">
                  {t(dynamicKey('preg.cp', c.id))}
                  <span className="ml-1.5 text-[13px] font-normal text-muted">
                    {c.fromWeek === c.toWeek ? t('pg.weekShort', { n: c.fromWeek }) : t('pg.weeksShort', { from: c.fromWeek, to: c.toWeek })}
                  </span>
                </p>
                {(s === 'now' || s === 'soon') && <p className="mt-0.5 text-[13px] text-muted">{t(dynamicKey('preg.cpHint', c.id))}</p>}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** Свои визиты к врачу: дата, что, галочка «был(а)». */
function Visits({ visits, today }: { visits: Visit[]; today: string }) {
  const t = useT()
  const save = useSaveVisit()
  const remove = useDeleteVisit()
  const [adding, setAdding] = useState(false)
  const upcoming = visits.filter((v) => !v.done)
  const past = visits.filter((v) => v.done)

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4">
        <SectionTitle>{t('pg.visits')}</SectionTitle>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-8 items-center gap-1 rounded-full bg-accent-soft px-3 text-[13px] font-semibold text-accent-soft-ink active:scale-95"
        >
          <Plus size={14} aria-hidden />
          {t('common.add')}
        </button>
      </div>
      {visits.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">{t('pg.noVisits')}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {[...upcoming, ...past].map((v) => (
            <li key={v.id} className={`flex items-center gap-3 px-4 py-2.5 ${v.done ? 'opacity-55' : ''}`}>
              <button
                type="button"
                role="checkbox"
                aria-checked={v.done}
                onClick={() => save.mutate({ id: v.id, date: v.date, title: v.title, note: v.note ?? '', done: !v.done })}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <CalendarCheck size={18} aria-hidden className={v.done ? 'shrink-0 text-tone-green' : 'shrink-0 text-tone-plum'} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{v.title}</span>
                  <span className="block text-[13px] text-muted">
                    {formatDayMonth(fromLocalISO(v.date))}
                    {v.date < today && !v.done ? ` · ${t('pg.visitPast')}` : ''}
                    {v.note ? ` · ${v.note}` : ''}
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label={t('common.delete')}
                onClick={() => remove.mutate(v.id)}
                className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted/70 active:bg-raised"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding && <VisitSheet today={today} onClose={() => setAdding(false)} />}
    </Card>
  )
}

function VisitSheet({ today, onClose }: { today: string; onClose: () => void }) {
  const t = useT()
  const save = useSaveVisit()
  const [date, setDate] = useState(today)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  return (
    <Sheet open onClose={onClose} title={t('pg.newVisit')}>
      <div className="flex flex-col gap-4">
        <Field label={t('pg.visitTitle')} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('pg.visitPlaceholder')} maxLength={120} autoFocus />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('pg.visitDate')}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || today)} className={INPUT_CLASS} />
        </label>
        <Field label={t('pg.visitNote')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <Button disabled={title.trim() === ''} loading={save.isPending} onClick={() => save.mutate({ date, title, note }, { onSuccess: onClose })}>
          {t('common.save')}
        </Button>
      </div>
    </Sheet>
  )
}

/**
 * Счёт шевелений: «начать», тап на каждое, «готово». Сохраняется сессия -
 * сколько за сколько минут. Как его вести и что считать нормой, говорит врач.
 */
function Kicks({ sessions }: { sessions: KickSession[] }) {
  const t = useT()
  const save = useSaveKicks()
  const burst = useBurst()
  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [count, setCount] = useState(0)
  const [, tick] = useState(0)

  useEffect(() => {
    if (!startedAt) return
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [startedAt])

  const minutes = startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 60000) : 0
  const seconds = startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 1000) % 60 : 0

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <IconBadge icon={Footprints} tone="plum" size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{t('pg.kicks')}</p>
          <p className="text-[13px] text-muted">{t('pg.kicksHint')}</p>
        </div>
      </div>
      {startedAt ? (
        <>
          <button
            type="button"
            onClick={(e) => {
              setCount((c) => c + 1)
              const r = e.currentTarget.getBoundingClientRect()
              burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 'hearts')
            }}
            className="mt-4 flex aspect-[2/1] w-full flex-col items-center justify-center rounded-3xl bg-tone-plum-soft text-tone-plum transition-transform active:scale-95"
          >
            <span className="font-display text-[48px] leading-none font-extrabold tabular-nums">{count}</span>
            <span className="mt-1 text-sm font-semibold tabular-nums">
              {minutes}:{String(seconds).padStart(2, '0')}
            </span>
          </button>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setStartedAt(null); setCount(0) }}>
              {t('common.cancel')}
            </Button>
            <Button
              className="flex-1"
              disabled={count === 0}
              loading={save.isPending}
              onClick={() =>
                save.mutate(
                  { startedAt: startedAt.toISOString(), endedAt: new Date().toISOString(), kicks: count },
                  { onSuccess: () => { setStartedAt(null); setCount(0) } },
                )
              }
            >
              {t('common.done')}
            </Button>
          </div>
        </>
      ) : (
        <Button variant="soft" className="mt-4 w-full" onClick={() => setStartedAt(new Date())}>
          {t('pg.kicksStart')}
        </Button>
      )}
      {sessions.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-[13px] text-muted">
          {sessions.slice(0, 5).map((s) => {
            const mins = Math.max(1, Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000))
            return (
              <li key={s.id} className="flex justify-between tabular-nums">
                <span>{formatDayMonth(new Date(s.startedAt))}</span>
                <span>{t('pg.kicksLine', { n: s.kicks, m: mins })}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

type Contraction = { start: number; end: number | null }

const STORE = 'tandem-contractions'

/**
 * Таймер схваток: начало и конец каждой, длительность и промежуток между
 * ними, средние по последним трём. Только на этом телефоне - это
 * инструмент на час, а не история. Когда ехать, решает врач; экран
 * лишь напоминает спросить его заранее.
 */
function Contractions() {
  const t = useT()
  const [list, setList] = useState<Contraction[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORE) ?? '[]') as Contraction[]
    } catch {
      return []
    }
  })
  const [, tick] = useState(0)
  const active = list[list.length - 1]?.end === null

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(list.slice(-30)))
    } catch {
      /* приватный режим - таймер проживёт до перезагрузки */
    }
  }, [list])

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [active])

  const toggle = () =>
    setList((l) => {
      const last = l[l.length - 1]
      if (last && last.end === null) return [...l.slice(0, -1), { ...last, end: Date.now() }]
      return [...l, { start: Date.now(), end: null }]
    })

  const done = list.filter((c): c is { start: number; end: number } => c.end !== null)
  const last3 = done.slice(-3)
  const avgDur = last3.length ? Math.round(last3.reduce((s, c) => s + (c.end - c.start), 0) / last3.length / 1000) : null
  const gaps = last3.slice(1).map((c, i) => c.start - (last3[i]?.start ?? c.start))
  const avgGap = gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length / 60000) : null
  const sec = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
  const current = list[list.length - 1]

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <IconBadge icon={Timer} tone="rose" size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{t('pg.contractions')}</p>
          <p className="text-[13px] text-muted">{t('pg.contractionsHint')}</p>
        </div>
      </div>
      <Button variant={active ? 'primary' : 'soft'} className="mt-4 w-full" onClick={toggle}>
        {active && current ? `${t('pg.contractionStop')} · ${sec(Date.now() - current.start)}` : t('pg.contractionStart')}
      </Button>
      {(avgDur !== null || avgGap !== null) && (
        <p className="mt-3 text-center text-sm tabular-nums">
          {avgDur !== null && t('pg.avgDuration', { s: avgDur })}
          {avgGap !== null && <> · {t('pg.avgGap', { m: avgGap })}</>}
        </p>
      )}
      {done.length > 0 && (
        <button type="button" onClick={() => setList([])} className="mx-auto mt-2 block text-[13px] text-muted underline">
          {t('pg.clear')}
        </button>
      )}
    </Card>
  )
}

function SettingsSheet({ pregnancy, today, onClose, onBorn }: { pregnancy: Pregnancy; today: string; onClose: () => void; onBorn: () => void }) {
  const t = useT()
  const update = useUpdateLmp()
  const end = useEndPregnancy()
  const [lmp, setLmp] = useState(pregnancy.lmp)
  return (
    <Sheet open onClose={onClose} title={t('pg.settings')}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('pg.lmp')}</span>
          <input type="date" value={lmp} max={today} onChange={(e) => setLmp(e.target.value || lmp)} className={INPUT_CLASS} />
        </label>
        <Button loading={update.isPending} onClick={() => update.mutate(lmp, { onSuccess: onClose })}>
          {t('common.save')}
        </Button>
        <Button
          variant="soft"
          onClick={() => {
            onClose()
            onBorn()
          }}
        >
          <Baby size={18} aria-hidden />
          {t('bb.born')}
        </Button>
        <Button variant="secondary" loading={end.isPending} onClick={() => end.mutate(today, { onSuccess: onClose })}>
          {t('pg.end')}
        </Button>
        <p className="text-[13px] text-muted">{t('pg.endHint')}</p>
      </div>
    </Sheet>
  )
}
