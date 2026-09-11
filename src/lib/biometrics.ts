import { tr } from '@/lib/i18n'
import { APP_NAME } from '@/lib/appName'
import type { Account } from '@/lib/accounts'

const STORE_KEY = 'love-promises-biometrics'

type Stored = { credentialId: string; pin: string }
type Store = Record<string, Stored>

/*
 * Вход по Face ID.
 *
 * ЧЕСТНО О ТОМ, ЧТО ЭТО ДАЁТ. Проверка проходит НА УСТРОЙСТВЕ и сервером
 * не проверяется: подписи никто не сверяет, потому что сверять её некому -
 * приложение на двоих, и своего сервера аутентификации у него нет.
 * Значит Face ID здесь заменяет НАБОР ЦИФР, а не добавляет защиту.
 *
 * PIN при этом лежит в localStorage рядом с refresh-токеном, который и без
 * него открывает всё то же самое. То есть доступ к localStorage был
 * равносилен доступу к приложению и до этой возможности - хуже не стало.
 * Но и лучше тоже, и делать вид, что стало, нельзя.
 *
 * Настоящее усиление потребовало бы расширения PRF, чтобы вывести из ключа
 * симметричный секрет и зашифровать им PIN. Safari его поддерживает
 * не везде, и молча деградировать тут нельзя - лучше не обещать.
 */

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Store
  } catch {
    return {}
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // Приватный режим или переполненное хранилище: вход по PIN остаётся
  }
}

function toBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

/*
 * Буферы отдаются как ArrayBuffer, а не Uint8Array: тип BufferSource
 * в новых определениях привязан к конкретному ArrayBufferLike, и вид
 * из Uint8Array ему не подходит.
 */
function fromBase64(value: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

function challenge(): ArrayBuffer {
  // Случайный, хотя никто его не проверяет: ноль вместо случайных байт
  // некоторые платформы отвергают
  return crypto.getRandomValues(new Uint8Array(32)).buffer
}

function utf8(value: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(value)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

/** Умеет ли устройство Face ID или отпечаток. */
export async function biometricsAvailable(): Promise<boolean> {
  try {
    if (typeof PublicKeyCredential === 'undefined') return false
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function hasBiometrics(account: Account): boolean {
  return read()[account.email] !== undefined
}

/**
 * Заводит ключ и запоминает PIN.
 *
 * PIN сюда попадает только после того, как он проверен настоящим входом:
 * запомнить неверный значило бы сделать кнопку, которая всегда отказывает.
 */
export async function enrollBiometrics(account: Account, pin: string): Promise<void> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: APP_NAME },
      user: {
        id: utf8(account.email),
        name: account.email,
        displayName: account.nickname,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null

  if (!credential) throw new Error(tr('bio.noKey'))

  const store = read()
  store[account.email] = { credentialId: toBase64(credential.rawId), pin }
  write(store)
}

/**
 * Просит подтверждение и отдаёт запомненный PIN.
 *
 * Возвращает null, когда ключа нет. Отказ самого подтверждения - исключение:
 * человек нажал «отмена», и вход по PIN никуда не делся.
 */
export async function unlockWithBiometrics(account: Account): Promise<string | null> {
  const saved = read()[account.email]
  if (!saved) return null

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: challenge(),
      allowCredentials: [{ type: 'public-key', id: fromBase64(saved.credentialId) }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })
  if (!assertion) throw new Error(tr('bio.noAssertion'))
  return saved.pin
}

export function forgetBiometrics(account: Account): void {
  const store = read()
  delete store[account.email]
  write(store)
}
