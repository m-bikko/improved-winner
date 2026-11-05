import { dynamicKey, useT } from '@/lib/i18n'
import { useState } from 'react'
import { BellOff, Moon, Send, Smartphone } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { ListGroup, ListRow } from '@/ui/List'
import { Loading } from '@/ui/States'
import { Switch } from '@/ui/Switch'
import { useProfiles } from './api'
import { NOTIFICATION_KINDS } from './notifications'
import {
  useNotificationSettings,
  useSaveNotificationSetting,
  useSaveQuietHours,
  type ChannelSettings,
} from './notificationsApi'

const ON: ChannelSettings = { telegram: true, push: true }

/**
 * Что и куда присылать.
 *
 * Видов одиннадцать, и до этого экрана выключить нельзя было ни один.
 * Опаснее, чем кажется: человек, которого раздражает одно уведомление,
 * перестаёт читать все - и вместе с надоевшим пропускает срок задачи.
 *
 * Настройки персональные: партнёр не видит и не меняет, что приходит мне.
 */
export function NotificationsPage() {
  const t = useT()
  const userId = useUserId()
  const profiles = useProfiles()
  const settings = useNotificationSettings()
  const save = useSaveNotificationSetting()

  if (profiles.isPending || settings.isPending) return <Loading />

  const me = profiles.data?.find((p) => p.userId === userId)
  const current = (kind: string): ChannelSettings => settings.data?.[kind] ?? ON

  const toggle = (kind: string, channel: keyof ChannelSettings) => {
    const now = current(kind)
    save.mutate({ kind, ...now, [channel]: !now[channel] })
  }

  const muted = NOTIFICATION_KINDS.filter((k) => {
    const c = current(k.id)
    return !c.telegram && !c.push
  }).length

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <QuietHours quietFrom={me?.quietFrom ?? null} quietTo={me?.quietTo ?? null} />

      <ListGroup className="mt-2">
        {/* Шапка таблицы: значки каналов стоят ровно над своими столбцами
            переключателей (та же ширина, что у Switch, и тот же зазор).
            Раньше здесь были квадратные флажки - казалось, что двадцать
            восемь тумблеров читаются как забор. Но флажок на телефоне
            не опознаётся как «вкл/выкл», а тумблер опознаётся сразу; забор
            же разбирают столбцы, у каждого канала свой, со значком сверху */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="font-display text-[17px] font-bold">{t('notif.whatToSend')}</p>
          <div className="flex shrink-0 gap-2 text-muted">
            <span className="flex w-[50px] justify-center">
              <Send size={17} aria-hidden />
            </span>
            <span className="flex w-[50px] justify-center">
              <Smartphone size={17} aria-hidden />
            </span>
          </div>
        </div>

        {NOTIFICATION_KINDS.map((kind) => {
          const c = current(kind.id)
          return (
            <div key={kind.id} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[15px] leading-snug font-medium">{t(dynamicKey('notif', kind.id))}</p>
                <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">
                  {t(dynamicKey('notif', `${kind.id}.hint`))}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Switch
                  checked={c.telegram}
                  label={`${t(dynamicKey('notif', kind.id))}: Telegram`}
                  onChange={() => toggle(kind.id, 'telegram')}
                />
                <Switch
                  checked={c.push}
                  label={`${t(dynamicKey('notif', kind.id))}: push`}
                  onChange={() => toggle(kind.id, 'push')}
                />
              </div>
            </div>
          )
        })}
      </ListGroup>

      {muted > 0 && (
        <p className="flex items-start gap-2 px-1 text-[13px] text-muted">
          <BellOff size={15} aria-hidden className="mt-0.5 shrink-0" />
          {t('notif.mutedCount', { n: muted })}
        </p>
      )}
    </div>
  )
}

/**
 * Тихие часы.
 *
 * Уведомление в тихий час НЕ откладывается, а не приходит вовсе, и это
 * сказано прямо: отложенные вывалились бы кучей утром, а пачку из шести
 * сообщений никто не читает.
 */
function QuietHours({ quietFrom, quietTo }: { quietFrom: number | null; quietTo: number | null }) {
  const t = useT()
  const save = useSaveQuietHours()
  const enabled = quietFrom !== null && quietTo !== null
  const [from, setFrom] = useState(quietFrom ?? 22)
  const [to, setTo] = useState(quietTo ?? 8)

  const apply = (nextFrom: number, nextTo: number) => {
    setFrom(nextFrom)
    setTo(nextTo)
    save.mutate({ from: nextFrom, to: nextTo })
  }

  return (
    <section className="flex flex-col gap-2">
      <ListGroup>
        <ListRow
          static
          icon={Moon}
          tone="slate"
          title={t('notif.quiet')}
          trailing={
            <Switch
              checked={enabled}
              label={t('notif.quiet')}
              onChange={() => (enabled ? save.mutate({ from: null, to: null }) : apply(from, to))}
            />
          }
        />

        {enabled && (
          <div className="flex min-h-14 items-center gap-2 px-4 py-2.5">
            <Hour value={from} onChange={(v) => apply(v, to)} label={t('notif.quietFrom')} />
            <span className="text-muted" aria-hidden>
              —
            </span>
            <Hour value={to} onChange={(v) => apply(from, v)} label={t('notif.quietTo')} />
          </div>
        )}
      </ListGroup>

      {/* Подсказка под группой, а не внутри: как сноска в настройках iPhone -
          объясняет группу, но не спорит со строками за место */}
      <p className="px-4 text-[13px] leading-snug text-muted">{t('notif.quietHint')}</p>
    </section>
  )
}

function Hour({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (v: number) => void
  label: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={label}
      className="min-h-11 flex-1 rounded-2xl bg-raised px-4 text-center tabular-nums ring-1 ring-transparent outline-none
                 focus:bg-surface focus:ring-2 focus:ring-accent"
    >
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, '0')}:00
        </option>
      ))}
    </select>
  )
}
