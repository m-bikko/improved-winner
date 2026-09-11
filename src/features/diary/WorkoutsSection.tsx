import { dynamicKey, useT } from '@/lib/i18n'
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { Button } from '@/ui/Button'
import { Field, NumberField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useProfiles } from '@/features/profile/api'
import { KIND_BY_ID, WORKOUT_KINDS, estimateKcal } from './workouts'
import {
  useDeleteWorkout,
  useSaveWorkout,
  useWorkouts,
  type Workout,
} from './workoutsApi'

/**
 * Тренировки за день и баланс с приходом.
 *
 * Баланс отдельной строкой, а не подмешан в норму. daily_goals заморожена
 * на дату, и добавить в неё сожжённое значило бы менять смысл числа,
 * на которое человек смотрит каждый день: «1420 из 2000» вдруг стало бы
 * «из 2420», и понять, откуда взялась разница, было бы неоткуда.
 */
export function WorkoutsSection({
  date,
  eatenKcal,
  goalKcal,
}: {
  date: string
  eatenKcal: number
  goalKcal: number | null
}) {
  const t = useT()
  const userId = useUserId()
  const all = useWorkouts(date)
  const [editing, setEditing] = useState<Workout | 'new' | null>(null)

  const mine = (all.data ?? []).filter((w) => w.userId === userId)
  const burned = mine.reduce((sum, w) => sum + w.kcal, 0)

  return (
    <section className="mt-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium">{t('workout.section')}</h2>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex items-center gap-1 text-sm text-accent"
        >
          <Plus size={15} aria-hidden />
          {t('common.add')}
        </button>
      </div>

      {mine.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t('workout.dayEmpty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {mine.map((w) => {
            const kind = KIND_BY_ID[w.kind]
            const Icon = kind?.icon
            return (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => setEditing(w)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-raised text-muted">
                    {Icon && <Icon size={17} aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{kind ? t(dynamicKey('workout', kind.id)) : w.kind}</span>
                    {w.note && <span className="block truncate text-sm text-muted">{w.note}</span>}
                  </span>
                  <span className="shrink-0 text-right text-sm text-muted">
                    {w.minutes} {t('unit.min')}
                    <br />
                    {Math.round(w.kcal)} {t('unit.kcal')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {burned > 0 && (
        <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
          {t('workout.balance', {
            eaten: Math.round(eatenKcal),
            burned: Math.round(burned),
          })}
          <span className="text-ink">
            {t('workout.balanceValue', { n: Math.round(eatenKcal - burned) })}
          </span>
          {goalKcal !== null && t('workout.ofGoal', { n: Math.round(goalKcal) })}
        </p>
      )}

      {editing && (
        <Editor
          date={date}
          workout={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

function Editor({
  date,
  workout,
  onClose,
}: {
  date: string
  workout: Workout | null
  onClose: () => void
}) {
  const t = useT()
  const userId = useUserId()
  const profiles = useProfiles()
  const save = useSaveWorkout()
  const remove = useDeleteWorkout()

  const weight = profiles.data?.find((p) => p.userId === userId)?.weightKg ?? null

  const [kind, setKind] = useState(workout?.kind ?? 'gym')
  const [minutes, setMinutes] = useState<number | ''>(workout?.minutes ?? 60)
  // Правка расхода руками: пока её не было, показываем оценку и держим её
  // свежей. Как только человек вписал своё - оценка отступает и больше
  // не перебивает введённое при смене вида или длительности.
  const [kcal, setKcal] = useState<number | ''>(workout?.kcal ?? '')
  const [manual, setManual] = useState(workout !== null)
  const [note, setNote] = useState(workout?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const estimate = estimateKcal(kind, typeof minutes === 'number' ? minutes : 0, weight)
  const shown = manual ? kcal : (estimate ?? '')

  const submit = async () => {
    setError(null)
    if (typeof minutes !== 'number' || minutes < 1 || minutes > 600) {
      setError(t('workout.badMinutes'))
      return
    }
    const value = typeof shown === 'number' ? shown : 0
    try {
      await save.mutateAsync({
        ...(workout ? { id: workout.id } : {}),
        date,
        kind,
        minutes,
        kcal: value,
        note: note || null,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={t(workout ? 'workout.title' : 'workout.new')}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {WORKOUT_KINDS.map((k) => {
            const Icon = k.icon
            const active = kind === k.id
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm transition-colors ${
                  active ? 'bg-accent text-accent-ink' : 'bg-raised text-ink ring-1 ring-line'
                }`}
              >
                <Icon size={15} aria-hidden />
                {t(dynamicKey('workout', k.id))}
              </button>
            )
          })}
        </div>

        <NumberField
          label={t('workout.minutes')}
          value={minutes}
          onValueChange={setMinutes}
          max={600}
          suffix={t('unit.min')}
        />

        <NumberField
          label={t('workout.burned')}
          value={shown}
          onValueChange={(v) => {
            setManual(true)
            setKcal(v)
          }}
          max={5000}
          suffix={t('unit.kcal')}
          hint={
            weight === null
              ? t('workout.noWeight')
              : manual
                ? t('workout.manual')
                : t('workout.estimate', { n: weight })
          }
        />

        <Field
          label={t('common.note')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('common.optional')}
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} loading={save.isPending}>
          {t('common.save')}
        </Button>

        {workout && (
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => void remove.mutateAsync({ id: workout.id, date }).then(onClose)}
          >
            <Trash2 size={18} aria-hidden />
            {t('common.delete')}
          </Button>
        )}
      </div>
    </Sheet>
  )
}
