import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BellRing,
  Languages,
  Check,
  ChevronRight,
  KeyRound,
  Scale,
  ScanFace,
  Send,
  Sparkles,
  Target,
} from 'lucide-react'
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
import { useLang, useT } from '@/lib/i18n'
import { LANGS, LANG_NAMES } from '@/lib/i18n/lang'
import { useSaveLang } from '@/lib/i18n/sync'
import {
  biometricsAvailable,
  enrollBiometrics,
  forgetBiometrics,
  hasBiometrics,
} from '@/lib/biometrics'
import { useAuth } from '@/auth/AuthProvider'
import { PinPad } from '@/auth/PinPad'
import { useFreezeDayGoal } from '@/features/diary/api'
import {
  getPushState,
  subscribeToPush,
  unsubscribeFromPush,
  type PushState,
} from '@/lib/push'
import { Button } from '@/ui/Button'
import { Field, NumberField } from '@/ui/Field'

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

/** Бот, от имени которого приходят уведомления. */
const BOT_LINK = '@improved_winner_nine_bot'

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
  const freezeGoal = useFreezeDayGoal()

  const [birthYear, setBirthYear] = useState<number | ''>(profile.birthYear ?? '')
  const [heightCm, setHeightCm] = useState<number | ''>(profile.heightCm ?? '')
  const [weightKg, setWeightKg] = useState<number | ''>(profile.weightKg ?? '')
  const [sex, setSex] = useState<Sex | null>(profile.sex)
  const [activity, setActivity] = useState<ActivityLevel>(profile.activityLevel)
  const [goal, setGoal] = useState<GoalDirection>(profile.goalDirection)
  const [manualKcal, setManualKcal] = useState<number | ''>(profile.goalKcal ?? '')
  const [manual, setManual] = useState(profile.goalsMode === 'manual')
  const [chatId, setChatId] = useState(profile.telegramChatId ?? '')
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
          telegramChatId: chatId.trim() || null,
          // При автоматическом режиме ручные цели обнуляем: иначе они останутся
          // лежать в базе и однажды всплывут при переключении обратно
          goalKcal: manual && manualKcal !== '' ? manualKcal : null,
          ...(manual && preview
            ? { goalProtein: preview.protein, goalFat: preview.fat, goalCarbs: preview.carbs }
            : { goalProtein: null, goalFat: null, goalCarbs: null }),
        },
      })
      // Вес попадает и в историю: profiles.weight_kg - это «последнее значение»,
      // а график строится по weight_log
      if (weightKg !== '' && weightKg !== profile.weightKg) {
        await logWeight.mutateAsync({
          userId: profile.userId,
          date: todayLocal(),
          weightKg,
        })
      }

      // Пересчитанная норма должна попасть в снимок сегодняшнего дня, иначе
      // завтра он замёрзнет со старым значением
      if (preview) {
        // Ручная норма перебивает только калории - Б/Ж/У остаются расчётными
        const kcal = manual && manualKcal !== '' ? manualKcal : preview.kcal
        await freezeGoal.mutateAsync({
          userId: profile.userId,
          date: todayLocal(),
          goal: { kcal, protein: preview.protein, fat: preview.fat, carbs: preview.carbs },
          goalDirection: goal,
        })
      }
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Нижние границы проверяются здесь, а не при вводе: блокировать символы
  // по минимуму - значит запретить ввод вовсе, потому что первая набранная
  // цифра года заведомо меньше 1900. Границы совпадают с CHECK в схеме.
  const outOfRange = (v: number | '', lo: number, hi: number, unit: string) =>
    v !== '' && (v < lo || v > hi) ? `Ожидается от ${lo} до ${hi} ${unit}` : null

  const range = {
    birthYear: outOfRange(birthYear, 1900, 2100, 'года'),
    heightCm: outOfRange(heightCm, 100, 250, 'см'),
    weightKg: outOfRange(weightKg, 20, 400, 'кг'),
  }
  const hasRangeError = Object.values(range).some((r) => r !== null)

  // Тот же формат, что и в CHECK на колонке: пустое или цифры, возможно
  // со знаком минус - у групповых чатов id отрицательный
  const chatIdInvalid = chatId.trim() !== '' && !/^-?\d{1,20}$/.test(chatId.trim())

  // Чего именно не хватает для расчёта нормы. Показываем списком, а не общим
  // «заполните профиль»: человек должен видеть, какие два поля осталось ввести,
  // а не искать пустое среди семи.
  const missing = [
    birthYear === '' && 'год рождения',
    sex === null && 'пол',
    heightCm === '' && 'рост',
    weightKg === '' && 'вес',
  ].filter((x): x is string => typeof x === 'string')

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-3 pb-16">
      {missing.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-raised px-4 py-3 text-sm">
          <Target size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span>
            Чтобы появилась дневная норма, не хватает: <b>{missing.join(', ')}</b>. По этим
            данным считается норма под твою цель.
          </span>
        </p>
      )}

      <Link
        to="/notifications"
        className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-4 ring-1 ring-line"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <BellRing size={16} aria-hidden />
          Уведомления
        </span>
        <ChevronRight size={18} aria-hidden className="text-muted" />
      </Link>

      <Link
        to="/year"
        className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-4 ring-1 ring-line"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Sparkles size={16} aria-hidden />
          Год в цифрах
        </span>
        <ChevronRight size={18} aria-hidden className="text-muted" />
      </Link>

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
          max={2100}
          placeholder="2004"
          invalid={range.birthYear !== null}
          hint={range.birthYear ?? undefined}
        />
        <NumberField
          label="Рост"
          suffix="см"
          value={heightCm}
          onValueChange={setHeightCm}
          max={250}
          invalid={range.heightCm !== null}
          hint={range.heightCm ?? undefined}
        />
        <NumberField
          label="Вес"
          suffix="кг"
          value={weightKg}
          onValueChange={setWeightKg}
          max={400}
          invalid={range.weightKg !== null}
          hint={range.weightKg ?? undefined}
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
            Заполни год рождения, пол, рост и вес - норма посчитается сама.
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
              max={10000}
              hint="Белки, жиры и углеводы остаются расчётными."
            />
          </div>
        )}
      </div>

      <PushToggle userId={profile.userId} />

      <div className="rounded-xl bg-raised px-4 py-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Send size={15} aria-hidden />
          Уведомления в Telegram
        </p>
        <p className="mt-1 mb-3 text-xs text-muted">
          Приходят партнёру, когда ты заводишь тему, отвечаешь в ней или закрываешь её.
          Пусто - уведомления не шлём.
        </p>
        <Field
          label="Chat ID"
          value={chatId}
          onChange={(e) => setChatId(e.target.value.replace(/[^\d-]/g, ''))}
          placeholder="123456789"
          inputMode="numeric"
          hint={`Узнать: напиши @userinfobot в Telegram, он ответит твоим id. Затем открой ${BOT_LINK} и нажми «Старт» - без этого бот не сможет тебе написать.`}
        />
        {chatIdInvalid && <p className="mt-1 text-xs text-danger">Chat ID - это только цифры.</p>}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button
        onClick={() => void submit()}
        loading={save.isPending}
        disabled={hasRangeError || chatIdInvalid}
      >
        {saved ? <Check size={18} aria-hidden /> : null}
        {saved ? 'Сохранено' : 'Сохранить'}
      </Button>

      <Button variant="secondary" onClick={() => setPinOpen(true)}>
        <KeyRound size={18} aria-hidden />
        Сменить PIN
      </Button>

      <ChangePinSheet open={pinOpen} onClose={() => setPinOpen(false)} />

      <LanguageRow />

      <FaceIdRow />
    </div>
  )
}

/**
 * Язык интерфейса.
 *
 * Свой у каждого: они могут читать на разных языках, и общий переключатель
 * заставил бы одного уступить. Переключается сразу, не дожидаясь сети -
 * язык интерфейса должен меняться по нажатию, а не по ответу сервера.
 */
function LanguageRow() {
  const t = useT()
  const { lang } = useLang()
  const save = useSaveLang()

  return (
    <div className="rounded-xl bg-surface px-4 py-4 ring-1 ring-line">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Languages size={16} aria-hidden />
        {t('lang.title')}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {LANGS.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => save.mutate(code)}
            aria-pressed={lang === code}
            className={`rounded-full px-4 py-2 text-sm transition-colors ${
              lang === code ? 'bg-accent text-accent-ink' : 'bg-raised text-ink ring-1 ring-line'
            }`}
          >
            {LANG_NAMES[code]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{t('lang.hint')}</p>
    </div>
  )
}

/**
 * Вход по Face ID.
 *
 * Включение требует ввести PIN и проверяется настоящим входом: запомнить
 * неверный значило бы сделать кнопку, которая всегда отказывает.
 *
 * На экране прямо сказано, чего это НЕ даёт. Проверка проходит на устройстве
 * и сервером не сверяется, а PIN лежит рядом с refresh-токеном, который
 * и без него открывает всё то же самое. Face ID тут заменяет набор цифр,
 * а не добавляет защиту, и делать вид, что добавляет, нельзя.
 */
function FaceIdRow() {
  const { account, signIn } = useAuth()
  const [available, setAvailable] = useState(false)
  const [on, setOn] = useState(false)
  const [asking, setAsking] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(0)

  useEffect(() => {
    if (!account) return
    let alive = true
    void biometricsAvailable().then((ok) => {
      if (!alive) return
      setAvailable(ok)
      setOn(hasBiometrics(account))
    })
    return () => {
      alive = false
    }
  }, [account])

  if (!account || !available) return null

  const finish = async (value: string) => {
    if (value.length !== PIN_LENGTH || busy) return
    setBusy(true)
    setError(null)
    const failure = await signIn(account, value)
    if (failure) {
      setError(failure.kind === 'wrong-pin' ? 'Неверный PIN' : 'Не удалось проверить PIN')
      setShake((k) => k + 1)
      setPin('')
      setBusy(false)
      return
    }
    try {
      await enrollBiometrics(account, value)
      setOn(true)
      setAsking(false)
      setPin('')
    } catch {
      setError('Устройство не создало ключ')
      setShake((k) => k + 1)
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3 rounded-xl bg-surface px-4 py-4 ring-1 ring-line">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ScanFace size={16} aria-hidden />
            Вход по Face ID
          </p>
          <p className="mt-1 text-xs text-muted">
            Заменяет набор PIN, но не усиливает защиту: проверка идёт на устройстве,
            а PIN хранится рядом с уже сохранённым входом.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Вход по Face ID"
          onClick={() => {
            if (on) {
              forgetBiometrics(account)
              setOn(false)
            } else {
              setError(null)
              setPin('')
              setAsking(true)
            }
          }}
          className={`mt-0.5 size-6 shrink-0 rounded-md ring-1 transition-colors ${
            on ? 'bg-accent ring-accent' : 'bg-bg ring-line'
          }`}
        />
      </div>

      <Sheet open={asking} onClose={() => setAsking(false)} title="Вход по Face ID">
        <div className="flex flex-col items-center py-2">
          <PinPad
            title="Подтверди PIN"
            subtitle="Чтобы запомнить его для Face ID"
            value={pin}
            onChange={(next) => {
              setPin(next)
              void finish(next)
            }}
            error={error}
            shakeKey={shake}
            disabled={busy}
          />
        </div>
      </Sheet>
    </>
  )
}

/**
 * Смена PIN.
 *
 * Экран обязателен, а не «на будущее»: у синтетических адресов нет
 * восстановления по почте, и без него единственный способ поменять код -
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
      <div className="flex flex-col items-center py-2">
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

/**
 * Переключатель push-уведомлений.
 *
 * Состояний больше двух, и каждое требует своего объяснения: на iOS Push
 * работает только у приложения с домашнего экрана, отклонённое разрешение
 * из приложения не переспросить, а без ключа VAPID подписка невозможна
 * в принципе. Показывать во всех этих случаях одну неработающую кнопку
 * значит оставить человека гадать.
 */
function PushToggle({ userId }: { userId: string }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getPushState().then(setState)
  }, [])

  const toggle = async () => {
    setBusy(true)
    setError(null)
    try {
      setState(state === 'on' ? await unsubscribeFromPush() : await subscribeToPush(userId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const hint: Record<PushState, string> = {
    unsupported: 'Этот браузер не умеет push-уведомления.',
    'not-installed':
      'Добавь приложение на экран «Домой» и открой уже оттуда - в обычной вкладке уведомления недоступны.',
    unconfigured: 'Push не настроен на сервере.',
    denied: 'Уведомления запрещены в настройках браузера. Включить можно только там.',
    off: 'Напоминания о завтраке, обеде и ужине, если приём пищи остался пустым.',
    on: 'Включены. Напоминания приходят в 11:00, 14:00 и 21:00, если приём пищи пуст.',
  }

  return (
    <div className="rounded-xl bg-raised px-4 py-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <BellRing size={15} aria-hidden />
        Уведомления на устройстве
      </p>
      <p className="mt-1 mb-3 text-xs text-muted">{state ? hint[state] : 'Проверяю…'}</p>

      {(state === 'off' || state === 'on') && (
        <Button variant={state === 'on' ? 'secondary' : 'primary'} onClick={() => void toggle()} loading={busy}>
          {state === 'on' ? 'Отключить' : 'Включить уведомления'}
        </Button>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
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
