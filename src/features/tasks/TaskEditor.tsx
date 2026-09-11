import { useT } from '@/lib/i18n'
import { useState } from 'react'
import { Bell, Plus, Repeat, Trash2, X } from 'lucide-react'
import { fromDateTimeInput, toDateTimeInput } from '@/lib/date'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useDeleteTask, useSaveTask, type EditScope, type Task } from './api'
import {
  FREQ_KEYS,
  WEEKDAY_KEYS,
  describeRecurrence,
  isoWeekday,
  type Freq,
  type Recurrence,
} from './recurrence'

/**
 * Набор смещений для напоминаний.
 *
 * Фиксированный список, а не произвольное число: те же значения перечислены
 * в CHECK на колонке, и совпадение здесь не случайно - интерфейс не должен
 * предлагать то, что база откажется принять.
 */
const REMINDER_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'В момент' },
  { minutes: 5, label: '5 мин' },
  { minutes: 10, label: '10 мин' },
  { minutes: 15, label: '15 мин' },
  { minutes: 30, label: '30 мин' },
  { minutes: 60, label: '1 час' },
  { minutes: 120, label: '2 часа' },
  { minutes: 180, label: '3 часа' },
  { minutes: 720, label: '12 часов' },
  { minutes: 1440, label: '1 день' },
  { minutes: 2880, label: '2 дня' },
  { minutes: 10080, label: 'Неделя' },
]

const MAX_REMINDERS = 5

export function TaskEditor({
  task,
  occurrenceAt,
  canDelete,
  defaultDue,
  onClose,
}: {
  task: Task | null
  /**
   * Какое вхождение открыли, в ISO. Нужен, чтобы спросить область правки:
   * без него «только это» не к чему привязать.
   */
  occurrenceAt?: string | null
  canDelete: boolean
  /** Дата, выбранная в календаре: новая задача попадает на неё, а не на сегодня. */
  defaultDue?: string | undefined
  onClose: () => void
}) {
  const t = useT()
  const save = useSaveTask()
  const remove = useDeleteTask()

  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [due, setDue] = useState(
    task?.dueAt ? toDateTimeInput(task.dueAt) : (defaultDue ?? ''),
  )
  const [reminders, setReminders] = useState<number[]>(task?.reminders ?? [0])
  const [recurrence, setRecurrence] = useState<Recurrence | null>(task?.recurrence ?? null)
  const [until, setUntil] = useState(task?.recurrenceUntil ?? '')
  const [pickingReminder, setPickingReminder] = useState(false)
  const [askingScope, setAskingScope] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Спрашивать область есть смысл только когда правят одно из МНОГИХ вхождений.
  // У разовой задачи вариант ровно один, и лишний вопрос был бы данью
  // единообразию, а не помощью.
  const recurring = task !== null && task.recurrence !== null && occurrenceAt != null

  const hasDue = due !== ''

  // Функциональное обновление обязательно: React батчит быстрые нажатия, и при
  // чтении состояния из замыкания три тапа подряд считались бы от одного
  // и того же устаревшего значения - последний перетирал бы предыдущие.
  // Пустой набор дней трактуется как простое «каждую неделю».
  const toggleWeekday = (day: number) => {
    setRecurrence((prev) => {
      if (!prev) return prev
      const current = prev.weekdays ?? []
      return {
        ...prev,
        weekdays: current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
      }
    })
  }

  const setFreq = (freq: Freq | null) => {
    if (freq === null) {
      setRecurrence(null)
      return
    }
    setRecurrence((prev) => {
      const base: Recurrence = { freq, interval: prev?.interval ?? 1 }
      if (freq === 'weekly') {
        // По умолчанию - день недели самого срока: это то, что человек имел
        // в виду, выбрав «каждую неделю»
        base.weekdays = [isoWeekday(due ? new Date(due) : new Date())]
      }
      return base
    })
  }

  const submit = async (scope: EditScope = 'all') => {
    setError(null)
    try {
      await save.mutateAsync({
        ...(task ? { id: task.id } : {}),
        title,
        notes,
        dueAt: fromDateTimeInput(due),
        reminders: hasDue ? [...reminders].sort((a, b) => b - a) : [],
        recurrence,
        recurrenceUntil: until || null,
        ...(occurrenceAt ? { occurrenceAt } : {}),
        scope,
      })
      onClose()
    } catch (e) {
      setAskingScope(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={task ? 'Задача' : 'Новая задача'}>
      <div className="flex min-w-0 flex-col gap-5">
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
            rows={2}
            placeholder="необязательно"
            className="w-full min-w-0 resize-none rounded-xl bg-surface px-4 py-3 ring-1
                       ring-line outline-none focus:ring-2 focus:ring-accent
                       placeholder:text-muted"
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
            className="w-full min-w-0 rounded-xl bg-surface px-4 py-3 ring-1 ring-line
                       outline-none focus:ring-2 focus:ring-accent"
          />
          {hasDue ? (
            <button
              type="button"
              onClick={() => {
                setDue('')
                setRecurrence(null)
              }}
              className="self-start text-xs text-muted underline"
            >
              Убрать срок
            </button>
          ) : (
            <span className="text-xs text-muted">
              Без срока не будет ни напоминаний, ни повторения.
            </span>
          )}
        </label>

        {hasDue && (
          <>
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Bell size={15} aria-hidden />
                Напоминания
              </p>

              {reminders.length === 0 && (
                <p className="text-xs text-muted">Не напоминать.</p>
              )}

              <div className="flex flex-wrap gap-2">
                {[...reminders]
                  .sort((a, b) => b - a)
                  .map((minutes) => (
                    <span
                      key={minutes}
                      className="flex items-center gap-1 rounded-full bg-raised py-1.5 pr-1.5 pl-3 text-sm ring-1 ring-line"
                    >
                      {REMINDER_OPTIONS.find((o) => o.minutes === minutes)?.label ?? minutes}
                      <button
                        type="button"
                        onClick={() => setReminders(reminders.filter((m) => m !== minutes))}
                        aria-label="Убрать напоминание"
                        className="p-1 text-muted"
                      >
                        <X size={13} aria-hidden />
                      </button>
                    </span>
                  ))}

                {reminders.length < MAX_REMINDERS && (
                  <button
                    type="button"
                    onClick={() => setPickingReminder(true)}
                    className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-accent ring-1 ring-accent/40"
                  >
                    <Plus size={14} aria-hidden />
                    Добавить
                  </button>
                )}
              </div>

              {pickingReminder && (
                <div className="mt-1 flex flex-wrap gap-2 rounded-xl bg-raised p-3">
                  {REMINDER_OPTIONS.filter((o) => !reminders.includes(o.minutes)).map((option) => (
                    <button
                      key={option.minutes}
                      type="button"
                      onClick={() => {
                        setReminders([...reminders, option.minutes])
                        setPickingReminder(false)
                      }}
                      className="rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-line"
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPickingReminder(false)}
                    className="px-2 py-1.5 text-sm text-muted"
                  >
                    Отмена
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Repeat size={15} aria-hidden />
                Повторение
              </p>

              <div className="flex flex-wrap gap-2">
                <Chip active={recurrence === null} onClick={() => setFreq(null)}>
                  Не повторять
                </Chip>
                {(Object.keys(FREQ_KEYS) as Freq[]).map((freq) => (
                  <Chip key={freq} active={recurrence?.freq === freq} onClick={() => setFreq(freq)}>
                    {t(FREQ_KEYS[freq])}
                  </Chip>
                ))}
              </div>

              {recurrence && (
                <>
                  <label className="mt-1 flex items-center gap-2 text-sm">
                    <span className="text-muted">Каждые</span>
                    <input
                      inputMode="numeric"
                      value={String(recurrence.interval)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '')
                        const n = raw === '' ? 1 : Math.min(99, Number(raw))
                        setRecurrence({ ...recurrence, interval: n })
                      }}
                      className="w-16 rounded-lg bg-surface px-3 py-2 text-center ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
                    />
                    <span className="text-muted">{t(FREQ_KEYS[recurrence.freq]).toLowerCase()}</span>
                  </label>

                  {recurrence.freq === 'weekly' && (
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_KEYS.map((key, i) => {
                        const day = i + 1
                        const active = (recurrence.weekdays ?? []).includes(day)
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleWeekday(day)}
                            aria-pressed={active}
                            className={`size-9 rounded-full text-xs transition-colors ${
                              active ? 'bg-accent text-accent-ink' : 'bg-raised ring-1 ring-line'
                            }`}
                          >
                            {t(key)}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm text-muted">Повторять до</span>
                    <input
                      type="date"
                      value={until}
                      onChange={(e) => setUntil(e.target.value)}
                      className="w-full min-w-0 rounded-xl bg-surface px-4 py-3 ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
                    />
                    <span className="text-xs text-muted">
                      {until ? describeRecurrence(recurrence) : `${describeRecurrence(recurrence)}, без конца`}
                    </span>
                  </label>
                </>
              )}
            </div>
          </>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button
          onClick={() => (recurring ? setAskingScope(true) : void submit('all'))}
          disabled={!title.trim()}
          loading={save.isPending}
        >
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

      {askingScope && (
        <ScopeSheet
          busy={save.isPending}
          onPick={(scope) => void submit(scope)}
          onClose={() => setAskingScope(false)}
        />
      )}
    </Sheet>
  )
}

/**
 * Вопрос об области правки.
 *
 * Порядок вариантов не случаен: «только это» первым, потому что это самый
 * частый случай - перенести одну тренировку, - и самый безобидный при
 * ошибочном нажатии. «Все» стоит последним, хотя раньше был единственным
 * и молчаливым.
 */
function ScopeSheet({
  busy,
  onPick,
  onClose,
}: {
  busy: boolean
  onPick: (scope: EditScope) => void
  onClose: () => void
}) {
  const options: { scope: EditScope; label: string; hint: string }[] = [
    {
      scope: 'one',
      label: 'Только это событие',
      hint: 'Остальные вхождения останутся как были.',
    },
    {
      scope: 'following',
      label: 'Это и дальнейшие',
      hint: 'Прошедшие вхождения не изменятся.',
    },
    {
      scope: 'all',
      label: 'Все события',
      hint: 'Изменит и прошедшие тоже.',
    },
  ]

  return (
    <Sheet open onClose={onClose} title="Что изменить">
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <button
            key={o.scope}
            type="button"
            disabled={busy}
            onClick={() => onPick(o.scope)}
            className="rounded-xl bg-surface px-4 py-3.5 text-left ring-1 ring-line disabled:opacity-60"
          >
            <span className="block font-medium">{o.label}</span>
            <span className="mt-0.5 block text-sm text-muted">{o.hint}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

function Chip({
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
      className={`rounded-full px-3.5 py-2 text-sm transition-colors ${
        active ? 'bg-accent text-accent-ink' : 'bg-raised text-ink ring-1 ring-line'
      }`}
    >
      {children}
    </button>
  )
}
