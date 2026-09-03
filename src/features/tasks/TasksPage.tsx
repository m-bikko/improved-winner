import { useMemo, useState } from 'react'
import {
  Bell,
  CalendarClock,
  CalendarDays,
  Check,
  List,
  Plus,
  Repeat,
  TriangleAlert,
} from 'lucide-react'
import { formatDueAt, todayLocal } from '@/lib/date'
import { useLocalFlag } from '@/lib/localFlag'
import { useAuth } from '@/auth/AuthProvider'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { useProfiles } from '@/features/profile/api'
import { useTasks, useToggleTask, type Task } from './api'
import { TaskEditor } from './TaskEditor'
import { TasksCalendar, occurrencesOn } from './TasksCalendar'
import { describeRecurrence } from './recurrence'

export function TasksPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const tasks = useTasks()
  const profiles = useProfiles()
  const toggle = useToggleTask()

  const [asCalendar, setAsCalendar] = useLocalFlag('tasks-calendar-view', true)
  const [selected, setSelected] = useState(todayLocal)
  const [editing, setEditing] = useState<Task | 'new' | null>(null)

  const nicknames = useMemo(
    () => new Map((profiles.data ?? []).map((p) => [p.userId, p.nickname])),
    [profiles.data],
  )

  const all = tasks.data ?? []
  const dayItems = useMemo(() => occurrencesOn(all, selected), [all, selected])

  const { open, done, undated } = useMemo(
    () => ({
      open: all.filter((t) => t.doneAt === null && t.dueAt !== null),
      undated: all.filter((t) => t.doneAt === null && t.dueAt === null),
      done: all
        .filter((t) => t.doneAt !== null)
        .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')),
    }),
    [all],
  )

  if (tasks.isError) return <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />

  const markDone = (task: Task, done: boolean) =>
    void toggle.mutateAsync({ task, done, userId })

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3 pb-28">
      <div className="mb-3 flex gap-1 rounded-xl bg-raised p-1">
        <ViewTab active={asCalendar} onClick={() => setAsCalendar(true)}>
          <CalendarDays size={15} aria-hidden />
          Календарь
        </ViewTab>
        <ViewTab active={!asCalendar} onClick={() => setAsCalendar(false)}>
          <List size={15} aria-hidden />
          Список
        </ViewTab>
      </div>

      {tasks.isPending && <Loading />}

      {asCalendar ? (
        <>
          <TasksCalendar tasks={all} selected={selected} onSelect={setSelected} />

          <p className="mt-5 mb-2 text-sm text-muted">{formatDayHeading(selected)}</p>

          {dayItems.length === 0 ? (
            <p className="rounded-xl bg-surface px-4 py-6 text-center text-sm text-muted ring-1 ring-line">
              На этот день ничего не запланировано
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dayItems.map((item) => (
                <li key={`${item.task.id}-${item.at.toISOString()}`}>
                  <TaskRow
                    occurrence={item}
                    nicknames={nicknames}
                    onToggle={() => markDone(item.task, true)}
                    onOpen={() => setEditing(item.task)}
                  />
                </li>
              ))}
            </ul>
          )}

          {undated.length > 0 && (
            <>
              <p className="mt-6 mb-2 text-sm text-muted">Без срока</p>
              <ul className="flex flex-col gap-2">
                {undated.map((task) => (
                  <li key={task.id}>
                    <TaskRow
                      occurrence={{ task, at: null }}
                      nicknames={nicknames}
                      onToggle={() => markDone(task, true)}
                      onOpen={() => setEditing(task)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          {tasks.isSuccess && all.length === 0 && (
            <EmptyState
              title="Задач нет"
              hint="Заведи задачу со сроком — напоминания придут вам обоим."
            />
          )}

          {[...open, ...undated].length > 0 && (
            <ul className="flex flex-col gap-2">
              {[...open, ...undated].map((task) => (
                <li key={task.id}>
                  <TaskRow
                    occurrence={{ task, at: task.dueAt ? new Date(task.dueAt) : null }}
                    nicknames={nicknames}
                    onToggle={() => markDone(task, true)}
                    onOpen={() => setEditing(task)}
                  />
                </li>
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <>
              <p className="mt-6 mb-2 text-sm text-muted">Выполнено</p>
              <ul className="flex flex-col gap-2">
                {done.map((task) => (
                  <li key={task.id}>
                    <TaskRow
                      occurrence={{ task, at: task.dueAt ? new Date(task.dueAt) : null }}
                      nicknames={nicknames}
                      onToggle={() => markDone(task, false)}
                      onOpen={() => setEditing(task)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => setEditing('new')}
        aria-label="Новая задача"
        className="fixed right-5 bottom-6 z-20 flex size-14 items-center justify-center
                   rounded-full bg-accent text-accent-ink shadow-lg
                   transition-transform active:scale-95"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Plus size={26} aria-hidden />
      </button>

      {editing && (
        <TaskEditor
          task={editing === 'new' ? null : editing}
          canDelete={editing !== 'new' && editing.createdBy === userId}
          // Новая задача из календаря попадает на выбранный день, а не на сегодня
          {...(editing === 'new' && asCalendar ? { defaultDue: `${selected}T09:00` } : {})}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function formatDayHeading(iso: string): string {
  const today = todayLocal()
  if (iso === today) return 'Сегодня'
  const date = new Date(`${iso}T12:00:00`)
  return date.toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'long' })
}

function TaskRow({
  occurrence,
  nicknames,
  onToggle,
  onOpen,
}: {
  occurrence: { task: Task; at: Date | null }
  nicknames: Map<string, string>
  onToggle: () => void
  onOpen: () => void
}) {
  const { task, at } = occurrence
  const isDone = task.doneAt !== null
  // Просрочка считается только у невыполненных: закрытая вчера задача
  // не должна светиться красным вечно
  const overdue = !isDone && at !== null && at <= new Date()

  return (
    <div
      className={`flex items-start gap-3 rounded-xl bg-surface px-3 py-3 ring-1 ${
        overdue ? 'ring-danger/40' : 'ring-line'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={isDone ? 'Вернуть в работу' : 'Выполнено'}
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md ring-1 transition-colors ${
          isDone ? 'bg-carbs text-white ring-carbs' : 'ring-line'
        }`}
      >
        {isDone && <Check size={15} aria-hidden />}
      </button>

      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className={`block ${isDone ? 'text-muted line-through' : ''}`}>{task.title}</span>

        {task.notes && !isDone && (
          <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{task.notes}</span>
        )}

        {!isDone && (
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            {at && (
              <span className={`flex items-center gap-1 ${overdue ? 'text-danger' : 'text-muted'}`}>
                {overdue ? <TriangleAlert size={12} aria-hidden /> : <CalendarClock size={12} aria-hidden />}
                {overdue ? 'Срок вышел: ' : ''}
                {formatDueAt(at.toISOString())}
              </span>
            )}
            {task.recurrence && (
              <span className="flex items-center gap-1 text-muted">
                <Repeat size={12} aria-hidden />
                {describeRecurrence(task.recurrence)}
              </span>
            )}
            {task.reminders.length > 0 && at && (
              <span className="flex items-center gap-1 text-muted">
                <Bell size={12} aria-hidden />
                {task.reminders.length}
              </span>
            )}
          </span>
        )}

        {isDone && task.doneBy && (
          <span className="mt-0.5 block text-xs text-muted">
            {nicknames.get(task.doneBy) ?? 'кто-то'}
          </span>
        )}
      </button>
    </div>
  )
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-colors ${
        active ? 'bg-surface text-ink shadow-sm' : 'text-muted'
      }`}
    >
      {children}
    </button>
  )
}
