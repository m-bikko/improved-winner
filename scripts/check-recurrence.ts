/**
 * Сверка двух реализаций правила повторения.
 *
 *   pnpm tsx scripts/check-recurrence.ts
 *
 * Логика живёт в двух местах: SQL-функция next_occurrence сдвигает срок
 * при рассылке, а TypeScript раскрывает правило на видимый месяц календаря.
 * Дублирование неизбежно, но расхождение недопустимо: календарь показывал бы
 * одни даты, а уведомления приходили бы в другие.
 *
 * Проверка гоняет одни и те же входные данные через обе реализации и сверяет
 * результат до минуты.
 */
import { Client } from 'pg'
import { nextOccurrence, type Recurrence } from '../src/features/tasks/recurrence.ts'
import { pgConfig } from './env.ts'

let failed = 0

const CASES: { from: string; rule: Recurrence; note: string }[] = [
  { from: '2026-09-03T14:30:00', rule: { freq: 'daily', interval: 1 }, note: 'каждый день' },
  { from: '2026-09-03T14:30:00', rule: { freq: 'daily', interval: 3 }, note: 'каждые 3 дня' },
  { from: '2026-09-03T14:30:00', rule: { freq: 'weekly', interval: 1 }, note: 'каждую неделю' },
  { from: '2026-09-03T14:30:00', rule: { freq: 'weekly', interval: 2 }, note: 'каждые 2 недели' },
  {
    from: '2026-09-03T14:30:00',
    rule: { freq: 'weekly', interval: 1, weekdays: [1, 3, 5] },
    note: 'пн, ср, пт - с четверга ближайшая пятница',
  },
  {
    from: '2026-09-07T09:00:00',
    rule: { freq: 'weekly', interval: 1, weekdays: [7] },
    note: 'только воскресенье',
  },
  { from: '2026-09-03T14:30:00', rule: { freq: 'monthly', interval: 1 }, note: 'каждый месяц' },
  {
    from: '2026-01-31T10:00:00',
    rule: { freq: 'monthly', interval: 1 },
    note: '31 января + месяц: конец февраля, а не 3 марта',
  },
  {
    from: '2026-12-31T23:00:00',
    rule: { freq: 'monthly', interval: 2 },
    note: 'через год через границу года',
  },
  {
    // 2024 - леап-год, 2026 нет: дата 2026-02-29 не существует вовсе
    from: '2024-02-29T12:00:00',
    rule: { freq: 'yearly', interval: 1 },
    note: '29 февраля + год: конец февраля невисокосного',
  },
  { from: '2026-09-03T14:30:00', rule: { freq: 'yearly', interval: 5 }, note: 'каждые 5 лет' },
]

/** Локальная метка без зоны: обе реализации должны видеть одно и то же время. */
function stamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()

  try {
    // Сессию ставим в тот же пояс, в котором считает браузер: иначе сравнивали
    // бы не логику правила, а разницу часовых поясов
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    await client.query(`set time zone '${tz}'`)
    console.log(`Часовой пояс сверки: ${tz}\n`)

    for (const c of CASES) {
      const { rows } = await client.query<{ next: string | null }>(
        `select to_char(
                  next_occurrence($1::timestamptz, $2::jsonb),
                  'YYYY-MM-DD HH24:MI'
                ) as next`,
        [c.from, JSON.stringify(c.rule)],
      )
      const fromSql = rows[0]?.next ?? '-'

      const jsNext = nextOccurrence(new Date(c.from), c.rule)
      const fromJs = jsNext ? stamp(jsNext) : '-'

      const ok = fromSql === fromJs
      if (!ok) failed++
      console.log(
        `${ok ? '  OK  ' : ' ПРОВАЛ '} ${c.note}\n         ${c.from.replace('T', ' ').slice(0, 16)} → SQL ${fromSql} | TS ${fromJs}`,
      )
    }
  } finally {
    await client.end()
  }

  console.log(
    failed === 0
      ? '\nОбе реализации правила согласны.'
      : `\nРасхождений: ${failed} - календарь и уведомления покажут разные даты`,
  )
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
