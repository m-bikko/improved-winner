import { useEffect, useRef, useState } from 'react'
import { haptic } from '@/lib/haptics'
import { ChevronLeft, ChevronRight, Heart, ScanFace } from 'lucide-react'
import { ACCOUNTS, PIN_LENGTH, type Account } from '@/lib/accounts'
import { useT, type Translate } from '@/lib/i18n'
import { biometricsAvailable, hasBiometrics, unlockWithBiometrics } from '@/lib/biometrics'
import { useAuth, type SignInFailure } from './AuthProvider'
import { PinPad } from './PinPad'
import { APP_NAME } from '@/lib/appName'
import { Avatar } from '@/ui/Avatar'

/** Задержка после N подряд неверных попыток, в секундах. */
const LOCK_SECONDS = [0, 0, 0, 5, 15, 30, 60] as const

function lockFor(attempts: number): number {
  return LOCK_SECONDS[Math.min(attempts, LOCK_SECONDS.length - 1)] ?? 60
}

function messageFor(failure: SignInFailure, t: Translate): string {
  switch (failure.kind) {
    case 'wrong-pin':
      return t('login.wrongPin')
    case 'rate-limited':
      return t('login.rateLimited')
    case 'offline':
      return t('login.offline')
    case 'other':
      // Сообщение приходит от Supabase и переводу не подлежит - зато
      // оно точное, а выдуманная замена скрыла бы настоящую причину
      return failure.message
  }
}

export function LoginScreen() {
  const t = useT()
  const { signIn } = useAuth()
  const [account, setAccount] = useState<Account | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [lockUntil, setLockUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const submitting = useRef(false)
  // Автоматическую попытку делаем один раз на выбор аккаунта: повторный
  // запрос Face ID после того, как его отменили, - это спор с человеком
  const autoTried = useRef<string | null>(null)
  const [biometrics, setBiometrics] = useState(false)

  const lockLeft = Math.max(0, Math.ceil((lockUntil - now) / 1000))

  // Тикаем только пока идёт блокировка - незачем будить рендер просто так
  useEffect(() => {
    if (lockUntil <= Date.now()) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [lockUntil])

  // Отправляем сами, как только набрано 6 цифр: отдельная кнопка «Войти»
  // на PIN-экране - лишний тап без всякой пользы
  useEffect(() => {
    if (!account || pin.length !== PIN_LENGTH || submitting.current || lockLeft > 0) return

    submitting.current = true
    setBusy(true)
    setError(null)

    signIn(account, pin)
      .then((failure) => {
        if (!failure) return // onAuthStateChange уведёт с экрана сам

        const next = failure.kind === 'wrong-pin' ? attempts + 1 : attempts
        setAttempts(next)
        const wait = failure.kind === 'rate-limited' ? 60 : lockFor(next)
        if (wait > 0) setLockUntil(Date.now() + wait * 1000)

        setError(messageFor(failure, t))
        setShakeKey((k) => k + 1)
        setPin('')
        haptic('error')
      })
      .finally(() => {
        submitting.current = false
        setBusy(false)
      })
  }, [pin, account, signIn, attempts, lockLeft, t])

  // Есть ли чем разблокировать этот аккаунт
  useEffect(() => {
    if (!account) {
      setBiometrics(false)
      return
    }
    let alive = true
    void (async () => {
      const ok = hasBiometrics(account) && (await biometricsAvailable())
      if (alive) setBiometrics(ok)
    })()
    return () => {
      alive = false
    }
  }, [account])

  /**
   * Разблокировка отпечатком или лицом.
   *
   * Отмена - не ошибка: человек передумал, и PIN-пад никуда не делся.
   * Поэтому сообщение показываем только на настоящем сбое.
   */
  const unlock = async (target: Account, silent: boolean) => {
    setBusy(true)
    try {
      const saved = await unlockWithBiometrics(target)
      if (saved) setPin(saved)
    } catch {
      if (!silent) setError(t('login.faceIdFailed'))
    } finally {
      setBusy(false)
    }
  }

  // Одна автоматическая попытка при заходе на экран PIN
  useEffect(() => {
    if (!account || !biometrics || autoTried.current === account.email) return
    autoTried.current = account.email
    void unlock(account, true)
    // unlock стабильна по смыслу; следим за готовностью
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, biometrics])

  if (!account) {
    return (
      <Backdrop>
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-[72px] items-center justify-center rounded-[17px] bg-love text-white">
            <Heart size={38} className="fill-current" aria-hidden />
          </span>
          <p className="mt-1 type-large">{APP_NAME}</p>
          <h1 className="text-[17px] text-muted">{t('login.who')}</h1>
        </div>
        <div className="list-group w-full max-w-sm overflow-hidden rounded-3xl bg-surface [--sep:4.5rem]">
          {ACCOUNTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setAccount(a)
                setPin('')
                setError(null)
              }}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-200 active:bg-raised active:duration-0"
            >
              <Avatar name={a.nickname} tone="slate" />
              <span className="min-w-0 flex-1 truncate text-[17px] font-medium">{a.nickname}</span>
              <ChevronRight size={16} strokeWidth={2.6} aria-hidden className="-mr-1 shrink-0 text-muted/45" />
            </button>
          ))}
        </div>
      </Backdrop>
    )
  }

  return (
    <Backdrop>
      <PinPad
        title={account.nickname}
        subtitle={lockLeft > 0 ? t('login.wait', { n: lockLeft }) : t('login.enterPin')}
        value={pin}
        onChange={setPin}
        error={error}
        shakeKey={shakeKey}
        disabled={busy || lockLeft > 0}
        footer={
          <div className="flex flex-col items-center gap-1">
            {biometrics && (
              <button
                type="button"
                onClick={() => void unlock(account, false)}
                disabled={busy}
                className="flex min-h-11 items-center gap-2 text-[15px] font-medium text-accent disabled:opacity-50"
              >
                <ScanFace size={17} aria-hidden />
                {t('login.faceId')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAccount(null)
                setPin('')
                setError(null)
              }}
              className="flex min-h-11 items-center gap-1 text-[15px] text-accent"
            >
              <ChevronLeft size={16} aria-hidden />
              {t('login.switchUser')}
            </button>
          </div>
        }
      />
    </Backdrop>
  )
}

/** Экран входа стоит на том же фоне, что и всё приложение: вход не отдельный сайт. */
function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 pt-safe pb-safe">{children}</main>
  )
}
