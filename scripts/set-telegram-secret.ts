/**
 * Кладёт токен Telegram-бота в Vault.
 *
 *   pnpm tg:secret
 *
 * Отдельно от миграции намеренно: миграции лежат в git, а репозиторий публичный.
 * Токен читается из .env, который в git не попадает.
 *
 * Запускать после `pnpm db:push` на новом окружении и при смене токена.
 */
import { Client } from 'pg'
import { pgConfig, readVars } from './env.ts'

const SECRET_NAME = 'telegram_bot_token'

async function main(): Promise<void> {
  const token = readVars()['TELEGRAM_BOT_ID']
  if (!token) {
    throw new Error('В .env нет TELEGRAM_BOT_ID.')
  }

  // Проверяем токен до записи: положить в Vault нерабочий токен и узнать об
  // этом через неделю по молчащим уведомлениям — худший из вариантов
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
  const info = (await res.json()) as { ok: boolean; result?: { username?: string }; description?: string }
  if (!info.ok) {
    throw new Error(`Telegram отклонил токен: ${info.description ?? 'причина не указана'}`)
  }

  const client = new Client(pgConfig())
  await client.connect()
  try {
    const { rows } = await client.query<{ id: string }>(
      'select id from vault.secrets where name = $1',
      [SECRET_NAME],
    )
    const existing = rows[0]?.id

    if (existing) {
      await client.query('select vault.update_secret($1, $2)', [existing, token])
      console.log(`Токен обновлён в Vault (@${info.result?.username ?? '?'}).`)
    } else {
      await client.query('select vault.create_secret($1, $2, $3)', [
        token,
        SECRET_NAME,
        'Токен бота для уведомлений о темах',
      ])
      console.log(`Токен записан в Vault (@${info.result?.username ?? '?'}).`)
    }
  } finally {
    await client.end()
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
