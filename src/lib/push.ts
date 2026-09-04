import { supabase } from './supabase'

/**
 * Подписка на push-уведомления.
 *
 * Обёртка над Push API, чтобы экран профиля не разбирался в base64url
 * и типах разрешений.
 */

const VAPID_KEY = import.meta.env.VITE_PUBLIC_VAPID_KEY ?? ''

export type PushState =
  | 'unsupported' // браузер или устройство не умеют
  | 'not-installed' // iOS: только из приложения на домашнем экране
  | 'unconfigured' // не задан публичный ключ
  | 'denied' // разрешение отклонено, из приложения не переспросить
  | 'off'
  | 'on'

/** Приложение открыто как установленное, а не вкладкой браузера. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS до сих пор сообщает об этом собственным нестандартным полем
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) {
    // На iOS Push появляется только у приложения, добавленного на домашний
    // экран. Во вкладке Safari его нет вовсе, и это не ошибка, а ограничение
    // платформы - о нём нужно сказать прямо, иначе кнопка выглядит сломанной.
    return isStandalone() ? 'unsupported' : 'not-installed'
  }
  if (!VAPID_KEY) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  return existing ? 'on' : 'off'
}

/**
 * base64url из VAPID → байты, которых ждёт браузер.
 *
 * Явный ArrayBuffer, а не просто Uint8Array: тип по умолчанию допускает
 * SharedArrayBuffer, который applicationServerKey не принимает.
 */
function decodeKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function keyToBase64(key: ArrayBuffer | null): string {
  if (!key) return ''
  return btoa(String.fromCharCode(...new Uint8Array(key)))
}

export async function subscribeToPush(userId: string): Promise<PushState> {
  if (!pushSupported()) return isStandalone() ? 'unsupported' : 'not-installed'
  if (!VAPID_KEY) return 'unconfigured'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'

  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Без этого флага браузеры отказывают: тихие push запрещены
      userVisibleOnly: true,
      applicationServerKey: decodeKey(VAPID_KEY),
    }))

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: subscription.endpoint,
      user_id: userId,
      p256dh: keyToBase64(subscription.getKey('p256dh')),
      auth_key: keyToBase64(subscription.getKey('auth')),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error

  return 'on'
}

export async function unsubscribeFromPush(): Promise<PushState> {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return 'off'

  // Сначала убираем из базы, потом у браузера: обратный порядок оставил бы
  // мёртвый адрес, на который отправитель продолжал бы стучаться
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
  return 'off'
}
