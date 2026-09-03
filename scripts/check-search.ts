/**
 * Проверка клиентского поиска на реальной базе продуктов.
 *
 *   pnpm tsx scripts/check-search.ts
 *
 * Тянет name_norm прямо из foods и прогоняет тот же код, что работает
 * в браузере, — так проверяется и логика скоринга, и то, что нормализация
 * в TypeScript совпадает с выражением generated-колонки в Postgres.
 */
import { Client } from 'pg'
import { normalize, searchItems } from '../src/lib/search.ts'
import { pgConfig } from './env.ts'

type Row = { name: string; nameNorm: string }

const cases: { query: string; expectFirst?: string; expectAmong?: string; expectNone?: boolean }[] = [
  { query: 'мол', expectFirst: 'Молоко 1.5%' },
  { query: 'молоко', expectAmong: 'Молоко 3.2%' },
  { query: 'курца', expectAmong: 'Курица с кожей' }, // опечатка
  { query: 'греча', expectAmong: 'Гречка сухая' },
  { query: 'творог 5', expectFirst: 'Творог 5%' },
  { query: 'ёлка', expectNone: true }, // такого продукта нет — важно, что не падает
  { query: 'яй', expectAmong: 'Яйцо куриное' },
  { query: 'куриная грудка', expectFirst: 'Куриная грудка' },
  { query: 'олив масло', expectAmong: 'Масло оливковое' }, // слова в другом порядке
  { query: 'it\'s & bad(', expectNone: true }, // спецсимволы не должны ломать
  { query: '', expectAmong: 'Куриная грудка' }, // пустой запрос — всё подряд
]

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()
  const { rows } = await client.query<Row>(
    'select name, name_norm as "nameNorm" from foods where archived_at is null',
  )
  await client.end()

  console.log(`Продуктов в базе: ${rows.length}\n`)

  let failed = 0

  // Нормализация в TS обязана совпадать с generated-колонкой в Postgres,
  // иначе поиск будет промахиваться именно на словах с «ё»
  const mismatched = rows.filter((r) => normalize(r.name) !== r.nameNorm.trim())
  if (mismatched.length > 0) {
    failed++
    console.log(` ПРОВАЛ  Нормализация TS и Postgres расходятся`)
    console.log(`         ${mismatched.length} шт., например: ${mismatched[0]?.name}`)
  } else {
    console.log('  OK   Нормализация в TS совпадает с колонкой name_norm')
  }

  for (const c of cases) {
    const found = searchItems(rows, c.query, { limit: 8 })
    const names = found.map((f) => f.name)
    let ok: boolean
    let detail: string

    if (c.expectNone) {
      ok = names.length === 0
      detail = ok ? 'пусто, как и ожидалось' : `нашлось лишнее: ${names.slice(0, 3).join(', ')}`
    } else if (c.expectFirst) {
      ok = names[0] === c.expectFirst
      detail = `первый: ${names[0] ?? '—'}`
    } else {
      ok = names.includes(c.expectAmong ?? '')
      detail = names.slice(0, 4).join(', ') || '—'
    }

    if (!ok) failed++
    console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} «${c.query}»\n         ${detail}`)
  }

  console.log(failed === 0 ? '\nПоиск работает.' : `\nПровалено: ${failed}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
