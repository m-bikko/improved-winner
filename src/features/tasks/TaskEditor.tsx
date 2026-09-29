import { useT, type Key } from '@/lib/i18n'
import { useState } from 'react'
import { Bell, Plus, Repeat, Trash2, X } from 'lucide-react'
import { fromDateTimeInput, toDateTimeInput } from '@/lib/date'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Field, INPUT_CLASS } from '@/ui/Field'
import { IconBadge } from '@/ui/IconBadge'
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
const REMINDER_OPTIONS: { minutes: number; key: Key }[] = [
  { minutes: 0, key: 'remind.atTime' },
  { minutes: 5, key: 'remind.5m' },
  { minutes: 10, key: 'remind.10m' },
  { minutes: 15, key: 'remind.15m' },
  { minutes: 30, key: 'remind.30m' },
  { minutes: 60, key: 'remind.1h' },
  { minutes: 120, key: 'remind.2h' },
  { minutes: 180, key: 'remind.3h' },
  { minutes: 720, key: 'remind.12h' },
  { minutes: 1440, key: 'remind.1d' },
  { minutes: 2880, key: 'remind.2d' },
  { minutes: 10080, key: 'remind.1w' },
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
    <Sheet open onClose={onClose} title={t(task ? 'task.title' : 'task.new')}>
      <div className="flex min-w-0 flex-col gap-5">
        <Field
          label={t('task.what')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('task.placeholder')}
          autoFocus={!task}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('common.note')}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t('common.optional')}
            className={`${INPUT_CLASS} min-w-0 resize-none`}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('task.due')}</span>
          {/* Системный datetime-local: на телефоне он даёт родной выбор даты
              и времени, который своим компонентом не переплюнуть */}
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className={`${INPUT_CLASS} min-w-0`}
          />
          {hasDue ? (
            // Пилюлей, а не подчёркнутой ссылкой: мелкий серый текст под полем
            // не читался как действие, и в него было не попасть пальцем
            <button
              type="button"
              onClick={() => {
                setDue('')
                setRecurrence(null)
              }}
              className="mt-0.5 flex min-h-9 items-center gap-1.5 self-start rounded-full bg-raised px-3.5
                         text-sm font-medium text-muted transition-transform active:scale-95"
            >
              <X size={15} aria-hidden />
              {t('task.clearDue')}
            </button>
          ) : (
            <span className="text-[13px] text-muted">
              {t('task.noDueHint')}
            </span>
          )}
        </label>

        {hasDue && (
          <>
            <div className="flex flex-col gap-2.5">
              <p className="flex items-center gap-2.5 text-[15px] font-semibold">
                <IconBadge icon={Bell} tone="sky" size="sm" />
                {t('task.reminders')}
              </p>

              {reminders.length === 0 && (
                <p className="text-[13px] text-muted">{t('task.noReminders')}</p>
              )}

              <div className="flex flex-wrap gap-2">
                {[...reminders]
                  .sort((a, b) => b - a)
                  .map((minutes) => (
                    <span
                      key={minutes}
                      className="flex min-h-9 items-center gap-0.5 rounded-full bg-raised pr-0.5 pl-3.5 text-sm font-medium"
                    >
                      {(() => {
                        const found = REMINDER_OPTIONS.find((o) => o.minutes === minutes)
                        return found ? t(found.key) : minutes
                      })()}
                      <button
                        type="button"
                        onClick={() => setReminders(reminders.filter((m) => m !== minutes))}
                        aria-label={t('task.clearReminder')}
                        className="flex size-8 items-center justify-center rounded-full text-muted
                                   transition-colors active:bg-line"
                      >
                        <X size={15} aria-hidden />
                      </button>
                    </span>
                  ))}

                {reminders.length < MAX_REMINDERS && (
                  <button
                    type="button"
                    onClick={() => setPickingReminder(true)}
                    aria-expanded={pickingReminder}
                    className="flex min-h-9 items-center gap-1 rounded-full bg-accent-soft px-3.5 text-sm
                               font-semibold text-accent-soft-ink transition-transform active:scale-95"
                  >
                    <Plus size={16} strokeWidth={2.4} aria-hidden />
                    {t('common.add')}
                  </button>
                )}
              </div>

              {pickingReminder && (
                <div className="flex flex-wrap gap-2 rounded-2xl bg-raised p-3">
                  {REMINDER_OPTIONS.filter((o) => !reminders.includes(o.minutes)).map((option) => (
                    <button
                      key={option.minutes}
                      type="button"
                      onClick={() => {
                        setReminders([...reminders, option.minutes])
                        setPickingReminder(false)
                      }}
                      className="min-h-9 rounded-full bg-surface px-3.5 text-sm font-medium shadow-card
                                 transition-transform active:scale-95"
                    >
                      {t(option.key)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPickingReminder(false)}
                    className="min-h-9 px-2.5 text-sm font-medium text-muted"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2.5">
              <p className="flex items-center gap-2.5 text-[15px] font-semibold">
                <IconBadge icon={Repeat} tone="sky" size="sm" />
                {t('task.repeat')}
              </p>

              <div className="flex flex-wrap gap-2">
                <Chip selected={recurrence === null} onClick={() => setFreq(null)}>
                  {t('task.noRepeat')}
                </Chip>
                {(Object.keys(FREQ_KEYS) as Freq[]).map((freq) => (
                  <Chip key={freq} selected={recurrence?.freq === freq} onClick={() => setFreq(freq)}>
                    {t(FREQ_KEYS[freq])}
                  </Chip>
                ))}
              </div>

              {recurrence && (
                <>
                  <label className="mt-1 flex items-center gap-2 text-sm">
                    <span className="text-muted">{t('task.everyN')}</span>
                    <input
                      inputMode="numeric"
                      value={String(recurrence.interval)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '')
                        const n = raw === '' ? 1 : Math.min(99, Number(raw))
                        setRecurrence({ ...recurrence, interval: n })
                      }}
                      className="w-16 rounded-2xl bg-raised px-3 py-2.5 text-center tabular-nums ring-1 ring-transparent
                                 outline-none focus:bg-surface focus:ring-2 focus:ring-accent"
                    />
                    <span className="text-muted">{t(FREQ_KEYS[recurrence.freq]).toLowerCase()}</span>
                  </label>

                  {recurrence.freq === 'weekly' && (
                    // Сетка на семь, а не перенос строки: семь кругов по 44px
                    // ровно встают в ширину шторки, и неделя читается одной строкой
                    <div className="grid grid-cols-7 gap-1.5">
                      {WEEKDAY_KEYS.map((key, i) => {
                        const day = i + 1
                        const active = (recurrence.weekdays ?? []).includes(day)
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleWeekday(day)}
                            aria-pressed={active}
                            className={`flex aspect-square min-h-11 items-center justify-center rounded-full
                                        text-[13px] font-semibold transition-[background-color,color,transform]
                                        active:scale-95 ${
                                          active ? 'bg-accent text-accent-ink' : 'bg-raised text-ink'
                                        }`}
                          >
                            {t(key)}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm text-muted">{t('task.until')}</span>
                    <input
                      type="date"
                      value={until}
                      onChange={(e) => setUntil(e.target.value)}
                      className={`${INPUT_CLASS} min-w-0`}
                    />
                    <span className="text-[13px] text-muted">
                      {until
                        ? describeRecurrence(recurrence)
                        : t('task.noEnd', { rule: describeRecurrence(recurrence) })}
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
          {t('common.save')}
        </Button>

        {canDelete && task && (
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => void remove.mutateAsync(task.id).then(onClose)}
          >
            <Trash2 size={18} aria-hidden />
            {t('common.delete')}
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
  const t = useT()
  const options: { scope: EditScope; label: Key; hint: Key }[] = [
    { scope: 'one', label: 'task.scope.one', hint: 'task.scope.one.hint' },
    { scope: 'following', label: 'task.scope.future', hint: 'task.scope.future.hint' },
    { scope: 'all', label: 'task.scope.all', hint: 'task.scope.all.hint' },
  ]

  return (
    <Sheet open onClose={onClose} title={t('task.scope.title')}>
      <Card as="div" className="overflow-hidden">
        <div className="divide-y divide-line">
          {options.map((o) => (
            <button
              key={o.scope}
              type="button"
              disabled={busy}
              onClick={() => onPick(o.scope)}
              className="flex min-h-14 w-full flex-col justify-center px-4 py-3 text-left transition-colors
                         active:bg-raised disabled:opacity-60"
            >
              <span className="block text-[15px] font-semibold">{t(o.label)}</span>
              <span className="mt-0.5 block text-[13px] text-muted">{t(o.hint)}</span>
            </button>
          ))}
        </div>
      </Card>
    </Sheet>
  )
}
