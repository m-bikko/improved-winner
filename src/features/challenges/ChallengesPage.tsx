import { useState } from 'react'
import { Check, Ellipsis, Flame, Heart, RotateCcw, Square, Trash2, Trophy } from 'lucide-react'
import { dynamicKey, useT } from '@/lib/i18n'
import { diffDays, formatDayMonth, fromLocalISO, shiftDays, todayLocal } from '@/lib/date'
import { usePair, type Pair } from '@/features/profile/pair'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card, SectionTitle } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Fab } from '@/ui/Fab'
import { Field, NumberField } from '@/ui/Field'
import { IconBadge } from '@/ui/IconBadge'
import { Segmented } from '@/ui/Segmented'
import { Sheet } from '@/ui/Sheet'
import { Sparkles } from '@/ui/Sparkles'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { TONE_CLASS } from '@/ui/tones'
import { useChallenges, useCreateChallenge, useDeleteChallenge, useToggleMark, useUpdateChallenge } from './api'
import {
  canMark,
  countOf,
  dayNumber,
  daysOf,
  jointStreak,
  lastDay,
  marked,
  statusOf,
  togetherCount,
  type Challenge,
} from './logic'
import { CHALLENGE_ICONS, DURATIONS, PRESETS, iconOf, type ChallengeIcon } from './presets'

/**
 * Челленджи на двоих.
 *
 * Одна цель на N дней, отметки у каждого свои. Главное на экране - сетка
 * дней, где каждая клетка поделена пополам цветами двоих: видно сразу,
 * кто держится, а где пропуск. Отметиться можно кнопкой за сегодня или
 * тапом по прошедшему дню - забыть вечером не повод терять день.
 */
export function ChallengesPage() {
  const t = useT()
  const pair = usePair()
  const today = todayLocal()
  const challenges = useChallenges()
  const [creating, setCreating] = useState<Partial<Draft> | null>(null)
  const [editing, setEditing] = useState<Challenge | null>(null)

  if (challenges.isError) return <ErrorState error={challenges.error} onRetry={() => void challenges.refetch()} />
  if (challenges.isPending || pair.isPending) return <Loading />

  const list = challenges.data
  const active = list.filter((c) => statusOf(c, today) === 'active')
  const upcoming = list.filter((c) => statusOf(c, today) === 'upcoming')
  const done = list.filter((c) => statusOf(c, today) === 'done')

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {list.length === 0 && (
        <EmptyState
          icon={Trophy}
          title={t('ch.emptyTitle')}
          hint={t('ch.emptyHint')}
          action={<Button onClick={() => setCreating({})}>{t('ch.start')}</Button>}
        />
      )}

      {active.map((c) => (
        <ActiveCard key={c.id} c={c} pair={pair} today={today} onEdit={() => setEditing(c)} />
      ))}

      {upcoming.map((c) => (
        <UpcomingCard key={c.id} c={c} today={today} onEdit={() => setEditing(c)} />
      ))}

      {done.length > 0 && (
        <>
          <SectionTitle className="mt-3">{t('ch.finished')}</SectionTitle>
          {done.map((c) => (
            <DoneCard key={c.id} c={c} pair={pair} onOpen={() => setEditing(c)} />
          ))}
        </>
      )}

      <Fab onClick={() => setCreating({})} label={t('ch.new')} />

      {creating && <CreateSheet initial={creating} today={today} onClose={() => setCreating(null)} />}
      {editing && (
        <EditSheet
          c={editing}
          today={today}
          onClose={() => setEditing(null)}
          onRepeat={() => {
            setCreating({ title: editing.title, icon: editing.icon as ChallengeIcon, days: editing.days })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function ActiveCard({ c, pair, today, onEdit }: { c: Challenge; pair: Pair; today: string; onEdit: () => void }) {
  const t = useT()
  const toggle = useToggleMark()
  const burst = useBurst()
  const [error, setError] = useState<string | null>(null)

  const n = dayNumber(c, today)
  const mineToday = marked(c, pair.userId, today)
  const theirsToday = pair.partnerId !== '' && marked(c, pair.partnerId, today)
  const streak = jointStreak(c, pair.userId, pair.partnerId, today)
  const together = togetherCount(c, pair.userId, pair.partnerId)

  const set = (date: string, on: boolean, from?: HTMLElement) => {
    setError(null)
    const rect = from?.getBoundingClientRect()
    toggle.mutate(
      { challengeId: c.id, userId: pair.userId, date, on },
      {
        onSuccess: () => {
          // Разлёт - после успеха: искры за свою отметку, сердца, если этим
          // нажатием сегодняшний день закрыли оба
          if (on && rect) {
            const both = date === today && theirsToday
            burst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, both ? 'hearts' : 'sparks')
          }
        },
        onError: (e) => setError(e instanceof Error ? e.message : String(e)),
      },
    )
  }

  return (
    <Card className="relative overflow-hidden p-4">

      <div className="flex items-start gap-3">
        <IconBadge icon={iconOf(c.icon)} tone="green" size="lg" />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-display text-lg leading-tight font-extrabold">{c.title}</p>
          <p className="mt-0.5 text-sm text-muted">
            {t('ch.dayOf', { n, days: c.days })} · {t('ch.until', { date: formatDayMonth(fromLocalISO(lastDay(c))) })}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label={t('common.edit')}
          className="-mt-1 -mr-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors active:bg-raised"
        >
          <Ellipsis size={20} aria-hidden />
        </button>
      </div>

      <DayGrid c={c} pair={pair} today={today} onToggle={(date, on, el) => set(date, on, el)} />

      <div className="mt-4 flex flex-col gap-2">
        <PersonLine name={pair.myName} tone={pair.myTone} count={countOf(c, pair.userId)} days={c.days} />
        {pair.partnerId !== '' && (
          <PersonLine name={pair.partnerName} tone={pair.partnerTone} count={countOf(c, pair.partnerId)} days={c.days} />
        )}
      </div>

      {pair.partnerId !== '' && together > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
          <span className={streak >= 2 ? 'flicker text-tone-orange' : 'text-muted'}>
            <Flame size={16} aria-hidden />
          </span>
          {t('ch.together', { n: together })}
          {streak >= 2 && <> · {t('ch.streak', { n: streak })}</>}
        </p>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <Button
        variant={mineToday ? 'secondary' : 'soft'}
        onClick={(e) => set(today, !mineToday, e.currentTarget)}
        className="mt-4 w-full"
      >
        {mineToday ? <Check size={18} strokeWidth={2.6} aria-hidden /> : <Square size={18} aria-hidden />}
        {mineToday ? (theirsToday ? t('ch.bothToday') : t('ch.markedToday')) : t('ch.markToday')}
      </Button>
    </Card>
  )
}

/**
 * Сетка дней. Клетка поделена пополам: левая половина - твоя отметка,
 * правая - второго, в цветах людей. Оба - клетка целиком и сердце внутри.
 * Будущие дни бледные и не нажимаются, сегодняшний обведён.
 */
function DayGrid({
  c,
  pair,
  today,
  onToggle,
}: {
  c: Challenge
  pair: Pair
  today: string
  onToggle?: (date: string, on: boolean, el: HTMLElement) => void
}) {
  const t = useT()
  const cols = c.days <= 14 ? 'grid-cols-7' : 'grid-cols-10'
  return (
    <div className={`mt-4 grid ${cols} gap-1.5`}>
      {daysOf(c).map((date, i) => {
        const mine = marked(c, pair.userId, date)
        const theirs = pair.partnerId !== '' && marked(c, pair.partnerId, date)
        const open = onToggle !== undefined && canMark(c, date, today)
        const future = date > today
        const who = [mine ? pair.myName : null, theirs ? pair.partnerName : null].filter(Boolean).join(', ')
        return (
          <button
            key={date}
            type="button"
            disabled={!open}
            aria-pressed={mine}
            aria-label={t('ch.cell', { n: i + 1, date: formatDayMonth(fromLocalISO(date)), who: who || t('ch.nobody') })}
            onClick={(e) => onToggle?.(date, !mine, e.currentTarget)}
            className={`relative aspect-square overflow-hidden rounded-[8px] bg-raised transition-transform
                        active:scale-90 disabled:active:scale-100 ${future ? 'opacity-45' : ''} ${
                          date === today ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''
                        }`}
          >
            <span
              aria-hidden
              className={`absolute inset-y-0 left-0 w-1/2 origin-bottom transition-transform duration-300 ${
                TONE_CLASS[pair.myTone].solid
              } ${mine ? 'scale-y-100' : 'scale-y-0'}`}
            />
            <span
              aria-hidden
              className={`absolute inset-y-0 right-0 w-1/2 origin-bottom transition-transform duration-300 ${
                TONE_CLASS[pair.partnerTone].solid
              } ${theirs ? 'scale-y-100' : 'scale-y-0'}`}
            />
            {mine && theirs && (
              <Heart
                aria-hidden
                size={11}
                strokeWidth={0}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 fill-white"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

function PersonLine({ name, tone, count, days }: { name: string; tone: Pair['myTone']; count: number; days: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={name} tone={tone} size="sm" />
      <span className="w-20 shrink-0 truncate text-sm font-medium">{name}</span>
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-raised">
        <span
          className={`block h-full rounded-full transition-[width] duration-500 ${TONE_CLASS[tone].solid}`}
          style={{ width: `${Math.round((count / days) * 100)}%` }}
        />
      </span>
      <span className="w-12 shrink-0 text-right text-sm text-muted tabular-nums">
        {count}/{days}
      </span>
    </div>
  )
}

function UpcomingCard({ c, today, onEdit }: { c: Challenge; today: string; onEdit: () => void }) {
  const t = useT()
  const left = diffDays(today, c.startedOn)
  return (
    <Card className="flex items-center gap-3 p-4">
      <IconBadge icon={iconOf(c.icon)} tone="slate" size="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[17px] font-extrabold">{c.title}</p>
        <p className="mt-0.5 text-sm text-muted">
          {left === 1
            ? t('ch.startsTomorrow')
            : t('ch.startsIn', { date: formatDayMonth(fromLocalISO(c.startedOn)) })}{' '}
          · {c.days} {t.plural('unit.day', c.days)}
        </p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label={t('common.edit')}
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors active:bg-raised"
      >
        <Ellipsis size={20} aria-hidden />
      </button>
    </Card>
  )
}

/** Итог: сколько отметился каждый и сколько вместе. Оба прошли всё - кубок искрится. */
function DoneCard({ c, pair, onOpen }: { c: Challenge; pair: Pair; onOpen: () => void }) {
  const t = useT()
  const mine = countOf(c, pair.userId)
  const theirs = pair.partnerId === '' ? 0 : countOf(c, pair.partnerId)
  const total = daysOf(c).filter((d) => d <= lastDay(c)).length
  const perfect = mine === total && (pair.partnerId === '' || theirs === total)
  const trophy = <IconBadge icon={Trophy} tone={perfect ? 'amber' : 'slate'} size="md" />

  return (
    <Card as="article" className="p-0">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 p-4 text-left active:opacity-70">
        {perfect ? (
          <Sparkles count={3} colors={['var(--t-amber)', 'var(--c-accent)', 'var(--t-green)']} className="shrink-0">
            {trophy}
          </Sparkles>
        ) : (
          trophy
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{c.title}</span>
          <span className="mt-0.5 block truncate text-[13px] text-muted">
            {perfect
              ? t('ch.perfect')
              : `${pair.myName} ${mine}/${total}` +
                (pair.partnerId === '' ? '' : ` · ${pair.partnerName} ${theirs}/${total}`) +
                ` · ${t('ch.together', { n: togetherCount(c, pair.userId, pair.partnerId) })}`}
          </span>
          <span className="mt-0.5 block text-[13px] text-muted">
            {formatDayMonth(fromLocalISO(c.startedOn))} - {formatDayMonth(fromLocalISO(lastDay(c)))}
          </span>
        </span>
      </button>
    </Card>
  )
}

type Draft = { title: string; icon: ChallengeIcon; days: number }

function CreateSheet({ initial, today, onClose }: { initial: Partial<Draft>; today: string; onClose: () => void }) {
  const t = useT()
  const create = useCreateChallenge()
  const burst = useBurst()
  const [preset, setPreset] = useState<string | null>(null)
  const [title, setTitle] = useState(initial.title ?? '')
  const [icon, setIcon] = useState<ChallengeIcon>(initial.icon ?? 'target')
  const [days, setDays] = useState<number | ''>(initial.days ?? 21)
  const [start, setStart] = useState<'today' | 'tomorrow'>('today')
  const [error, setError] = useState<string | null>(null)

  const pick = (p: (typeof PRESETS)[number]) => {
    setPreset(p.id)
    setTitle(t(dynamicKey('chp', p.id)))
    setIcon(p.icon)
    setDays(p.days)
  }

  const submit = async (from: HTMLElement) => {
    setError(null)
    if (title.trim() === '') return setError(t('ch.noTitle'))
    if (days === '' || days < 3 || days > 100) return setError(t('ch.badDays'))
    const rect = from.getBoundingClientRect()
    try {
      await create.mutateAsync({
        title,
        icon,
        days,
        startedOn: start === 'today' ? today : shiftDays(today, 1),
      })
      burst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, 'sparks')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={t('ch.new')}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">{t('ch.presets')}</span>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => {
              const Icon = CHALLENGE_ICONS[p.icon]
              const on = preset === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p)}
                  aria-pressed={on}
                  className={`flex min-h-14 items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition-[transform,background-color] active:scale-[0.97] ${
                    on ? 'bg-accent-soft ring-2 ring-accent' : 'bg-raised'
                  }`}
                >
                  <Icon size={20} aria-hidden className={on ? 'shrink-0 text-accent-soft-ink' : 'shrink-0 text-tone-green'} />
                  <span className="min-w-0">
                    <span className="block text-[14px] leading-tight font-semibold">{t(dynamicKey('chp', p.id))}</span>
                    <span className="mt-0.5 block text-[12px] text-muted">
                      {p.days} {t.plural('unit.day', p.days)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <Field
          label={t('ch.titleLabel')}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setPreset(null)
          }}
          placeholder={t('ch.titlePlaceholder')}
          maxLength={80}
        />

        <IconPicker value={icon} onChange={setIcon} />

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">{t('ch.duration')}</span>
          <div className="flex flex-wrap items-center gap-2">
            {DURATIONS.map((d) => (
              <Chip key={d} selected={days === d} onClick={() => setDays(d)}>
                {d} {t.plural('unit.day', d)}
              </Chip>
            ))}
          </div>
          <NumberField label={t('ch.customDays')} hideLabel value={days} onValueChange={setDays} max={100} placeholder={t('ch.customDays')} suffix={t.plural('unit.day', days === '' ? 5 : days)} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">{t('ch.startWhen')}</span>
          <Segmented
            value={start}
            onChange={setStart}
            options={[
              { value: 'today', label: t('common.today') },
              { value: 'tomorrow', label: t('common.tomorrow') },
            ]}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={(e) => void submit(e.currentTarget)} loading={create.isPending}>
          {t('ch.create')}
        </Button>
      </div>
    </Sheet>
  )
}

function IconPicker({ value, onChange }: { value: ChallengeIcon; onChange: (icon: ChallengeIcon) => void }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted">{t('ch.icon')}</span>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(CHALLENGE_ICONS) as ChallengeIcon[]).map((key) => {
          const Icon = CHALLENGE_ICONS[key]
          const on = key === value
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-pressed={on}
              aria-label={t(dynamicKey('chi', key))}
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
  )
}

/**
 * Правка: название и значок. Срок и начало не правятся - отметки уже
 * стоят по дням, и сдвиг срока выкинул бы их из счёта (это держит и база).
 * Идущий челлендж можно завершить сегодняшним днём, прошедший - повторить.
 */
function EditSheet({
  c,
  today,
  onClose,
  onRepeat,
}: {
  c: Challenge
  today: string
  onClose: () => void
  onRepeat: () => void
}) {
  const t = useT()
  const update = useUpdateChallenge()
  const remove = useDeleteChallenge()
  const [title, setTitle] = useState(c.title)
  const [icon, setIcon] = useState<ChallengeIcon>((c.icon in CHALLENGE_ICONS ? c.icon : 'target') as ChallengeIcon)
  const [error, setError] = useState<string | null>(null)
  const status = statusOf(c, today)

  const run = async (job: () => Promise<unknown>) => {
    setError(null)
    try {
      await job()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={c.title}>
      <div className="flex flex-col gap-5">
        <Field label={t('ch.titleLabel')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        <IconPicker value={icon} onChange={setIcon} />

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button
          loading={update.isPending}
          disabled={title.trim() === ''}
          onClick={() => void run(() => update.mutateAsync({ id: c.id, title, icon }))}
        >
          {t('common.save')}
        </Button>

        {status === 'active' && (
          <Button
            variant="secondary"
            onClick={() => void run(() => update.mutateAsync({ id: c.id, stoppedOn: today }))}
          >
            <Check size={18} aria-hidden />
            {t('ch.stop')}
          </Button>
        )}
        {status === 'done' && (
          <Button variant="soft" onClick={onRepeat}>
            <RotateCcw size={18} aria-hidden />
            {t('ch.again')}
          </Button>
        )}
        <Button variant="danger" loading={remove.isPending} onClick={() => void run(() => remove.mutateAsync(c.id))}>
          <Trash2 size={18} aria-hidden />
          {t('common.delete')}
        </Button>
      </div>
    </Sheet>
  )
}
