import { useId, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  ScrollText,
  Minus,
  PiggyBank,
  Plus,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { dynamicKey, useT } from '@/lib/i18n'
import { formatDayLabel, formatDayMonthYear, fromLocalISO, monthName, todayLocal } from '@/lib/date'
import { usePair, type Pair } from '@/features/profile/pair'
import { AnimatedNumber } from '@/ui/AnimatedNumber'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card, SectionTitle } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Fab } from '@/ui/Fab'
import { Field, INPUT_CLASS, NumberField } from '@/ui/Field'
import { IconBadge } from '@/ui/IconBadge'
import { Segmented } from '@/ui/Segmented'
import { Sheet } from '@/ui/Sheet'
import { Sparkles } from '@/ui/Sparkles'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { TONE_CLASS, toneVar } from '@/ui/tones'
import { GOAL_ICONS, goalIcon, type GoalIcon } from './icons'
import { useAddDeposit, useArchiveGoal, useDeleteDeposit, useDeleteGoal, useGoals, useSaveGoal } from './api'
import {
  CURRENCIES,
  QUICK,
  currencySymbol,
  forecastDate,
  formatMoney,
  monthOf,
  monthStart,
  onTrack,
  perMonthNeeded,
  progressOf,
  reached,
  savedOf,
  shareOf,
  type Currency,
  type Goal,
} from './logic'

/**
 * Копилка на цель.
 *
 * Одна понятная цифра «сколько осталось» и банка, которая наполняется, -
 * вместо таблицы трат. Вклад каждого виден цветом человека; срок превращается
 * в «по N в месяц», а история вкладов - в прогноз «в таком темпе - к марту».
 */
export function SavingsPage() {
  const t = useT()
  const pair = usePair()
  const goals = useGoals()
  const today = todayLocal()
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [depositTo, setDepositTo] = useState<{ goal: Goal; withdraw: boolean } | null>(null)
  const [history, setHistory] = useState<Goal | null>(null)
  const [showArchive, setShowArchive] = useState(false)

  if (goals.isError) return <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />
  if (goals.isPending || pair.isPending) return <Loading />

  const live = goals.data.filter((g) => g.archivedAt === null)
  const archived = goals.data.filter((g) => g.archivedAt !== null)
  // Свежие данные для открытых шторок: после вклада цель в кэше новая
  const fresh = (g: Goal) => goals.data.find((x) => x.id === g.id) ?? g

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {live.length === 0 && (
        <EmptyState
          icon={PiggyBank}
          title={t('sv.emptyTitle')}
          hint={t('sv.emptyHint')}
          action={<Button onClick={() => setEditing('new')}>{t('sv.newGoal')}</Button>}
        />
      )}

      {live.map((g) => (
        <GoalCard
          key={g.id}
          g={g}
          pair={pair}
          today={today}
          onDeposit={(withdraw) => setDepositTo({ goal: g, withdraw })}
          onHistory={() => setHistory(g)}
          onEdit={() => setEditing(g)}
        />
      ))}

      {archived.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            aria-expanded={showArchive}
            className="mt-3 self-start"
          >
            <SectionTitle>
              {t('sv.archive')} · {archived.length}
            </SectionTitle>
          </button>
          {showArchive &&
            archived.map((g) => (
              <Card key={g.id} as="article" className="p-0">
                <button type="button" onClick={() => setEditing(g)} className="flex w-full items-center gap-3 p-4 text-left">
                  <IconBadge icon={goalIcon(g.icon)} tone={reached(g) ? 'amber' : 'slate'} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{g.title}</span>
                    <span className="mt-0.5 block text-[13px] text-muted tabular-nums">
                      {formatMoney(savedOf(g), g.currency)} / {formatMoney(g.target, g.currency)}
                    </span>
                  </span>
                </button>
              </Card>
            ))}
        </>
      )}

      <Fab onClick={() => setEditing('new')} label={t('sv.newGoal')} />

      {editing && <GoalSheet goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {depositTo && (
        <DepositSheet
          goal={fresh(depositTo.goal)}
          withdraw={depositTo.withdraw}
          today={today}
          onClose={() => setDepositTo(null)}
        />
      )}
      {history && <HistorySheet goal={fresh(history)} pair={pair} onClose={() => setHistory(null)} />}
    </div>
  )
}

function GoalCard({
  g,
  pair,
  today,
  onDeposit,
  onHistory,
  onEdit,
}: {
  g: Goal
  pair: Pair
  today: string
  onDeposit: (withdraw: boolean) => void
  onHistory: () => void
  onEdit: () => void
}) {
  const t = useT()
  const saved = savedOf(g)
  const level = progressOf(g)
  const done = reached(g)
  const Icon = goalIcon(g.icon)
  const need = perMonthNeeded(g, today)
  const forecast = forecastDate(g, today)
  const track = onTrack(g, today)
  const mine = shareOf(g, pair.userId)
  const theirs = pair.partnerId === '' ? 0 : shareOf(g, pair.partnerId)
  const positive = Math.max(mine, 0) + Math.max(theirs, 0)
  const a = toneVar(pair.myTone)

  const jar = <Jar level={level} />

  return (
    <Card className="relative overflow-hidden p-4">

      <div className="flex gap-4">
        {done ? (
          <Sparkles count={4} colors={['var(--t-amber)', 'var(--c-accent)', a]} className="shrink-0 self-start">
            {jar}
          </Sparkles>
        ) : (
          jar
        )}

        <div className="min-w-0 flex-1">
          <button type="button" onClick={onEdit} className="-my-2 flex min-h-10 max-w-full items-center gap-1.5 text-left active:opacity-60">
            <Icon size={16} aria-hidden className="shrink-0 text-tone-amber" />
            <span className="truncate font-display text-[17px] font-extrabold">{g.title}</span>
          </button>

          <AnimatedNumber
            value={saved}
            format={(n) => formatMoney(Math.round(n), g.currency)}
            className="mt-1.5 block font-display text-[28px] leading-none font-extrabold tracking-tight tabular-nums"
          />
          <p className="mt-1 text-[13px] text-muted tabular-nums">
            {done
              ? t('sv.reached')
              : t('sv.ofTarget', { target: formatMoney(g.target, g.currency), pct: Math.floor(level * 100) })}
          </p>

          {/* Вклад каждого - полоса в цветах людей. Только положительный:
              «взял больше, чем положил» рисовать долей полосы бессмысленно */}
          {positive > 0 && (
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-raised">
              <span className={TONE_CLASS[pair.myTone].solid} style={{ width: `${(Math.max(mine, 0) / positive) * 100}%` }} />
              <span className={TONE_CLASS[pair.partnerTone].solid} style={{ width: `${(Math.max(theirs, 0) / positive) * 100}%` }} />
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <Share name={pair.myName} tone={pair.myTone} amount={mine} currency={g.currency} />
            {pair.partnerId !== '' && <Share name={pair.partnerName} tone={pair.partnerTone} amount={theirs} currency={g.currency} />}
          </div>
        </div>
      </div>

      {!done && (need !== null || forecast !== null) && (
        <div className="mt-4 flex flex-col gap-1.5 rounded-2xl bg-raised px-3.5 py-2.5 text-[13px]">
          {need !== null && g.deadline && (
            <p className="flex items-center gap-2">
              <CalendarClock size={15} aria-hidden className="shrink-0 text-muted" />
              <span>
                {t('sv.needPerMonth', {
                  date: formatDayMonthYear(fromLocalISO(g.deadline)),
                  amount: formatMoney(need, g.currency),
                })}
              </span>
            </p>
          )}
          {forecast !== null && (
            <p className={`flex items-center gap-2 ${track === false ? 'text-danger' : ''}`}>
              <TrendingUp size={15} aria-hidden className={`shrink-0 ${track === false ? '' : 'text-tone-green'}`} />
              <span>{t('sv.forecast', { date: formatDayMonthYear(fromLocalISO(forecast)) })}</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="soft" onClick={() => onDeposit(false)} className="flex-1">
          <Plus size={18} aria-hidden />
          {t('sv.deposit')}
        </Button>
        <Button variant="secondary" onClick={() => onDeposit(true)} aria-label={t('sv.withdraw')} className="px-4">
          <Minus size={18} aria-hidden />
        </Button>
        <Button variant="secondary" onClick={onHistory} aria-label={t('sv.history')} className="px-4">
          <ScrollText size={18} aria-hidden />
        </Button>
      </div>
    </Card>
  )
}

function Share({ name, tone, amount, currency }: { name: string; tone: Pair['myTone']; amount: number; currency: Currency }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${TONE_CLASS[tone].solid}`} />
      <span className="truncate text-muted">{name}</span>
      <span className="font-semibold tabular-nums">{formatMoney(amount, currency)}</span>
    </span>
  )
}

/** Тело банки - контур и маска для жидкости. */
const BODY = 'M10 24 Q10 17 17 17 H55 Q62 17 62 24 V83 Q62 92 53 92 H19 Q10 92 10 83 Z'
/**
 * Волна шириной в два экрана банки: двигается на один экран влево
 * и встаёт ровно туда, откуда начала (период гребня 36 единиц).
 */
const WAVE = 'M0 0 q9 -4 18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 V90 H0 Z'

/**
 * Банка, которая наполняется.
 *
 * Уровень меняется сдвигом слоя жидкости, волна бежит CSS-анимацией
 * transform - всё на композиторе. При «уменьшить движение» волна стоит,
 * уровень встаёт сразу (см. index.css).
 */
function Jar({ level }: { level: number }) {
  const id = useId().replace(/:/g, '')
  const top = 21
  const bottom = 92
  // Пустая банка - жидкость целиком под дном, чуть-чуть - тонкий слой
  const y = level <= 0 ? bottom + 6 : bottom - (bottom - top) * level
  return (
    <svg viewBox="0 0 72 96" aria-hidden className="h-[104px] w-[78px] shrink-0 text-ink">
      <defs>
        <clipPath id={`${id}c`}>
          <path d={BODY} />
        </clipPath>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--jar-top)' }} />
          <stop offset="1" style={{ stopColor: 'var(--jar-bottom)' }} />
        </linearGradient>
      </defs>
      <path d={BODY} className="fill-raised" />
      <g clipPath={`url(#${id}c)`}>
        <g className="jar-level" style={{ transform: `translateY(${y}px)` }}>
          <path className="jar-wave-back" d={WAVE} fill={`url(#${id}g)`} opacity={0.45} />
          <path className="jar-wave" d={WAVE} fill={`url(#${id}g)`} />
        </g>
      </g>
      <path d={BODY} fill="none" stroke="currentColor" strokeOpacity={0.14} strokeWidth={2} />
      <rect x={21} y={7} width={30} height={8} rx={3} className="fill-line" />
      {/* Блик на стекле */}
      <path d="M17 31 V66" stroke="white" strokeOpacity={0.4} strokeWidth={3} strokeLinecap="round" />
    </svg>
  )
}

function DepositSheet({
  goal,
  withdraw: initialWithdraw,
  today,
  onClose,
}: {
  goal: Goal
  withdraw: boolean
  today: string
  onClose: () => void
}) {
  const t = useT()
  const add = useAddDeposit()
  const burst = useBurst()
  const [mode, setMode] = useState<'in' | 'out'>(initialWithdraw ? 'out' : 'in')
  const [amount, setAmount] = useState<number | ''>('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const saved = savedOf(goal)

  const submit = async (from: HTMLElement) => {
    setError(null)
    if (amount === '' || amount <= 0) return setError(t('sv.noAmount'))
    if (mode === 'out' && amount > saved) return setError(t('sv.negative'))
    const rect = from.getBoundingClientRect()
    const signed = mode === 'in' ? amount : -amount
    try {
      await add.mutateAsync({ goalId: goal.id, amount: signed, date, note })
      if (mode === 'in') {
        // Этим вкладом цель набрана - сердца, иначе искры
        const crossed = saved < goal.target && saved + signed >= goal.target
        burst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, crossed ? 'hearts' : 'sparks')
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={goal.title}>
      <div className="flex flex-col gap-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'in', label: t('sv.deposit'), icon: Plus },
            { value: 'out', label: t('sv.withdraw'), icon: Minus },
          ]}
        />
        <NumberField
          label={t('sv.amount')}
          value={amount}
          onValueChange={setAmount}
          suffix={currencySymbol(goal.currency)}
          max={1_000_000_000_000}
          placeholder="0"
        />
        {mode === 'in' && (
          <div className="flex flex-wrap gap-2">
            {QUICK[goal.currency].map((q) => (
              <Chip key={q} selected={amount === q} onClick={() => setAmount(q)}>
                {formatMoney(q, goal.currency)}
              </Chip>
            ))}
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('sv.date')}</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} className={INPUT_CLASS} />
        </label>
        <Field label={t('sv.note')} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('sv.notePlaceholder')} maxLength={200} />

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={(e) => void submit(e.currentTarget)} loading={add.isPending}>
          {mode === 'in' ? t('sv.depositAction') : t('sv.withdrawAction')}
        </Button>
      </div>
    </Sheet>
  )
}

function GoalSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const t = useT()
  const save = useSaveGoal()
  const archive = useArchiveGoal()
  const remove = useDeleteGoal()
  const [title, setTitle] = useState(goal?.title ?? '')
  const [icon, setIcon] = useState<GoalIcon>((goal && goal.icon in GOAL_ICONS ? goal.icon : 'piggy') as GoalIcon)
  const [target, setTarget] = useState<number | ''>(goal?.target ?? '')
  const [currency, setCurrency] = useState<Currency>(goal?.currency ?? 'KZT')
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const [error, setError] = useState<string | null>(null)

  const run = async (job: () => Promise<unknown>) => {
    setError(null)
    try {
      await job()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const submit = () => {
    if (title.trim() === '') return setError(t('sv.noTitle'))
    if (target === '' || target <= 0) return setError(t('sv.noTarget'))
    void run(() =>
      save.mutateAsync({
        ...(goal ? { id: goal.id } : {}),
        title,
        icon,
        target,
        currency,
        deadline: deadline || null,
      }),
    )
  }

  return (
    <Sheet open onClose={onClose} title={goal ? goal.title : t('sv.newGoal')}>
      <div className="flex flex-col gap-5">
        <Field
          label={t('sv.goalTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('sv.goalPlaceholder')}
          maxLength={80}
          autoFocus={!goal}
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">{t('sv.icon')}</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GOAL_ICONS) as GoalIcon[]).map((key) => {
              const Icon = GOAL_ICONS[key]
              const on = key === icon
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIcon(key)}
                  aria-pressed={on}
                  aria-label={t(dynamicKey('svi', key))}
                  className={`flex size-11 items-center justify-center rounded-full transition-[transform,background-color] active:scale-90 ${
                    on ? 'bg-accent text-accent-ink' : 'bg-raised text-muted'
                  }`}
                >
                  <Icon size={19} aria-hidden />
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <NumberField
            label={t('sv.target')}
            value={target}
            onValueChange={setTarget}
            suffix={currencySymbol(currency)}
            max={1_000_000_000_000}
            placeholder="0"
          />
          <Segmented
            value={currency}
            onChange={setCurrency}
            ariaLabel={t('sv.currency')}
            options={CURRENCIES.map((c) => ({ value: c, label: currencySymbol(c) }))}
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">
            {t('sv.deadline')} <span className="text-muted/70">· {t('common.optional')}</span>
          </span>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={INPUT_CLASS} />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={submit} loading={save.isPending}>
          {goal ? t('common.save') : t('sv.create')}
        </Button>

        {goal && (
          <>
            <Button
              variant="secondary"
              loading={archive.isPending}
              onClick={() => void run(() => archive.mutateAsync({ id: goal.id, archived: goal.archivedAt === null }))}
            >
              {goal.archivedAt === null ? <Archive size={18} aria-hidden /> : <ArchiveRestore size={18} aria-hidden />}
              {goal.archivedAt === null ? t('sv.toArchive') : t('sv.fromArchive')}
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => void run(() => remove.mutateAsync(goal.id))}>
              <Trash2 size={18} aria-hidden />
              {t('common.delete')}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  )
}

/** История вкладов по месяцам. Удалить можно только свой вклад - это держит и RLS. */
function HistorySheet({ goal, pair, onClose }: { goal: Goal; pair: Pair; onClose: () => void }) {
  const t = useT()
  const remove = useDeleteDeposit()
  const [error, setError] = useState<string | null>(null)

  const months: { month: string; items: Goal['deposits'] }[] = []
  for (const d of goal.deposits) {
    const m = monthOf(d.date)
    const last = months[months.length - 1]
    if (last && last.month === m) last.items.push(d)
    else months.push({ month: m, items: [d] })
  }

  return (
    <Sheet open onClose={onClose} title={t('sv.history')}>
      {goal.deposits.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('sv.noHistory')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {error && <p className="text-sm text-danger">{error}</p>}
          {months.map(({ month, items }) => {
            const start = monthStart(month)
            return (
              <section key={month} className="flex flex-col gap-1">
                <h3 className="px-1 text-[13px] font-semibold text-muted first-letter:uppercase">
                  {monthName(start.getMonth())} {start.getFullYear()}
                </h3>
                <ul className="flex flex-col">
                  {items.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-2">
                      <Avatar name={pair.nameOf(d.userId)} tone={pair.toneOf(d.userId)} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className={`block font-semibold tabular-nums ${d.amount < 0 ? 'text-danger' : ''}`}>
                          {d.amount > 0 ? '+' : ''}
                          {formatMoney(d.amount, goal.currency)}
                        </span>
                        <span className="block truncate text-[13px] text-muted">
                          {formatDayLabel(d.date)}
                          {d.note ? ` · ${d.note}` : ''}
                        </span>
                      </span>
                      {d.userId === pair.userId && (
                        <button
                          type="button"
                          aria-label={t('common.delete')}
                          onClick={() => {
                            setError(null)
                            remove.mutate(d.id, { onError: (e) => setError(e.message) })
                          }}
                          className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors active:bg-raised"
                        >
                          <Trash2 size={17} aria-hidden />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}
