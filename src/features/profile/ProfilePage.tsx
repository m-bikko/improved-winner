import { CookAccess } from '@/features/cook/CookAccess'
import { HealthSummary } from './HealthSummary'
import { EnergyBalance } from './EnergyBalance'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BellRing, Check, KeyRound, Languages, Scale, ScanFace, Send, Sparkles, Target } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { todayLocal } from '@/lib/date'
import {
  ACTIVITY_LEVELS,
  GOAL_DIRECTIONS,
  computeGoals,
  macrosFor,
  type ActivityLevel,
  type GoalDirection,
  type Sex,
} from '@/lib/nutrition'
import { PIN_LENGTH } from '@/lib/accounts'
import { dynamicKey, useLang, useT } from '@/lib/i18n'
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
import { Field } from '@/ui/Field'
import { Card, SectionTitle } from '@/ui/Card'
import { IconBadge } from '@/ui/IconBadge'
import { ListGroup, ListRow } from '@/ui/List'
import { Switch } from '@/ui/Switch'
import { toast } from '@/ui/Toast'

import { Sheet } from '@/ui/Sheet'
import { ErrorState, Loading } from '@/ui/States'
import {
  goalsFor,
  leanFrom,
  useProfiles,
  useSaveProfile,
  useWeightLog,
  type Profile,
} from './api'
import { BodyChart } from './BodyChart'
import { WeighInSheet } from './WeighInSheet'
import { BodyComposition } from './BodyComposition'
import { ChoiceSheet, NumberSheet } from './SettingSheets'

/** Бот, от имени которого приходят уведомления. */
const BOT_LINK = '@improved_winner_nine_bot'

export function ProfilePage() {
  const t = useT()
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const profiles = useProfiles()

  if (profiles.isError) {
    return <ErrorState error={profiles.error} onRetry={() => void profiles.refetch()} />
  }
  if (!profiles.isSuccess) return <Loading />

  const me = profiles.data.find((p) => p.userId === userId)
  if (!me) return <ErrorState error={new Error(t('profile.notFound'))} />

  return <ProfileForm profile={me} />
}

type Field = 'birthYear' | 'heightCm' | 'sex' | 'activity' | 'goal' | 'kcal' | 'lang' | 'telegram'

/**
 * Профиль как системные настройки: строка показывает значение, нажатие открывает
 * выбор, и изменение применяется сразу.
 *
 * Раньше это была одна длинная форма с панелью «Есть несохранённые изменения» внизу:
 * поправил рост - ищи кнопку, ушёл с экрана - потерял. Значение, которое сохраняется
 * само, не требует помнить ни о кнопке, ни о том, применилось ли оно.
 */
function ProfileForm({ profile }: { profile: Profile }) {
  const t = useT()
  const { lang } = useLang()
  const saveLang = useSaveLang()
  const save = useSaveProfile()
  const weights = useWeightLog(profile.userId)
  const freezeGoal = useFreezeDayGoal()

  // Вес - НЕ поле формы. Его меняет только взвешивание, а форма читает
  // текущий из профиля. Раньше здесь была своя копия: взвешивание обновляло
  // профиль, копия оставалась старой, форма считала себя изменённой
  // и предлагала «Сохранить» - а сохранение писало в журнал старый вес
  // без состава тела и стирало только что внесённые данные с умных весов
  const weightKg = profile.weightKg
  const [editing, setEditing] = useState<Field | null>(null)
  const [pinOpen, setPinOpen] = useState(false)
  const [weighIn, setWeighIn] = useState(false)

  // «Вес» с главной приходит сюда с ?weigh=1 и сразу открывает взвешивание.
  // Параметр снимается, чтобы перезагрузка не открывала шторку снова
  const [params, setParams] = useSearchParams()
  const weighParam = params.get('weigh')
  useEffect(() => {
    if (weighParam !== '1') return
    setWeighIn(true)
    setParams({}, { replace: true })
  }, [weighParam, setParams])

  /**
   * Применить изменение и пересчитать норму от него же.
   *
   * Те же входы, что у goalsFor: иначе экран показывал бы одну норму, а дневник
   * другую. Своя норма меняет только калории; Б/Ж/У делятся под них по тем же
   * правилам. Пересчитанная норма сразу уходит в снимок сегодняшнего дня, иначе
   * завтра он замёрзнет со старым значением.
   */
  const commit = (change: Partial<Pick<Profile, 'birthYear' | 'heightCm' | 'sex' | 'activityLevel' | 'goalDirection' | 'goalsMode' | 'goalKcal'>>) => {
    const next = { ...profile, ...change }
    const lean = leanFrom(profile)
    const calculated = computeGoals({
      birthYear: next.birthYear,
      sex: next.sex,
      heightCm: next.heightCm,
      weightKg,
      activityLevel: next.activityLevel,
      goalDirection: next.goalDirection,
      leanKg: lean,
      bmrKcal: profile.bmrKcal,
    })
    const own = next.goalsMode === 'manual' ? next.goalKcal : null
    const effective = own ? (weightKg !== null ? macrosFor(own, weightKg, lean) : null) : calculated
    save.mutate(
      {
        userId: profile.userId,
        patch: {
          ...change,
          // При автоматическом режиме ручные цели обнуляем: иначе они останутся
          // лежать в базе и однажды всплывут при переключении обратно
          ...(own && effective
            ? { goalProtein: effective.protein, goalFat: effective.fat, goalCarbs: effective.carbs }
            : { goalProtein: null, goalFat: null, goalCarbs: null }),
        },
      },
      {
        onSuccess: () => {
          if (effective) {
            freezeGoal.mutate({ userId: profile.userId, date: todayLocal(), goal: effective, goalDirection: next.goalDirection })
          }
        },
        onError: (e) => toast({ text: e.message }),
      },
    )
  }

  const norm = goalsFor(profile)
  const manual = profile.goalsMode === 'manual'
  const notSet = t('common.notSet')

  // Чего именно не хватает для расчёта нормы. Показываем списком, а не общим
  // «заполните профиль»: человек должен видеть, какие поля осталось ввести
  const missing = [
    profile.birthYear === null && t('profile.birthYearLow'),
    profile.sex === null && t('profile.sexLow'),
    profile.heightCm === null && t('profile.heightLow'),
    weightKg === null && t('profile.weightLow'),
  ].filter((x): x is string => typeof x === 'string')

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {missing.length > 0 && (
        <p className="flex items-start gap-2.5 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-soft-ink">
          <Target size={17} className="mt-0.5 shrink-0" aria-hidden />
          <span>{t('profile.missing', { list: missing.join(', ') })}</span>
        </p>
      )}

      {/* Взвешивание - действие, за которым сюда приходят каждый день */}
      <Button className="w-full" onClick={() => setWeighIn(true)}>
        <Scale size={18} aria-hidden />
        {t('body.weighInAction')}
      </Button>

      <Card className="p-4">
        <p className="type-headline">{t('chart.title')}</p>
        <div className="mt-3">{weights.isSuccess ? <BodyChart points={weights.data} /> : <Loading />}</div>
      </Card>

      <BodyComposition userId={profile.userId} sex={profile.sex} heightCm={profile.heightCm} weightKg={weightKg} />

      {weighIn && (
        <WeighInSheet
          userId={profile.userId}
          existing={weights.data?.find((p) => p.date === todayLocal()) ?? null}
          onClose={() => setWeighIn(false)}
        />
      )}

      <SectionTitle className="mt-4">{t('profile.section.norm')}</SectionTitle>

      <Card className="p-4">
        <p className="text-[13px] font-semibold text-muted">{t('profile.daily')}</p>
        {norm ? (
          <>
            <p className="mt-0.5 font-display text-[32px] leading-tight font-extrabold tabular-nums">
              {Math.round(norm.kcal)} <span className="text-lg font-bold text-muted">{t('unit.kcal')}</span>
            </p>
            <p className="mt-0.5 text-[15px] tabular-nums">
              <span className="font-semibold text-protein">{t('macro.p')}</span> {norm.protein} ·{' '}
              <span className="font-semibold text-fat">{t('macro.f')}</span> {norm.fat} ·{' '}
              <span className="font-semibold text-carbs">{t('macro.c')}</span> {norm.carbs}{' '}
              <span className="text-muted">{t('unit.gram')}</span>
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">{t('profile.autoHint')}</p>
        )}
      </Card>

      <ListGroup>
        <ListRow
          onClick={() => setEditing('birthYear')}
          title={t('profile.birthYear')}
          trailing={profile.birthYear ?? notSet}
        />
        <ListRow
          onClick={() => setEditing('heightCm')}
          title={t('profile.height')}
          trailing={profile.heightCm === null ? notSet : `${profile.heightCm} ${t('profile.unit.cm')}`}
        />
        {/* Вес здесь только показывается: менять его - это взвешивание,
            со всеми полями умных весов. Строка открывает ту же шторку */}
        <ListRow
          onClick={() => setWeighIn(true)}
          title={t('profile.weight')}
          subtitle={t('profile.weightFromLog')}
          trailing={weightKg === null ? notSet : `${weightKg} ${t('unit.kg')}`}
        />
        <ListRow
          onClick={() => setEditing('sex')}
          title={t('profile.sex')}
          trailing={profile.sex === null ? notSet : t(profile.sex === 'male' ? 'profile.male' : 'profile.female')}
        />
        <ListRow
          onClick={() => setEditing('activity')}
          title={t('profile.activity')}
          subtitle={t(dynamicKey('activity', profile.activityLevel))}
        />
        <ListRow
          onClick={() => setEditing('goal')}
          title={t('profile.goal')}
          trailing={t(dynamicKey('goal', profile.goalDirection))}
        />
      </ListGroup>

      <ListGroup>
        <ListRow
          static
          title={t('profile.manual')}
          trailing={
            <Switch
              checked={manual}
              label={t('profile.manual')}
              onChange={(on) => {
                if (on) setEditing('kcal')
                else commit({ goalsMode: 'auto', goalKcal: null })
              }}
            />
          }
        />
        {manual && (
          <ListRow
            onClick={() => setEditing('kcal')}
            title={t('profile.ownGoal')}
            trailing={`${profile.goalKcal ?? ''} ${t('unit.kcal')}`}
          />
        )}
      </ListGroup>
      {manual && <p className="-mt-1 px-4 text-[13px] text-muted">{t('profile.manualHint')}</p>}

      <HealthSummary />

      {/* Ниже дневной нормы, а не выше: норма - то, чем человек пользуется
          каждый день, а измеренный расход - повод её пересмотреть */}
      <EnergyBalance userId={profile.userId} />

      <SectionTitle className="mt-4">{t('profile.section.settings')}</SectionTitle>

      <ListGroup>
        <ListRow to="/notifications" icon={BellRing} tone="rose" title={t('profile.notifications')} />
        <ListRow onClick={() => setEditing('lang')} icon={Languages} tone="teal" title={t('lang.title')} trailing={LANG_NAMES[lang]} />
        <ListRow onClick={() => setPinOpen(true)} icon={KeyRound} tone="sky" title={t('profile.changePinButton')} />
        <FaceIdRow />
        <ListRow
          onClick={() => setEditing('telegram')}
          icon={Send}
          tone="sky"
          title={t('profile.telegram')}
          trailing={profile.telegramChatId ? t('profile.connected') : notSet}
        />
        <ListRow to="/year" icon={Sparkles} tone="accent" title={t('profile.year')} />
      </ListGroup>

      <PushToggle userId={profile.userId} />

      <CookAccess />

      <ChangePinSheet open={pinOpen} onClose={() => setPinOpen(false)} />

      {editing === 'birthYear' && (
        <NumberSheet
          title={t('profile.birthYear')}
          value={profile.birthYear}
          min={1900}
          max={2100}
          unit={t('profile.unit.years')}
          placeholder="2004"
          onSave={(birthYear) => commit({ birthYear })}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === 'heightCm' && (
        <NumberSheet
          title={t('profile.height')}
          value={profile.heightCm}
          suffix={t('profile.unit.cm')}
          min={100}
          max={250}
          unit={t('profile.unit.cm')}
          onSave={(heightCm) => commit({ heightCm })}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === 'kcal' && (
        <NumberSheet
          title={t('profile.ownGoal')}
          value={profile.goalKcal ?? norm?.kcal ?? null}
          suffix={t('unit.kcal')}
          min={500}
          max={10000}
          unit={t('unit.kcal')}
          hint={t('profile.manualHint')}
          onSave={(goalKcal) => commit({ goalsMode: 'manual', goalKcal })}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === 'sex' && (
        <ChoiceSheet<Sex>
          title={t('profile.sex')}
          value={profile.sex}
          options={[
            { value: 'male', label: t('profile.male') },
            { value: 'female', label: t('profile.female') },
          ]}
          onPick={(sex) => commit({ sex })}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === 'activity' && (
        <ChoiceSheet<ActivityLevel>
          title={t('profile.activity')}
          value={profile.activityLevel}
          options={ACTIVITY_LEVELS.map((level) => ({ value: level, label: t(dynamicKey('activity', level)) }))}
          onPick={(activityLevel) => commit({ activityLevel })}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === 'goal' && (
        <ChoiceSheet<GoalDirection>
          title={t('profile.goal')}
          value={profile.goalDirection}
          options={GOAL_DIRECTIONS.map((g) => ({ value: g, label: t(dynamicKey('goal', g)) }))}
          onPick={(goalDirection) => commit({ goalDirection })}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === 'lang' && (
        <ChoiceSheet
          title={t('lang.title')}
          value={lang}
          options={LANGS.map((code) => ({ value: code, label: LANG_NAMES[code] }))}
          footer={t('lang.hint')}
          // Язык меняется по нажатию, а не по ответу сервера
          onPick={(code) => saveLang.mutate(code)}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === 'telegram' && (
        <TelegramSheet
          value={profile.telegramChatId ?? ''}
          onSave={(chatId) => {
            save.mutate(
              { userId: profile.userId, patch: { telegramChatId: chatId || null } },
              { onError: (e) => toast({ text: e.message }) },
            )
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function TelegramSheet({ value, onSave, onClose }: { value: string; onSave: (chatId: string) => void; onClose: () => void }) {
  const t = useT()
  const [chatId, setChatId] = useState(value)
  // Тот же формат, что и в CHECK на колонке: пустое или цифры, возможно
  // со знаком минус - у групповых чатов id отрицательный
  const invalid = chatId.trim() !== '' && !/^-?\d{1,20}$/.test(chatId.trim())
  return (
    <Sheet open onClose={onClose} title={t('profile.telegram')}>
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-muted">{t('profile.telegramAbout')}</p>
        <Field
          label="Chat ID"
          value={chatId}
          onChange={(e) => setChatId(e.target.value.replace(/[^\d-]/g, ''))}
          placeholder="123456789"
          inputMode="numeric"
          hint={t('profile.chatIdHint', { link: BOT_LINK })}
        />
        {invalid && <p className="-mt-2 text-[13px] text-danger">{t('profile.chatIdDigits')}</p>}
        <Button
          disabled={invalid}
          onClick={() => {
            onSave(chatId.trim())
            onClose()
          }}
        >
          {t('common.save')}
        </Button>
      </div>
    </Sheet>
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
  const t = useT()
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
      setError(failure.kind === 'wrong-pin' ? t('login.wrongPin') : t('profile.pinCheckFailed'))
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
      setError(t('profile.noKey'))
      setShake((k) => k + 1)
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Строка сгруппированного списка настроек, а не отдельная карточка:
          переключатель справа, объяснение мелко под названием */}
      <div className="flex min-h-11 items-center gap-3 px-4 py-2 [--sep:3.5625rem]">
        <IconBadge icon={ScanFace} tone="violet" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[17px]">{t('profile.faceId')}</p>
          <p className="text-[13px] text-muted">{t('profile.faceIdHint')}</p>
        </div>
        <Switch
          checked={on}
          label={t('profile.faceId')}
          onChange={(next) => {
            if (!next) {
              forgetBiometrics(account)
              setOn(false)
            } else {
              setError(null)
              setPin('')
              setAsking(true)
            }
          }}
        />
      </div>

      <Sheet open={asking} onClose={() => setAsking(false)} title={t('profile.faceId')}>
        <div className="flex flex-col items-center py-2">
          <PinPad
            title={t('profile.confirmPin')}
            subtitle={t('profile.confirmPinHint')}
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
  const t = useT()
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
      setError(t('profile.pinMismatch'))
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
      title={t('profile.changePin')}
    >
      <div className="flex flex-col items-center py-2">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Check size={28} className="text-carbs" aria-hidden />
            <p>{t('profile.pinChanged')}</p>
            <p className="text-sm text-muted">
              {t('profile.pinChangedHint')}
            </p>
          </div>
        ) : (
          <PinPad
            title={confirm === null ? t('profile.newPin') : t('profile.repeatPin')}
            subtitle={confirm === null ? t('profile.pinDigits', { n: PIN_LENGTH }) : t('profile.onceMore')}
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
  const t = useT()
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
    unsupported: t('push.noSupport'),
    'not-installed': t('push.installFirst'),
    unconfigured: t('push.notConfigured'),
    denied: t('push.blocked'),
    off: t('push.offHint'),
    on: t('push.onHint'),
  }

  return (
    <div className="flex flex-col gap-1.5">
      <ListGroup>
        <ListRow
          static
          icon={BellRing}
          tone="rose"
          title={t('push.device')}
          trailing={
            state === 'off' || state === 'on' ? (
              <Switch
                checked={state === 'on'}
                disabled={busy}
                label={t(state === 'on' ? 'push.disable' : 'push.enable')}
                onChange={() => void toggle()}
              />
            ) : undefined
          }
        />
      </ListGroup>
      <p className="px-4 text-[13px] text-muted">{state ? hint[state] : t('push.checking')}</p>
      {error && <p className="px-4 text-[13px] text-danger">{error}</p>}
    </div>
  )
}

export { goalsFor }
