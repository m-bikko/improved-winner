/**
 * Кладёт серверные секреты в Supabase Vault.
 *
 *   pnpm secrets
 *
 * Отдельно от миграций намеренно: миграции лежат в git, а репозиторий
 * публичный. Значения читаются из .env, которого в git нет.
 *
 * Запускать после `pnpm db:push` на новом окружении и при смене любого
 * из секретов.
 */
import { Client } from 'pg'
import { pgConfig, readVars } from './env.ts'

type Secret = { name: string; value: string; comment: string }

async function upsert(client: Client, secret: Secret): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    'select id from vault.secrets where name = $1',
    [secret.name],
  )
  const existing = rows[0]?.id

  if (existing) {
    await client.query('select vault.update_secret($1, $2)', [existing, secret.value])
    return 'обновлён'
  }
  await client.query('select vault.create_secret($1, $2, $3)', [
    secret.value,
    secret.name,
    secret.comment,
  ])
  return 'записан'
}

async function main(): Promise<void> {
  const vars = readVars()

  const token = vars['TELEGRAM_BOT_ID']
  if (token) {
    // Проверяем токен до записи: положить нерабочий и узнать об этом через
    // неделю по молчащим уведомлениям - худший вариант
    const info = (await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json()) as {
      ok: boolean
      description?: string
    }
    if (!info.ok) throw new Error(`Telegram отклонил токен: ${info.description}`)
  }

  const pushUrl = vars['PUSH_ENDPOINT_URL']
  const pushSecret = vars['PUSH_SHARED_SECRET']

  const secrets: Secret[] = [
    ...(token
      ? [{ name: 'telegram_bot_token', value: token, comment: 'Токен бота уведомлений' }]
      : []),
    ...(pushUrl
      ? [{ name: 'push_endpoint_url', value: pushUrl, comment: 'Адрес функции отправки push' }]
      : []),
    ...(pushSecret
      ? [
          {
            name: 'push_shared_secret',
            value: pushSecret,
            comment: 'Общий секрет базы и функции отправки push',
          },
        ]
      : []),
  ]

  if (secrets.length === 0) {
    console.log('В .env нет ни одного секрета для записи.')
    return
  }

  const client = new Client(pgConfig())
  await client.connect()
  try {
    for (const secret of secrets) {
      const action = await upsert(client, secret)
      console.log(`  ${action}  ${secret.name}`)
    }
  } finally {
    await client.end()
  }

  const missing = ['PUSH_ENDPOINT_URL', 'PUSH_SHARED_SECRET'].filter((n) => !vars[n])
  if (missing.length > 0) {
    console.log(`\nБез ${missing.join(' и ')} push-уведомления не отправляются.`)
    console.log('Telegram при этом работает - напоминания не пропадут целиком.')
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
