import { useState } from 'react'
import { BellOff, Moon, Send, Smartphone } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { Loading } from '@/ui/States'
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
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-3 pb-10">
      <QuietHours quietFrom={me?.quietFrom ?? null} quietTo={me?.quietTo ?? null} />

      <section className="rounded-2xl bg-surface ring-1 ring-line">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-sm font-medium">Что присылать</p>
          <div className="flex shrink-0 gap-3 text-muted">
            <Send size={15} aria-hidden />
            <Smartphone size={15} aria-hidden />
          </div>
        </div>

        <ul>
          {NOTIFICATION_KINDS.map((kind) => {
            const c = current(kind.id)
            return (
              <li
                key={kind.id}
                className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{kind.label}</p>
                  <p className="truncate text-xs text-muted">{kind.hint}</p>
                </div>
                <div className="flex shrink-0 gap-3">
                  <Box
                    on={c.telegram}
                    label={`${kind.label}: телеграм`}
                    onClick={() => toggle(kind.id, 'telegram')}
                  />
                  <Box
                    on={c.push}
                    label={`${kind.label}: push`}
                    onClick={() => toggle(kind.id, 'push')}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {muted > 0 && (
        <p className="flex items-start gap-2 px-1 text-sm text-muted">
          <BellOff size={15} aria-hidden className="mt-0.5 shrink-0" />
          Полностью выключено: {muted}. Всё, о чём молчат уведомления, остаётся
          в приложении - ничего не теряется.
        </p>
      )}
    </div>
  )
}

/**
 * Флажок канала.
 *
 * Не переключатель-«тумблер»: их тут двадцать два, и тумблеры такой плотности
 * читаются как забор. Квадрат с галочкой на этом расстоянии понятнее.
 */
function Box({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`size-6 rounded-md ring-1 transition-colors ${
        on ? 'bg-accent ring-accent' : 'bg-bg ring-line'
      }`}
    />
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
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Moon size={16} aria-hidden />
          Тихие часы
        </p>
        <Box
          on={enabled}
          label="Тихие часы"
          onClick={() => (enabled ? save.mutate({ from: null, to: null }) : apply(from, to))}
        />
      </div>

      {enabled && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Hour value={from} onChange={(v) => apply(v, to)} label="Начало тихих часов" />
          <span className="text-muted">—</span>
          <Hour value={to} onChange={(v) => apply(from, v)} label="Конец тихих часов" />
        </div>
      )}

      <p className="mt-3 text-xs text-muted">
        В эти часы уведомления не приходят вовсе - они не копятся и не придут
        позже. Всё, что в них было, лежит в приложении.
      </p>
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
      className="rounded-xl bg-bg px-3 py-2 ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
    >
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, '0')}:00
        </option>
      ))}
    </select>
  )
}
