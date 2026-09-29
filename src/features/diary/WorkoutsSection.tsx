import { dynamicKey, useT } from '@/lib/i18n'
import { useState } from 'react'
import { Dumbbell, Flame, Plus, Trash2 } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Field, NumberField } from '@/ui/Field'
import { IconBadge } from '@/ui/IconBadge'
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

  // Вид карточки - как у приёма пищи: заголовок, строки во всю ширину
  // и «Добавить» кнопкой внизу. Раньше тут была мелкая ссылка у края,
  // и секция выглядела чужой среди соседних карточек дня
  return (
    <Card as="section" className="mt-3 overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <h2 className="min-w-0 flex-1 truncate font-display text-[17px] font-bold">{t('workout.section')}</h2>
        {burned > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums">
            <Flame size={15} aria-hidden className="text-tone-amber" />
            {Math.round(burned)} <span className="font-normal text-muted">{t('unit.kcal')}</span>
          </span>
        )}
      </div>

      {mine.length === 0 ? (
        <p className="mx-4 mb-1 rounded-2xl border border-dashed border-line px-4 py-3 text-center text-[13px] text-muted">
          {t('workout.dayEmpty')}
        </p>
      ) : (
        <ul>
          {mine.map((w) => {
            const kind = KIND_BY_ID[w.kind]
            return (
              <li
                key={w.id}
                // Разделитель от текста, а не от края - как у строк еды выше
                className="relative before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-line"
              >
                <button
                  type="button"
                  onClick={() => setEditing(w)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-raised"
                >
                  <IconBadge icon={kind?.icon ?? Dumbbell} tone="amber" size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">
                      {kind ? t(dynamicKey('workout', kind.id)) : w.kind}
                    </span>
                    <span className="block truncate text-[13px] text-muted">
                      <span className="tabular-nums">{w.minutes}</span> {t('unit.min')}
                      {w.note && ` · ${w.note}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {Math.round(w.kcal)} <span className="font-normal text-muted">{t('unit.kcal')}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {burned > 0 && (
        <p className="mx-3 mt-2 rounded-2xl bg-raised/60 px-3.5 py-2.5 text-[13px] text-muted">
          {t('workout.balance', {
            eaten: Math.round(eatenKcal),
            burned: Math.round(burned),
          })}
          <span className="font-semibold text-ink">
            {t('workout.balanceValue', { n: Math.round(eatenKcal - burned) })}
          </span>
          {goalKcal !== null && t('workout.ofGoal', { n: Math.round(goalKcal) })}
        </p>
      )}

      <div className="px-3 pt-2 pb-3">
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-accent-soft
                     px-4 text-[15px] font-semibold text-accent-soft-ink transition-transform active:scale-[0.97]"
        >
          <Plus size={18} strokeWidth={2.4} aria-hidden />
          {t('common.add')}
        </button>
      </div>

      {editing && (
        <Editor
          date={date}
          workout={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
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
          {WORKOUT_KINDS.map((k) => (
            <Chip key={k.id} icon={k.icon} selected={kind === k.id} onClick={() => setKind(k.id)}>
              {t(dynamicKey('workout', k.id))}
            </Chip>
          ))}
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

        {/* Тот же низ, что у шторки порции: удаление - значком слева,
            главное действие - широкой кнопкой под большим пальцем */}
        <div className="flex gap-2">
          {workout && (
            <Button
              variant="danger"
              loading={remove.isPending}
              aria-label={t('common.delete')}
              className="min-h-14 w-14 shrink-0 px-0"
              onClick={() => void remove.mutateAsync({ id: workout.id, date }).then(onClose)}
            >
              {!remove.isPending && <Trash2 size={20} aria-hidden />}
            </Button>
          )}
          <Button className="min-h-14 flex-1 text-[17px]" onClick={() => void submit()} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
