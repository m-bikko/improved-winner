import { useMemo, type ReactNode } from 'react'
import {
  CalendarHeart,
  ChevronRight,
  Droplet,
  Flame,
  HeartHandshake,
  HeartPulse,
  Mic,
  Images,
  ListChecks,
  Lock,
  MessageCircleHeart,
  MessagesSquare,
  NotebookPen,
  Scale,
  Smile,
  TriangleAlert,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { formatDayMonth, formatTime, formatWeekdayDate, fromLocalISO, todayLocal } from '@/lib/date'
import { Loading } from '@/ui/States'
import { CardLink } from '@/ui/Card'
import { Sparkles } from '@/ui/Sparkles'
import { IconBadge } from '@/ui/IconBadge'
import { Tag } from '@/ui/Chip'
import { Avatar, personTone } from '@/ui/Avatar'
import { AnimatedNumber } from '@/ui/AnimatedNumber'
import { motion } from 'motion/react'
import type { Tone } from '@/ui/tones'
import { useCheckins, useStreaks } from '@/features/checkin/api'
import { STATE_BY_ID } from '@/features/checkin/states'
import { dynamicKey, useT, type Key } from '@/lib/i18n'
import { useCycleDays, useCycleSettings, useCycleShared, useLutealOf, usePeriods } from '@/features/cycle/api'
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
import { useAnswers, useProgress } from '@/features/question/api'
import { dayOf } from '@/features/question/logic'
import { useChallenges } from '@/features/challenges/api'
import { marked, statusOf } from '@/features/challenges/logic'
import { iconOf } from '@/features/challenges/presets'
import { useMemories, useMemoryUrls } from '@/features/memories/api'
import { onThisDay } from '@/features/memories/logic'
import { ProgressiveImage } from '@/ui/ProgressiveImage'
import { TONE_CLASS } from '@/ui/tones'
import { useMeetings } from '@/features/meetings/api'
import { nextMeeting, stateOf } from '@/features/meetings/logic'
import { useVoiceNotes } from '@/features/voice/api'
import { useActivePregnancy } from '@/features/pregnancy/api'
import { BabyTile, MedsTile, PauseTile, ShotTile } from './Extras'
import { gestation } from '@/features/pregnancy/logic'

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
    // -mt-10: заголовок на одной строке с шапкой, а не под пустой полосой
    <div className="mx-auto -mt-10 flex max-w-2xl flex-col gap-3 px-4">
      <Hero
        today={today}
        name={myName}
        partnerName={partnerName}
        myTone={personTone(userId, ids)}
        partnerTone={personTone(partnerId, ids)}
        together={together}
      />

      {/* Срочное и живое сейчас - выше всего, и его чаще всего нет */}
      <PauseTile />

      <Meeting today={today} />

      <ShotTile today={today} />

      <Voice userId={userId} partnerName={partnerName} />

      <QuickActions />

      <NudgeButton />

      <MedsTile today={today} />

      <BabyTile today={today} />

      {/* Еда - выше настроения: записей в дневнике за месяц на порядок больше */}
      <Food
        totals={sumEntries(myDay.data ?? [])}
        goals={goalsFor(me)}
        partnerName={partnerName}
        partnerTone={personTone(partnerId, ids)}
        partnerEaten={theirDay.data ? sumEntries(theirDay.data).kcal : null}
      />

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

      <Question userId={userId} partnerId={partnerId} partnerName={partnerName} today={today} />

      <Tasks tasks={tasks.data ?? []} today={today} />

      <Challenges
        userId={userId}
        partnerId={partnerId}
        myTone={personTone(userId, ids)}
        partnerTone={personTone(partnerId, ids)}
        today={today}
      />

      {/* Две короткие плашки рядом: у каждой одно крупное число, и в полную
          ширину они были бы строкой текста в огромной рамке. Если видна
          только одна, она занимает всю ширину */}
      <div className="grid grid-cols-2 gap-3 empty:hidden [&>*:only-child]:col-span-2">
        <Cycle userId={userId} partnerId={partnerId} partnerName={partnerName} />
        <NextDate list={dates.data ?? []} />
      </div>

      <Reply reply={reply.data ?? null} userId={userId} partnerName={partnerName} />

      <ThisDay today={today} />

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
 * Крупный заголовок экрана: дата и приветствие.
 *
 * Здесь была декоративная карточка с сиянием, и она съедала полтора сантиметра
 * над всем, что человек открыл посмотреть. Заголовок несёт то же самое и уступает
 * место, уходя под шапку при прокрутке.
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
    <header className="flex items-center gap-3 pb-1">
      <div className="min-w-0 flex-1">
        {/* Не formatDayLabel: он вернёт «Сегодня», а так уже называется сам
            раздел - вышло бы слово «Сегодня» дважды подряд. Здесь нужна дата */}
        <p className="text-[13px] font-semibold text-muted first-letter:uppercase">
          {formatWeekdayDate(fromLocalISO(today))}
        </p>
        <h1 className="font-display text-[28px] leading-[1.14] font-extrabold tracking-[-0.02em]">
          {t(greetingKey(new Date().getHours()))},<br />
          {name}
        </h1>
      </div>
      <PairMark name={name} partnerName={partnerName} myTone={myTone} partnerTone={partnerTone} together={together} />
    </header>
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
    <nav aria-label={t('today.quick')} className="grid grid-cols-3 gap-3">
      {items.map((a) => (
        <CardLink key={a.key} to={a.to} className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 px-2 py-2.5">
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
              <Flame size={12} aria-hidden />
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
  const pregnancy = useActivePregnancy()
  const settings = useCycleSettings()
  const shared = useCycleShared(partnerId)
  const mine = usePeriods(userId)
  const theirs = usePeriods(partnerId)

  const own = settings.data?.trackingEnabled ?? false
  const periods = own ? (mine.data ?? []) : shared.data === true ? (theirs.data ?? []) : null
  // Лютеиновая фаза владелицы цикла, а не того, кто смотрит
  const luteal = useLutealOf(own ? userId : partnerId, own)
  // Тот же кэш, что у раздела цикла: тест на овуляцию сдвигает фазу,
  // и без него плитка разошлась бы с экраном, на который ведёт
  const days = useCycleDays(own ? userId : shared.data === true ? partnerId : '')

  // Беременность - вместо дня цикла: «день 45, задержка» здесь был бы неправдой
  if (pregnancy) {
    const g = gestation(pregnancy.lmp, todayLocal())
    return (
      <MiniTile
        to="/pregnancy"
        icon={HeartPulse}
        tone="plum"
        title={t('nav.pregnancy')}
        value={t('pg.weekN', { n: g.week })}
        caption={g.week >= 4 ? t(dynamicKey('preg.size', String(Math.min(g.week, 40)))) : t('pg.dayN', { n: g.day + 1 })}
        sparkle={g.day === 0}
      />
    )
  }

  if (periods === null || periods.length === 0) return null

  const lhDates = (days.data ?? []).filter((d) => d.lhPositive).map((d) => d.date)
  const state = cycleDay(periods, todayLocal(), luteal, lhDates)
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

/**
 * Вопрос дня: сам вопрос и чей ход. Тот же кэш, что у раздела, - ответ,
 * данный там, здесь виден сразу.
 */
function Question({
  userId,
  partnerId,
  partnerName,
  today,
}: {
  userId: string
  partnerId: string
  partnerName: string
  today: string
}) {
  const t = useT()
  const answers = useAnswers()
  const progress = useProgress()
  if (!answers.data || !progress.data) return null

  const day = dayOf(today, userId, answers.data, progress.data)
  const both = day.mine !== null && day.partnerAnswered
  const status = both
    ? t('qd.tile.open')
    : day.mine
      ? t('qd.tile.waiting', { name: partnerName })
      : day.partnerAnswered
        ? t('qd.tile.partnerReady', { name: partnerName })
        : t('qd.tile.first')

  return (
    <Tile to="/question" icon={MessageCircleHeart} tone="violet" title={t('nav.question')}>
      <p className="line-clamp-2 text-[15px] leading-snug font-semibold">
        {day.question ? t(dynamicKey('q', day.question.id)) : t('qd.unknown')}
      </p>
      <p
        className={`mt-1.5 flex items-center gap-1.5 text-sm ${
          // Второй уже ответил, а ты нет - это зов, а не справка: акцентом
          !day.mine && day.partnerAnswered ? 'font-semibold text-accent' : 'text-muted'
        }`}
      >
        {!both && partnerId !== '' && <Lock size={14} aria-hidden className="shrink-0" />}
        <span className="truncate">{status}</span>
      </p>
    </Tile>
  )
}

/**
 * Идущие челленджи: у каждого две точки цветами людей - кто уже отметился
 * сегодня. Нет идущих - нет плашки.
 */
function Challenges({
  userId,
  partnerId,
  myTone,
  partnerTone,
  today,
}: {
  userId: string
  partnerId: string
  myTone: Tone
  partnerTone: Tone
  today: string
}) {
  const t = useT()
  const challenges = useChallenges()
  const active = (challenges.data ?? []).filter((c) => statusOf(c, today) === 'active')
  if (active.length === 0) return null

  return (
    <Tile to="/challenges" icon={Trophy} tone="green" title={t('nav.challenges')}>
      <ul className="flex flex-col gap-2">
        {active.slice(0, 3).map((c) => {
          const Icon = iconOf(c.icon)
          const mine = marked(c, userId, today)
          return (
            <li key={c.id} className="flex items-center gap-2.5">
              <Icon size={17} aria-hidden className="shrink-0 text-tone-green" />
              <span className={`min-w-0 flex-1 truncate text-[15px] ${mine ? 'text-muted' : 'font-medium'}`}>{c.title}</span>
              <span className="flex shrink-0 gap-1">
                <Dot on={mine} tone={myTone} />
                {partnerId !== '' && <Dot on={marked(c, partnerId, today)} tone={partnerTone} />}
              </span>
            </li>
          )
        })}
      </ul>
    </Tile>
  )
}

/** Точка человека: залита - отметился сегодня, контур - ещё нет. */
function Dot({ on, tone }: { on: boolean; tone: Tone }) {
  return (
    <span
      aria-hidden
      className={`size-3 rounded-full ring-2 ring-inset ${on ? TONE_CLASS[tone].solid : 'bg-transparent'} ${
        tone === 'sky' ? 'ring-tone-sky' : 'ring-tone-rose'
      }`}
    />
  )
}

/**
 * «В этот день»: воспоминание того же числа из прошлых лет. Только когда
 * оно есть - пустая плашка «сегодня вспомнить нечего» ничего не даёт.
 */
function ThisDay({ today }: { today: string }) {
  const t = useT()
  const memories = useMemories()
  const past = onThisDay(memories.data ?? [], today)[0]
  const photo = past?.memory.photos[0]
  const urls = useMemoryUrls(photo ? [photo.thumbPath] : [])
  if (!past) return null

  return (
    <Tile to="/memories" icon={Images} tone="rose" title={t('mem.today')}>
      <div className="flex items-center gap-3">
        {photo && (
          <ProgressiveImage
            src={urls.data?.[photo.thumbPath]}
            placeholder={photo.placeholder}
            alt=""
            className="size-16 shrink-0 rounded-2xl"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-muted">
            {t('mem.ago', { n: past.yearsAgo, unit: t.plural('unit.year', past.yearsAgo) })}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[15px] font-medium">
            {past.memory.caption ?? past.memory.place ?? formatDayMonth(fromLocalISO(past.memory.happenedOn))}
          </p>
        </div>
      </div>
    </Tile>
  )
}

/**
 * До встречи: крупное число дней (меньше трёх - искрится) или «вы вместе».
 * Нет встречи на горизонте - нет плашки.
 */
function Meeting({ today }: { today: string }) {
  const t = useT()
  const meetings = useMeetings()
  const next = nextMeeting(meetings.data ?? [], today)
  if (!next) return null
  const state = stateOf(next, today)
  const value =
    state.kind === 'upcoming'
      ? `${state.days} ${t.plural('unit.day', state.days)}`
      : state.kind === 'now'
        ? t('mt.dayOf', { n: state.day, of: state.of })
        : ''
  return (
    <CardLink to="/meetings" className="relative flex items-center gap-3 overflow-hidden p-4">
      <IconBadge icon={HeartHandshake} tone="rose" size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-muted">{state.kind === 'now' ? t('mt.together') : t('mt.until')}</p>
        {state.kind === 'upcoming' && state.days <= 3 ? (
          <Sparkles count={4} className="mt-0.5">
            <span className="font-display text-[24px] leading-tight font-extrabold">{value}</span>
          </Sparkles>
        ) : (
          <p className="mt-0.5 font-display text-[24px] leading-tight font-extrabold">{value}</p>
        )}
      </div>
      <span className="shrink-0 text-right text-[13px] text-muted">
        {formatDayMonth(fromLocalISO(next.startsOn))}
        {next.place ? <span className="block max-w-28 truncate">{next.place}</span> : null}
      </span>
    </CardLink>
  )
}

/** Новое голосовое от второго - пока не прослушано. */
function Voice({ userId, partnerName }: { userId: string; partnerName: string }) {
  const t = useT()
  const notes = useVoiceNotes()
  const fresh = (notes.data ?? []).filter((n) => n.authorId !== userId && n.listenedAt === null)
  if (fresh.length === 0) return null
  return (
    <CardLink to="/voice" className="flex items-center gap-3 p-4">
      <span className="relative">
        <IconBadge icon={Mic} tone="violet" size="md" />
        <span aria-hidden className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-accent ring-2 ring-surface" />
      </span>
      <p className="min-w-0 flex-1 text-[15px] font-semibold">
        {t('vc.fromPartner', { name: partnerName })}
        {fresh.length > 1 && <span className="ml-1 text-muted">· {fresh.length}</span>}
      </p>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-muted/70" />
    </CardLink>
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
      // Меньше недели до праздника - число начинает искриться
      sparkle={next.days <= 7}
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
  sparkle = false,
}: {
  to: string
  icon: LucideIcon
  tone: Tone
  title: string
  value: string
  caption: string
  sparkle?: boolean
}) {
  return (
    <CardLink to={to} className="flex min-w-0 flex-col p-4">
      <span className="flex items-center gap-2">
        <IconBadge icon={icon} tone={tone} size="sm" />
        <span className="min-w-0 truncate text-[13px] font-semibold text-muted">{title}</span>
      </span>
      {sparkle ? (
        // Звёзды выходят за край числа - обёртка не должна их обрезать,
        // поэтому truncate у самого текста, а не у обёртки
        <Sparkles count={4} colors={['var(--t-teal)', 'var(--t-amber)', 'var(--c-accent)']} className="mt-3 max-w-full self-start">
          <span className="truncate font-display text-[22px] leading-tight font-extrabold">{value}</span>
        </Sparkles>
      ) : (
        <span className="mt-3 truncate font-display text-[22px] leading-tight font-extrabold">{value}</span>
      )}
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

