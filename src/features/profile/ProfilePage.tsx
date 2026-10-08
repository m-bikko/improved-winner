import { CookAccess } from '@/features/cook/CookAccess'
import { HealthSummary } from './HealthSummary'
import { EnergyBalance } from './EnergyBalance'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BellRing,
  Languages,
  Check,
  CircleCheck,
  Circle,
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
  ACTIVITY_LEVELS,
  GOAL_DIRECTIONS,
  computeGoals,
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
import { Field, INPUT_CLASS, NumberField } from '@/ui/Field'
import { Card, SectionTitle } from '@/ui/Card'
import { IconBadge } from '@/ui/IconBadge'
import { ListGroup, ListRow } from '@/ui/List'
import { Segmented } from '@/ui/Segmented'
import { Switch } from '@/ui/Switch'

import { Sheet } from '@/ui/Sheet'
import { ErrorState, Loading } from '@/ui/States'
import {
  goalsFor,
  useProfiles,
  useSaveProfile,
  useWeightLog,
  type Profile,
} from './api'
import { BodyChart } from './BodyChart'
import { WeighInSheet } from './WeighInSheet'
import { BodyComposition } from './BodyComposition'

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

function ProfileForm({ profile }: { profile: Profile }) {
  const t = useT()
  const save = useSaveProfile()
  const weights = useWeightLog(profile.userId)
  const freezeGoal = useFreezeDayGoal()

  const [birthYear, setBirthYear] = useState<number | ''>(profile.birthYear ?? '')
  const [heightCm, setHeightCm] = useState<number | ''>(profile.heightCm ?? '')
  // Вес - НЕ поле формы. Его меняет только взвешивание, а форма читает
  // текущий из профиля. Раньше здесь была своя копия: взвешивание обновляло
  // профиль, копия оставалась старой, форма считала себя изменённой
  // и предлагала «Сохранить» - а сохранение писало в журнал старый вес
  // без состава тела и стирало только что внесённые данные с умных весов
  const weightKg = profile.weightKg
  const [sex, setSex] = useState<Sex | null>(profile.sex)
  const [activity, setActivity] = useState<ActivityLevel>(profile.activityLevel)
  const [goal, setGoal] = useState<GoalDirection>(profile.goalDirection)
  const [manualKcal, setManualKcal] = useState<number | ''>(profile.goalKcal ?? '')
  const [manual, setManual] = useState(profile.goalsMode === 'manual')
  const [chatId, setChatId] = useState(profile.telegramChatId ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  // Отметка «Сохранено» живёт пару секунд и уходит вместе с панелью
  useEffect(() => {
    if (!saved) return
    const id = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(id)
  }, [saved])

  const preview = computeGoals({
    birthYear: birthYear === '' ? null : birthYear,
    sex,
    heightCm: heightCm === '' ? null : heightCm,
    weightKg,
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
    v !== '' && (v < lo || v > hi) ? t('profile.expected', { lo, hi, unit }) : null

  const range = {
    birthYear: outOfRange(birthYear, 1900, 2100, t('profile.unit.years')),
    heightCm: outOfRange(heightCm, 100, 250, t('profile.unit.cm')),
  }
  const hasRangeError = Object.values(range).some((r) => r !== null)

  // Тот же формат, что и в CHECK на колонке: пустое или цифры, возможно
  // со знаком минус - у групповых чатов id отрицательный
  const chatIdInvalid = chatId.trim() !== '' && !/^-?\d{1,20}$/.test(chatId.trim())

  // Чего именно не хватает для расчёта нормы. Показываем списком, а не общим
  // «заполните профиль»: человек должен видеть, какие два поля осталось ввести,
  // а не искать пустое среди семи.
  const missing = [
    birthYear === '' && t('profile.birthYearLow'),
    sex === null && t('profile.sexLow'),
    heightCm === '' && t('profile.heightLow'),
    weightKg === null && t('profile.weightLow'),
  ].filter((x): x is string => typeof x === 'string')

  // Есть ли что сохранять. Панель «Сохранить» появляется только тогда:
  // раньше кнопка стояла в самом низу длинной страницы, и после правки
  // роста человек не знал, применилось ли - а кнопку надо было искать
  const dirty =
    birthYear !== (profile.birthYear ?? '') ||
    heightCm !== (profile.heightCm ?? '') ||
    sex !== profile.sex ||
    activity !== profile.activityLevel ||
    goal !== profile.goalDirection ||
    manual !== (profile.goalsMode === 'manual') ||
    manualKcal !== (profile.goalKcal ?? '') ||
    chatId.trim() !== (profile.telegramChatId ?? '')

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {missing.length > 0 && (
        <p className="flex items-start gap-2.5 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-soft-ink">
          <Target size={17} className="mt-0.5 shrink-0" aria-hidden />
          <span>{t('profile.missing', { list: missing.join(', ') })}</span>
        </p>
      )}

      <SectionTitle>{t('profile.section.body')}</SectionTitle>

      <Card className="p-4">
        <div className="flex items-center gap-2.5">
          <IconBadge icon={Scale} tone="slate" size="sm" />
          <p className="font-display text-[17px] font-bold">{t('chart.title')}</p>
        </div>
        {/* Кнопка стоит НАД графиком: взвешивание - действие, за которым
            сюда приходят каждый день, а график - то, ради чего его делают.
            Внизу карточки её пришлось бы искать за фильтрами и таблицей. */}
        <Button className="mt-3 w-full" onClick={() => setWeighIn(true)}>
          <Scale size={18} aria-hidden />
          {t('body.weighInAction')}
        </Button>

        <div className="mt-4">
          {weights.isSuccess ? <BodyChart points={weights.data} /> : <Loading />}
        </div>
      </Card>

      <BodyComposition
        userId={profile.userId}
        sex={sex}
        heightCm={heightCm === '' ? null : heightCm}
        weightKg={weightKg}
      />

      {weighIn && (
        <WeighInSheet
          userId={profile.userId}
          existing={weights.data?.find((p) => p.date === todayLocal()) ?? null}
          onClose={() => setWeighIn(false)}
        />
      )}

      <SectionTitle className="mt-4">{t('profile.section.norm')}</SectionTitle>

      <Card className="flex flex-col gap-5 p-4">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label={t('profile.birthYear')}
            value={birthYear}
            onValueChange={setBirthYear}
            max={2100}
            placeholder="2004"
            invalid={range.birthYear !== null}
            hint={range.birthYear ?? undefined}
          />
          <NumberField
            label={t('profile.height')}
            suffix={t('profile.unit.cm')}
            value={heightCm}
            onValueChange={setHeightCm}
            max={250}
            invalid={range.heightCm !== null}
            hint={range.heightCm ?? undefined}
          />
          {/* Вес здесь только показывается: менять его - это взвешивание,
              со всеми полями умных весов. Плитка открывает ту же шторку */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">{t('profile.weight')}</span>
            <button
              type="button"
              onClick={() => setWeighIn(true)}
              className={`${INPUT_CLASS} flex items-center justify-between gap-2 text-left transition-transform active:scale-[0.98]`}
            >
              <span className={`truncate tabular-nums ${weightKg === null ? 'text-muted' : ''}`}>
                {weightKg === null ? t('body.weighInAction') : `${weightKg} ${t('unit.kg')}`}
              </span>
              <Scale size={17} aria-hidden className="shrink-0 text-muted" />
            </button>
            <span className="text-[13px] text-muted">{t('profile.weightFromLog')}</span>
          </div>
        </div>

        <div>
          <Label>{t('profile.sex')}</Label>
          <Segmented
            ariaLabel={t('profile.sex')}
            value={sex ?? ''}
            onChange={(v) => setSex(v === '' ? null : v)}
            options={[
              { value: 'male', label: t('profile.male') },
              { value: 'female', label: t('profile.female') },
            ]}
          />
        </div>

        <div>
          <Label>{t('profile.activity')}</Label>
          <div className="flex flex-col gap-1.5">
            {ACTIVITY_LEVELS.map((level) => (
              <Row key={level} active={activity === level} onClick={() => setActivity(level)}>
                {t(dynamicKey('activity', level))}
              </Row>
            ))}
          </div>
        </div>

        <div>
          <Label>{t('profile.goal')}</Label>
          <div className="grid grid-cols-3 gap-2">
            {GOAL_DIRECTIONS.map((g) => (
              <Choice key={g} active={goal === g} onClick={() => setGoal(g)}>
                {t(dynamicKey('goal', g))}
              </Choice>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-raised/70 p-4">
          <p className="text-sm font-semibold text-muted">{t('profile.daily')}</p>

          {effective ? (
            <>
              <p className="mt-1 font-display text-[32px] leading-tight font-extrabold tabular-nums">
                {Math.round(effective.kcal)}{' '}
                <span className="text-lg font-bold text-muted">{t('unit.kcal')}</span>
              </p>
              <p className="mt-1 text-sm tabular-nums">
                <span className="font-semibold text-protein">{t('macro.p')}</span> {preview?.protein} ·{' '}
                <span className="font-semibold text-fat">{t('macro.f')}</span> {preview?.fat} ·{' '}
                <span className="font-semibold text-carbs">{t('macro.c')}</span> {preview?.carbs}{' '}
                <span className="text-muted">{t('unit.gram')}</span>
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">{t('profile.autoHint')}</p>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-[15px] font-medium">{t('profile.manual')}</span>
            <Switch checked={manual} onChange={setManual} label={t('profile.manual')} />
          </div>

          {manual && (
            <div className="mt-3">
              <NumberField
                label={t('profile.ownGoal')}
                suffix={t('unit.kcal')}
                value={manualKcal}
                onValueChange={setManualKcal}
                max={10000}
                hint={t('profile.manualHint')}
              />
            </div>
          )}
        </div>
      </Card>

      <HealthSummary />

      {/* Ниже дневной нормы, а не выше: норма - то, чем человек пользуется
          каждый день, а измеренный расход - повод её пересмотреть */}
      <EnergyBalance userId={profile.userId} />

      <SectionTitle className="mt-4">{t('profile.section.settings')}</SectionTitle>

      <ListGroup>
        <ListRow to="/notifications" icon={BellRing} tone="slate" title={t('profile.notifications')} />
        <ListRow to="/year" icon={Sparkles} tone="accent" title={t('profile.year')} />
        <ListRow
          onClick={() => setPinOpen(true)}
          icon={KeyRound}
          tone="sky"
          title={t('profile.changePinButton')}
        />
        <FaceIdRow />
      </ListGroup>

      <LanguageRow />

      <PushToggle userId={profile.userId} />

      <Card className="p-4">
        <p className="flex items-center gap-2.5 text-[15px] font-semibold">
          <IconBadge icon={Send} tone="sky" size="sm" />
          {t('profile.telegram')}
        </p>
        <p className="mt-2 mb-3 text-[13px] text-muted">{t('profile.telegramAbout')}</p>
        <Field
          label="Chat ID"
          value={chatId}
          onChange={(e) => setChatId(e.target.value.replace(/[^\d-]/g, ''))}
          placeholder="123456789"
          inputMode="numeric"
          hint={t('profile.chatIdHint', { link: BOT_LINK })}
        />
        {chatIdInvalid && <p className="mt-1 text-xs text-danger">{t('profile.chatIdDigits')}</p>}
      </Card>

      <CookAccess />

      <ChangePinSheet open={pinOpen} onClose={() => setPinOpen(false)} />

      {(dirty || saved || error) && (
        <div className="sticky bottom-above-tabbar z-20 mt-1">
          <div className="flex items-center gap-3 rounded-3xl bg-surface/90 p-2 pl-4 shadow-float backdrop-blur-xl">
            <span className={`min-w-0 flex-1 text-sm ${error ? 'text-danger' : 'text-muted'}`}>
              {error ?? (saved && !dirty ? t('profile.saved') : t('profile.unsaved'))}
            </span>
            <Button
              className="min-h-11 shrink-0 px-6"
              onClick={() => void submit()}
              loading={save.isPending}
              disabled={hasRangeError || chatIdInvalid || (!dirty && saved)}
            >
              <Check size={18} aria-hidden />
              {saved && !dirty ? t('profile.saved') : t('common.save')}
            </Button>
          </div>
        </div>
      )}
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
    <Card className="p-4">
      <p className="flex items-center gap-2.5 text-[15px] font-semibold">
        <IconBadge icon={Languages} tone="teal" size="sm" />
        {t('lang.title')}
      </p>
      <Segmented
        className="mt-3"
        ariaLabel={t('lang.title')}
        value={lang}
        onChange={(code) => save.mutate(code)}
        options={LANGS.map((code) => ({ value: code, label: LANG_NAMES[code] }))}
      />
      <p className="mt-2 text-[13px] text-muted">{t('lang.hint')}</p>
    </Card>
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
      <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
        <IconBadge icon={ScanFace} tone="violet" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">{t('profile.faceId')}</p>
          <p className="mt-0.5 text-[13px] text-muted">{t('profile.faceIdHint')}</p>
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
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <IconBadge icon={BellRing} tone="rose" size="sm" />
        <p className="min-w-0 flex-1 text-[15px] font-semibold">{t('push.device')}</p>
        {(state === 'off' || state === 'on') && (
          <Switch
            checked={state === 'on'}
            disabled={busy}
            label={t(state === 'on' ? 'push.disable' : 'push.enable')}
            onChange={() => void toggle()}
          />
        )}
      </div>
      <p className="mt-2 text-[13px] text-muted">{state ? hint[state] : t('push.checking')}</p>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </Card>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">{children}</p>
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
      className={`min-h-12 rounded-2xl px-2 py-1.5 text-center text-sm leading-tight font-semibold
                  transition-[background-color,color,transform] active:scale-95 ${
                    active ? 'bg-accent text-accent-ink' : 'bg-raised text-ink'
                  }`}
    >
      {children}
    </button>
  )
}

/** Вариант из списка: отметка слева - выбор виден и без цвета. */
function Row({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const Mark = active ? CircleCheck : Circle
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-[15px]
                  transition-colors ${active ? 'bg-accent-soft font-semibold text-accent-soft-ink' : 'bg-raised text-ink'}`}
    >
      <Mark size={20} aria-hidden className={`shrink-0 ${active ? '' : 'text-muted/60'}`} />
      {children}
    </button>
  )
}

export { goalsFor }
