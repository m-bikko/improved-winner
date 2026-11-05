import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'
import { useT } from '@/lib/i18n'

/** Минимальная длительность вращения, мс. */
const MIN_SPIN = 450

/**
 * Кнопка «обновить» в шапке - одна на всё приложение.
 *
 * Не по кнопке на каждом экране: экранов тринадцать, и на четырнадцатом её
 * однажды забудут - ровно так же, как забылись боковые отступы у шторки
 * и вид рассылки у уведомлений. То, что нужно везде, живёт в оболочке.
 *
 * Обновляет ДАННЫЕ и заодно спрашивает, нет ли новой версии приложения:
 * человек, нажимающий «обновить», имеет в виду и то и другое. Само
 * обновление версии по-прежнему предлагает UpdatePrompt - подменять
 * ассеты под работающей сессией без спроса нельзя.
 */
export function RefreshButton() {
  const t = useT()
  const qc = useQueryClient()
  const [spinning, setSpinning] = useState(false)

  const refresh = async () => {
    if (spinning) return
    setSpinning(true)

    // Без фильтра: помечает устаревшим всё, но перезапрашивает только активные
    // запросы - то есть данные текущего экрана. Перечислять ключи вручную
    // значило бы держать в оболочке список того, что знает каждый раздел
    const data = qc.invalidateQueries()

    // Проверка новой версии. Если она есть, сработает уже подписанный
    // обработчик vite-plugin-pwa и покажет свою плашку
    const version = navigator.serviceWorker
      ? navigator.serviceWorker.getRegistration().then((r) => r?.update())
      : Promise.resolve()

    // Пол-секунды снизу: без них мгновенный ответ из кэша не даёт вращению
    // проявиться, и нажатие выглядит как «ничего не произошло»
    const floor = new Promise((resolve) => setTimeout(resolve, MIN_SPIN))

    await Promise.allSettled([data, version, floor])
    setSpinning(false)
  }

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      aria-label={t('common.refresh')}
      aria-busy={spinning}
      // Только там, где нет пальца: на телефоне обновляют, потянув экран вниз
      className="hidden size-11 items-center justify-center rounded-full text-muted
                 transition-[color,background-color] active:bg-raised active:text-ink
                 [@media(hover:hover)_and_(pointer:fine)]:flex"
    >
      <RotateCw size={19} aria-hidden className={spinning ? 'animate-spin' : ''} />
    </button>
  )
}
