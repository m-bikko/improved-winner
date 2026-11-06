import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Baby, CalendarHeart, Check, ChevronDown, ChevronRight, Ellipsis, HeartPulse, Pill, Plus, Signature, Stethoscope, Trash2 } from 'lucide-react'
import { dynamicKey, useT } from '@/lib/i18n'
import { diffDays, formatDayMonth, fromLocalISO, shiftDays, todayLocal } from '@/lib/date'
import { usePair, type Pair } from '@/features/profile/pair'
import { useCycleDays, useCycleSettings, useCycleShared, useLutealOf, usePeriods } from '@/features/cycle/api'
import { AnimatedNumber } from '@/ui/AnimatedNumber'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card, SectionTitle } from '@/ui/Card'
import { Field, INPUT_CLASS } from '@/ui/Field'
import { IconBadge } from '@/ui/IconBadge'
import { Sheet } from '@/ui/Sheet'
import { Sparkles } from '@/ui/Sparkles'
import { ErrorState, Loading } from '@/ui/States'
import { TONE_CLASS } from '@/ui/tones'
import {
  useAddCustom,
  useDeleteCustom,
  usePrep,
  useSetPlan,
  useToggleCustom,
  useTogglePreset,
  useToggleVitamins,
  type Prep,
} from './api'
import { FOLATE_GOAL_DAYS, itemsFor } from './items'
import { useActivePregnancy } from '@/features/pregnancy/api'
import { gestation } from '@/features/pregnancy/logic'
import { nextWindow, vitaminDaysSince, vitaminStreak, type Check as CheckRow } from './logic'

/**
 * Готовимся к малышу.
 *
 * Подготовка - дело двоих: анализы, витамины и привычки касаются обоих.
 * План общий, списки у каждого свои, и каждый видит, как идёт у второго.
 * Ближайшее благоприятное окно берётся из раздела цикла - если цикл виден
 * тому, кто смотрит (свой или открытый партнёром).
 *
 * Это памятка, а не назначение, и экран говорит это прямо.
 */
export function PrepPage() {
  const t = useT()
  const pair = usePair()
  const prep = usePrep()
  const today = todayLocal()
  const [settings, setSettings] = useState(false)

  if (prep.isError) return <ErrorState error={prep.error} onRetry={() => void prep.refetch()} />
  if (prep.isPending || pair.isPending) return <Loading />

  const data = prep.data
  const people = [pair.userId, ...(pair.partnerId !== '' ? [pair.partnerId] : [])]

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Hero data={data} pair={pair} today={today} onSettings={() => setSettings(true)} />

      <BabyLinks />

      <FertileWindow pair={pair} today={today} />

      <Vitamins data={data} pair={pair} today={today} />

      {people.map((id) => (
        <Checklist key={id} data={data} pair={pair} owner={id} today={today} />
      ))}

      <Card className="flex gap-3 p-4">
        <IconBadge icon={Stethoscope} tone="teal" size="sm" />
        <p className="text-sm text-muted">{t('prep.disclaimer')}</p>
      </Card>

      {settings && <PlanSheet startedOn={data.startedOn} today={today} onClose={() => setSettings(false)} />}
    </div>
  )
}

function Hero({ data, pair, today, onSettings }: { data: Prep; pair: Pair; today: string; onSettings: () => void }) {
  const t = useT()
  const plan = useSetPlan()
  const burst = useBurst()
  const people = [pair.userId, ...(pair.partnerId !== '' ? [pair.partnerId] : [])]

  return (
    <section
      className="relative isolate overflow-hidden rounded-3xl bg-surface p-5 shadow-card"
    >
      {data.startedOn === null ? (
        <>
          <p className="font-display text-[24px] leading-tight font-extrabold tracking-tight">{t('prep.heroTitle')}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{t('prep.heroText')}</p>
          <Button
            className="mt-4 w-full"
            loading={plan.isPending}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              plan.mutate(today, {
                onSuccess: () => burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 'hearts'),
              })
            }}
          >
            <Baby size={18} aria-hidden />
            {t('prep.start')}
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-muted">{t('prep.heroTitle')}</p>
              <p className="mt-1 font-display text-[28px] leading-none font-extrabold tracking-tight">
                {t('prep.dayN', { n: Math.max(diffDays(data.startedOn, today) + 1, 1) })}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {t('prep.since', { date: formatDayMonth(fromLocalISO(data.startedOn)) })}
              </p>
            </div>
            <button
              type="button"
              onClick={onSettings}
              aria-label={t('prep.settings')}
              className="-mt-1 -mr-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors active:bg-raised"
            >
              <Ellipsis size={20} aria-hidden />
            </button>
          </div>

          {/* Витамины каждого к трём месяцам - столько считается хорошей подготовкой */}
          <div className="mt-4 flex flex-col gap-2.5">
            {people.map((id) => {
              const days = vitaminDaysSince(
                data.vitamins.filter((v) => v.userId === id).map((v) => v.date),
                data.startedOn ?? today,
              )
              const tone = pair.toneOf(id)
              return (
                <div key={id} className="flex items-center gap-2.5">
                  <Avatar name={pair.nameOf(id)} tone={tone} size="sm" />
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface/70">
                    <span
                      className={`block h-full rounded-full transition-[width] duration-700 ${TONE_CLASS[tone].solid}`}
                      style={{ width: `${Math.min(days / FOLATE_GOAL_DAYS, 1) * 100}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-[13px] text-muted tabular-nums">
                    <AnimatedNumber value={days} className="font-semibold text-ink" />/{FOLATE_GOAL_DAYS}
                  </span>
                </div>
              )
            })}
            <p className="text-[12px] text-muted">{t('prep.vitaminsGoal')}</p>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * Дальше по пути: режим беременности (идёт - срок, нет - «тест
 * положительный?») и выбор имени.
 */
function BabyLinks() {
  const t = useT()
  const pregnancy = useActivePregnancy()
  const week = pregnancy ? gestation(pregnancy.lmp, todayLocal()).week : null
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link to="/pregnancy" className="block rounded-3xl transition-transform active:scale-[0.98]">
        <Card className="flex h-full flex-col gap-2 p-4">
          <IconBadge icon={HeartPulse} tone="plum" size="sm" />
          <p className="text-[15px] leading-tight font-semibold">
            {week !== null ? t('pg.weekN', { n: week }) : t('pg.startTitle')}
          </p>
          <p className="text-[13px] text-muted">{week !== null ? t('nav.pregnancy') : t('prep.pregnancyHint')}</p>
        </Card>
      </Link>
      <Link to="/names" className="block rounded-3xl transition-transform active:scale-[0.98]">
        <Card className="flex h-full flex-col gap-2 p-4">
          <IconBadge icon={Signature} tone="orange" size="sm" />
          <p className="text-[15px] leading-tight font-semibold">{t('nav.names')}</p>
          <p className="text-[13px] text-muted">{t('prep.namesHint')}</p>
        </Card>
      </Link>
    </div>
  )
}

/**
 * Ближайшее благоприятное окно - из того же расчёта, что у раздела цикла.
 * Виден только тот цикл, что виден человеку: свой при включённом
 * отслеживании или открытый партнёром. Иначе карточки нет.
 */
function FertileWindow({ pair, today }: { pair: Pair; today: string }) {
  const t = useT()
  const settings = useCycleSettings()
  const shared = useCycleShared(pair.partnerId)
  const own = settings.data?.trackingEnabled ?? false
  const pregnancy = useActivePregnancy()
  const owner = own ? pair.userId : shared.data === true ? pair.partnerId : ''
  const periods = usePeriods(owner)
  const days = useCycleDays(owner)
  // Лютеиновая фаза владелицы цикла - окно у обоих должно совпадать
  const luteal = useLutealOf(owner, own)

  if (pregnancy || owner === '' || !periods.data || periods.data.length === 0) return null
  const lhDates = (days.data ?? []).filter((d) => d.lhPositive).map((d) => d.date)
  const w = nextWindow(periods.data, today, luteal, lhDates)
  if (!w) return null

  const inDays = diffDays(today, w.from)
  return (
    <Link to="/cycle" className="block rounded-3xl transition-transform active:scale-[0.98]">
      <Card className="relative overflow-hidden p-4">
        <div className="flex items-center gap-3">
          {w.now ? (
            <Sparkles count={4} colors={['var(--t-plum)', 'var(--c-accent)', 'var(--t-amber)']} className="shrink-0">
              <IconBadge icon={CalendarHeart} tone="plum" size="md" />
            </Sparkles>
          ) : (
            <IconBadge icon={CalendarHeart} tone="plum" size="md" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-muted">{w.now ? t('prep.windowNow') : t('prep.window')}</p>
            <p className="mt-0.5 font-display text-[19px] leading-tight font-extrabold">
              {formatDayMonth(fromLocalISO(w.from))} - {formatDayMonth(fromLocalISO(w.to))}
            </p>
            <p className="mt-0.5 text-[13px] text-muted">
              {w.now
                ? t('prep.ovulation', { date: formatDayMonth(fromLocalISO(w.ovulation)) })
                : t('prep.inDays', { n: inDays, unit: t.plural('unit.day', inDays) })}
              {w.approximate && <> · {t('prep.approximate')}</>}
            </p>
          </div>
          <ChevronRight size={18} aria-hidden className="shrink-0 text-muted/70" />
        </div>
      </Card>
    </Link>
  )
}

/** Витамины по дням: две недели точками у каждого и кнопка за сегодня. */
function Vitamins({ data, pair, today }: { data: Prep; pair: Pair; today: string }) {
  const t = useT()
  const toggle = useToggleVitamins()
  const burst = useBurst()
  const people = [pair.userId, ...(pair.partnerId !== '' ? [pair.partnerId] : [])]
  const dates = Array.from({ length: 14 }, (_, i) => shiftDays(today, i - 13))
  const takenBy = (id: string) => data.vitamins.filter((v) => v.userId === id).map((v) => v.date)
  const mineToday = takenBy(pair.userId).includes(today)

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <IconBadge icon={Pill} tone="teal" size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{t('prep.vitamins')}</p>
          <p className="text-[13px] text-muted">{t('prep.vitaminsHint')}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {people.map((id) => {
          const taken = new Set(takenBy(id))
          const streak = vitaminStreak([...taken], today)
          const tone = pair.toneOf(id)
          return (
            <div key={id} className="flex items-center gap-2.5">
              <Avatar name={pair.nameOf(id)} tone={tone} size="sm" />
              <span className="grid min-w-0 flex-1 grid-cols-14 gap-1">
                {dates.map((d) => (
                  <span
                    key={d}
                    title={formatDayMonth(fromLocalISO(d))}
                    className={`aspect-square rounded-full ${taken.has(d) ? TONE_CLASS[tone].solid : 'bg-raised'} ${
                      d === today ? 'ring-2 ring-accent/60 ring-offset-1 ring-offset-surface' : ''
                    }`}
                  />
                ))}
              </span>
              <span className="w-14 shrink-0 text-right text-[12px] text-muted tabular-nums">
                {streak > 0 ? t('prep.streak', { n: streak }) : ''}
              </span>
            </div>
          )
        })}
      </div>

      <Button
        variant={mineToday ? 'secondary' : 'soft'}
        className="mt-4 w-full"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          toggle.mutate(
            { userId: pair.userId, date: today, on: !mineToday },
            { onSuccess: () => !mineToday && burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 'sparks') },
          )
        }}
      >
        {mineToday ? <Check size={18} strokeWidth={2.6} aria-hidden /> : <Pill size={18} aria-hidden />}
        {mineToday ? t('prep.taken') : t('prep.take')}
      </Button>
    </Card>
  )
}

/**
 * Список одного человека. Свой - с галочками и своими пунктами, второго -
 * только посмотреть: отметиться за другого нельзя, это держит и RLS.
 */
function Checklist({ data, pair, owner, today }: { data: Prep; pair: Pair; owner: string; today: string }) {
  const t = useT()
  const preset = useTogglePreset()
  const toggleCustom = useToggleCustom()
  const deleteCustom = useDeleteCustom()
  const addCustom = useAddCustom()
  const [draft, setDraft] = useState('')
  const mine = owner === pair.userId
  // Свой список раскрыт, второго - свёрнут до шкалы: два длинных списка
  // подряд превращали экран в простыню, а у второго обычно важен итог
  const [open, setOpen] = useState(mine)
  const profile = mine ? pair.me : pair.partner
  const items = itemsFor(profile?.sex ?? null)
  const checks = data.checks.filter((c) => c.userId === owner)
  const doneOf = (key: string) => checks.find((c) => c.itemKey === key)?.doneOn ?? null
  const custom = checks.filter((c): c is CheckRow & { title: string } => c.title !== null)
  const total = items.length + custom.length
  const done = items.filter((i) => doneOf(i.id) !== null).length + custom.filter((c) => c.doneOn !== null).length

  const tone = pair.toneOf(owner)

  return (
    <section className="mt-2 flex flex-col gap-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-h-11 text-left">
        <SectionTitle
          action={
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted tabular-nums">
              {done}/{total}
              <ChevronDown size={16} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </span>
          }
        >
          <span className="flex items-center gap-2">
            <Avatar name={pair.nameOf(owner)} tone={tone} size="sm" />
            {pair.nameOf(owner)}
          </span>
        </SectionTitle>
      </button>

      {!open && (
        <span className="mx-1 h-2 overflow-hidden rounded-full bg-raised">
          <span
            className={`block h-full rounded-full transition-[width] duration-700 ${TONE_CLASS[tone].solid}`}
            style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
          />
        </span>
      )}

      {open && <Card className="overflow-hidden [&>*+*]:border-t [&>*+*]:border-line">
        {items.map((item) => {
          const at = doneOf(item.id)
          return (
            <Row
              key={item.id}
              done={at !== null}
              editable={mine}
              icon={<item.icon size={17} aria-hidden />}
              title={t(dynamicKey('prep.item', item.id))}
              hint={at ? t('prep.doneOn', { date: formatDayMonth(fromLocalISO(at)) }) : t(dynamicKey('prep.hint', item.id))}
              onToggle={() => preset.mutate({ userId: owner, itemKey: item.id, doneOn: at ? null : today })}
            />
          )
        })}
        {custom.map((c) => (
          <Row
            key={c.id}
            done={c.doneOn !== null}
            editable={mine}
            icon={<Plus size={17} aria-hidden />}
            title={c.title}
            hint={c.doneOn ? t('prep.doneOn', { date: formatDayMonth(fromLocalISO(c.doneOn)) }) : undefined}
            onToggle={() => toggleCustom.mutate({ id: c.id, doneOn: c.doneOn ? null : today })}
            onDelete={mine ? () => deleteCustom.mutate(c.id) : undefined}
          />
        ))}
        {mine && (
          <form
            className="flex items-center gap-2 p-2.5"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim() === '') return
              addCustom.mutate({ userId: owner, title: draft }, { onSuccess: () => setDraft('') })
            }}
          >
            <Field
              label={t('prep.addCustom')}
              hideLabel
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('prep.customPlaceholder')}
              maxLength={120}
            />
            <button
              type="submit"
              aria-label={t('prep.addCustom')}
              disabled={draft.trim() === '' || addCustom.isPending}
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-ink transition-transform active:scale-95 disabled:opacity-40"
            >
              <Plus size={20} aria-hidden />
            </button>
          </form>
        )}
      </Card>}
    </section>
  )
}

function Row({
  done,
  editable,
  icon,
  title,
  hint,
  onToggle,
  onDelete,
}: {
  done: boolean
  editable: boolean
  icon: ReactNode
  title: string
  hint?: string | undefined
  onToggle: () => void
  onDelete?: (() => void) | undefined
}) {
  const t = useT()
  const box = (
    <span
      aria-hidden
      className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-colors ${
        done ? 'bg-tone-green text-white' : 'bg-raised text-muted'
      }`}
    >
      {done ? <Check size={16} strokeWidth={3} /> : icon}
    </span>
  )
  const text = (
    <span className="min-w-0 flex-1">
      <span className={`block text-[15px] font-medium ${done ? 'text-muted line-through decoration-muted/50' : ''}`}>{title}</span>
      {hint && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{hint}</span>}
    </span>
  )

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {editable ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-3 text-left active:opacity-70"
        >
          {box}
          {text}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-3" aria-label={title}>
          {box}
          {text}
        </div>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('common.delete')}
          className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors active:bg-raised"
        >
          <Trash2 size={16} aria-hidden />
        </button>
      )}
    </div>
  )
}

function PlanSheet({ startedOn, today, onClose }: { startedOn: string | null; today: string; onClose: () => void }) {
  const t = useT()
  const plan = useSetPlan()
  const [date, setDate] = useState(startedOn ?? today)
  const [error, setError] = useState<string | null>(null)

  const run = (value: string | null) =>
    plan.mutate(value, { onSuccess: onClose, onError: (e) => setError(e.message) })

  return (
    <Sheet open onClose={onClose} title={t('prep.settings')}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('prep.startedOn')}</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} className={INPUT_CLASS} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button loading={plan.isPending} onClick={() => run(date)}>
          {t('common.save')}
        </Button>
        <Button variant="danger" onClick={() => run(null)}>
          <Trash2 size={18} aria-hidden />
          {t('prep.finish')}
        </Button>
        <p className="text-[13px] text-muted">{t('prep.finishHint')}</p>
      </div>
    </Sheet>
  )
}
