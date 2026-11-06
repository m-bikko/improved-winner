import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
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
  Plus,
  Scale,
  TriangleAlert,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { formatDayMonth, formatTime, formatWeekdayDate, fromLocalISO, todayLocal } from '@/lib/date'
import { Loading } from '@/ui/States'
import { Card, CardLink } from '@/ui/Card'
import { Avatar, personTone } from '@/ui/Avatar'
import { AnimatedNumber } from '@/ui/AnimatedNumber'
import { ListGroup, ListRow } from '@/ui/List'
import { TONE_CLASS, type Tone } from '@/ui/tones'
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
import { useMeetings } from '@/features/meetings/api'
import { nextMeeting, stateOf } from '@/features/meetings/logic'
import { useVoiceNotes } from '@/features/voice/api'
import { useActivePregnancy } from '@/features/pregnancy/api'
import { BabyRow, MedsRows, PauseRow, ShotRow } from './Extras'
import { gestation } from '@/features/pregnancy/logic'

/**
 * «Сегодня» - первый экран приложения.
 *
 * Разделов сорок, и чтобы понять, как идёт день, раньше нужно было обойти
 * их все. Здесь собрано только то, что меняется за день, а порядок следует вопросу
 * «что мне сейчас делать»: сначала то, что ждёт ответа, потом еда, потом мы двое,
 * потом сводка строками.
 *
 * Самые частые действия стоят там, к чему относятся, а не отдельным рядом плиток:
 * «+» в карточке еды (десять раз в день), отметка в строке со своим именем,
 * «Думаю о тебе» под именем второго, взвешивание в строке веса.
 *
 * Ни одного нового запроса к базе, кроме последнего ответа в теме: всё
 * остальное уже спрашивают сами разделы, и TanStack отдаёт тот же кэш.
 * Считать это заново в отдельной выборке значило бы завести второй источник
 * правды - и однажды показать на главной не то, что внутри.
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

  return (
    // Заголовок на одной строке с шапкой, а не под пустой полосой
    <div className="mx-auto -mt-[43px] flex max-w-2xl flex-col gap-4 px-4">
      <Hero today={today} name={myName} />

      {/* Срочное и живое сейчас - выше всего, и его чаще всего нет.
          Нет ни одной строки - нет и группы */}
      <ListGroup className="empty:hidden">
        <PauseRow />
        <ShotRow today={today} />
        <VoiceRow userId={userId} partnerName={partnerName} />
        <MedsRows today={today} />
        <BabyRow today={today} />
      </ListGroup>

      {/* Еда - выше настроения: записей в дневнике за месяц на порядок больше */}
      <Food
        totals={sumEntries(myDay.data ?? [])}
        goals={goalsFor(me)}
        partnerName={partnerName}
        partnerTone={personTone(partnerId, ids)}
        partnerEaten={theirDay.data ? sumEntries(theirDay.data).kcal : null}
      />

      <Us
        today={today}
        userId={userId}
        partnerId={partnerId}
        myName={myName}
        partnerName={partnerName}
        ids={ids}
        checkins={checkins.data ?? []}
        streaks={streaks.data ?? {}}
      />

      {/* Сводка одной группой: у каждой строки одно значение справа, и глаз идёт
          по одной вертикали, а не по шести карточкам разной формы */}
      <ListGroup>
        <MeetingRow today={today} />
        <ListRow
          to="/profile?weigh=1"
          icon={Scale}
          tone="slate"
          title={t('today.quick.weigh')}
          trailing={me?.weightKg != null ? <Value>{`${me.weightKg} ${t('unit.kg')}`}</Value> : undefined}
        />
        <CycleRow userId={userId} partnerId={partnerId} partnerName={partnerName} />
        <NextDateRow list={dates.data ?? []} />
      </ListGroup>

      <Question userId={userId} partnerId={partnerId} partnerName={partnerName} today={today} />

      <Tasks tasks={tasks.data ?? []} today={today} />

      <Challenges
        userId={userId}
        partnerId={partnerId}
        myTone={personTone(userId, ids)}
        partnerTone={personTone(partnerId, ids)}
        today={today}
      />

      <ThisDay today={today} />

      <ListGroup className="empty:hidden">
        <ReplyRow reply={reply.data ?? null} userId={userId} partnerName={partnerName} />
      </ListGroup>

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

/** Крупный заголовок экрана: дата и приветствие. Уступает место, уходя под шапку. */
function Hero({ today, name }: { today: string; name: string }) {
  const t = useT()
  return (
    <header className="pr-11">
      {/* Не formatDayLabel: он вернёт «Сегодня», а так уже называется сам
          раздел - вышло бы слово «Сегодня» дважды подряд. Здесь нужна дата */}
      <p className="text-[13px] leading-[18px] font-medium text-muted first-letter:uppercase">
        {formatWeekdayDate(fromLocalISO(today))}
      </p>
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
        {t(greetingKey(new Date().getHours()))}, {name}
      </h1>
    </header>
  )
}

/** Какой приём пищи сейчас - на него и откроется добавление. */
function mealNow(hour: number): Meal {
  if (hour < 11) return 'breakfast'
  if (hour < 16) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}

/** Шеврон строки-ссылки: один на весь экран, чтобы все строки заканчивались одинаково. */
function Chevron() {
  return <ChevronRight size={16} strokeWidth={2.6} aria-hidden className="-mr-1 shrink-0 text-muted/45" />
}

/**
 * Заголовок карточки: значок и название цветом раздела, как в «Здоровье».
 * Цвет называет раздел, а квадратная подложка рядом с крупным числом была бы лишней.
 */
function TileHead({ icon: Icon, tone, title, chevron = true }: { icon: LucideIcon; tone: Tone; title: string; chevron?: boolean }) {
  const fg = TONE_CLASS[tone].fg
  return (
    <div className="flex min-h-5 items-center gap-1.5">
      <Icon size={17} strokeWidth={2.3} aria-hidden className={`shrink-0 ${fg}`} />
      <span className={`min-w-0 flex-1 truncate text-[15px] leading-5 font-semibold ${fg}`}>{title}</span>
      {chevron && <Chevron />}
    </div>
  )
}

/** Карточка-ссылка главной: заголовок раздела и содержимое. */
function Tile({
  to,
  icon,
  tone,
  title,
  children,
}: {
  to: string
  icon: LucideIcon
  tone: Tone
  title: string
  children: ReactNode
}) {
  return (
    <CardLink to={to} className="p-4">
      <TileHead icon={icon} tone={tone} title={title} />
      <div className="mt-2">{children}</div>
    </CardLink>
  )
}

/**
 * Мы двое: как каждый сегодня и «Думаю о тебе».
 *
 * Своя строка без отметки зовёт цветом: это единственное здесь, что ждёт действия.
 * Состояния - строкой через запятую: чипы занимали по три ряда и не давали ничего,
 * кроме шума, потому что здесь их не выбирают, а читают.
 */
function Us({
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

  const person = (name: string, who: string, own: boolean) => {
    const entry = checkins.find((c) => c.userId === who && c.date === today)
    const states = (entry?.states ?? []).filter((id) => STATE_BY_ID[id]).map((id) => t(dynamicKey('state', id)))
    const detail = entry
      ? states.length > 0
        ? states.join(', ')
        : entry.note || '-'
      : t(own ? 'today.notMarkedYou' : 'today.notMarkedPartner')
    return (
      <Link
        key={who}
        to="/checkin"
        className="flex min-h-[3.75rem] items-center gap-3 px-4 py-2 transition-colors duration-200 active:bg-raised active:duration-0 [--sep:4rem]"
      >
        <Avatar name={name} tone={personTone(who, ids)} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[17px] font-medium">{name}</span>
            {(streaks[who] ?? 0) > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-tone-orange tabular-nums">
                <Flame size={13} aria-hidden />
                {streaks[who]}
              </span>
            )}
          </span>
          <span
            className={`block truncate text-[13px] first-letter:uppercase ${
              own && !entry ? 'font-medium text-accent' : 'text-muted'
            }`}
          >
            {detail}
          </span>
        </span>
        <Chevron />
      </Link>
    )
  }

  return (
    <section aria-label={t('today.howAreWe')}>
      <ListGroup>
        {person(myName, userId, true)}
        {partnerId !== '' && person(partnerName, partnerId, false)}
        <NudgeButton />
      </ListGroup>
    </section>
  )
}

/**
 * Еда: сколько съедено, сколько осталось и «+».
 *
 * «+» лежит поверх карточки-ссылки, а не внутри неё: ссылка в ссылке - недопустимая
 * разметка, поэтому сама карточка растянута ссылкой на весь размер, содержимое её
 * не перехватывает, а кнопка стоит слоем выше.
 */
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
    <Card as="section" className="relative p-4">
      <Link
        to="/diary"
        aria-label={t('today.food')}
        className="absolute inset-0 rounded-3xl transition-colors duration-200 active:bg-raised active:duration-0"
      />
      <div className="pointer-events-none relative">
        <div className="pr-9">
          <TileHead icon={NotebookPen} tone="amber" title={t('today.food')} chevron={false} />
        </div>

        <div className="mt-3 flex items-center gap-3.5">
          {goals && (
            <div className="relative shrink-0" aria-hidden>
              <RingArc size={68} ratio={ratio} />
              <span className="absolute inset-0 flex items-center justify-center text-[15px] font-semibold tabular-nums">
                <AnimatedNumber value={Math.round(ratio * 100)} format={(n) => `${Math.round(n)}%`} />
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[28px] leading-[34px] font-bold tabular-nums">
              <AnimatedNumber value={eaten} />
              {goals !== null && <span className="text-[17px] font-medium text-muted"> / {Math.round(goals.kcal)}</span>}
            </p>
            <p className={`truncate text-[15px] leading-5 ${over ? 'text-danger' : 'text-muted'}`}>
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
          <p className="mt-3.5 flex items-center gap-2 border-t-[0.5px] border-line pt-3 text-[15px] text-muted">
            <Avatar name={partnerName} tone={partnerTone} size="sm" />
            <span className="truncate">{partnerName}</span>
            <span className="ml-auto shrink-0 text-ink tabular-nums">
              {Math.round(partnerEaten)} {t('unit.kcal')}
            </span>
          </p>
        )}
      </div>

      <Link
        to={`/diary?add=${mealNow(new Date().getHours())}`}
        aria-label={`${t('common.add')}: ${t('today.food')}`}
        className="absolute top-1 right-1 flex size-11 items-center justify-center"
      >
        <span className="flex size-[30px] items-center justify-center rounded-full bg-accent text-accent-ink transition-opacity active:opacity-60 active:duration-0">
          <Plus size={20} strokeWidth={2.6} aria-hidden />
        </span>
      </Link>
    </Card>
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
      <p className="mb-1 truncate text-[13px] leading-4 tabular-nums">
        <span className={`font-semibold ${text}`}>{label}</span>{' '}
        <span className="text-muted">
          {Math.round(value)}/{Math.round(goal)}
        </span>
      </p>
      <div className="h-1 overflow-hidden rounded-full bg-raised">
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
  // Пустая карточка «ничего не назначено» только удлиняла экран
  if (open.length === 0 && overdue === 0) return null

  return (
    <Tile to="/tasks" icon={ListChecks} tone="sky" title={t('today.tasks')}>
      {open.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {open.slice(0, 3).map((o) => (
            <li key={`${o.task.id}-${o.at.toISOString()}`} className="flex items-center gap-2.5 text-[15px]">
              <span aria-hidden className="size-[18px] shrink-0 rounded-full ring-[1.5px] ring-muted/50 ring-inset" />
              <span className="min-w-0 flex-1 truncate">{o.task.title}</span>
              <span className="shrink-0 text-[13px] text-muted tabular-nums">{formatTime(o.at)}</span>
            </li>
          ))}
          {open.length > 3 && (
            <li className="pl-7 text-[13px] text-muted">{t('today.andMore', { n: open.length - 3 })}</li>
          )}
        </ul>
      )}
      {overdue > 0 && (
        <p className={`flex items-center gap-1.5 text-[15px] font-medium text-danger ${open.length > 0 ? 'mt-2.5' : ''}`}>
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
function CycleRow({
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
      <ListRow
        to="/pregnancy"
        icon={HeartPulse}
        tone="plum"
        title={t('nav.pregnancy')}
        subtitle={g.week >= 4 ? t(dynamicKey('preg.size', String(Math.min(g.week, 40)))) : t('pg.dayN', { n: g.day + 1 })}
        trailing={<Value>{t('pg.weekN', { n: g.week })}</Value>}
      />
    )
  }

  if (periods === null || periods.length === 0) return null

  const lhDates = (days.data ?? []).filter((d) => d.lhPositive).map((d) => d.date)
  const state = cycleDay(periods, todayLocal(), luteal, lhDates)
  if (!state) return null

  return (
    <ListRow
      to="/cycle"
      icon={Droplet}
      tone="plum"
      title={own ? t('today.cycle') : t('today.cycleOf', { name: partnerName })}
      subtitle={t(dynamicKey('phase', state.phase))}
      trailing={<Value>{t('cyc.dayN', { n: state.day })}</Value>}
    />
  )
}

/** Значение в конце строки сводки: главное в строке, поэтому чёрным и полужирным. */
function Value({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-ink tabular-nums">{children}</span>
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
      <p className="line-clamp-2 text-[17px] leading-[22px] font-semibold">
        {day.question ? t(dynamicKey('q', day.question.id)) : t('qd.unknown')}
      </p>
      <p
        className={`mt-1 flex items-center gap-1.5 text-[13px] ${
          // Второй уже ответил, а ты нет - это зов, а не справка: акцентом
          !day.mine && day.partnerAnswered ? 'font-semibold text-accent' : 'text-muted'
        }`}
      >
        {!both && partnerId !== '' && <Lock size={13} aria-hidden className="shrink-0" />}
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
              <Icon size={17} aria-hidden className="shrink-0 text-muted" />
              <span className={`min-w-0 flex-1 truncate text-[15px] ${mine ? 'text-muted' : ''}`}>{c.title}</span>
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
      className={`size-3 rounded-full ring-[1.5px] ring-inset ${on ? TONE_CLASS[tone].solid : 'bg-transparent'} ${
        tone === 'sky' ? 'ring-tone-sky-solid' : 'ring-tone-rose-solid'
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
            className="size-14 shrink-0 rounded-xl"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted">
            {t('mem.ago', { n: past.yearsAgo, unit: t.plural('unit.year', past.yearsAgo) })}
          </p>
          <p className="line-clamp-2 text-[17px] leading-[22px]">
            {past.memory.caption ?? past.memory.place ?? formatDayMonth(fromLocalISO(past.memory.happenedOn))}
          </p>
        </div>
      </div>
    </Tile>
  )
}

/** До встречи: сколько дней или «вы вместе». Нет встречи на горизонте - нет строки. */
function MeetingRow({ today }: { today: string }) {
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
  const date = formatDayMonth(fromLocalISO(next.startsOn))
  return (
    <ListRow
      to="/meetings"
      icon={HeartHandshake}
      tone="rose"
      title={state.kind === 'now' ? t('mt.together') : t('mt.until')}
      subtitle={next.place ? `${date} · ${next.place}` : date}
      trailing={value ? <Value>{value}</Value> : undefined}
    />
  )
}

/** Новое голосовое от второго - пока не прослушано. */
function VoiceRow({ userId, partnerName }: { userId: string; partnerName: string }) {
  const t = useT()
  const notes = useVoiceNotes()
  const fresh = (notes.data ?? []).filter((n) => n.authorId !== userId && n.listenedAt === null)
  if (fresh.length === 0) return null
  return (
    <ListRow
      to="/voice"
      icon={Mic}
      tone="violet"
      title={t('vc.fromPartner', { name: partnerName })}
      trailing={
        <span className="flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[13px] leading-5 font-semibold text-accent-ink tabular-nums">
          {fresh.length}
        </span>
      }
    />
  )
}

function NextDateRow({ list }: { list: { title: string; days: number }[] }) {
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
    <ListRow
      to="/dates"
      icon={CalendarHeart}
      tone="teal"
      title={next.title}
      subtitle={t('today.nextDate')}
      trailing={<Value>{value}</Value>}
    />
  )
}

function ReplyRow({
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
    <ListRow
      to={`/topics/${reply.topicId}`}
      icon={MessagesSquare}
      tone="indigo"
      title={reply.topicTitle}
      subtitle={`${t('today.lastReply')} · ${mine ? t('today.you') : partnerName} · ${when}`}
    />
  )
}
