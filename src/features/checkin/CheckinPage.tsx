import { useMemo, useState } from 'react'
import { Check, Flame, Pencil, Trash2 } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { useProfiles } from '@/features/profile/api'
import { formatDayLabel, todayLocal } from '@/lib/date'
import { dynamicKey, useT } from '@/lib/i18n'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Loading } from '@/ui/States'
import { Card as Surface, SectionTitle } from '@/ui/Card'
import { Chip, Tag } from '@/ui/Chip'
import { Avatar, personTone } from '@/ui/Avatar'
import { INPUT_CLASS } from '@/ui/Field'
import type { Tone } from '@/ui/tones'
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
  const t = useT()
  const userId = useUserId()
  const profiles = useProfiles()
  const all = useCheckins()
  const today = todayLocal()
  const streaks = useStreaks(today)
  const restorable = useRestorable(today)

  const partner = profiles.data?.find((p) => p.userId !== userId)
  const me = profiles.data?.find((p) => p.userId === userId)
  const ids = (profiles.data ?? []).map((p) => p.userId)
  const partnerName = partner?.nickname ?? t('partner')

  const mine = all.data?.find((c) => c.userId === userId && c.date === today)
  const theirs = all.data?.find((c) => c.userId === partner?.userId && c.date === today)

  const [editing, setEditing] = useState(false)

  if (all.isPending || profiles.isPending) {
    return <Loading />
  }

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
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
          title={me?.nickname ? t('checkin.meNamed', { name: me.nickname }) : t('checkin.me')}
          name={me?.nickname ?? t('checkin.me')}
          tone={personTone(userId, ids)}
          checkin={mine}
          streak={streaks.data?.[userId] ?? 0}
          onEdit={() => setEditing(true)}
        />
      )}

      <Card
        title={partnerName}
        name={partnerName}
        tone={personTone(partner?.userId ?? '', ids)}
        checkin={theirs ?? null}
        streak={partner ? (streaks.data?.[partner.userId] ?? 0) : 0}
        onEdit={null}
      />

      <Missed days={restorable.data ?? []} today={today} />

      <History
        all={all.data ?? []}
        userId={userId}
        partnerName={partnerName}
        myName={me?.nickname ?? t('checkin.me')}
        myTone={personTone(userId, ids)}
        partnerTone={personTone(partner?.userId ?? '', ids)}
      />
    </div>
  )
}

function Card({
  title,
  name,
  tone,
  checkin,
  streak,
  onEdit,
}: {
  title: string
  name: string
  tone: Tone
  checkin: Checkin | null
  streak: number
  onEdit: (() => void) | null
}) {
  const t = useT()
  return (
    <Surface as="section" className="p-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} tone={tone} size="md" />
        <p className="flex min-w-0 flex-1 items-center gap-2 font-display text-[17px] font-bold">
          <span className="truncate">{title}</span>
          {streak > 0 && <Streak days={streak} />}
        </p>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5
                       text-sm font-semibold text-accent-soft-ink transition-transform active:scale-95"
          >
            <Pencil size={14} aria-hidden />
            {t('common.edit')}
          </button>
        )}
      </div>

      {!checkin ? (
        <p className="mt-3 text-sm text-muted">{t('checkin.notYet')}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {checkin.states.map((id) => {
              const def = STATE_BY_ID[id]
              if (!def) return null
              return (
                <Tag key={id} icon={def.icon}>
                  {t(dynamicKey('state', id))}
                </Tag>
              )
            })}
          </div>
          {checkin.note && (
            <p className="mt-3 rounded-2xl bg-raised/60 px-3.5 py-2.5 text-sm">{checkin.note}</p>
          )}
        </>
      )}
    </Surface>
  )
}

/**
 * Огонёк с числом.
 *
 * Число рядом с иконкой, а не только иконка: «горит» и «горит двенадцатый
 * день» - разные вещи, и вторая как раз и есть то, что жалко потерять.
 */
function Streak({ days }: { days: number }) {
  const t = useT()
  return (
    <span
      className="flex shrink-0 items-center gap-0.5 rounded-full bg-accent-soft px-2 py-0.5 font-sans
                 text-[13px] font-bold text-accent-soft-ink"
      title={t('checkin.streak', { n: days, unit: t.plural('unit.day', days) })}
    >
      <Flame size={13} aria-hidden />
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
  const t = useT()
  const restore = useRestoreDay(today)
  const [error, setError] = useState<string | null>(null)

  if (days.length === 0) return null

  const left = days[0]?.monthLeft ?? 0

  return (
    <Surface as="section" className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-[17px] font-bold">{t('checkin.missed')}</p>
        <p className="text-sm text-muted">
          {left > 0
            ? t.plural('checkin.restoresLeft', left).replace('{n}', String(left))
            : t('checkin.noRestores')}
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
              className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5 text-sm
                         font-semibold text-accent-soft-ink transition-transform active:scale-95
                         disabled:opacity-50"
            >
              <Flame size={14} aria-hidden />
              {t('checkin.restore')}
            </button>
          ) : (
            <span className="text-sm text-muted">-</span>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-danger">{error}</p>}
    </Surface>
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
  const t = useT()
  const save = useSaveCheckin()
  const remove = useDeleteCheckin()
  const burst = useBurst()
  const [states, setStates] = useState<string[]>(current?.states ?? [])
  const [note, setNote] = useState(current?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  // Функциональное обновление: React батчит быстрые нажатия, и чтение
  // состояния из замыкания посчитало бы три тапа подряд от одного значения.
  const toggle = (id: string) => {
    setStates((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const empty = states.length === 0 && note.trim() === ''

  const submit = async (from: HTMLElement) => {
    setError(null)
    // Точка разлёта - до сохранения: после него форма закроется
    const r = from.getBoundingClientRect()
    try {
      // База пустую отметку не принимает, и это правильно. Поэтому «сохранить
      // пустое» превращается в удаление строки, а не в ошибку в лицо.
      if (empty) {
        if (current) await remove.mutateAsync(date)
      } else {
        await save.mutateAsync({ date, states, note: note || null })
        burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 'sparks')
      }
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <Surface as="section" className="flex flex-col gap-5 p-4">
        <p className="font-display text-xl font-extrabold tracking-tight">{t('checkin.question')}</p>

        {STATE_GROUPS.map((group) => (
          <div key={group} className="flex flex-col gap-2.5">
            <p className="text-[13px] font-semibold tracking-wide text-muted uppercase">
              {t(dynamicKey('checkinGroup', group))}
            </p>
            <div className="flex flex-wrap gap-2">
              {STATES.filter((s) => s.group === group).map((s) => (
                <Chip
                  key={s.id}
                  selected={states.includes(s.id)}
                  onClick={() => toggle(s.id)}
                  icon={s.icon}
                >
                  {t(dynamicKey('state', s.id))}
                </Chip>
              ))}
            </div>
          </div>
        ))}

        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold tracking-wide text-muted uppercase">
            {t('checkin.words')}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={t('common.optional')}
            className={`${INPUT_CLASS} min-w-0 resize-none`}
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        {(onCancel || (current && !empty)) && (
          <div className="flex flex-wrap items-center gap-2">
            {current && !empty && (
              <Button
                variant="danger"
                className="min-h-11 flex-1 text-sm"
                loading={remove.isPending}
                onClick={() => void remove.mutateAsync(date).then(onDone)}
              >
                <Trash2 size={17} aria-hidden />
                {t('checkin.erase')}
              </Button>
            )}
            {onCancel && (
              <Button variant="secondary" className="min-h-11 flex-1 text-sm" onClick={onCancel}>
                {t('common.cancel')}
              </Button>
            )}
          </div>
        )}
      </Surface>

      {/* Сохранение прилипает к низу над панелью вкладок. Раньше кнопка
          стояла под сорока чипами и полем заметки, и чтобы сохранить отметку,
          нужно было пролистать весь опрос - а выбирают обычно в первых двух
          группах */}
      <div className="sticky bottom-above-tabbar z-20">
        <div className="flex items-center gap-3 rounded-3xl bg-surface/90 p-2 pl-4 shadow-float backdrop-blur-xl">
          <span className="min-w-0 flex-1 truncate text-sm text-muted">
            {t('checkin.selected', { n: states.length })}
          </span>
          <Button
            className="min-h-11 shrink-0 px-6"
            onClick={(e) => void submit(e.currentTarget)}
            loading={save.isPending || remove.isPending}
          >
            <Check size={18} aria-hidden />
            {t(empty && current ? 'checkin.erase' : 'common.save')}
          </Button>
        </div>
      </div>
    </>
  )
}

/** Столько дней видно сразу; остальное - по кнопке, а не стеной. */
const HISTORY_STEP = 7

/**
 * Прошлые дни - по дате, оба ответа рядом.
 *
 * Рядом, а не двумя списками: смысл в сопоставлении. «У неё третий день
 * подряд болит голова, а я не заметил» видно только так.
 *
 * Состояния - чипами с иконками, а не строкой через запятую: тридцать дней
 * текстом читались как простыня, а иконка узнаётся раньше слова.
 */
function History({
  all,
  userId,
  partnerName,
  myName,
  myTone,
  partnerTone,
}: {
  all: Checkin[]
  userId: string
  partnerName: string
  myName: string
  myTone: Tone
  partnerTone: Tone
}) {
  const t = useT()
  const today = todayLocal()
  const [shown, setShown] = useState(HISTORY_STEP)
  const days = useMemo(() => {
    const set = [...new Set(all.map((c) => c.date))].filter((d) => d !== today).sort().reverse()
    return set.slice(0, 30)
  }, [all, today])

  if (days.length === 0) return null

  return (
    <section className="mt-2 flex flex-col gap-2.5">
      <SectionTitle>{t('checkin.pastDays')}</SectionTitle>
      {days.slice(0, shown).map((date) => {
        const mine = all.find((c) => c.date === date && c.userId === userId)
        const theirs = all.find((c) => c.date === date && c.userId !== userId)
        return (
          <Surface key={date} className="flex flex-col gap-3 p-4">
            <p className="text-sm font-semibold first-letter:uppercase">{formatDayLabel(date)}</p>
            <Row name={myName} tone={myTone} checkin={mine ?? null} />
            <Row name={partnerName} tone={partnerTone} checkin={theirs ?? null} />
          </Surface>
        )
      })}
      {shown < days.length && (
        <Button variant="secondary" onClick={() => setShown((n) => n + HISTORY_STEP * 2)}>
          {t('common.showMore')}
        </Button>
      )}
    </section>
  )
}

function Row({ name, tone, checkin }: { name: string; tone: Tone; checkin: Checkin | null }) {
  const t = useT()
  const states = (checkin?.states ?? []).filter((id) => STATE_BY_ID[id])
  return (
    <div className="flex gap-2.5">
      <Avatar name={name} tone={tone} size="sm" />
      <div className="min-w-0 flex-1 pt-0.5">
        {!checkin ? (
          <p className="text-sm text-muted">-</p>
        ) : (
          <>
            {states.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {states.map((id) => (
                  <Tag key={id} icon={STATE_BY_ID[id]?.icon}>
                    {t(dynamicKey('state', id))}
                  </Tag>
                ))}
              </div>
            )}
            {checkin.note && (
              <p className={`text-sm text-muted ${states.length > 0 ? 'mt-1.5' : ''}`}>{checkin.note}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
