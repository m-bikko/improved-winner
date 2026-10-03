import { Camera, Check, ChevronRight, Milk, Pill, Wind } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { formatTime, fromLocalISO, shiftDays } from '@/lib/date'
import { useNow } from '@/lib/useNow'
import { usePair } from '@/features/profile/pair'
import { useShots } from '@/features/shots/api'
import { mmss, shotState } from '@/features/shots/logic'
import { usePauses } from '@/features/pause/api'
import { activeOn, doseKey, useHealth, useToggleDose } from '@/features/health/api'
import { useBaby, useHasBaby } from '@/features/baby/api'
import { sinceLabel } from '@/features/baby/logic'
import { CardLink } from '@/ui/Card'
import { IconBadge } from '@/ui/IconBadge'
import { Sparkles } from '@/ui/Sparkles'

/**
 * Плитки главной для разделов этой серии. Правило то же, что у остальных:
 * те же хуки и кэш, что у разделов, и пустых плиток нет - плитка есть,
 * только когда есть что сделать или увидеть сейчас.
 */

/** Пауза идёт или закончилась и ждёт строк - это важнее всего остального. */
export function PauseTile() {
  const t = useT()
  const pair = usePair()
  const pauses = usePauses()
  const now = useNow(1000)
  const open = pauses.data?.find((p) => p.closedAt === null)
  if (!open) return null
  const active = new Date(open.endsAt).getTime() > now
  const mine = open.notes.some((n) => n.userId === pair.userId)
  return (
    <CardLink to="/pause" className="flex items-center gap-3 p-4">
      <IconBadge icon={Wind} tone="sky" size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-muted">{t('nav.pause')}</p>
        <p className="font-display text-[19px] leading-tight font-extrabold">
          {active ? `${t('ps.until', { time: formatTime(new Date(open.endsAt)) })} · ${mmss((new Date(open.endsAt).getTime() - now) / 1000)}` : mine ? t('ps.tileWaiting') : t('ps.tileWrite')}
        </p>
      </div>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-muted/70" />
    </CardLink>
  )
}

/** Кадр дня: отсчёт, «твой ход» или «оба открыты» - пока сегодняшний день живой. */
export function ShotTile({ today }: { today: string }) {
  const t = useT()
  const pair = usePair()
  const shots = useShots()
  const now = useNow(1000)
  const day = shots.data?.find((d) => d.day === today)
  if (!day) return null
  const state = shotState(day.sentAt, now)
  const mine = day.posted.includes(pair.userId)
  const theirs = day.posted.includes(pair.partnerId)
  if (state.kind === 'closed' || (mine && !theirs)) return null

  const text = !mine
    ? state.kind === 'open'
      ? t('sh.tileOpen', { left: mmss(state.secondsLeft) })
      : theirs
        ? t('sh.tilePartner', { name: pair.partnerName })
        : t('sh.tileLate')
    : t('sh.tileBoth')
  const content = <span className="font-display text-[19px] leading-tight font-extrabold">{text}</span>
  return (
    <CardLink to="/shots" className="flex items-center gap-3 p-4">
      <IconBadge icon={Camera} tone="sky" size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-muted">{t('nav.shots')}</p>
        {state.kind === 'open' && !mine ? <Sparkles count={3}>{content}</Sparkles> : <p>{content}</p>}
      </div>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-muted/70" />
    </CardLink>
  )
}

/** Своё лекарство, время которого прошло, а приём не отмечен - отметить прямо отсюда. */
export function MedsTile({ today }: { today: string }) {
  const t = useT()
  const pair = usePair()
  const since = shiftDays(today, -14)
  const health = useHealth(since)
  const toggle = useToggleDose(since)
  const now = useNow(60_000)
  const clock = formatClock(new Date(now))
  const due = (health.data?.meds ?? [])
    .filter((m) => m.userId === pair.userId && activeOn(m, today))
    .flatMap((m) => m.times.filter((slot) => slot <= clock).map((slot) => ({ m, slot })))
    .filter(({ m, slot }) => !(health.data?.doses ?? []).includes(doseKey(m.id, today, slot)))
  if (due.length === 0) return null
  return (
    <div className="flex flex-col gap-2 rounded-3xl bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <IconBadge icon={Pill} tone="teal" size="sm" />
        <p className="min-w-0 flex-1 text-[15px] font-semibold">{t('hl.dueNow')}</p>
      </div>
      {due.slice(0, 3).map(({ m, slot }) => (
        <button
          key={`${m.id}-${slot}`}
          type="button"
          onClick={() => toggle.mutate({ medId: m.id, day: today, slot, taken: true })}
          className="flex items-center gap-3 rounded-2xl bg-raised px-3 py-2.5 text-left active:scale-[0.98]"
        >
          <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-muted">{slot}</span>
          <span className="min-w-0 flex-1 truncate">
            {m.name}
            {m.dose ? <span className="text-muted"> · {m.dose}</span> : null}
          </span>
          <span className="flex size-8 items-center justify-center rounded-full bg-tone-green-soft text-tone-green">
            <Check size={16} strokeWidth={3} aria-label={t('hl.take')} />
          </span>
        </button>
      ))}
    </div>
  )
}

/** «HH:MM» по местному времени - так хранится расписание приёма. */
function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Малыш: когда было последнее кормление и идёт ли сон. */
export function BabyTile({ today }: { today: string }) {
  const t = useT()
  const has = useHasBaby()
  const d = fromLocalISO(today)
  d.setDate(d.getDate() - 2)
  const data = useBaby(d.toISOString(), has.data === true)
  const now = useNow(60_000)
  if (has.data !== true) return null
  const events = data.data?.events ?? []
  const lastFeed = events.find((e) => e.kind === 'feed')
  const sleeping = events.find((e) => e.kind === 'sleep' && e.endedAt === null)
  const name = data.data?.babies[0]?.name ?? t('bb.noName')
  return (
    <CardLink to="/baby" className="flex items-center gap-3 p-4">
      <IconBadge icon={Milk} tone="teal" size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-muted">{name}</p>
        <p className="font-display text-[19px] leading-tight font-extrabold">
          {sleeping
            ? t('bb.tileSleeping', { time: sinceLabel((now - new Date(sleeping.startedAt).getTime()) / 60_000) })
            : lastFeed
              ? (now - new Date(lastFeed.startedAt).getTime()) / 60_000 < 1
                ? t('bb.lastFeedNow')
                : t('bb.lastFeed', { ago: sinceLabel((now - new Date(lastFeed.startedAt).getTime()) / 60_000) })
              : t('bb.tileStart')}
        </p>
      </div>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-muted/70" />
    </CardLink>
  )
}
