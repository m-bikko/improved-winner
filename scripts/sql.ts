/**
 * Выполняет SQL против базы проекта. Служебный инструмент для проверок и отладки.
 *
 *   pnpm sql "select count(*) from foods"
 *   echo "select 1" | pnpm sql
 *
 * Подключается по POSTGRES_URL_NON_POOLING из .env - это session-mode пулер на
 * порту 5432. Транзакционный пулер (6543) для DDL и расширенных запросов не годится.
 *
 * Работает от имени postgres, то есть В ОБХОД RLS. Для проверки самих политик
 * нужен вход под реальным пользователем - см. scripts/check-rls.ts.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { pgConfig } from './env.ts'

async function main(): Promise<void> {
  const arg = process.argv.slice(2).join(' ').trim()
  const sql = arg || readFileSync(0, 'utf8').trim()
  if (!sql) {
    console.error('Нечего выполнять: передай SQL аргументом или через stdin.')
    process.exit(1)
  }

  const client = new Client(pgConfig())
  await client.connect()
  try {
    const result = await client.query(sql)
    const results = Array.isArray(result) ? result : [result]
    for (const r of results) {
      if (r.rows.length > 0) console.table(r.rows)
      else console.log(`${r.command ?? 'OK'} - строк: ${r.rowCount ?? 0}`)
    }
  } finally {
    await client.end()
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
