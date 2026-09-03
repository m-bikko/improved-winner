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
  // Название приложения сюда не подставить: файл лежит в public/ и копируется
  // как есть, переменные сборки до него не доходят. Поэтому запасной заголовок
  // нейтральный — тем более что имя PWA систему подписывает сама.
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Напоминание', body: event.data.text() }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Напоминание', {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Тег заменяет предыдущее уведомление с тем же тегом. Раньше тег был
      // один на всё («meal-reminder»), и это была поломка: наступивший срок
      // задачи молча стирал непрочитанное напоминание о еде — виды рассылок
      // разные и адресаты у них разные. Теперь тег берётся из заголовка,
      // то есть из вида события, и разные виды друг друга не затирают.
      tag: payload.tag || payload.title || 'push',
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
