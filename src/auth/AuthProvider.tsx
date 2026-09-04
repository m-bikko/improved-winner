import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthError, Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ACCOUNTS, type Account } from '@/lib/accounts'

export type SignInFailure =
  | { kind: 'wrong-pin' }
  | { kind: 'rate-limited' }
  | { kind: 'offline' }
  | { kind: 'other'; message: string }

type AuthValue = {
  status: 'loading' | 'anonymous' | 'authed'
  user: User | null
  /** Аккаунт из ACCOUNTS, соответствующий сессии. null, пока не вошли. */
  account: Account | null
  signIn: (account: Account, pin: string) => Promise<SignInFailure | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

/**
 * Классификация ошибки входа.
 *
 * Различать их важно: у GoTrue лимит порядка 30 запросов за 5 минут НА IP,
 * а оба партнёра дома сидят за одним NAT и делят этот бюджет с автообновлением
 * токена. Показать «неверный PIN» там, где на самом деле 429, - верный способ
 * заставить человека вводить код снова и снова и упереться в лимит ещё глубже.
 */
function describeFailure(error: AuthError): SignInFailure {
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return { kind: 'rate-limited' }
  }
  if (error.status === 400 || error.code === 'invalid_credentials') {
    return { kind: 'wrong-pin' }
  }
  // AuthRetryableFetchError прилетает при отсутствии сети: статуса нет вовсе
  if (error.status === undefined || error.name === 'AuthRetryableFetchError') {
    return { kind: 'offline' }
  }
  return { kind: 'other', message: error.message }
}

function accountForSession(session: Session | null): Account | null {
  const email = session?.user.email
  return ACCOUNTS.find((a) => a.email === email) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setReady(true)
    })

    // Единственный источник правды о сессии после старта. Сюда же приходит
    // TOKEN_REFRESHED, поэтому вручную обновлять ничего не нужно.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return
      setSession(next)
      setReady(true)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (account: Account, pin: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: pin,
    })
    return error ? describeFailure(error) : null
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      status: !ready ? 'loading' : session ? 'authed' : 'anonymous',
      user: session?.user ?? null,
      account: accountForSession(session),
      signIn,
      signOut,
    }),
    [ready, session, signIn, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthValue {
  const value = use(AuthContext)
  if (!value) throw new Error('useAuth вызван вне AuthProvider')
  return value
}

/** id текущего пользователя. Бросает, если сессии нет - вызывать только за guard'ом. */
export function useUserId(): string {
  const { user } = useAuth()
  if (!user) throw new Error('useUserId вызван без активной сессии')
  return user.id
}
