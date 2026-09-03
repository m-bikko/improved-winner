/**
 * Чтение .env для скриптов, запускаемых локально.
 *
 * Отдельно от src/lib/env.ts: там переменные приходят от Vite на этапе сборки,
 * а здесь читаются из файла в рантайме. И главное — здесь есть секретные ключи,
 * которым в клиентском бандле делать нечего.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function parseEnvFile(path: string): Record<string, string> {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    throw new Error(`Не найден ${path}. Скопируй .env.example в .env и заполни.`)
  }

  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!m) continue
    const [, key, rawValue] = m
    if (!key || rawValue === undefined) continue
    out[key] = rawValue.replace(/^["']|["']$/g, '')
  }
  return out
}

function required(vars: Record<string, string>, name: string): string {
  const value = vars[name]
  if (!value) throw new Error(`В .env не задана переменная ${name}.`)
  return value
}

export function loadEnv() {
  const vars = parseEnvFile(join(ROOT, '.env'))
  return {
    supabaseUrl: required(vars, 'SUPABASE_URL'),
    /** Секретный ключ: только для Admin API. Никогда не попадает в клиентский бандл. */
    secretKey: required(vars, 'SUPABASE_SECRET_KEY'),
    publishableKey: required(vars, 'VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    /** Session-mode пулер (5432). Транзакционный на 6543 для DDL не годится. */
    databaseUrl: required(vars, 'POSTGRES_URL_NON_POOLING'),
  }
}

/**
 * Конфиг подключения для pg.
 *
 * `pg` 8 трактует sslmode=require из строки подключения как verify-full, а пулер
 * Supabase отдаёт цепочку, подписанную собственным CA, которого нет в системном
 * хранилище — отсюда «self-signed certificate in certificate chain».
 *
 * rejectUnauthorized: false возвращает семантику libpq: соединение шифруется,
 * но сертификат не проверяется. Для локальных админских скриптов это приемлемо;
 * в клиентском коде такого нет — там всё идёт через HTTPS supabase-js.
 */
export function pgConfig(): { connectionString: string; ssl: { rejectUnauthorized: false } } {
  // sslmode из строки подключения перекрывает опцию ssl объекта, поэтому его
  // нужно именно вырезать, а не просто передать ssl рядом.
  const url = new URL(loadEnv().databaseUrl)
  url.searchParams.delete('sslmode')
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
  }
}
