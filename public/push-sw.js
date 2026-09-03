/**
 * Обработчики push для Service Worker.
 *
 * Отдельным файлом, а не внутри сгенерированного sw.js: vite-plugin-pwa
 * в режиме generateSW собирает воркер сам, и дописать туда свой код можно
 * только через importScripts. Зато при обновлении сборки этот файл остаётся
 * нетронутым.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Love promises', body: event.data.text() }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Love promises', {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Тег заменяет предыдущее уведомление вместо того, чтобы копить их
      // стопкой: три висящих «Позавтракал?» подряд — это раздражение,
      // а не напоминание
      tag: 'meal-reminder',
      renotify: true,
      data: { url: payload.url || '/diary' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/diary'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Если приложение уже открыто, переиспользуем окно: открывать вторую
      // копию PWA поверх первой — плохой способ ответить на тап
      for (const client of windows) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
