import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { formatDayLabel } from '@/lib/date'
import { Button } from '@/ui/Button'
import { Sheet } from '@/ui/Sheet'
import { useDeleteCycleDay, useSaveCycleDay } from './api'
import {
  FLOW,
  FLOW_LABELS,
  MOODS,
  MOOD_LABELS,
  PAIN_LABELS,
  SYMPTOMS,
  SYMPTOM_LABELS,
  isEmpty,
  type DayLog,
  type Flow,
  type Mood,
  type Symptom,
} from './dayLog'

/**
 * Отметка за день.
 *
 * Всё повторным нажатием снимается: выбранная обильность, боль, настроение.
 * Иначе поставленную по ошибке отметку нельзя было бы убрать, не удаляя
 * весь день целиком.
 *
 * Пустую отметку база не принимает - есть ограничение. Поэтому «сохранить
 * пустое» здесь превращается в удаление строки, а не в ошибку в лицо.
 */
export function DaySheet({
  log,
  readOnly,
  onClose,
}: {
  log: DayLog
  readOnly: boolean
  onClose: () => void
}) {
  const save = useSaveCycleDay()
  const remove = useDeleteCycleDay()

  const [flow, setFlow] = useState<Flow | null>(log.flow)
  const [pain, setPain] = useState<number | null>(log.pain)
  const [mood, setMood] = useState<Mood | null>(log.mood)
  const [symptoms, setSymptoms] = useState<Symptom[]>(log.symptoms)
  const [note, setNote] = useState(log.note ?? '')
  const [error, setError] = useState<string | null>(null)

  // Функциональное обновление: три быстрых нажатия подряд React батчит,
  // и чтение из замыкания посчитало бы их все от одного значения.
  const toggleSymptom = (s: Symptom) => {
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  const submit = async () => {
    setError(null)
    const next: DayLog = { date: log.date, flow, pain, mood, symptoms, note: note || null }
    try {
      if (isEmpty(next)) await remove.mutateAsync(log.date)
      else await save.mutateAsync(next)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={formatDayLabel(log.date)}>
      <div className="flex min-w-0 flex-col gap-5 px-4 py-4">
        {readOnly ? (
          <ReadOnly log={log} />
        ) : (
          <>
            <Group label="Обильность">
              {FLOW.map((f) => (
                <Chip key={f} active={flow === f} onClick={() => setFlow(flow === f ? null : f)}>
                  {FLOW_LABELS[f]}
                </Chip>
              ))}
            </Group>

            <Group label="Боль">
              {[0, 1, 2, 3].map((p) => (
                <Chip key={p} active={pain === p} onClick={() => setPain(pain === p ? null : p)}>
                  {PAIN_LABELS[p]}
                </Chip>
              ))}
            </Group>

            <Group label="Настроение">
              {MOODS.map((m) => (
                <Chip key={m} active={mood === m} onClick={() => setMood(mood === m ? null : m)}>
                  {MOOD_LABELS[m]}
                </Chip>
              ))}
            </Group>

            <Group label="Симптомы">
              {SYMPTOMS.map((s) => (
                <Chip key={s} active={symptoms.includes(s)} onClick={() => toggleSymptom(s)}>
                  {SYMPTOM_LABELS[s]}
                </Chip>
              ))}
            </Group>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">Заметка</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="что помогло, что нет"
                className="w-full min-w-0 resize-none rounded-xl bg-surface px-4 py-3 ring-1
                           ring-line outline-none focus:ring-2 focus:ring-accent placeholder:text-muted"
              />
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button onClick={() => void submit()} loading={save.isPending || remove.isPending}>
              Сохранить
            </Button>

            {!isEmpty(log) && (
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() => void remove.mutateAsync(log.date).then(onClose)}
              >
                <Trash2 size={18} aria-hidden />
                Стереть отметку
              </Button>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

function ReadOnly({ log }: { log: DayLog }) {
  if (isEmpty(log)) return <p className="text-sm text-muted">За этот день отметок нет.</p>
  return (
    <dl className="flex flex-col gap-3 text-sm">
      {log.flow && <Row label="Обильность" value={FLOW_LABELS[log.flow]} />}
      {log.pain !== null && <Row label="Боль" value={PAIN_LABELS[log.pain] ?? '-'} />}
      {log.mood && <Row label="Настроение" value={MOOD_LABELS[log.mood]} />}
      {log.symptoms.length > 0 && (
        <Row label="Симптомы" value={log.symptoms.map((s) => SYMPTOM_LABELS[s]).join(', ')} />
      )}
      {log.note && <Row label="Заметка" value={log.note} />}
    </dl>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
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
