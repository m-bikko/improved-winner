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

  // Любой тап заодно проверяет, не вышла ли новая версия. Особенно нужно
  // для уведомления «вышло обновление»: приложение, вернувшееся из фона,
  // само сервер не спрашивает, а человек пришёл именно за новой версией
  try {
    self.registration.update()
  } catch (e) {
    // проверка обновления - не повод ронять переход по уведомлению
  }

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

/**
 * Снимки из хранилища - по пути, без токена.
 *
 * Бакеты приватные, и картинки приходят по подписанным ссылкам. Токен
 * в ссылке меняется каждый час, поэтому браузерный кэш (ключ - URL целиком)
 * промахивался бы и качал ту же картинку заново. Объект с одним и тем же
 * путём не меняется никогда: имена случайные, замена - это новый путь.
 * Значит, путь без токена - честный ключ, и снимок, однажды скачанный,
 * дальше отдаётся с устройства мгновенно, в том числе без сети и после
 * того, как ссылка протухла.
 *
 * Данные (PostgREST) здесь по-прежнему не кэшируются - почему, см.
 * src/lib/queryClient.ts. Картинки - другое дело: они неизменяемы.
 */
const PHOTO_CACHE = 'tandem-photos-v1'
const PHOTO_LIMIT = 400
const SIGNED_PATH = '/storage/v1/object/sign/'

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  let url
  try {
    url = new URL(request.url)
  } catch (e) {
    return
  }
  if (!url.pathname.includes(SIGNED_PATH)) return
  event.respondWith(cachedPhoto(url.origin + url.pathname, request))
})

async function cachedPhoto(key, request) {
  let cache
  try {
    cache = await caches.open(PHOTO_CACHE)
    const hit = await cache.match(key)
    if (hit) return hit
  } catch (e) {
    // Хранилище недоступно (приватный режим, квота) - просто идём в сеть
    return fetch(request)
  }

  let response
  try {
    // CORS-запросом, а не как просила картинка: непрозрачный ответ кэш
    // считает многомегабайтным и быстро съедает квоту
    response = await fetch(request.url, { mode: 'cors', credentials: 'omit' })
  } catch (e) {
    return fetch(request)
  }
  if (response.ok) {
    cache
      .put(key, response.clone())
      .then(() => trimPhotos(cache))
      .catch(() => {})
  }
  return response
}

let photoPuts = 0

/** Держим последние PHOTO_LIMIT снимков - проверка раз в 25 записей, а не на каждой. */
async function trimPhotos(cache) {
  photoPuts += 1
  if (photoPuts % 25 !== 0) return
  const keys = await cache.keys()
  const extra = keys.length - PHOTO_LIMIT
  for (let i = 0; i < extra; i++) await cache.delete(keys[i])
}
