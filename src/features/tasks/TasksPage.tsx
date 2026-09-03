import { useMemo, useState } from 'react'
import { CalendarClock, Check, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { formatDueAt, fromDateTimeInput, toDateTimeInput } from '@/lib/date'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { useProfiles } from '@/features/profile/api'
import { useDeleteTask, useSaveTask, useTasks, useToggleTask, type Task } from './api'

export function TasksPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const tasks = useTasks()
  const profiles = useProfiles()
  const toggle = useToggleTask()
  const [editing, setEditing] = useState<Task | 'new' | null>(null)

  const nicknames = useMemo(
    () => new Map((profiles.data ?? []).map((p) => [p.userId, p.nickname])),
    [profiles.data],
  )

  const { open, done } = useMemo(() => {
    const all = tasks.data ?? []
    return {
      open: all.filter((t) => t.doneAt === null),
      // Свежевыполненные сверху: к ним чаще возвращаются, чем к прошлогодним
      done: all.filter((t) => t.doneAt !== null).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')),
    }
  }, [tasks.data])

  if (tasks.isError) return <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3 pb-28">
      {tasks.isPending && <Loading />}

      {tasks.isSuccess && open.length === 0 && done.length === 0 && (
        <EmptyState
          title="Задач нет"
          hint="Заведи задачу со сроком — при наступлении дедлайна уведомление придёт вам обоим."
        />
      )}

      {open.length > 0 && (
        <ul className="flex flex-col gap-2">
          {open.map((task) => (
            <li key={task.id}>
              <TaskRow
                task={task}
                nicknames={nicknames}
                onToggle={() => void toggle.mutateAsync({ id: task.id, done: true, userId })}
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
                  task={task}
                  nicknames={nicknames}
                  onToggle={() => void toggle.mutateAsync({ id: task.id, done: false, userId })}
                  onOpen={() => setEditing(task)}
                />
              </li>
            ))}
          </ul>
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
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function TaskRow({
  task,
  nicknames,
  onToggle,
  onOpen,
}: {
  task: Task
  nicknames: Map<string, string>
  onToggle: () => void
  onOpen: () => void
}) {
  const isDone = task.doneAt !== null
  // Просрочка считается только у невыполненных: закрытая вчера задача
  // не должна светиться красным вечно
  const overdue = !isDone && task.dueAt !== null && new Date(task.dueAt) <= new Date()

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

        {task.dueAt && !isDone && (
          <span
            className={`mt-1 flex items-center gap-1 text-xs ${overdue ? 'text-danger' : 'text-muted'}`}
          >
            {overdue ? <TriangleAlert size={12} aria-hidden /> : <CalendarClock size={12} aria-hidden />}
            {overdue ? 'Срок вышел: ' : 'Срок: '}
            {formatDueAt(task.dueAt)}
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

function TaskEditor({
  task,
  canDelete,
  onClose,
}: {
  task: Task | null
  canDelete: boolean
  onClose: () => void
}) {
  const save = useSaveTask()
  const remove = useDeleteTask()

  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [due, setDue] = useState(task?.dueAt ? toDateTimeInput(task.dueAt) : '')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      await save.mutateAsync({
        ...(task ? { id: task.id } : {}),
        title,
        notes,
        dueAt: fromDateTimeInput(due),
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={task ? 'Задача' : 'Новая задача'}>
      <div className="flex flex-col gap-4 px-4 py-4">
        <Field
          label="Что сделать"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Записаться к врачу"
          autoFocus={!task}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Заметка</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="необязательно"
            className="w-full resize-none rounded-xl bg-surface px-4 py-3 ring-1 ring-line
                       outline-none focus:ring-2 focus:ring-accent placeholder:text-muted"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Срок</span>
          {/* Системный datetime-local: на телефоне он даёт родной выбор даты
              и времени, который своим компонентом не переплюнуть */}
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-full rounded-xl bg-surface px-4 py-3 ring-1 ring-line outline-none
                       focus:ring-2 focus:ring-accent"
          />
          <span className="text-xs text-muted">
            {due
              ? 'Когда срок наступит, уведомление придёт вам обоим — на устройство и в Telegram.'
              : 'Без срока уведомлений не будет.'}
          </span>
        </label>

        {due && (
          <button type="button" onClick={() => setDue('')} className="self-start text-sm text-muted underline">
            Убрать срок
          </button>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} disabled={!title.trim()} loading={save.isPending}>
          Сохранить
        </Button>

        {canDelete && task && (
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => void remove.mutateAsync(task.id).then(onClose)}
          >
            <Trash2 size={18} aria-hidden />
            Удалить
          </Button>
        )}
      </div>
    </Sheet>
  )
}
