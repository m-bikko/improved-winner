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

    // Задача без срока - тоже
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

    // Создание задачи само по себе уведомляет обоих.
    //
    // Считаем отдельно от срока: это разные события, и раньше первого
    // не существовало вовсе - о задаче узнавали только когда наступал срок,
    // хотя список общий.
    const beforeCreate = await client.query<{ n: string }>(
      'select count(*)::text as n from net.http_request_queue',
    )
    await client.query(
      `insert into public.tasks (title, notes, due_at, created_by)
       values ('ТЕСТ создание', 'заметка', now() + interval '3 days', $1)`,
      [author],
    )
    const afterCreate = await client.query<{ n: string }>(
      'select count(*)::text as n from net.http_request_queue',
    )
    const onCreate = Number(afterCreate.rows[0]?.n) - Number(beforeCreate.rows[0]?.n)
    check(
      onCreate === memberCount * 2,
      'Созданная задача уведомляет ОБОИХ, двумя каналами каждому',
      `участников ${memberCount}, запросов ${onCreate} (ожидалось ${memberCount * 2})`,
    )

    const createdBody = await client.query<{ body: string }>(
      `select convert_from(q.body, 'utf8') as body from net.http_request_queue q
        order by q.id desc limit 1`,
    )
    const body = createdBody.rows[0]?.body ?? ''
    check(
      body.includes('ТЕСТ создание'),
      'В уведомлении о создании есть заголовок задачи',
      body.includes('ТЕСТ создание') ? 'заголовок на месте' : `в теле: ${body.slice(0, 80)}`,
    )

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
      `отправлено: ${second.rows[0]?.n} - задача идёт каждые 5 минут, дубли недопустимы`,
    )

    // Сдвинули срок - отметки должны сброситься, иначе задача больше никогда
    // о себе не напомнит. Дедупликация живёт в reminded_offsets: колонка
    // notified_at снята как мёртвая.
    await client.query(
      `update tasks set due_at = now() - interval '1 minute', reminded_offsets = '{}'
        where id = $1`,
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
      `update tasks set done_at = now(), done_by = $2, reminded_offsets = '{}',
              due_at = now() - interval '1 minute' where id = $1`,
      [taskId, author],
    )
    const done = await client.query<{ n: string }>('select notify_due_tasks()::text as n')
    check(done.rows[0]?.n === '0', 'Выполненная задача не уведомляет', `отправлено: ${done.rows[0]?.n}`)

    // --- Настраиваемые напоминания ------------------------------------------
    // Срок через час, напоминания за сутки, за час и в момент. Сейчас должны
    // сработать ровно два первых: «в момент» ещё не пришло.
    const multi = await client.query<{ id: string }>(
      `insert into tasks (title, due_at, reminders, created_by)
       values ('ТЕСТ напоминания', now() + interval '55 minutes', array[1440, 60, 0], $1)
       returning id`,
      [author],
    )
    const multiId = multi.rows[0]?.id

    const firstPass = await client.query<{ n: string }>('select notify_due_tasks()::text as n')
    check(
      firstPass.rows[0]?.n === '2',
      'Срабатывают только те напоминания, чьё время пришло',
      `за сутки и за час - да, в момент - нет: отправлено ${firstPass.rows[0]?.n}`,
    )

    const repeatPass = await client.query<{ n: string }>('select notify_due_tasks()::text as n')
    check(repeatPass.rows[0]?.n === '0', 'Те же напоминания не повторяются', `отправлено: ${repeatPass.rows[0]?.n}`)

    // Срок наступил - доезжает «в момент»
    await client.query(`update tasks set due_at = now() where id = $1`, [multiId])
    const atDue = await client.query<{ n: string }>('select notify_due_tasks()::text as n')
    check(atDue.rows[0]?.n === '1', 'Напоминание «в момент» приходит по сроку', `отправлено: ${atDue.rows[0]?.n}`)

    // --- Повторение ---------------------------------------------------------
    const recurring = await client.query<{ id: string }>(
      `insert into tasks (title, due_at, reminders, recurrence, created_by)
       values ('ТЕСТ повтор', now() - interval '1 minute', array[0],
               '{"freq":"daily","interval":1}'::jsonb, $1)
       returning id`,
      [author],
    )
    const recurringId = recurring.rows[0]?.id

    await client.query('select notify_due_tasks()')
    const moved = await client.query<{ shifted: boolean; offsets: string }>(
      `select due_at > now() as shifted, reminded_offsets::text as offsets
         from tasks where id = $1`,
      [recurringId],
    )
    check(
      moved.rows[0]?.shifted === true && moved.rows[0]?.offsets === '{}',
      'Повторяющаяся задача сдвигается вперёд и обнуляет отметки',
      `срок в будущем: ${moved.rows[0]?.shifted}, отметки: ${moved.rows[0]?.offsets}`,
    )

    // Повторение с истёкшим сроком окончания снимается, а не сдвигается вечно
    await client.query(
      `update tasks set due_at = now() - interval '1 minute', reminded_offsets = '{}',
              recurrence_until = current_date - 1 where id = $1`,
      [recurringId],
    )
    await client.query('select notify_due_tasks()')
    const ended = await client.query<{ recurrence: string | null }>(
      'select recurrence::text as recurrence from tasks where id = $1',
      [recurringId],
    )
    check(
      ended.rows[0]?.recurrence === null,
      'После даты окончания повторение снимается',
      `правило: ${ended.rows[0]?.recurrence ?? 'null'}`,
    )
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
