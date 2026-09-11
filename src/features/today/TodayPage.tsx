import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarHeart,
  ChevronRight,
  Droplet,
  Flame,
  ListChecks,
  MessagesSquare,
  NotebookPen,
  Smile,
  TriangleAlert,
} from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { formatDayMonth, formatTime, formatWeekdayDate, fromLocalISO, todayLocal } from '@/lib/date'
import { Loading } from '@/ui/States'
import { useCheckins, useStreaks } from '@/features/checkin/api'
import { STATE_BY_ID } from '@/features/checkin/states'
import { dynamicKey, useT } from '@/lib/i18n'
import { DEFAULT_SETTINGS, useCycleSettings, useCycleShared, usePeriods } from '@/features/cycle/api'
import { cycleDay } from '@/features/cycle/cycle'
import { useOccasions } from '@/features/dates/api'
import { useDiaryDay } from '@/features/diary/api'
import { sumEntries } from '@/features/diary/types'
import { goalsFor, useProfiles } from '@/features/profile/api'
import { useTasks } from '@/features/tasks/api'
import { occurrencesOn } from '@/features/tasks/TasksCalendar'
import { useLastReply } from './api'
import { NudgeButton } from './NudgeButton'

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
 */
export function TodayPage() {
  const t = useT()
  const userId = useUserId()
  const today = todayLocal()

  const profiles = useProfiles()
  const me = profiles.data?.find((p) => p.userId === userId)
  const partner = profiles.data?.find((p) => p.userId !== userId)
  const partnerId = partner?.userId ?? ''

  const checkins = useCheckins()
  const streaks = useStreaks(today)
  const myDay = useDiaryDay(today, userId)
  const theirDay = useDiaryDay(today, partnerId)
  const tasks = useTasks()
  const dates = useOccasions(today)
  const reply = useLastReply()

  if (profiles.isPending) return <Loading />

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-3 pb-10">
      {/* Не formatDayLabel: он вернёт «Сегодня», а так уже называется сам
          раздел - вышло бы слово «Сегодня» дважды подряд. Здесь нужна дата */}
      <p className="px-1 text-sm text-muted">
        {formatWeekdayDate(fromLocalISO(today))}
      </p>

      <NudgeButton />

      <Mood
        today={today}
        userId={userId}
        partnerId={partnerId}
        myName={me?.nickname ?? t('diary.me')}
        partnerName={partner?.nickname ?? t('partner')}
        checkins={checkins.data ?? []}
        streaks={streaks.data ?? {}}
      />

      <Food
        eaten={sumEntries(myDay.data ?? []).kcal}
        goal={goalsFor(me)?.kcal ?? null}
        partnerName={partner?.nickname ?? t('partner')}
        partnerEaten={theirDay.data ? sumEntries(theirDay.data).kcal : null}
      />

      <Tasks tasks={tasks.data ?? []} today={today} />

      <Cycle userId={userId} partnerId={partnerId} partnerName={partner?.nickname ?? t('partner')} />

      <NextDate list={dates.data ?? []} />

      <Reply reply={reply.data ?? null} userId={userId} partnerName={partner?.nickname ?? t('partner')} />
    </div>
  )
}

function Tile({
  to,
  icon: Icon,
  title,
  children,
}: {
  to: string
  icon: typeof Smile
  title: string
  children: React.ReactNode
}) {
  return (
    <Link to={to} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Icon size={15} aria-hidden />
        {title}
        <ChevronRight size={15} aria-hidden className="ml-auto" />
      </div>
      <div className="mt-2">{children}</div>
    </Link>
  )
}

function Mood({
  today,
  userId,
  partnerId,
  myName,
  partnerName,
  checkins,
  streaks,
}: {
  today: string
  userId: string
  partnerId: string
  myName: string
  partnerName: string
  checkins: { userId: string; date: string; states: string[]; note: string | null }[]
  streaks: Record<string, number>
}) {
  const t = useT()
  const mine = checkins.find((c) => c.userId === userId && c.date === today)
  const theirs = checkins.find((c) => c.userId === partnerId && c.date === today)

  const side = (name: string, who: string, entry: typeof mine, own: boolean) => (
    <div className="min-w-0 flex-1">
      <p className="flex items-baseline gap-1.5 text-sm">
        <span className="truncate font-medium">{name}</span>
        {(streaks[who] ?? 0) > 0 && (
          <span className="flex shrink-0 items-baseline gap-0.5 text-xs text-accent">
            <Flame size={11} aria-hidden className="self-center" />
            {streaks[who]}
          </span>
        )}
      </p>
      {entry ? (
        <p className="mt-1 truncate text-sm text-muted">
          {entry.states
            .map((id) => (STATE_BY_ID[id] ? t(dynamicKey('state', id)) : null))
            .filter(Boolean)
            .join(', ') ||
            entry.note ||
            '-'}
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">{t(own ? 'today.notMarkedYou' : 'today.notMarkedPartner')}</p>
      )}
    </div>
  )

  return (
    <Tile to="/checkin" icon={Smile} title={t('today.howAreWe')}>
      <div className="flex gap-4">
        {side(myName, userId, mine, true)}
        {side(partnerName, partnerId, theirs, false)}
      </div>
    </Tile>
  )
}

function Food({
  eaten,
  goal,
  partnerName,
  partnerEaten,
}: {
  eaten: number
  goal: number | null
  partnerName: string
  partnerEaten: number | null
}) {
  const t = useT()
  const left = goal === null ? null : Math.round(goal - eaten)

  return (
    <Tile to="/diary" icon={NotebookPen} title={t('today.food')}>
      <p className="text-2xl font-semibold tabular-nums">
        {Math.round(eaten)}
        {goal !== null && <span className="text-base font-normal text-muted"> / {Math.round(goal)}</span>}
      </p>
      <p className="text-sm text-muted">
        {left === null
          ? t('unit.kcal')
          : left >= 0
            ? t('today.kcalLeft', { n: left })
            : t('today.kcalOver', { n: -left })}
        {partnerEaten !== null && ` · ${partnerName} ${Math.round(partnerEaten)}`}
      </p>
    </Tile>
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
    <Tile to="/tasks" icon={ListChecks} title={t('today.tasks')}>
      {open.length === 0 ? (
        <p className="text-sm text-muted">{t('today.noTasks')}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {open.slice(0, 3).map((o) => (
            <li key={`${o.task.id}-${o.at.toISOString()}`} className="truncate text-sm">
              {o.task.title}
            </li>
          ))}
          {open.length > 3 && (
            <li className="text-sm text-muted">
              {t('today.andMore', { n: open.length - 3 })}
            </li>
          )}
        </ul>
      )}
      {overdue > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-danger">
          <TriangleAlert size={14} aria-hidden />
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
    <Tile to="/cycle" icon={Droplet} title={own ? t('today.cycle') : t('today.cycleOf', { name: partnerName })}>
      <p className="text-sm">
        {t('cyc.dayN', { n: state.day })} · {t(dynamicKey('phase', state.phase))}
      </p>
    </Tile>
  )
}

function NextDate({ list }: { list: { title: string; days: number }[] }) {
  const t = useT()
  const next = list.find((o) => o.days <= 45)
  if (!next) return null

  return (
    <Tile to="/dates" icon={CalendarHeart} title={t('today.nextDate')}>
      <p className="text-sm">
        {next.title}
        <span className="text-muted">
          {' — '}
          {next.days === 0
            ? t('cyc.todayLower')
            : next.days === 1
              ? t('common.tomorrow').toLowerCase()
              : t('dates.inDays', { n: next.days, unit: t.plural('unit.day', next.days) })}
        </span>
      </p>
    </Tile>
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
    <Tile to={`/topics/${reply.topicId}`} icon={MessagesSquare} title={t('today.lastReply')}>
      <p className="truncate text-sm">{reply.topicTitle}</p>
      <p className="text-sm text-muted">
        {mine ? t('today.you') : partnerName} · {when}
      </p>
    </Tile>
  )
}
