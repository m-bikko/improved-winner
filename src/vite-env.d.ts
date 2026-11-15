/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SUPABASE_URL: string
  readonly VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string
  /** Публичный ключ VAPID. Пусто - подписка на push недоступна. */
  readonly VITE_PUBLIC_VAPID_KEY?: string
  /** Название приложения. Пусто - берётся значение по умолчанию из lib/appName. */
  readonly VITE_PUBLIC_APP_NAME?: string
  /** Короткое название для подписи под иконкой. Пусто - совпадает с полным. */
  readonly VITE_PUBLIC_APP_SHORT_NAME?: string
  /** Имя первого из пары на экране входа. Пусто - значение по умолчанию из lib/accounts. */
  readonly VITE_PUBLIC_PARTNER_1_NAME?: string
  /** Имя второго из пары на экране входа. */
  readonly VITE_PUBLIC_PARTNER_2_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
