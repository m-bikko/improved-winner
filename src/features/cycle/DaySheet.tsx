import { dynamicKey, useT } from '@/lib/i18n'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { formatDayLabel } from '@/lib/date'
import { Button } from '@/ui/Button'
import { Sheet } from '@/ui/Sheet'
import { Chip } from '@/ui/Chip'
import { INPUT_CLASS } from '@/ui/Field'
import { useDeleteCycleDay, useSaveCycleDay } from './api'
import {
  FLOW,
  MOODS,
  SYMPTOMS,
  isEmpty,
  type DayLog,
  type Flow,
  type Mood,
  type Symptom,
  PAIN_KEYS,
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
  const t = useT()
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
      <div className="flex min-w-0 flex-col gap-5">
        {readOnly ? (
          <ReadOnly log={log} />
        ) : (
          <>
            <Group label={t('day.flow')}>
              {FLOW.map((f) => (
                <Chip key={f} selected={flow === f} onClick={() => setFlow(flow === f ? null : f)}>
                  {t(dynamicKey('flow', f))}
                </Chip>
              ))}
            </Group>

            <Group label={t('day.pain')}>
              {[0, 1, 2, 3].map((p) => (
                <Chip key={p} selected={pain === p} onClick={() => setPain(pain === p ? null : p)}>
                  {t(PAIN_KEYS[p] ?? 'pain.none')}
                </Chip>
              ))}
            </Group>

            <Group label={t('day.mood')}>
              {MOODS.map((m) => (
                <Chip key={m} selected={mood === m} onClick={() => setMood(mood === m ? null : m)}>
                  {t(dynamicKey('mood', m))}
                </Chip>
              ))}
            </Group>

            <Group label={t('day.symptoms')}>
              {SYMPTOMS.map((s) => (
                <Chip key={s} selected={symptoms.includes(s)} onClick={() => toggleSymptom(s)}>
                  {t(dynamicKey('symptom', s))}
                </Chip>
              ))}
            </Group>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">{t('day.note')}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={t('day.notePlaceholder')}
                className={`${INPUT_CLASS} min-w-0 resize-none`}
              />
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button onClick={() => void submit()} loading={save.isPending || remove.isPending}>
              {t('common.save')}
            </Button>

            {!isEmpty(log) && (
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() => void remove.mutateAsync(log.date).then(onClose)}
              >
                <Trash2 size={18} aria-hidden />
                {t('day.erase')}
              </Button>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

function ReadOnly({ log }: { log: DayLog }) {
  const t = useT()
  if (isEmpty(log)) return <p className="text-[15px] text-muted">{t('day.empty')}</p>
  return (
    <dl className="divide-y divide-line overflow-hidden rounded-2xl bg-raised/60">
      {log.flow && <Row label={t('day.flow')} value={t(dynamicKey('flow', log.flow))} />}
      {log.pain !== null && <Row label={t('day.pain')} value={t(PAIN_KEYS[log.pain] ?? 'pain.none')} />}
      {log.mood && <Row label={t('day.mood')} value={t(dynamicKey('mood', log.mood))} />}
      {log.symptoms.length > 0 && (
        <Row label={t('day.symptoms')} value={log.symptoms.map((s) => t(dynamicKey('symptom', s))).join(', ')} />
      )}
      {log.note && <Row label={t('day.note')} value={log.note} />}
    </dl>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[15px] leading-relaxed">{value}</dd>
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
