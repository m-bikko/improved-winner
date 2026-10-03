import { useMemo } from 'react'
import {
  Baby,
  CalendarHeart,
  Camera,
  Handshake,
  Heart,
  HeartHandshake,
  HeartPulse,
  Images,
  Lightbulb,
  MessageCircleHeart,
  PiggyBank,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { activeLocale, useLang, useT } from '@/lib/i18n'
import { diffDays, formatDayMonthYear, fromLocalISO, todayLocal } from '@/lib/date'
import { useMemoryUrls } from '@/features/memories/api'
import { Aurora } from '@/ui/Aurora'
import { AnimatedNumber } from '@/ui/AnimatedNumber'
import { Card } from '@/ui/Card'
import { IconBadge } from '@/ui/IconBadge'
import { ProgressiveImage } from '@/ui/ProgressiveImage'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import type { Tone } from '@/ui/tones'
import { useStory, type StoryItem, type StoryKind } from './api'
import { ordinal } from './logic'

const LOOK: Record<StoryKind, { icon: LucideIcon; tone: Tone }> = {
  date: { icon: CalendarHeart, tone: 'teal' },
  meeting: { icon: HeartHandshake, tone: 'rose' },
  memory: { icon: Images, tone: 'rose' },
  agreement: { icon: Handshake, tone: 'indigo' },
  challenge: { icon: Trophy, tone: 'green' },
  savings: { icon: PiggyBank, tone: 'amber' },
  idea: { icon: Lightbulb, tone: 'violet' },
  pregnancy: { icon: HeartPulse, tone: 'plum' },
  baby: { icon: Baby, tone: 'teal' },
  gratitude: { icon: Heart, tone: 'rose' },
  question: { icon: MessageCircleHeart, tone: 'violet' },
  shot: { icon: Camera, tone: 'sky' },
}

/**
 * Наша история.
 *
 * Лента отношений из того, что уже записано: даты, встречи, воспоминания,
 * договорённости, челленджи, копилка, идеи, малыш и вехи. Наверху - сколько
 * вы вместе (от самой ранней годовщины), ниже - годы, новые сверху.
 */
export function StoryPage() {
  const t = useT()
  const { lang } = useLang()
  const today = todayLocal()
  const story = useStory(today, lang)
  const items = story.data ?? []
  const photos = useMemo(() => items.map((i) => i.photo).filter((p): p is string => p !== null), [items])
  const urls = useMemoryUrls(photos)

  if (story.isError) return <ErrorState error={story.error} onRetry={() => void story.refetch()} />
  if (story.isPending) return <Loading />
  if (items.length === 0) return <EmptyState icon={Heart} tone="rose" title={t('st.emptyTitle')} hint={t('st.emptyHint')} />

  // Начало - самая ранняя годовщина пары, а если её нет - самое раннее событие
  const anniversaries = items.filter((i) => i.kind === 'date' && i.detail === 'anniversary')
  const start = (anniversaries.length > 0 ? anniversaries : items).reduce((min, i) => (i.day < min ? i.day : min), today)
  const days = diffDays(start, today)

  const years = new Map<number, StoryItem[]>()
  for (const item of items) {
    const y = Number(item.day.slice(0, 4))
    years.set(y, [...(years.get(y) ?? []), item])
  }

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-surface p-6 shadow-card">
        <Aurora colors={['var(--t-rose)', 'var(--c-accent)', 'var(--t-amber)']} />
        <p className="text-[13px] font-semibold text-muted">{t('st.since', { date: formatDayMonthYear(fromLocalISO(start)) })}</p>
        <p className="mt-1 flex items-baseline gap-2">
          <AnimatedNumber value={days} className="font-display text-[56px] leading-none font-extrabold tracking-tight tabular-nums" />
          <span className="font-display text-xl font-extrabold">{t.plural('unit.day', days)}</span>
        </p>
        <p className="mt-2 text-[15px] text-muted">{t('st.together')}</p>
      </section>

      {[...years.entries()].map(([year, list]) => (
        <section key={year} className="flex flex-col gap-2.5">
          <div className="mt-3 px-1">
            <h2 className="font-display text-2xl font-extrabold">{year}</h2>
            <p className="text-[13px] text-muted">{yearSummary(list, t)}</p>
          </div>
          <ol className="relative flex flex-col gap-2.5 before:absolute before:top-2 before:bottom-2 before:left-[19px] before:w-0.5 before:rounded-full before:bg-line">
            {list.map((item, i) => (
              <Event key={`${item.kind}-${item.ref ?? i}-${item.day}`} item={item} url={item.photo ? urls.data?.[item.photo] : undefined} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

function yearSummary(list: StoryItem[], t: ReturnType<typeof useT>): string {
  const count = (k: StoryKind) => list.filter((i) => i.kind === k).length
  const parts: string[] = []
  const meetings = count('meeting')
  const memories = count('memory')
  const agreements = count('agreement')
  if (meetings) parts.push(`${meetings} ${t.plural('st.meetings', meetings)}`)
  if (memories) parts.push(`${memories} ${t.plural('st.memories', memories)}`)
  if (agreements) parts.push(`${agreements} ${t.plural('st.agreements', agreements)}`)
  return parts.join(' · ') || `${list.length} ${t.plural('st.events', list.length)}`
}

function Event({ item, url }: { item: StoryItem; url: string | undefined }) {
  const t = useT()
  const { lang } = useLang()
  const look = LOOK[item.kind]
  const n = item.n ?? 0
  const ord = ordinal(n, lang)
  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat(activeLocale(), { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)

  const [title, sub] = ((): [string, string | null] => {
    switch (item.kind) {
      case 'date':
        return [item.title ?? '', null]
      case 'meeting':
        return [item.title ?? t('st.meeting'), t('st.meetingDays', { n, unit: t.plural('unit.day', n) })]
      case 'memory':
        return [item.title ?? t('st.memory'), item.detail]
      case 'agreement':
        return [item.title ?? '', item.detail]
      case 'challenge':
        return [item.title ?? '', t('st.challenge', { n, unit: t.plural('unit.day', n) })]
      case 'savings':
        return [item.title ?? '', t('st.savings', { sum: money(n, item.detail ?? 'KZT') })]
      case 'idea':
        return [item.title ?? '', t('st.idea')]
      case 'pregnancy':
        return [t('st.pregnancy'), null]
      case 'baby':
        return [item.title ?? t('st.babyNoName'), t('st.baby')]
      case 'gratitude':
        return [n === 1 ? t('st.gratitude1') : t('st.gratitudeN', { n, ord }), null]
      case 'question':
        return [n === 1 ? t('st.question1') : t('st.questionN', { n, ord }), null]
      case 'shot':
        return [n === 1 ? t('st.shot1') : t('st.shotN', { n, ord }), null]
    }
  })()

  return (
    <li className="relative flex gap-3">
      <IconBadge icon={look.icon} tone={look.tone} size="md" className="relative z-[1] shrink-0 ring-4 ring-bg" />
      <Card className="min-w-0 flex-1 overflow-hidden">
        {item.kind === 'memory' && item.photo && item.placeholder && (
          <ProgressiveImage src={url} placeholder={item.placeholder} alt="" className="aspect-[16/9] w-full" />
        )}
        <div className="p-3.5">
          <p className="text-[12px] font-semibold text-muted">{formatDayMonthYear(fromLocalISO(item.day))}</p>
          <p className="mt-0.5 font-semibold leading-snug">{title}</p>
          {sub && <p className="mt-0.5 line-clamp-3 text-sm text-muted">{sub}</p>}
        </div>
      </Card>
    </li>
  )
}
