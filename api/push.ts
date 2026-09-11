/**
 * Отправка web-push.
 *
 * Единственный серверный код в проекте, и он здесь не по прихоти: подписать
 * VAPID и зашифровать полезную нагрузку - это ECDH и AES-GCM, в plpgsql такому
 * не место. Поэтому база решает «кому и что», а этот обработчик - «как».
 *
 * Вызывается из базы через pg_net по расписанию pg_cron, авторизуется общим
 * секретом. Без секрета отвечает 401 и ничего не раскрывает.
 *
 * Сигнатура классическая (req, res), а не Web-стандартная: та тянет за собой
 * Edge-рантайм, где нет нужной web-push криптографии.
 *
 * Переменные окружения на Vercel:
 *   VAPID_PRIVATE_KEY, VITE_PUBLIC_VAPID_KEY, VAPID_SUBJECT,
 *   PUSH_SHARED_SECRET, SUPABASE_URL, SUPABASE_SECRET_KEY
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

type Request = IncomingMessage & { body?: unknown }
type Response = ServerResponse & {
  status: (code: number) => Response
  json: (value: unknown) => void
  send: (value: string) => void
}

type Payload = {
  userId?: string
  title?: string
  body?: string
  url?: string
  /** Число на иконке. Считает база - только она знает, что «требует тебя». */
  badge?: number
}

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

export default async function handler(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed')
    return
  }

  if (req.headers.authorization !== `Bearer ${env('PUSH_SHARED_SECRET')}`) {
    res.status(401).send('Unauthorized')
    return
  }

  const payload = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Payload
  if (!payload?.userId || !payload.body) {
    res.status(400).send('Bad request')
    return
  }

  webpush.setVapidDetails(
    env('VAPID_SUBJECT'),
    env('VITE_PUBLIC_VAPID_KEY'),
    env('VAPID_PRIVATE_KEY'),
  )

  // Секретный ключ, потому что функция работает от имени системы: RLS
  // на push_subscriptions пускает человека только к своим подпискам
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false },
  })

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('user_id', payload.userId)

  if (error) {
    res.status(500).send(error.message)
    return
  }
  if (!subscriptions?.length) {
    res.status(200).json({ sent: 0, reason: 'no subscriptions' })
    return
  }

  const notification = JSON.stringify({
    // Пустой заголовок, а не слово. Сюда мы попадаем, только если вызывающий
    // его не передал, - а база передаёт всегда. Любое слово на этом месте
    // было бы словом на ОДНОМ языке: ни у обработчика, ни у воркера нет
    // ни сессии, ни языка получателя. Имя приложения система подписывает
    // сама, так что пустой заголовок неотличим от отсутствующего.
    title: payload.title ?? '',
    body: payload.body,
    url: payload.url ?? '/diary',
    // Проходит насквозь: считать это здесь значило бы вторым запросом
    // ходить за чек-инами и повторением задач - знание, которое уже есть
    // в базе
    badge: payload.badge,
  })

  let sent = 0
  const dead: string[] = []

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          notification,
        )
        sent++
      } catch (e) {
        // 404 и 410 означают, что подписка мертва: приложение удалили или
        // разрешение отозвали. Копить такие записи и биться о них каждый час
        // бессмысленно
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(sub.endpoint)
      }
    }),
  )

  if (dead.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', dead)
  }

  res.status(200).json({ sent, removed: dead.length })
}
