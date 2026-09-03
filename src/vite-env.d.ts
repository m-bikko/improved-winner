/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SUPABASE_URL: string
  readonly VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string
  /** Публичный ключ VAPID. Пусто — подписка на push недоступна. */
  readonly VITE_PUBLIC_VAPID_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
