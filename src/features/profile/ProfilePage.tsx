import { useState } from 'react'
import { Check, KeyRound, Scale } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { todayLocal } from '@/lib/date'
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  computeGoals,
  type ActivityLevel,
  type GoalDirection,
  type Sex,
} from '@/lib/nutrition'
import { PIN_LENGTH } from '@/lib/accounts'
import { useAuth } from '@/auth/AuthProvider'
import { PinPad } from '@/auth/PinPad'
import { Button } from '@/ui/Button'
import { NumberField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { ErrorState, Loading } from '@/ui/States'
import {
  goalsFor,
  useLogWeight,
  useProfiles,
  useSaveProfile,
  useWeightLog,
  type Profile,
} from './api'
import { WeightChart } from './WeightChart'

export function ProfilePage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const profiles = useProfiles()

  if (profiles.isError) {
    return <ErrorState error={profiles.error} onRetry={() => void profiles.refetch()} />
  }
  if (!profiles.isSuccess) return <Loading />

  const me = profiles.data.find((p) => p.userId === userId)
  if (!me) return <ErrorState error={new Error('Профиль не найден')} />

  return <ProfileForm profile={me} />
}

function ProfileForm({ profile }: { profile: Profile }) {
  const save = useSaveProfile()
  const weights = useWeightLog(profile.userId)
  const logWeight = useLogWeight()

  const [birthYear, setBirthYear] = useState<number | ''>(profile.birthYear ?? '')
  const [heightCm, setHeightCm] = useState<number | ''>(profile.heightCm ?? '')
  const [weightKg, setWeightKg] = useState<number | ''>(profile.weightKg ?? '')
  const [sex, setSex] = useState<Sex | null>(profile.sex)
  const [activity, setActivity] = useState<ActivityLevel>(profile.activityLevel)
  const [goal, setGoal] = useState<GoalDirection>(profile.goalDirection)
  const [manualKcal, setManualKcal] = useState<number | ''>(profile.goalKcal ?? '')
  const [manual, setManual] = useState(profile.goalsMode === 'manual')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pinOpen, setPinOpen] = useState(false)

  const preview = computeGoals({
    birthYear: birthYear === '' ? null : birthYear,
    sex,
    heightCm: heightCm === '' ? null : heightCm,
    weightKg: weightKg === '' ? null : weightKg,
    activityLevel: activity,
    goalDirection: goal,
  })

  const effective = manual && manualKcal !== '' ? { ...preview, kcal: manualKcal } : preview

  const submit = async () => {
    setError(null)
    setSaved(false)
    try {
      await save.mutateAsync({
        userId: profile.userId,
        patch: {
          birthYear: birthYear === '' ? null : birthYear,
          heightCm: heightCm === '' ? null : heightCm,
          weightKg: weightKg === '' ? null : weightKg,
          sex,
          activityLevel: activity,
          goalDirection: goal,
          goalsMode: manual ? 'manual' : 'auto',
          // При автоматическом режиме ручные цели обнуляем: иначе они останутся
          // лежать в базе и однажды всплывут при переключении обратно
          goalKcal: manual && manualKcal !== '' ? manualKcal : null,
          ...(manual && preview
            ? { goalProtein: preview.protein, goalFat: preview.fat, goalCarbs: preview.carbs }
            : { goalProtein: null, goalFat: null, goalCarbs: null }),
        },
      })
      // Вес попадает и в историю: profiles.weight_kg — это «последнее значение»,
      // а график строится по weight_log
      if (weightKg !== '' && weightKg !== profile.weightKg) {
        await logWeight.mutateAsync({
          userId: profile.userId,
          date: todayLocal(),
          weightKg,
        })
      }
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-3 pb-16">
      <div className="rounded-xl bg-surface px-4 py-4 ring-1 ring-line">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Scale size={16} aria-hidden />
          Вес
        </p>
        {weights.isSuccess ? <WeightChart points={weights.data} /> : <Loading />}

        {weights.isSuccess && weights.data.length > 0 && (
          <ul className="mt-3 border-t border-line pt-2 text-sm">
            {weights.data
              .slice(-5)
              .reverse()
              .map((p) => (
                <li key={p.date} className="flex justify-between py-1 text-muted">
                  <span>{p.date}</span>
                  <span>{p.weightKg.toFixed(1)} кг</span>
                </li>
              ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Год рождения"
          value={birthYear}
          onValueChange={setBirthYear}
          min={1900}
          max={2100}
          placeholder="2004"
        />
        <NumberField
          label="Рост"
          suffix="см"
          value={heightCm}
          onValueChange={setHeightCm}
          min={100}
          max={250}
        />
        <NumberField
          label="Вес"
          suffix="кг"
          value={weightKg}
          onValueChange={setWeightKg}
          min={20}
          max={400}
        />
      </div>

      <Group label="Пол">
        <Choice active={sex === 'male'} onClick={() => setSex('male')}>
          Мужской
        </Choice>
        <Choice active={sex === 'female'} onClick={() => setSex('female')}>
          Женский
        </Choice>
      </Group>

      <div>
        <p className="mb-2 text-sm text-muted">Активность</p>
        <div className="flex flex-col gap-1.5">
          {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => (
            <Row key={level} active={activity === level} onClick={() => setActivity(level)}>
              {ACTIVITY_LABELS[level]}
            </Row>
          ))}
        </div>
      </div>

      <Group label="Цель">
        {(Object.keys(GOAL_LABELS) as GoalDirection[]).map((g) => (
          <Choice key={g} active={goal === g} onClick={() => setGoal(g)}>
            {GOAL_LABELS[g]}
          </Choice>
        ))}
      </Group>

      <div className="rounded-xl bg-raised px-4 py-4">
        <p className="text-sm font-medium">Дневная норма</p>

        {effective ? (
          <>
            <p className="mt-1 text-2xl font-semibold">{Math.round(effective.kcal)} ккал</p>
            <p className="mt-1 text-sm text-muted">
              Б {preview?.protein} · Ж {preview?.fat} · У {preview?.carbs} г
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Заполни год рождения, пол, рост и вес — норма посчитается сама.
          </p>
        )}

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={manual}
            onChange={(e) => setManual(e.target.checked)}
            className="size-4 accent-[var(--c-accent)]"
          />
          Задать калории вручную
        </label>

        {manual && (
          <div className="mt-2">
            <NumberField
              label="Своя норма"
              suffix="ккал"
              value={manualKcal}
              onValueChange={setManualKcal}
              min={500}
              max={10000}
              hint="Белки, жиры и углеводы остаются расчётными."
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button onClick={() => void submit()} loading={save.isPending}>
        {saved ? <Check size={18} aria-hidden /> : null}
        {saved ? 'Сохранено' : 'Сохранить'}
      </Button>

      <Button variant="secondary" onClick={() => setPinOpen(true)}>
        <KeyRound size={18} aria-hidden />
        Сменить PIN
      </Button>

      <ChangePinSheet open={pinOpen} onClose={() => setPinOpen(false)} />
    </div>
  )
}

/**
 * Смена PIN.
 *
 * Экран обязателен, а не «на будущее»: у синтетических адресов нет
 * восстановления по почте, и без него единственный способ поменять код —
 * запустить скрипт с ноутбука.
 */
function ChangePinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setPin('')
    setConfirm(null)
    setError(null)
    setDone(false)
  }

  const handle = async (next: string) => {
    setPin(next)
    if (next.length !== PIN_LENGTH) return

    if (confirm === null) {
      setConfirm(next)
      setPin('')
      setError(null)
      return
    }

    if (next !== confirm) {
      setError('PIN-коды не совпали')
      setShake((s) => s + 1)
      setPin('')
      setConfirm(null)
      return
    }

    setBusy(true)
    const { error: authError } = await supabase.auth.updateUser({ password: next })
    setBusy(false)

    if (authError) {
      setError(authError.message)
      setShake((s) => s + 1)
      setPin('')
      setConfirm(null)
      return
    }
    setDone(true)
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Смена PIN"
    >
      <div className="flex flex-col items-center px-4 py-6">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Check size={28} className="text-carbs" aria-hidden />
            <p>PIN изменён</p>
            <p className="text-sm text-muted">
              На других устройствах, возможно, придётся войти заново.
            </p>
          </div>
        ) : (
          <PinPad
            title={confirm === null ? 'Новый PIN' : 'Повтори PIN'}
            subtitle={confirm === null ? `${PIN_LENGTH} цифр` : 'ещё раз, чтобы не ошибиться'}
            value={pin}
            onChange={(next) => void handle(next)}
            error={error}
            shakeKey={shake}
            disabled={busy}
          />
        )}
      </div>
    </Sheet>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Choice({
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
      className={`rounded-full px-4 py-2.5 text-sm transition-colors ${
        active ? 'bg-accent text-accent-ink' : 'bg-raised text-ink ring-1 ring-line'
      }`}
    >
      {children}
    </button>
  )
}

function Row({
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
      className={`flex items-center gap-2 rounded-xl px-4 py-3 text-left text-sm transition-colors ${
        active ? 'bg-accent text-accent-ink' : 'bg-surface text-ink ring-1 ring-line'
      }`}
    >
      {children}
    </button>
  )
}

export { goalsFor }
