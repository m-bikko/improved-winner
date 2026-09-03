/**
 * Проверка цепочки уведомлений: триггер → Vault → pg_net → Telegram.
 *
 *   pnpm tsx scripts/check-telegram.ts
 *
 * Реального chat id у скрипта нет, поэтому он подставляет заведомо чужой
 * и смотрит, что ответил Telegram. Ответ «chat not found» — это успех
 * проверки: значит запрос дошёл, токен принят, и не хватает только настоящего
 * получателя. Ответ про токен или отсутствие запроса — настоящая поломка.
 *
 * Отдельно проверяется главное свойство: неудачное уведомление не должно
 * ронять запись.
 */
import { Client } from 'pg'
import { pgConfig } from './env.ts'

const FAKE_CHAT_ID = '1'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()

  let topicId: string | null = null
  let restore: { userId: string; chatId: string | null } | null = null

  try {
    const { rows: members } = await client.query<{ user_id: string; telegram_chat_id: string | null }>(
      `select p.user_id, p.telegram_chat_id
         from profiles p join app_members m on m.user_id = p.user_id
        order by p.nickname`,
    )
    const author = members[0]
    const partner = members[1]
    if (!author || !partner) throw new Error('Нужны два участника в app_members')

    restore = { userId: partner.user_id, chatId: partner.telegram_chat_id }
    await client.query('update profiles set telegram_chat_id = $1 where user_id = $2', [
      FAKE_CHAT_ID,
      partner.user_id,
    ])

    const before = await client.query<{ n: string }>('select count(*)::text as n from net._http_response')

    const inserted = await client.query<{ id: string }>(
      `insert into topics (title, body, created_by)
       values ('ТЕСТ уведомления', 'Проверка цепочки', $1) returning id`,
      [author.user_id],
    )
    topicId = inserted.rows[0]?.id ?? null
    check(topicId !== null, 'Тема создалась, несмотря на заведомо неверный chat id', 'запись прошла')

    // pg_net работает асинхронно: ответ появляется не мгновенно
    let response: { status_code: number | null; content: string | null } | undefined
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500))
      const { rows } = await client.query<{ status_code: number | null; content: string | null }>(
        `select status_code, content from net._http_response order by created desc limit 1`,
      )
      const after = await client.query<{ n: string }>('select count(*)::text as n from net._http_response')
      if (Number(after.rows[0]?.n) > Number(before.rows[0]?.n)) {
        response = rows[0]
        break
      }
    }

    // Три события — три уведомления. Проверяем все, а не только создание темы
    if (topicId) {
      await client.query(
        `insert into topic_comments (topic_id, author_id, body) values ($1, $2, 'ТЕСТ комментарий')`,
        [topicId, author.user_id],
      )
      await client.query(
        `update topics
            set status = 'closed', resolution = 'ТЕСТ решение',
                closed_at = now(), closed_by = $2
          where id = $1`,
        [topicId, author.user_id],
      )
    }

    if (!response) {
      check(false, 'Запрос в Telegram ушёл', 'ответа в net._http_response не появилось за 10 с')
    } else {
      const body = String(response.content ?? '')
      const tokenRejected = /unauthorized|bot token/i.test(body)
      const chatMissing = /chat not found|chat_id is empty/i.test(body)
      check(
        !tokenRejected,
        'Токен принят Telegram',
        tokenRejected ? body.slice(0, 120) : `HTTP ${response.status_code}`,
      )
      check(
        chatMissing,
        'Запрос дошёл до Telegram и отклонён только из-за тестового chat id',
        chatMissing ? 'ответ: chat not found — цепочка рабочая' : body.slice(0, 160),
      )
    }

    // Ждём, пока pg_net разберёт очередь по всем трём событиям
    let sent = 0
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500))
      const { rows } = await client.query<{ n: string }>(
        'select count(*)::text as n from net._http_response',
      )
      sent = Number(rows[0]?.n) - Number(before.rows[0]?.n)
      if (sent >= 3) break
    }
    check(
      sent >= 3,
      'Уведомления уходят на все три события',
      `тема, комментарий, закрытие → запросов: ${sent}`,
    )
  } finally {
    if (topicId) await client.query('delete from topics where id = $1', [topicId])
    if (restore) {
      await client.query('update profiles set telegram_chat_id = $1 where user_id = $2', [
        restore.chatId,
        restore.userId,
      ])
    }
    await client.end()
  }

  console.log(
    failed === 0
      ? '\nЦепочка уведомлений рабочая. Осталось указать настоящий chat id в профиле.'
      : `\nПровалено: ${failed}`,
  )
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
