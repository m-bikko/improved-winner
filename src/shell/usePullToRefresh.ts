import { useEffect, useState } from 'react'
import { useMotionValue, animate, type MotionValue } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { haptic } from '@/lib/haptics'
import { SPRING, rubberband } from '@/ui/motion'

/** Сколько надо протянуть, чтобы обновление сработало. */
const THRESHOLD = 72
const RESTING = 56
/** Минимум вращения, мс: мгновенный ответ из кэша выглядел бы как «ничего не произошло». */
const MIN_SPIN = 450

/** Жест не наш: у этих элементов свой жест по вертикали. */
const FOREIGN = '[data-sheet-lock], [data-no-pull], input[type="range"], textarea, .leaflet-container, [role="dialog"]'

/** Обновляет данные текущего экрана и заодно спрашивает, нет ли новой версии. */
export function useRefreshAll(): () => Promise<void> {
  const qc = useQueryClient()
  return async () => {
    // Без фильтра: помечает устаревшим всё, но перезапрашивает только активные запросы
    const data = qc.invalidateQueries()
    const version = navigator.serviceWorker ? navigator.serviceWorker.getRegistration().then((r) => r?.update()) : Promise.resolve()
    const floor = new Promise((resolve) => setTimeout(resolve, MIN_SPIN))
    await Promise.allSettled([data, version, floor])
  }
}

/**
 * Потянуть экран вниз - обновить.
 *
 * В установленном PWA браузерного жеста нет, поэтому раньше в шапке каждого экрана
 * стояла кнопка «обновить»: лишний значок там, где действие нужно редко. Индикатор
 * идёт за пальцем с сопротивлением, а сам экран на месте: сдвиг `transform` на нём
 * сломал бы всё, что внутри прибито через `fixed`.
 */
export function usePullToRefresh(): { pull: MotionValue<number>; spinning: boolean } {
  const pull = useMotionValue(0)
  const refresh = useRefreshAll()
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    let start: { x: number; y: number } | null = null
    let active = false
    let armed = false
    let busy = false

    const onStart = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1 || window.scrollY > 0 || document.body.style.overflow === 'hidden') return
      const touch = e.touches[0]
      if (!touch || !(e.target instanceof Element) || e.target.closest(FOREIGN)) return
      start = { x: touch.clientX, y: touch.clientY }
      active = false
      armed = false
    }

    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!start || !touch) return
      const dy = touch.clientY - start.y
      const dx = touch.clientX - start.x
      if (!active) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
          start = null
          return
        }
        if (dy < 8) {
          if (dy < -8) start = null
          return
        }
        active = true
      }
      // Экран успел прокрутиться - значит, это была прокрутка, а не обновление
      if (window.scrollY > 0) {
        start = null
        active = false
        void animate(pull, 0, SPRING)
        return
      }
      const value = rubberband(dy - 8, window.innerHeight, 0.7)
      pull.set(value)
      const ready = value >= THRESHOLD
      if (ready !== armed) {
        armed = ready
        if (ready) haptic('commit')
      }
    }

    const onEnd = () => {
      if (!start) return
      start = null
      if (!active) return
      active = false
      if (!armed) {
        void animate(pull, 0, SPRING)
        return
      }
      armed = false
      busy = true
      setSpinning(true)
      void animate(pull, RESTING, SPRING)
      void refresh().finally(() => {
        busy = false
        setSpinning(false)
        void animate(pull, 0, SPRING)
      })
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [pull, refresh])

  return { pull, spinning }
}

export const PULL_THRESHOLD = THRESHOLD
