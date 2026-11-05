import { useT } from '@/lib/i18n'
import { useMemo, useState, type ReactNode } from 'react'
import {
  Bell,
  CalendarClock,
  CalendarDays,
  Check,
  List,
  ListChecks,
  Repeat,
  TriangleAlert,
} from 'lucide-react'
import { formatDayLabel, formatDueAt, todayLocal } from '@/lib/date'
import { useLocalFlag } from '@/lib/localFlag'
import { useAuth } from '@/auth/AuthProvider'
import { motion } from 'motion/react'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { useBurst } from '@/ui/Burst'
import { useProfiles } from '@/features/profile/api'
import { useTasks, useToggleTask, type Task } from './api'
import { TaskEditor } from './TaskEditor'
import { TasksCalendar, occurrencesOn } from './TasksCalendar'
import { describeRecurrence } from './recurrence'
import { Segmented } from '@/ui/Segmented'
import { Fab } from '@/ui/Fab'
import { Card, SectionTitle } from '@/ui/Card'

export function TasksPage() {
  const t = useT()
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const tasks = useTasks()
  const profiles = useProfiles()
  const toggle = useToggleTask()

  const [asCalendar, setAsCalendar] = useLocalFlag('tasks-calendar-view', true)
  const [selected, setSelected] = useState(todayLocal)
  // Не просто задача, а КАКОЕ вхождение открыли.
  //
  // Раньше в форму уезжала одна задача, и правка неизбежно означала «все
  // вхождения» - выбора у человека не было, потому что приложение само
  // не знало, какое из них он нажал.
  const [editing, setEditing] = useState<{ task: Task; at: Date | null } | 'new' | null>(null)

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
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Segmented
        value={asCalendar ? 'calendar' : 'list'}
        onChange={(v) => setAsCalendar(v === 'calendar')}
        options={[
          { value: 'calendar', label: t('task.calendar'), icon: CalendarDays },
          { value: 'list', label: t('task.list'), icon: List },
        ]}
      />

      {tasks.isPending && <Loading />}

      {asCalendar ? (
        <>
          <TasksCalendar tasks={all} selected={selected} onSelect={setSelected} />

          <SectionTitle className="mt-2">{formatDayLabel(selected)}</SectionTitle>

          {dayItems.length === 0 ? (
            <Card className="px-4 py-6 text-center text-[15px] text-muted">
              {t('task.dayEmpty')}
            </Card>
          ) : (
            <TaskList>
              {dayItems.map((item) => (
                <li key={`${item.task.id}-${item.at.toISOString()}`}>
                  <TaskRow
                    occurrence={item}
                    nicknames={nicknames}
                    onToggle={() => markDone(item.task, true)}
                    onOpen={() => setEditing({ task: item.task, at: item.at })}
                  />
                </li>
              ))}
            </TaskList>
          )}

          {undated.length > 0 && (
            <>
              <SectionTitle className="mt-2">{t('task.undated')}</SectionTitle>
              <TaskList>
                {undated.map((task) => (
                  <li key={task.id}>
                    <TaskRow
                      occurrence={{ task, at: null }}
                      nicknames={nicknames}
                      onToggle={() => markDone(task, true)}
                      onOpen={() => setEditing({ task, at: task.dueAt ? new Date(task.dueAt) : null })}
                    />
                  </li>
                ))}
              </TaskList>
            </>
          )}
        </>
      ) : (
        <>
          {tasks.isSuccess && all.length === 0 && (
            <EmptyState
              icon={ListChecks}
              tone="sky"
              title={t('task.emptyTitle')}
              hint={t('task.emptyHint')}
            />
          )}

          {[...open, ...undated].length > 0 && (
            <TaskList>
              {[...open, ...undated].map((task) => (
                <li key={task.id}>
                  <TaskRow
                    occurrence={{ task, at: task.dueAt ? new Date(task.dueAt) : null }}
                    nicknames={nicknames}
                    onToggle={() => markDone(task, true)}
                    onOpen={() => setEditing({ task, at: task.dueAt ? new Date(task.dueAt) : null })}
                  />
                </li>
              ))}
            </TaskList>
          )}

          {done.length > 0 && (
            <>
              <SectionTitle className="mt-2">{t('task.doneSection')}</SectionTitle>
              <TaskList>
                {done.map((task) => (
                  <li key={task.id}>
                    <TaskRow
                      occurrence={{ task, at: task.dueAt ? new Date(task.dueAt) : null }}
                      nicknames={nicknames}
                      onToggle={() => markDone(task, false)}
                      onOpen={() => setEditing({ task, at: task.dueAt ? new Date(task.dueAt) : null })}
                    />
                  </li>
                ))}
              </TaskList>
            </>
          )}
        </>
      )}

      <Fab onClick={() => setEditing('new')} label={t('task.new')} />

      {editing && (
        <TaskEditor
          task={editing === 'new' ? null : editing.task}
          occurrenceAt={editing === 'new' ? null : (editing.at?.toISOString() ?? null)}
          canDelete={editing !== 'new' && editing.task.createdBy === userId}
          // Новая задача из календаря попадает на выбранный день, а не на сегодня
          {...(editing === 'new' && asCalendar ? { defaultDue: `${selected}T09:00` } : {})}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/**
 * Задачи группы - строками одной карточки.
 *
 * Раньше каждая задача была отдельной обведённой плашкой, и пять задач
 * читались как пять разных блоков. Строка во всю ширину с разделителем
 * держит группу вместе и оставляет всю ширину под нажатие.
 */
function TaskList({ children }: { children: ReactNode }) {
  return (
    <Card as="div" className="overflow-hidden">
      <ul className="divide-y divide-line">{children}</ul>
    </Card>
  )
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
  const t = useT()
  const burst = useBurst()
  const { task, at } = occurrence
  const isDone = task.doneAt !== null
  // Просрочка считается только у невыполненных: закрытая вчера задача
  // не должна светиться красным вечно
  const overdue = !isDone && at !== null && at <= new Date()

  return (
    <div className="flex items-start">
      {/* Круг 26px, а область нажатия 44px: попасть в маленький квадрат
          на ходу большим пальцем было задачей само по себе, а промах
          открывал редактор вместо отметки */}
      <button
        type="button"
        onClick={(e) => {
          // Искры только на «сделано»: вернуть задачу в работу - не событие
          if (!isDone) burst(e.currentTarget, 'sparks')
          onToggle()
        }}
        aria-label={t(isDone ? 'task.reopen' : 'task.doneSection')}
        className="group mt-0.5 ml-1.5 flex size-11 shrink-0 items-center justify-center rounded-full"
      >
        <span
          className={`flex size-[26px] items-center justify-center rounded-full border-2 transition-[background-color,border-color,transform]
                      duration-150 group-active:scale-90 ${
                        isDone
                          ? 'border-carbs bg-carbs text-white'
                          : overdue
                            ? 'border-danger/70'
                            : 'border-muted/45'
                      }`}
        >
          {isDone && (
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 16 }}
              className="flex"
            >
              <Check size={16} strokeWidth={3} aria-hidden />
            </motion.span>
          )}
        </span>
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="min-h-14 min-w-0 flex-1 self-stretch py-3 pr-4 pl-1 text-left transition-colors active:bg-raised"
      >
        <span
          className={`block text-[15px] font-medium ${isDone ? 'text-muted line-through' : ''}`}
        >
          {task.title}
        </span>

        {task.notes && !isDone && (
          <span className="mt-0.5 line-clamp-2 text-[13px] text-muted">{task.notes}</span>
        )}

        {!isDone && (at !== null || task.recurrence !== null) && (
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            {at &&
              (overdue ? (
                // Просрочка - плашкой, а не только цветом текста: красная строка
                // среди серых теряется, а цвет в одиночку о состоянии не говорит
                <span className="flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 font-medium text-danger">
                  <TriangleAlert size={13} aria-hidden className="shrink-0" />
                  {t('task.overdue')}
                  {formatDueAt(at.toISOString())}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-muted">
                  <CalendarClock size={13} aria-hidden className="shrink-0" />
                  {formatDueAt(at.toISOString())}
                </span>
              ))}
            {task.recurrence && (
              <span className="flex items-center gap-1 text-muted">
                <Repeat size={13} aria-hidden className="shrink-0" />
                {describeRecurrence(task.recurrence)}
              </span>
            )}
            {task.reminders.length > 0 && at && (
              <span className="flex items-center gap-1 text-muted tabular-nums">
                <Bell size={13} aria-hidden className="shrink-0" />
                {task.reminders.length}
              </span>
            )}
          </span>
        )}

        {isDone && task.doneBy && (
          <span className="mt-0.5 block text-[13px] text-muted">
            {nicknames.get(task.doneBy) ?? t('task.someone')}
          </span>
        )}
      </button>
    </div>
  )
}
