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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
