import { useState, type ReactNode } from 'react'
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Dumbbell,
  Heart,
  HeartHandshake,
  Images,
  MessageCircleHeart,
  Mic,
  NotebookPen,
  PiggyBank,
  Scale,
  Smile,
  Trophy,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { activeLocale, useT } from '@/lib/i18n'
import { formatDayMonth, fromLocalISO, shiftDays, todayLocal } from '@/lib/date'
import { usePair, type Pair } from '@/features/profile/pair'
import { Avatar } from '@/ui/Avatar'
import { Card, SectionTitle } from '@/ui/Card'
import { IconBadge } from '@/ui/IconBadge'
import { ErrorState, Loading } from '@/ui/States'
import type { Tone } from '@/ui/tones'
import { useWeekSummary, type WeekPerson } from './api'
import { weekStart } from './logic'

/**
 * Наша неделя.
 *
 * Сводка из уже записанного - вводить ничего не нужно. Сверху - что было
 * вместе (вопросы, кадры, воспоминания, встречи), ниже - у каждого: дневник,
 * тренировки, вес, «как ты», «спасибо». Стрелки - против прошлой недели.
 */
export function WeekPage() {
  const t = useT()
  const pair = usePair()
  const current = weekStart(todayLocal())
  const [from, setFrom] = useState(current)
  const week = useWeekSummary(from)
  const prev = useWeekSummary(shiftDays(from, -7))

  if (week.isError) return <ErrorState error={week.error} onRetry={() => void week.refetch()} />
  if (week.isPending || pair.isPending) return <Loading />

  const s = week.data
  const people = [...s.people].sort((a) => (a.userId === pair.userId ? -1 : 1))
  const before = (id: string) => prev.data?.people.find((p) => p.userId === id)
  const range = `${formatDayMonth(fromLocalISO(s.from))} - ${formatDayMonth(fromLocalISO(s.to))}`

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <div className="flex items-center gap-2">
        <NavButton label={t('wk.prev')} onClick={() => setFrom(shiftDays(from, -7))}>
          <ChevronLeft size={20} aria-hidden />
        </NavButton>
        <div className="min-w-0 flex-1 text-center">
          <p className="font-display text-lg font-extrabold">{from === current ? t('wk.thisWeek') : range}</p>
          {from === current && <p className="text-[13px] text-muted">{range}</p>}
        </div>
        <NavButton label={t('wk.next')} onClick={() => setFrom(shiftDays(from, 7))} disabled={from >= current}>
          <ChevronRight size={20} aria-hidden />
        </NavButton>
      </div>

      <SectionTitle className="mt-1">{t('wk.together')}</SectionTitle>
      <div className="grid grid-cols-3 gap-2.5">
        <Big icon={MessageCircleHeart} tone="violet" value={`${s.together.questions}/7`} label={t('wk.questions')} />
        <Big icon={Camera} tone="sky" value={`${s.together.shots}/7`} label={t('wk.shots')} />
        <Big icon={HeartHandshake} tone="rose" value={String(s.together.meetingDays)} label={t('wk.meetingDays')} />
        <Big icon={Images} tone="rose" value={String(s.together.memories)} label={t('wk.memories')} />
        <Big icon={Clapperboard} tone="sky" value={String(s.together.watched)} label={t('wk.watched')} />
        <Big icon={PiggyBank} tone="amber" value={String(s.together.deposits)} label={t('wk.deposits')} />
      </div>

      {people.map((p) => (
        <Person key={p.userId} person={p} before={before(p.userId)} pair={pair} />
      ))}
    </div>
  )
}

function NavButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-11 items-center justify-center rounded-full bg-surface text-muted shadow-card active:scale-95 disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function Big({ icon, tone, value, label }: { icon: LucideIcon; tone: Tone; value: string; label: string }) {
  return (
    <Card className="flex flex-col gap-2 p-3">
      <IconBadge icon={icon} tone={tone} size="sm" />
      <span className="font-display text-[22px] leading-none font-extrabold tabular-nums">{value}</span>
      <span className="text-[12px] leading-tight text-muted">{label}</span>
    </Card>
  )
}

function Person({ person, before, pair }: { person: WeekPerson; before: WeekPerson | undefined; pair: Pair }) {
  const t = useT()
  const kg = (v: number) => new Intl.NumberFormat(activeLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)
  const weightDelta = person.weightFrom !== null && person.weightTo !== null ? person.weightTo - person.weightFrom : null

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <Avatar name={pair.nameOf(person.userId)} tone={pair.toneOf(person.userId)} size="md" />
        <p className="font-display text-lg font-extrabold">{pair.nameOf(person.userId)}</p>
      </div>
      <div className="flex flex-col gap-3">
        <Row icon={NotebookPen} tone="amber" label={t('wk.diary')} value={`${person.diaryDays}/7`} progress={person.diaryDays / 7} delta={before ? person.diaryDays - before.diaryDays : null}>
          {person.avgKcal !== null && (
            <span>
              {t('wk.avgKcal', { kcal: person.avgKcal })}
              {person.avgGoal !== null && ` · ${t('wk.goal', { kcal: person.avgGoal })}`}
            </span>
          )}
        </Row>
        <Row
          icon={Dumbbell}
          tone="green"
          label={t('wk.workouts')}
          value={String(person.workouts)}
          delta={before ? person.workouts - before.workouts : null}
        >
          {person.workoutMinutes > 0 && <span>{t('wk.minutes', { n: person.workoutMinutes })}</span>}
        </Row>
        {weightDelta !== null && person.weightFrom !== null && person.weightTo !== null && (
          <Row icon={Scale} tone="slate" label={t('wk.weight')} value={kg(person.weightTo)}>
            <span className="flex items-center gap-1">
              {kg(person.weightFrom)} → {kg(person.weightTo)}
              {Math.abs(weightDelta) >= 0.05 &&
                (weightDelta < 0 ? (
                  <TrendingDown size={14} aria-hidden className="text-tone-green" />
                ) : (
                  <TrendingUp size={14} aria-hidden className="text-tone-orange" />
                ))}
            </span>
          </Row>
        )}
        <Row icon={Smile} tone="violet" label={t('wk.checkins')} value={`${person.checkins}/7`} progress={person.checkins / 7} />
        <Row icon={Heart} tone="rose" label={t('wk.gratitudes')} value={String(person.gratitudes)} delta={before ? person.gratitudes - before.gratitudes : null} />
        <Row icon={MessageCircleHeart} tone="violet" label={t('wk.answers')} value={`${person.questions}/7`} progress={person.questions / 7} />
        {person.challengeMarks > 0 && <Row icon={Trophy} tone="green" label={t('wk.marks')} value={String(person.challengeMarks)} />}
        {person.voice > 0 && <Row icon={Mic} tone="violet" label={t('wk.voice')} value={String(person.voice)} />}
      </div>
    </Card>
  )
}

/** Строка показателя: значок, подпись, число, тонкая полоса и стрелка к прошлой неделе. */
function Row({
  icon,
  tone,
  label,
  value,
  progress,
  delta = null,
  children,
}: {
  icon: LucideIcon
  tone: Tone
  label: string
  value: string
  progress?: number
  delta?: number | null
  children?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <IconBadge icon={icon} tone={tone} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px]">{label}</span>
          {delta !== null && delta !== 0 && (
            <span className={`text-[12px] font-semibold tabular-nums ${delta > 0 ? 'text-tone-green' : 'text-muted'}`}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
          <span className="font-display text-[17px] font-extrabold tabular-nums">{value}</span>
        </div>
        {progress !== undefined && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.min(1, progress) * 100}%` }} />
          </div>
        )}
        {children && <div className="mt-0.5 text-[13px] text-muted">{children}</div>}
      </div>
    </div>
  )
}
