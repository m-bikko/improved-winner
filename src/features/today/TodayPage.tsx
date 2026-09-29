import { useMemo, type ReactNode } from 'react'
import {
  CalendarHeart,
  ChevronRight,
  Droplet,
  Flame,
  ListChecks,
  MessagesSquare,
  NotebookPen,
  Scale,
  Smile,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { formatDayMonth, formatTime, formatWeekdayDate, fromLocalISO, todayLocal } from '@/lib/date'
import { Loading } from '@/ui/States'
import { CardLink } from '@/ui/Card'
import { IconBadge } from '@/ui/IconBadge'
import { Tag } from '@/ui/Chip'
import { Avatar, personTone } from '@/ui/Avatar'
import { AnimatedNumber } from '@/ui/AnimatedNumber'
import { motion } from 'motion/react'
import type { Tone } from '@/ui/tones'
import { useCheckins, useStreaks } from '@/features/checkin/api'
import { STATE_BY_ID } from '@/features/checkin/states'
import { dynamicKey, useT, type Key } from '@/lib/i18n'
import { DEFAULT_SETTINGS, useCycleSettings, useCycleShared, usePeriods } from '@/features/cycle/api'
import { cycleDay } from '@/features/cycle/cycle'
import { useOccasions } from '@/features/dates/api'
import { useDiaryDay } from '@/features/diary/api'
import { RingArc, isOver, ratioOf } from '@/features/diary/CalorieRing'
import { sumEntries, type Meal } from '@/features/diary/types'
import type { Macros } from '@/lib/nutrition'
import { goalsFor, useProfiles } from '@/features/profile/api'
import { useTasks } from '@/features/tasks/api'
import { occurrencesOn } from '@/features/tasks/TasksCalendar'
import { useLastReply } from './api'
import { NudgeButton } from './NudgeButton'
import { GratitudeTile } from '@/features/gratitude/GratitudeTile'

/**
 * «Сегодня» - первый экран приложения.
 *
 * Разделов девять, и чтобы понять, как идёт день, раньше нужно было обойти
 * их все. Здесь собрано только то, что меняется за день, и каждая плашка -
 * ссылка в свой раздел: экран отвечает на вопрос «что происходит», а не
 * заменяет собой разделы.
 *
 * Ни одного нового запроса к базе, кроме последнего ответа в теме: всё
 * остальное уже спрашивают сами разделы, и TanStack отдаёт тот же кэш.
 * Считать это заново в отдельной выборке значило бы завести второй источник
 * правды - и однажды показать на главной не то, что внутри.
 *
 * Быстрые действия - тоже ссылки, а не формы: они открывают раздел сразу
 * на нужном действии. Главная, на которой правят данные, быстро превращается
 * в десятый раздел.
 */
export function TodayPage() {
  const t = useT()
  const userId = useUserId()
  const today = todayLocal()

  const profiles = useProfiles()
  const me = profiles.data?.find((p) => p.userId === userId)
  const partner = profiles.data?.find((p) => p.userId !== userId)
  const partnerId = partner?.userId ?? ''
  const ids = (profiles.data ?? []).map((p) => p.userId)

  const checkins = useCheckins()
  const streaks = useStreaks(today)
  const myDay = useDiaryDay(today, userId)
  const theirDay = useDiaryDay(today, partnerId)
  const tasks = useTasks()
  const dates = useOccasions(today)
  const reply = useLastReply()

  if (profiles.isPending) return <Loading />

  const myName = me?.nickname ?? t('diary.me')
  const partnerName = partner?.nickname ?? t('partner')
  const marked = new Set(
    (checkins.data ?? []).filter((c) => c.date === today).map((c) => c.userId),
  )
  const together = partnerId !== '' && marked.has(userId) && marked.has(partnerId)

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Hero
        today={today}
        name={myName}
        partnerName={partnerName}
        myTone={personTone(userId, ids)}
        partnerTone={personTone(partnerId, ids)}
        together={together}
      />

      <NudgeButton />

      <QuickActions />

      <Mood
        today={today}
        userId={userId}
        partnerId={partnerId}
        myName={myName}
        partnerName={partnerName}
        ids={ids}
        checkins={checkins.data ?? []}
        streaks={streaks.data ?? {}}
      />

      <Food
        totals={sumEntries(myDay.data ?? [])}
        goals={goalsFor(me)}
        partnerName={partnerName}
        partnerTone={personTone(partnerId, ids)}
        partnerEaten={theirDay.data ? sumEntries(theirDay.data).kcal : null}
      />

      <Tasks tasks={tasks.data ?? []} today={today} />

      {/* Две короткие плашки рядом: у каждой одно крупное число, и в полную
          ширину они были бы строкой текста в огромной рамке. Если видна
          только одна, она занимает всю ширину */}
      <div className="grid grid-cols-2 gap-3 empty:hidden [&>*:only-child]:col-span-2">
        <Cycle userId={userId} partnerId={partnerId} partnerName={partnerName} />
        <NextDate list={dates.data ?? []} />
      </div>

      <Reply reply={reply.data ?? null} userId={userId} partnerName={partnerName} />

      {/* Внизу, а не вверху: экран отвечает на «что сейчас», а благодарность -
          это то, что делают, дочитав. Наверху она требовала бы действия
          раньше, чем человек увидел день */}
      <GratitudeTile partnerName={partnerName} />
    </div>
  )
}

/** Приветствие по времени суток: ночь до пяти утра, как её и понимают. */
function greetingKey(hour: number): Key {
  if (hour < 5) return 'greet.night'
  if (hour < 12) return 'greet.morning'
  if (hour < 18) return 'greet.day'
  if (hour < 23) return 'greet.evening'
  return 'greet.night'
}

/** CSS-переменная тона - для SVG и градиентов, куда классы Tailwind не дотянутся. */
function toneVar(tone: Tone): string {
  return tone === 'accent' ? 'var(--c-accent)' : `var(--t-${tone})`
}

/**
 * Приветствие на цветном «сиянии» двух тонов пары.
 *
 * Пятна медленно дрейфуют - экран, с которого начинается день, не должен
 * выглядеть бланком. Двигается только transform градиентов без blur-фильтра:
 * это делает композитор, и батарею такой фон не ест.
 */
function Hero({
  today,
  name,
  partnerName,
  myTone,
  partnerTone,
  together,
}: {
  today: string
  name: string
  partnerName: string
  myTone: Tone
  partnerTone: Tone
  together: boolean
}) {
  const t = useT()
  return (
    <section className="relative isolate flex items-center gap-3 overflow-hidden rounded-[28px] bg-surface py-5 pr-4 pl-5 shadow-card">
      <div aria-hidden className="aurora">
        <span style={{ background: `radial-gradient(closest-side, ${toneVar(myTone)}, transparent)` }} />
        <span style={{ background: `radial-gradient(closest-side, ${toneVar(partnerTone)}, transparent)` }} />
        <span style={{ background: 'radial-gradient(closest-side, var(--c-accent), transparent)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[22px] leading-tight font-extrabold tracking-tight">
          {t(greetingKey(new Date().getHours()))}, {name}
        </p>
        {/* Не formatDayLabel: он вернёт «Сегодня», а так уже называется сам
            раздел - вышло бы слово «Сегодня» дважды подряд. Здесь нужна дата */}
        <p className="mt-1 text-sm font-medium text-muted first-letter:uppercase">
          {formatWeekdayDate(fromLocalISO(today))}
        </p>
      </div>
      <PairMark
        name={name}
        partnerName={partnerName}
        myTone={myTone}
        partnerTone={partnerTone}
        together={together}
      />
    </section>
  )
}

/**
 * Двое - два сцепленных кольца, как в знаке приложения.
 *
 * Середина, где кольца пересекаются, загорается, когда сегодня отметились
 * оба: общее у двоих живёт в пересечении. Пока отметился один или никто,
 * она пустая - без упрёка, просто не зажжена.
 */
function PairMark({
  name,
  partnerName,
  myTone,
  partnerTone,
  together,
}: {
  name: string
  partnerName: string
  myTone: Tone
  partnerTone: Tone
  together: boolean
}) {
  const t = useT()
  const R = 21
  const A = 28
  const B = 60
  const letter = (s: string): string => s.trim().charAt(0).toUpperCase() || '?'
  const rings = [
    { cx: A, tone: myTone, text: letter(name), dx: -4 },
    { cx: B, tone: partnerTone, text: letter(partnerName), dx: 4 },
  ]
  return (
    <svg
      viewBox="0 0 88 52"
      className="h-[52px] w-[88px] shrink-0 overflow-visible"
      role="img"
      aria-label={`${name}, ${partnerName}${together ? ` · ${t('today.bothMarked')}` : ''}`}
    >
      <defs>
        <clipPath id="pair-lens">
          <circle cx={A} cy={26} r={R} />
        </clipPath>
      </defs>
      {rings.map((r) => (
        <circle key={r.cx} cx={r.cx} cy={26} r={R} style={{ fill: `var(--t-${r.tone}-soft)` }} />
      ))}
      <motion.circle
        cx={B}
        cy={26}
        r={R}
        clipPath="url(#pair-lens)"
        style={{ fill: 'var(--c-accent)' }}
        // С нуля при каждом открытии: зажечься на глазах - в этом и смысл
        initial={{ opacity: 0 }}
        animate={{ opacity: together ? 1 : 0 }}
        transition={{ duration: 0.5, delay: together ? 0.35 : 0 }}
      />
      {rings.map((r) => (
        <circle
          key={r.cx}
          cx={r.cx}
          cy={26}
          r={R}
          fill="none"
          strokeWidth={2.5}
          style={{ stroke: toneVar(r.tone) }}
        />
      ))}
      {rings.map((r) => (
        <text
          key={r.cx}
          x={r.cx + r.dx}
          y={26}
          dy="0.36em"
          textAnchor="middle"
          className="font-display text-[17px] font-extrabold"
          style={{ fill: toneVar(r.tone) }}
        >
          {r.text}
        </text>
      ))}
    </svg>
  )
}

/** Какой приём пищи сейчас - на него и откроется добавление. */
function mealNow(hour: number): Meal {
  if (hour < 11) return 'breakfast'
  if (hour < 16) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}

function QuickActions() {
  const t = useT()
  const items: { to: string; key: Key; icon: LucideIcon; tone: Tone }[] = [
    { to: `/diary?add=${mealNow(new Date().getHours())}`, key: 'today.quick.food', icon: NotebookPen, tone: 'amber' },
    { to: '/checkin', key: 'today.quick.checkin', icon: Smile, tone: 'violet' },
    { to: '/profile?weigh=1', key: 'today.quick.weigh', icon: Scale, tone: 'slate' },
  ]
  return (
    <nav aria-label={t('today.quick')} className="grid grid-cols-3 gap-2.5">
      {items.map((a) => (
        <CardLink key={a.key} to={a.to} className="flex flex-col items-center gap-1.5 px-2 py-3">
          <IconBadge icon={a.icon} tone={a.tone} size="md" />
          <span className="truncate text-[13px] font-semibold">{t(a.key)}</span>
        </CardLink>
      ))}
    </nav>
  )
}

/**
 * Плашка-ссылка главной: значок раздела, заголовок, шеврон и содержимое.
 */
function Tile({
  to,
  icon,
  tone,
  title,
  children,
  className = '',
}: {
  to: string
  icon: LucideIcon
  tone: Tone
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <CardLink to={to} className={`p-4 ${className}`}>
      <div className="flex items-center gap-2.5">
        <IconBadge icon={icon} tone={tone} size="sm" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</span>
        <ChevronRight size={18} aria-hidden className="shrink-0 text-muted/70" />
      </div>
      <div className="mt-3">{children}</div>
    </CardLink>
  )
}

function Mood({
  today,
  userId,
  partnerId,
  myName,
  partnerName,
  ids,
  checkins,
  streaks,
}: {
  today: string
  userId: string
  partnerId: string
  myName: string
  partnerName: string
  ids: string[]
  checkins: { userId: string; date: string; states: string[]; note: string | null }[]
  streaks: Record<string, number>
}) {
  const t = useT()
  const mine = checkins.find((c) => c.userId === userId && c.date === today)
  const theirs = checkins.find((c) => c.userId === partnerId && c.date === today)

  const side = (name: string, who: string, entry: typeof mine, own: boolean) => {
    const states = (entry?.states ?? []).filter((id) => STATE_BY_ID[id])
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <p className="flex items-center gap-2 text-sm">
          <Avatar name={name} tone={personTone(who, ids)} size="sm" />
          <span className="truncate font-semibold">{name}</span>
          {(streaks[who] ?? 0) > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-accent">
              {/* Огонёк чуть «горит» - серия живая, пока её держат */}
              <Flame size={12} aria-hidden className="flicker" />
              {streaks[who]}
            </span>
          )}
        </p>
        {entry ? (
          states.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {states.slice(0, 3).map((id) => (
                <Tag key={id} icon={STATE_BY_ID[id]?.icon}>
                  {t(dynamicKey('state', id))}
                </Tag>
              ))}
              {states.length > 3 && <Tag>+{states.length - 3}</Tag>}
            </div>
          ) : (
            <p className="line-clamp-2 text-sm text-muted">{entry.note || '-'}</p>
          )
        ) : (
          <p className="text-sm text-muted">{t(own ? 'today.notMarkedYou' : 'today.notMarkedPartner')}</p>
        )}
      </div>
    )
  }

  return (
    <Tile to="/checkin" icon={Smile} tone="violet" title={t('today.howAreWe')}>
      <div className="grid grid-cols-2 gap-4">
        {side(myName, userId, mine, true)}
        {side(partnerName, partnerId, theirs, false)}
      </div>
    </Tile>
  )
}

function Food({
  totals,
  goals,
  partnerName,
  partnerTone,
  partnerEaten,
}: {
  totals: Macros
  goals: Macros | null
  partnerName: string
  partnerTone: Tone
  partnerEaten: number | null
}) {
  const t = useT()
  const eaten = totals.kcal
  const left = goals === null ? null : Math.round(goals.kcal - eaten)
  const ratio = goals ? ratioOf(totals, goals) : 0
  const over = goals ? isOver(ratio) : false

  return (
    <Tile to="/diary" icon={NotebookPen} tone="amber" title={t('today.food')}>
      <div className="flex items-center gap-4">
        {goals && (
          <div className="relative shrink-0" aria-hidden>
            <RingArc size={64} ratio={ratio} />
            <span className="absolute inset-0 flex items-center justify-center font-display text-[13px] font-extrabold tabular-nums">
              <AnimatedNumber value={Math.round(ratio * 100)} format={(n) => `${Math.round(n)}%`} />
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-[28px] leading-none font-extrabold tabular-nums">
            <AnimatedNumber value={eaten} />
            {goals !== null && (
              <span className="text-base font-bold text-muted"> / {Math.round(goals.kcal)}</span>
            )}
          </p>
          <p className={`mt-1 truncate text-sm ${over ? 'text-danger' : 'text-muted'}`}>
            {left === null
              ? t('unit.kcal')
              : left >= 0
                ? t('today.kcalLeft', { n: left })
                : t('today.kcalOver', { n: -left })}
          </p>
        </div>
      </div>

      {goals && (
        <div className="mt-3.5 grid grid-cols-3 gap-3">
          <MacroLine label={t('macro.p')} value={totals.protein} goal={goals.protein} bar="bg-protein" text="text-protein" />
          <MacroLine label={t('macro.f')} value={totals.fat} goal={goals.fat} bar="bg-fat" text="text-fat" />
          <MacroLine label={t('macro.c')} value={totals.carbs} goal={goals.carbs} bar="bg-carbs" text="text-carbs" />
        </div>
      )}

      {partnerEaten !== null && (
        <p className="mt-3.5 flex items-center gap-2 border-t border-line pt-3 text-sm text-muted">
          <Avatar name={partnerName} tone={partnerTone} size="sm" />
          <span className="truncate">{partnerName}</span>
          <span className="ml-auto shrink-0 font-semibold text-ink tabular-nums">
            {Math.round(partnerEaten)} {t('unit.kcal')}
          </span>
        </p>
      )}
    </Tile>
  )
}

/** Макрос строкой: буква своим цветом, числа и полоска. Опознаётся по букве, не по цвету. */
function MacroLine({
  label,
  value,
  goal,
  bar,
  text,
}: {
  label: string
  value: number
  goal: number
  bar: string
  text: string
}) {
  const filled = goal > 0 ? Math.min(100, (value / goal) * 100) : 0
  const over = goal > 0 && value > goal
  return (
    <div className="min-w-0">
      <p className="mb-1 truncate text-xs tabular-nums">
        <span className={`font-semibold ${text}`}>{label}</span>{' '}
        <span className="text-muted">
          {Math.round(value)}/{Math.round(goal)}
        </span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div className={`h-full rounded-full ${over ? 'bg-danger' : bar}`} style={{ width: `${filled}%` }} />
      </div>
    </div>
  )
}

function Tasks({ tasks, today }: { tasks: Parameters<typeof occurrencesOn>[0]; today: string }) {
  const t = useT()
  const items = useMemo(() => occurrencesOn(tasks, today), [tasks, today])
  const open = items.filter((o) => o.task.doneAt === null)
  const overdue = useMemo(
    () =>
      tasks.filter(
        (t) => t.doneAt === null && t.dueAt !== null && t.dueAt < new Date().toISOString(),
      ).length,
    [tasks],
  )

  return (
    <Tile to="/tasks" icon={ListChecks} tone="sky" title={t('today.tasks')}>
      {open.length === 0 ? (
        <p className="text-sm text-muted">{t('today.noTasks')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {open.slice(0, 3).map((o) => (
            <li key={`${o.task.id}-${o.at.toISOString()}`} className="flex items-center gap-2.5 text-sm">
              <span aria-hidden className="size-4 shrink-0 rounded-full ring-2 ring-line ring-inset" />
              <span className="min-w-0 flex-1 truncate">{o.task.title}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">{formatTime(o.at)}</span>
            </li>
          ))}
          {open.length > 3 && (
            <li className="pl-6.5 text-sm text-muted">{t('today.andMore', { n: open.length - 3 })}</li>
          )}
        </ul>
      )}
      {overdue > 0 && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          <TriangleAlert size={15} aria-hidden />
          {t.plural('today.overdue', overdue).replace('{n}', String(overdue))}
        </p>
      )}
    </Tile>
  )
}

/**
 * День цикла - только если он вообще виден.
 *
 * Свой показываем при включённом отслеживании, партнёрский - только когда
 * она сама открыла доступ. Главный экран не имеет права быть обходным путём
 * к тому, что закрыто в разделе.
 */
function Cycle({
  userId,
  partnerId,
  partnerName,
}: {
  userId: string
  partnerId: string
  partnerName: string
}) {
  const t = useT()
  const settings = useCycleSettings()
  const shared = useCycleShared(partnerId)
  const mine = usePeriods(userId)
  const theirs = usePeriods(partnerId)

  const own = settings.data?.trackingEnabled ?? false
  const periods = own ? (mine.data ?? []) : shared.data === true ? (theirs.data ?? []) : null
  const luteal = settings.data?.lutealDays ?? DEFAULT_SETTINGS.lutealDays

  if (periods === null || periods.length === 0) return null

  const state = cycleDay(periods, todayLocal(), luteal)
  if (!state) return null

  return (
    <MiniTile
      to="/cycle"
      icon={Droplet}
      tone="plum"
      title={own ? t('today.cycle') : t('today.cycleOf', { name: partnerName })}
      value={t('cyc.dayN', { n: state.day })}
      caption={t(dynamicKey('phase', state.phase))}
    />
  )
}

function NextDate({ list }: { list: { title: string; days: number }[] }) {
  const t = useT()
  const next = list.find((o) => o.days <= 45)
  if (!next) return null

  const value =
    next.days === 0
      ? t('common.today')
      : next.days === 1
        ? t('common.tomorrow')
        : `${next.days} ${t.plural('unit.day', next.days)}`

  return (
    <MiniTile
      to="/dates"
      icon={CalendarHeart}
      tone="teal"
      title={t('today.nextDate')}
      value={value}
      caption={next.title}
    />
  )
}

/** Короткая плашка: одно крупное значение и подпись под ним. */
function MiniTile({
  to,
  icon,
  tone,
  title,
  value,
  caption,
}: {
  to: string
  icon: LucideIcon
  tone: Tone
  title: string
  value: string
  caption: string
}) {
  return (
    <CardLink to={to} className="flex min-w-0 flex-col p-4">
      <span className="flex items-center gap-2">
        <IconBadge icon={icon} tone={tone} size="sm" />
        <span className="min-w-0 truncate text-[13px] font-semibold text-muted">{title}</span>
      </span>
      <span className="mt-3 truncate font-display text-[22px] leading-tight font-extrabold">{value}</span>
      <span className="mt-0.5 line-clamp-2 text-sm text-muted">{caption}</span>
    </CardLink>
  )
}

function Reply({
  reply,
  userId,
  partnerName,
}: {
  reply: { topicId: string; topicTitle: string; authorId: string; createdAt: string } | null
  userId: string
  partnerName: string
}) {
  const t = useT()
  if (!reply) return null
  const mine = reply.authorId === userId
  const at = new Date(reply.createdAt)
  const when = `${formatDayMonth(at)}, ${formatTime(at)}`

  return (
    <Tile to={`/topics/${reply.topicId}`} icon={MessagesSquare} tone="indigo" title={t('today.lastReply')}>
      <p className="truncate text-[15px] font-medium">{reply.topicTitle}</p>
      <p className="mt-0.5 text-sm text-muted">
        {mine ? t('today.you') : partnerName} · {when}
      </p>
    </Tile>
  )
}

