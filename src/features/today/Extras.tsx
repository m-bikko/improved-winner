import { Camera, Check, Milk, Pill, Wind } from 'lucide-react'
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
import { IconBadge } from '@/ui/IconBadge'
import { ListRow } from '@/ui/List'

/**
 * Строки блока «сейчас» на главной. Правило то же, что у остальных:
 * те же хуки и кэш, что у разделов, и пустых строк нет - строка есть,
 * только когда есть что сделать или увидеть сейчас.
 */

/** Пауза идёт или закончилась и ждёт строк - это важнее всего остального. */
export function PauseRow() {
  const t = useT()
  const pair = usePair()
  const pauses = usePauses()
  const now = useNow(1000)
  const open = pauses.data?.find((p) => p.closedAt === null)
  if (!open) return null
  const active = new Date(open.endsAt).getTime() > now
  const mine = open.notes.some((n) => n.userId === pair.userId)
  return (
    <ListRow
      to="/pause"
      icon={Wind}
      tone="sky"
      title={t('nav.pause')}
      subtitle={
        active
          ? `${t('ps.until', { time: formatTime(new Date(open.endsAt)) })} · ${mmss((new Date(open.endsAt).getTime() - now) / 1000)}`
          : mine
            ? t('ps.tileWaiting')
            : t('ps.tileWrite')
      }
    />
  )
}

/** Кадр дня: отсчёт, «твой ход» или «оба открыты» - пока сегодняшний день живой. */
export function ShotRow({ today }: { today: string }) {
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
  return <ListRow to="/shots" icon={Camera} tone="sky" title={t('nav.shots')} subtitle={text} />
}

/** Своё лекарство, время которого прошло, а приём не отмечен - отметить прямо отсюда. */
export function MedsRows({ today }: { today: string }) {
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
    <>
      {due.slice(0, 3).map(({ m, slot }) => (
        <button
          key={`${m.id}-${slot}`}
          type="button"
          onClick={() => toggle.mutate({ medId: m.id, day: today, slot, taken: true })}
          className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-200
                     active:bg-raised active:duration-0 [--sep:3.5625rem]"
        >
          <IconBadge icon={Pill} tone="teal" size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px]">
              {m.name}
              {m.dose ? <span className="text-muted"> · {m.dose}</span> : null}
            </span>
            <span className="block truncate text-[13px] text-muted tabular-nums">
              {t('hl.dueNow')} · {slot}
            </span>
          </span>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Check size={18} strokeWidth={3} aria-label={t('hl.take')} />
          </span>
        </button>
      ))}
    </>
  )
}

/** «HH:MM» по местному времени - так хранится расписание приёма. */
function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Малыш: когда было последнее кормление и идёт ли сон. */
export function BabyRow({ today }: { today: string }) {
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
    <ListRow
      to="/baby"
      icon={Milk}
      tone="teal"
      title={name}
      subtitle={
        sleeping
          ? t('bb.tileSleeping', { time: sinceLabel((now - new Date(sleeping.startedAt).getTime()) / 60_000) })
          : lastFeed
            ? (now - new Date(lastFeed.startedAt).getTime()) / 60_000 < 1
              ? t('bb.lastFeedNow')
              : t('bb.lastFeed', { ago: sinceLabel((now - new Date(lastFeed.startedAt).getTime()) / 60_000) })
            : t('bb.tileStart')
      }
    />
  )
}
