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
import { fromLocalISO, todayLocal } from '@/lib/date'
import { plural } from '@/lib/plural'
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
        {fromLocalISO(today).toLocaleDateString('ru-RU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </p>

      <NudgeButton />

      <Mood
        today={today}
        userId={userId}
        partnerId={partnerId}
        myName={me?.nickname ?? 'Я'}
        partnerName={partner?.nickname ?? 'Партнёр'}
        checkins={checkins.data ?? []}
        streaks={streaks.data ?? {}}
      />

      <Food
        eaten={sumEntries(myDay.data ?? []).kcal}
        goal={goalsFor(me)?.kcal ?? null}
        partnerName={partner?.nickname ?? 'Партнёр'}
        partnerEaten={theirDay.data ? sumEntries(theirDay.data).kcal : null}
      />

      <Tasks tasks={tasks.data ?? []} today={today} />

      <Cycle userId={userId} partnerId={partnerId} partnerName={partner?.nickname ?? 'Партнёр'} />

      <NextDate list={dates.data ?? []} />

      <Reply reply={reply.data ?? null} userId={userId} partnerName={partner?.nickname ?? 'Партнёр'} />
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
        <p className="mt-1 text-sm text-muted">{own ? 'ты ещё не отмечался' : 'пока не отмечалась'}</p>
      )}
    </div>
  )

  return (
    <Tile to="/checkin" icon={Smile} title="Как мы">
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
  const left = goal === null ? null : Math.round(goal - eaten)

  return (
    <Tile to="/diary" icon={NotebookPen} title="Еда">
      <p className="text-2xl font-semibold tabular-nums">
        {Math.round(eaten)}
        {goal !== null && <span className="text-base font-normal text-muted"> / {Math.round(goal)}</span>}
      </p>
      <p className="text-sm text-muted">
        {left === null
          ? 'ккал'
          : left >= 0
            ? `ккал · осталось ${left}`
            : `ккал · сверх нормы ${-left}`}
        {partnerEaten !== null && ` · ${partnerName} ${Math.round(partnerEaten)}`}
      </p>
    </Tile>
  )
}

function Tasks({ tasks, today }: { tasks: Parameters<typeof occurrencesOn>[0]; today: string }) {
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
    <Tile to="/tasks" icon={ListChecks} title="Задачи">
      {open.length === 0 ? (
        <p className="text-sm text-muted">На сегодня ничего не назначено.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {open.slice(0, 3).map((o) => (
            <li key={`${o.task.id}-${o.at.toISOString()}`} className="truncate text-sm">
              {o.task.title}
            </li>
          ))}
          {open.length > 3 && (
            <li className="text-sm text-muted">и ещё {open.length - 3}</li>
          )}
        </ul>
      )}
      {overdue > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-danger">
          <TriangleAlert size={14} aria-hidden />
          {overdue} {plural(overdue, 'просрочена', 'просрочены', 'просрочено')}
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
    <Tile to="/cycle" icon={Droplet} title={own ? 'Цикл' : `Цикл · ${partnerName}`}>
      <p className="text-sm">
        {t('cyc.dayN', { n: state.day })} · {t(dynamicKey('phase', state.phase))}
      </p>
    </Tile>
  )
}

function NextDate({ list }: { list: { title: string; days: number }[] }) {
  const next = list.find((o) => o.days <= 45)
  if (!next) return null

  return (
    <Tile to="/dates" icon={CalendarHeart} title="Ближайшая дата">
      <p className="text-sm">
        {next.title}
        <span className="text-muted">
          {' — '}
          {next.days === 0
            ? 'сегодня'
            : next.days === 1
              ? 'завтра'
              : `через ${next.days} ${plural(next.days, 'день', 'дня', 'дней')}`}
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
  if (!reply) return null
  const mine = reply.authorId === userId
  const when = new Date(reply.createdAt).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <Tile to={`/topics/${reply.topicId}`} icon={MessagesSquare} title="Последний ответ">
      <p className="truncate text-sm">{reply.topicTitle}</p>
      <p className="text-sm text-muted">
        {mine ? 'ты' : partnerName} · {when}
      </p>
    </Tile>
  )
}
