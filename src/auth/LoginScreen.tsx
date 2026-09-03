import { useEffect, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { ACCOUNTS, PIN_LENGTH, type Account } from '@/lib/accounts'
import { useAuth, type SignInFailure } from './AuthProvider'
import { PinPad } from './PinPad'

/** Задержка после N подряд неверных попыток, в секундах. */
const LOCK_SECONDS = [0, 0, 0, 5, 15, 30, 60] as const

function lockFor(attempts: number): number {
  return LOCK_SECONDS[Math.min(attempts, LOCK_SECONDS.length - 1)] ?? 60
}

function messageFor(failure: SignInFailure): string {
  switch (failure.kind) {
    case 'wrong-pin':
      return 'Неверный PIN'
    case 'rate-limited':
      return 'Слишком много попыток. Подожди минуту.'
    case 'offline':
      return 'Нет связи с сервером'
    case 'other':
      return failure.message
  }
}

export function LoginScreen() {
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

  const lockLeft = Math.max(0, Math.ceil((lockUntil - now) / 1000))

  // Тикаем только пока идёт блокировка — незачем будить рендер просто так
  useEffect(() => {
    if (lockUntil <= Date.now()) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [lockUntil])

  // Отправляем сами, как только набрано 6 цифр: отдельная кнопка «Войти»
  // на PIN-экране — лишний тап без всякой пользы
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

        setError(messageFor(failure))
        setShakeKey((k) => k + 1)
        setPin('')
        navigator.vibrate?.([40, 60, 40])
      })
      .finally(() => {
        submitting.current = false
        setBusy(false)
      })
  }, [pin, account, signIn, attempts, lockLeft])

  if (!account) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Кто заходит?</h1>
        <div className="flex w-full max-w-xs flex-col gap-3">
          {ACCOUNTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setAccount(a)
                setPin('')
                setError(null)
              }}
              className="rounded-2xl bg-surface px-6 py-5 text-lg font-medium shadow-sm
                         ring-1 ring-line transition-transform active:scale-[0.98]"
            >
              {a.nickname}
            </button>
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <PinPad
        title={account.nickname}
        subtitle={lockLeft > 0 ? `Подожди ${lockLeft} с` : 'Введи PIN'}
        value={pin}
        onChange={setPin}
        error={error}
        shakeKey={shakeKey}
        disabled={busy || lockLeft > 0}
        footer={
          <button
            type="button"
            onClick={() => {
              setAccount(null)
              setPin('')
              setError(null)
            }}
            className="flex items-center gap-1 py-2 text-sm text-muted"
          >
            <ChevronLeft size={16} aria-hidden />
            Сменить пользователя
          </button>
        }
      />
    </main>
  )
}
