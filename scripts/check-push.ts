/**
 * Проверка функции отправки push без деплоя.
 *
 *   pnpm tsx scripts/check-push.ts
 *
 * Обработчик из api/push.ts вызывается напрямую с подставными req/res.
 * Это проверяет всё, кроме доставки: авторизацию, переменные окружения,
 * доступ к базе, реакцию на отсутствие подписок и на мусор во входных данных.
 *
 * Саму доставку проверить отсюда нельзя — для неё нужен настоящий endpoint
 * от браузера на телефоне.
 */
import handler from '../api/push.ts'
import { readVars } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

type Captured = { code: number; body: unknown }

function fakeReq(method: string, auth: string | undefined, body: unknown) {
  return {
    method,
    headers: auth === undefined ? {} : { authorization: auth },
    body,
  } as never
}

function fakeRes(): { res: never; captured: Captured } {
  const captured: Captured = { code: 0, body: null }
  const res = {
    status(code: number) {
      captured.code = code
      return res
    },
    json(value: unknown) {
      captured.body = value
    },
    send(value: string) {
      captured.body = value
    },
  }
  return { res: res as never, captured }
}

async function call(method: string, auth: string | undefined, body: unknown): Promise<Captured> {
  const { res, captured } = fakeRes()
  await handler(fakeReq(method, auth, body), res)
  return captured
}

async function main(): Promise<void> {
  const vars = readVars()
  for (const [key, value] of Object.entries(vars)) process.env[key] = value

  const secret = vars['PUSH_SHARED_SECRET']
  if (!secret) throw new Error('В .env нет PUSH_SHARED_SECRET')

  const wrongMethod = await call('GET', `Bearer ${secret}`, {})
  check(wrongMethod.code === 405, 'GET отклоняется', `код ${wrongMethod.code}`)

  const noAuth = await call('POST', undefined, { userId: 'x', body: 'y' })
  check(noAuth.code === 401, 'Без секрета — 401', `код ${noAuth.code}`)

  const badAuth = await call('POST', 'Bearer неправильный', { userId: 'x', body: 'y' })
  check(badAuth.code === 401, 'С чужим секретом — 401', `код ${badAuth.code}`)

  const noBody = await call('POST', `Bearer ${secret}`, {})
  check(noBody.code === 400, 'Без адресата и текста — 400', `код ${noBody.code}`)

  // Настоящий вызов: подписок ещё нет, поэтому ожидаем честный ноль,
  // а не ошибку. Это подтверждает, что ключи VAPID приняты и база доступна.
  const real = await call('POST', `Bearer ${secret}`, {
    userId: '00000000-0000-0000-0000-000000000000',
    body: 'проверка',
  })
  const payload = real.body as { sent?: number; reason?: string }
  check(
    real.code === 200 && payload.sent === 0,
    'Ключи VAPID приняты, база доступна, подписок нет',
    `код ${real.code}, ответ ${JSON.stringify(real.body)}`,
  )
}

main()
  .then(() => {
    console.log(
      failed === 0
        ? '\nФункция отправки работает. Доставку проверит только настоящая подписка с телефона.'
        : `\nПровалено: ${failed}`,
    )
    process.exit(failed === 0 ? 0 : 1)
  })
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
