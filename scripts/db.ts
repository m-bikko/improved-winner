/**
 * Обёртка над Supabase CLI.
 *
 *   pnpm db:push    - применить миграции
 *   pnpm db:types   - перегенерировать src/types/db.ts
 *
 * Почему не `supabase link`: CLI на этой машине авторизован под другим аккаунтом
 * Supabase, и целевого проекта в его списке нет. Management API для миграций
 * при этом не нужен - CLI умеет работать напрямую по строке подключения,
 * а она уже лежит в .env.
 *
 * Отдельная причина не полагаться на link: MCP-сервер Supabase в этом окружении
 * привязан к чужому проекту, так что любая «неявная» цель опасна. Здесь цель
 * задана явно и всегда одна.
 */
import { spawnSync } from 'node:child_process'
import { openSync, closeSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadEnv } from './env.ts'

const TYPES_PATH = 'src/types/db.ts'

const commands = {
  push: (url: string) => ({
    args: ['db', 'push', '--db-url', url, '--include-all'],
    outFile: null,
  }),
  types: (url: string) => ({
    args: ['gen', 'types', 'typescript', '--db-url', url, '--schema', 'public'],
    outFile: TYPES_PATH,
  }),
} as const

function main(): void {
  const command = process.argv[2]
  if (!command || !(command in commands)) {
    console.error(`Использование: tsx scripts/db.ts <${Object.keys(commands).join('|')}>`)
    process.exit(1)
  }

  const { databaseUrl } = loadEnv()
  const { args, outFile } = commands[command as keyof typeof commands](databaseUrl)
  const extra = process.argv.slice(3)

  if (outFile) mkdirSync(dirname(outFile), { recursive: true })
  const fd = outFile ? openSync(outFile, 'w') : null
  try {
    const result = spawnSync('supabase', [...args, ...extra], {
      stdio: ['inherit', fd ?? 'inherit', 'inherit'],
      shell: false,
    })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
  } finally {
    if (fd !== null) closeSync(fd)
  }

  if (outFile) console.log(`Типы записаны в ${outFile}`)
}

main()
