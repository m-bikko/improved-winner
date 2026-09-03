/**
 * Проверка рассылки о наступивших дедлайнах.
 *
 *   pnpm tsx scripts/check-tasks.ts
 *
 * Главное свойство: уведомление уходит ОБОИМ участникам, а не только автору.
 * Задача общая, и второй должен знать, что срок настал, даже если заводил
 * её не он.
 *
 * Всё в транзакции и откатывается, поэтому запросы в Telegram и push
 * не отправляются: pg_net кладёт их в очередь той же транзакцией.
 */
import { Client } from 'pg'
import { pgConfig } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()

  try {
    await client.query('begin')

    const { rows: members } = await client.query<{ n: string }>(
      'select count(*)::text as n from app_members',
    )
    const memberCount = Number(members[0]?.n ?? 0)

    const { rows: authorRows } = await client.query<{ user_id: string }>(
      'select user_id from app_members limit 1',
    )
    const author = authorRows[0]?.user_id
    if (!author) throw new Error('Нет участников')

    // Проверка должна сама задавать условия, а не зависеть от того, настроен
    // ли Telegram прямо сейчас. Без chat id канал молчит, и «уходит обоим»
    // проверялось бы вполовину. Транзакция откатывается, ничего не уйдёт.
    await client.query(
      `update profiles set telegram_chat_id = '1'
        where user_id in (select user_id from app_members)`,
    )

    // Задача с будущим сроком не должна тревожить
    await client.query(
      `insert into tasks (title, due_at, created_by)
       values ('ТЕСТ будущее', now() + interval '1 day', $1)`,
      [author],
    )
    const future = await client.query<{ n: string }>('select notify_due_tasks()::text as n')
    check(future.rows[0]?.n === '0', 'Задача с будущим сроком не уведомляет', `отправлено: ${future.rows[0]?.n}`)

    // Задача без срока — тоже
    await client.query(`insert into tasks (title, created_by) values ('ТЕСТ без срока', $1)`, [author])
    const noDue = await client.query<{ n: string }>('select notify_due_tasks()::text as n')
    check(noDue.rows[0]?.n === '0', 'Задача без срока не уведомляет', `отправлено: ${noDue.rows[0]?.n}`)

    // Наступивший срок
    const overdue = await client.query<{ id: string }>(
      `insert into tasks (title, due_at, created_by)
       values ('ТЕСТ просрочка', now() - interval '1 minute', $1) returning id`,
      [author],
    )
    const taskId = overdue.rows[0]?.id

    const before = await client.query<{ n: string }>(
      'select count(*)::text as n from net.http_request_queue',
    )
    const first = await client.query<{ n: string }>('select notify_due_tasks()::text as n')
    const after = await client.query<{ n: string }>(
      'select count(*)::text as n from net.http_request_queue',
    )

    check(first.rows[0]?.n === '1', 'Наступивший срок уведомляет', `задач обработано: ${first.rows[0]?.n}`)

    // По два запроса на человека: Telegram и push
    const queued = Number(after.rows[0]?.n) - Number(before.rows[0]?.n)
    check(
      queued === memberCount * 2,
      'Уведомление уходит ОБОИМ, двумя каналами каждому',
      `участников ${memberCount}, запросов ${queued} (ожидалось ${memberCount * 2})`,
    )

    // Повтор: планировщик идёт каждые пять минут
    const second = await client.query<{ n: string }>('select notify_due_tasks()::text as n')
    check(
      second.rows[0]?.n === '0',
      'Повторный запуск НЕ уведомляет снова',
      `отправлено: ${second.rows[0]?.n} — задача идёт каждые 5 минут, дубли недопустимы`,
    )

    // Сдвинули срок — отметка должна сброситься, иначе задача больше никогда
    // о себе не напомнит
    await client.query(
      `update tasks set due_at = now() - interval '1 minute', notified_at = null where id = $1`,
      [taskId],
    )
    const rescheduled = await client.query<{ n: string }>('select notify_due_tasks()::text as n')
    check(
      rescheduled.rows[0]?.n === '1',
      'После сброса отметки уведомление приходит снова',
      `отправлено: ${rescheduled.rows[0]?.n}`,
    )

    // Выполненная задача молчит
    await client.query(
      `update tasks set done_at = now(), done_by = $2, notified_at = null,
              due_at = now() - interval '1 minute' where id = $1`,
      [taskId, author],
    )
    const done = await client.query<{ n: string }>('select notify_due_tasks()::text as n')
    check(done.rows[0]?.n === '0', 'Выполненная задача не уведомляет', `отправлено: ${done.rows[0]?.n}`)
  } finally {
    await client.query('rollback')
    await client.end()
  }

  console.log(failed === 0 ? '\nРассылка по дедлайнам верна.' : `\nПровалено: ${failed}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
