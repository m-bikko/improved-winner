/**
 * Доступ к переменным окружения с проверкой на этапе загрузки модуля.
 *
 * Vite подставляет только переменные с префиксом `VITE_`, причём на этапе сборки.
 * Пустое значение здесь означает, что переменная не задана в `.env` локально
 * или в настройках проекта на Vercel - и лучше упасть сразу с внятным текстом,
 * чем получить `undefined` где-то внутри supabase-клиента.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Locally: copy .env.example to .env. ` +
        `On Vercel: Settings → Environment Variables.`,
    )
  }
  return value
}

export const env = {
  supabaseUrl: required('VITE_PUBLIC_SUPABASE_URL', import.meta.env.VITE_PUBLIC_SUPABASE_URL),
  supabaseKey: required(
    'VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
} as const
