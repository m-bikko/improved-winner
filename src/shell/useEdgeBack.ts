import { useEffect } from 'react'
import { animate, useMotionValue, type MotionValue } from 'motion/react'
import { haptic } from '@/lib/haptics'
import { SPRING, prefersCalm, project, velocityTracker } from '@/ui/motion'

/** Ширина зоны у левого края, откуда начинается жест. */
const EDGE = 24

/**
 * В установленном на iPhone приложении нет браузерного свайпа назад, а кнопка
 * «назад» стоит в самой дальней от большого пальца точке экрана. Экран идёт за
 * пальцем один в один, а решение принимается по тому, куда он летит.
 *
 * Только в установленном режиме: в браузере и на Android от края уже есть системный
 * жест, и свой спорил бы с ним. `data-edge-back` на html включает его для проверок.
 */
export function useEdgeBack(enabled: boolean, onBack: () => void): MotionValue<number> {
  const x = useMotionValue(0)

  useEffect(() => {
    const standalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true || document.documentElement.dataset.edgeBack === 'on'
    if (!enabled || !standalone) return

    let start: { x: number; y: number } | null = null
    let active = false
    let speed = velocityTracker()

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!touch || e.touches.length !== 1 || touch.clientX > EDGE || document.body.style.overflow === 'hidden') return
      x.stop()
      speed = velocityTracker()
      start = { x: touch.clientX, y: touch.clientY }
      active = false
    }

    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!start || !touch) return
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      if (!active) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
          start = null
          return
        }
        if (dx < 10) return
        active = true
        start.x = touch.clientX
      }
      e.preventDefault()
      speed.add(touch.clientX)
      x.set(Math.max(0, touch.clientX - start.x))
    }

    const onEnd = () => {
      if (!start) return
      start = null
      if (!active) return
      active = false
      const width = window.innerWidth
      const velocity = speed.read()
      if (x.get() + project(velocity) > width * 0.5) {
        haptic('commit')
        // restDelta: за краем экрана доводить движение незачем - новый экран открывается сразу
        void animate(x, width, { ...SPRING, velocity, restDelta: 12, restSpeed: 300, ...(prefersCalm() ? { visualDuration: 0.01 } : {}) }).then(() => {
          onBack()
          // Новый экран уже под пальцем: старый сдвиг к нему не относится
          x.jump(0)
        })
      } else {
        void animate(x, 0, { ...SPRING, velocity })
      }
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, onBack, x])

  return x
}
