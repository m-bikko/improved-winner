import { useMemo, useState } from 'react'
import { Check, Flame, Trash2 } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { useProfiles } from '@/features/profile/api'
import { formatDayLabel, todayLocal } from '@/lib/date'
import { plural } from '@/lib/plural'
import { Button } from '@/ui/Button'
import {
  useCheckins,
  useDeleteCheckin,
  useRestorable,
  useRestoreDay,
  useSaveCheckin,
  useStreaks,
} from './api'
import type { Restorable } from './api'
import {
  GROUP_LABELS,
  STATES,
  STATE_BY_ID,
  STATE_GROUPS,
  type Checkin,
} from './states'

/**
 * «Как ты сегодня» - ежедневный опрос, который видят оба.
 *
 * В отличие от раздела цикла здесь общее по умолчанию, и это не недосмотр:
 * вопрос имеет смысл ровно потому, что ответ увидит второй. Живя порознь,
 * узнать «сегодня вымотан и болит голова» иначе неоткуда - разве что
 * спросить, а спрашивают не каждый день.
 *
 * Свой ответ правится, чужой только читается. Это держит база, а не форма.
 *
 * Огонёк - число дней подряд. Он тут не ради игры: вопрос «как ты» ценен
 * привычкой, а не отдельным ответом, и видимая серия - единственное, что
 * эту привычку показывает. Отсюда же и восстановление: серия, оборвавшаяся
 * из-за одного забытого вечера, перестаёт что-либо значить, и человек
 * бросает. Два раза в месяц - чтобы прощение осталось прощением.
 */
export function CheckinPage() {
  const userId = useUserId()
  const profiles = useProfiles()
  const all = useCheckins()
  const today = todayLocal()
  const streaks = useStreaks(today)
  const restorable = useRestorable(today)

  const partner = profiles.data?.find((p) => p.userId !== userId)
  const me = profiles.data?.find((p) => p.userId === userId)

  const mine = all.data?.find((c) => c.userId === userId && c.date === today)
  const theirs = all.data?.find((c) => c.userId === partner?.userId && c.date === today)

  const [editing, setEditing] = useState(false)

  if (all.isPending || profiles.isPending) {
    return <p className="px-4 py-10 text-center text-muted">Загрузка…</p>
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <p className="px-1 text-sm text-muted">{formatDayLabel(today)}</p>

      {editing || !mine ? (
        <Editor
          date={today}
          current={mine ?? null}
          onDone={() => setEditing(false)}
          onCancel={mine ? () => setEditing(false) : null}
        />
      ) : (
        <Card
          title={`Я${me?.nickname ? ` - ${me.nickname}` : ''}`}
          checkin={mine}
          streak={streaks.data?.[userId] ?? 0}
          onEdit={() => setEditing(true)}
        />
      )}

      <Card
        title={partner?.nickname ?? 'Партнёр'}
        checkin={theirs ?? null}
        streak={partner ? (streaks.data?.[partner.userId] ?? 0) : 0}
        onEdit={null}
      />

      <Missed days={restorable.data ?? []} today={today} />

      <History all={all.data ?? []} userId={userId} partnerName={partner?.nickname ?? 'Партнёр'} />
    </div>
  )
}

function Card({
  title,
  checkin,
  streak,
  onEdit,
}: {
  title: string
  checkin: Checkin | null
  streak: number
  onEdit: (() => void) | null
}) {
  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-baseline gap-2 font-medium">
          {title}
          {streak > 0 && <Streak days={streak} />}
        </p>
        {onEdit && (
          <button type="button" onClick={onEdit} className="text-sm text-accent underline">
            Изменить
          </button>
        )}
      </div>

      {!checkin ? (
        <p className="mt-2 text-sm text-muted">Сегодня ещё не отмечался.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {checkin.states.map((id) => {
              const def = STATE_BY_ID[id]
              if (!def) return null
              const Icon = def.icon
              return (
                <span
                  key={id}
                  className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-sm ring-1 ring-line"
                >
                  <Icon size={15} aria-hidden />
                  {def.label}
                </span>
              )
            })}
          </div>
          {checkin.note && <p className="mt-3 text-sm text-muted">{checkin.note}</p>}
        </>
      )}
    </section>
  )
}

/**
 * Огонёк с числом.
 *
 * Число рядом с иконкой, а не только иконка: «горит» и «горит двенадцатый
 * день» - разные вещи, и вторая как раз и есть то, что жалко потерять.
 */
function Streak({ days }: { days: number }) {
  return (
    <span
      className="flex items-baseline gap-1 text-sm text-accent"
      title={`${days} ${plural(days, 'день', 'дня', 'дней')} подряд`}
    >
      <Flame size={14} aria-hidden className="self-center" />
      {days}
    </span>
  )
}

/**
 * Пропущенные дни за неделю с возможностью вернуть огонёк.
 *
 * Показываем и когда попытки кончились: молча спрятать кнопку - значит
 * оставить человека гадать, почему вчера она была, а сегодня нет.
 */
function Missed({ days, today }: { days: Restorable[]; today: string }) {
  const restore = useRestoreDay(today)
  const [error, setError] = useState<string | null>(null)

  if (days.length === 0) return null

  const left = days[0]?.monthLeft ?? 0

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">Пропущенные дни</p>
        <p className="text-sm text-muted">
          {left > 0
            ? `${left} ${plural(left, 'восстановление', 'восстановления', 'восстановлений')} в этом месяце`
            : 'в этом месяце восстановлений не осталось'}
        </p>
      </div>

      {days.map((d) => (
        <div key={d.date} className="flex items-center justify-between gap-3">
          <p className="text-sm">{formatDayLabel(d.date)}</p>
          {d.monthLeft > 0 ? (
            <button
              type="button"
              disabled={restore.isPending}
              onClick={() => {
                setError(null)
                restore.mutate(d.date, {
                  onError: (e) => setError(e instanceof Error ? e.message : String(e)),
                })
              }}
              className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-sm
                         text-accent ring-1 ring-line disabled:opacity-50"
            >
              <Flame size={14} aria-hidden />
              Восстановить
            </button>
          ) : (
            <span className="text-sm text-muted">-</span>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  )
}

function Editor({
  date,
  current,
  onDone,
  onCancel,
}: {
  date: string
  current: Checkin | null
  onDone: () => void
  onCancel: (() => void) | null
}) {
  const save = useSaveCheckin()
  const remove = useDeleteCheckin()
  const [states, setStates] = useState<string[]>(current?.states ?? [])
  const [note, setNote] = useState(current?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  // Функциональное обновление: React батчит быстрые нажатия, и чтение
  // состояния из замыкания посчитало бы три тапа подряд от одного значения.
  const toggle = (id: string) => {
    setStates((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const empty = states.length === 0 && note.trim() === ''

  const submit = async () => {
    setError(null)
    try {
      // База пустую отметку не принимает, и это правильно. Поэтому «сохранить
      // пустое» превращается в удаление строки, а не в ошибку в лицо.
      if (empty) {
        if (current) await remove.mutateAsync(date)
      } else {
        await save.mutateAsync({ date, states, note: note || null })
      }
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <p className="font-medium">Как ты сегодня?</p>

      {STATE_GROUPS.map((group) => (
        <div key={group} className="flex flex-col gap-2">
          <p className="text-sm text-muted">{GROUP_LABELS[group]}</p>
          <div className="flex flex-wrap gap-2">
            {STATES.filter((s) => s.group === group).map((s) => {
              const active = states.includes(s.id)
              const Icon = s.icon
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm transition-colors ${
                    active ? 'bg-accent text-accent-ink' : 'bg-raised text-ink ring-1 ring-line'
                  }`}
                >
                  <Icon size={15} aria-hidden />
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">Словами</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="необязательно"
          className="w-full min-w-0 resize-none rounded-xl bg-bg px-4 py-3 ring-1 ring-line
                     outline-none focus:ring-2 focus:ring-accent placeholder:text-muted"
        />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button onClick={() => void submit()} loading={save.isPending || remove.isPending}>
        <Check size={18} aria-hidden />
        {empty && current ? 'Стереть отметку' : 'Сохранить'}
      </Button>

      {onCancel && (
        <button type="button" onClick={onCancel} className="text-sm text-muted underline">
          Отмена
        </button>
      )}

      {current && !empty && (
        <Button
          variant="danger"
          loading={remove.isPending}
          onClick={() => void remove.mutateAsync(date).then(onDone)}
        >
          <Trash2 size={18} aria-hidden />
          Стереть отметку
        </Button>
      )}
    </section>
  )
}

/**
 * Прошлые дни - по дате, оба ответа рядом.
 *
 * Рядом, а не двумя списками: смысл в сопоставлении. «У неё третий день
 * подряд болит голова, а я не заметил» видно только так.
 */
function History({
  all,
  userId,
  partnerName,
}: {
  all: Checkin[]
  userId: string
  partnerName: string
}) {
  const today = todayLocal()
  const days = useMemo(() => {
    const set = [...new Set(all.map((c) => c.date))].filter((d) => d !== today).sort().reverse()
    return set.slice(0, 30)
  }, [all, today])

  if (days.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm text-muted">Прошлые дни</h2>
      {days.map((date) => {
        const mine = all.find((c) => c.date === date && c.userId === userId)
        const theirs = all.find((c) => c.date === date && c.userId !== userId)
        return (
          <div key={date} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <p className="text-sm font-medium">{formatDayLabel(date)}</p>
            <Row label="Я" checkin={mine ?? null} />
            <Row label={partnerName} checkin={theirs ?? null} />
          </div>
        )
      })}
    </section>
  )
}

function Row({ label, checkin }: { label: string; checkin: Checkin | null }) {
  return (
    <div className="mt-2">
      <p className="text-xs text-muted">{label}</p>
      {!checkin ? (
        <p className="text-sm text-muted">-</p>
      ) : (
        <p className="text-sm">
          {checkin.states.map((id) => STATE_BY_ID[id]?.label).filter(Boolean).join(', ') || '-'}
          {checkin.note && <span className="text-muted"> · {checkin.note}</span>}
        </p>
      )}
    </div>
  )
}
