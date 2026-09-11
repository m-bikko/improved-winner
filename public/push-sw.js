/**
 * Обработчики push для Service Worker.
 *
 * Отдельным файлом, а не внутри сгенерированного sw.js: vite-plugin-pwa
 * в режиме generateSW собирает воркер сам, и дописать туда свой код можно
 * только через importScripts. Зато при обновлении сборки этот файл остаётся
 * нетронутым.
 */

/**
 * Число на иконке приложения.
 *
 * Считает база и присылает вместе с уведомлением: у воркера нет сессии,
 * чтобы спросить самому. Ноль обязательно СНИМАЕТ бейдж, а не ставит ноль -
 * ноль в кружке на iOS выглядит как единица.
 */
function applyBadge(count) {
  if (typeof count !== 'number') return Promise.resolve()
  try {
    return count > 0
      ? (self.navigator.setAppBadge ? self.navigator.setAppBadge(count) : Promise.resolve())
      : (self.navigator.clearAppBadge ? self.navigator.clearAppBadge() : Promise.resolve())
  } catch (e) {
    return Promise.resolve()
  }
}

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  // Запасной заголовок ПУСТОЙ, а не «Напоминание».
  //
  // Название приложения сюда не подставить: файл лежит в public/ и копируется
  // как есть, переменные сборки до него не доходят. Словаря здесь тоже нет -
  // у воркера нет ни сессии, ни языка получателя.
  //
  // Любое слово на этом месте было бы словом на ОДНОМ языке, и на чужом
  // экране оно так и осталось бы русским. Пустой заголовок неотличим от
  // отсутствующего: систему всё равно подписывает именем приложения, а текст
  // несёт тело. Срабатывает это только на непарсящейся нагрузке, то есть
  // почти никогда.
  try {
    payload = event.data.json()
  } catch {
    payload = { title: '', body: event.data.text() }
  }

  event.waitUntil(
    Promise.all([
      applyBadge(payload.badge),
      self.registration.showNotification(payload.title || '', {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Тег заменяет предыдущее уведомление с тем же тегом. Раньше тег был
      // один на всё («meal-reminder»), и это была поломка: наступивший срок
      // задачи молча стирал непрочитанное напоминание о еде - виды рассылок
      // разные и адресаты у них разные. Теперь тег берётся из заголовка,
      // то есть из вида события, и разные виды друг друга не затирают.
      tag: payload.tag || payload.title || 'push',
      renotify: true,
        data: { url: payload.url || '/diary' },
      }),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/diary'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Если приложение уже открыто, переиспользуем окно: открывать вторую
      // копию PWA поверх первой - плохой способ ответить на тап
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
