import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

type Kind = 'hearts' | 'sparks'
type Origin = HTMLElement | { x: number; y: number }
type Particle = {
  id: number
  x: number
  y: number
  dx: number
  dy: number
  rotate: number
  size: number
  color: string
  kind: Kind
  delay: number
}

const BurstContext = createContext<(origin: Origin, kind?: Kind) => void>(() => {})

const COLORS: Record<Kind, string[]> = {
  hearts: ['var(--c-accent)', 'var(--t-rose)', 'var(--c-accent-soft-ink)'],
  sparks: ['var(--c-accent)', 'var(--t-amber)', 'var(--t-sky)', 'var(--t-green)'],
}

const LIFE_MS = 1100

/**
 * Разлёт частиц - ответ на то, что приятно сделать: «Думаю о тебе»,
 * «Спасибо», выполненная задача, сохранённая отметка.
 *
 * Один слой поверх всего приложения, а не частицы внутри кнопки: кнопка
 * может тут же исчезнуть или перерисоваться (задача уехала в «Выполнено»),
 * а разлёт должен доиграть. Разброс задан номером частицы, а не случайностью:
 * одинаковый жест выглядит одинаково.
 *
 * При «уменьшить движение» ничего не рисуется - это чистое украшение.
 */
export function BurstProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion()
  const [parts, setParts] = useState<Particle[]>([])
  const seq = useRef(0)

  const fire = useCallback(
    (origin: Origin, kind: Kind = 'sparks') => {
      if (reduced) return
      const r = origin instanceof HTMLElement ? origin.getBoundingClientRect() : null
      const x = r ? r.left + r.width / 2 : (origin as { x: number }).x
      const y = r ? r.top + r.height / 2 : (origin as { y: number }).y
      const n = kind === 'hearts' ? 11 : 14
      const burst = ++seq.current
      const base = burst * 100
      const colors = COLORS[kind]
      const next: Particle[] = Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * Math.PI * 2 + burst * 0.7
        const dist = (kind === 'hearts' ? 64 : 54) + ((i * 37) % 46)
        return {
          id: base + i,
          x,
          y,
          dx: Math.cos(angle) * dist,
          // сердца летят вверх - «от сердца», искры расходятся ровнее
          dy: Math.sin(angle) * dist - (kind === 'hearts' ? 70 : 18),
          rotate: ((i * 53) % 70) - 35,
          size: kind === 'hearts' ? 14 + (i % 3) * 6 : 6 + (i % 3) * 3,
          color: colors[i % colors.length] ?? 'var(--c-accent)',
          kind,
          delay: (i % 4) * 0.018,
        }
      })
      setParts((p) => [...p, ...next])
      window.setTimeout(() => setParts((p) => p.filter((q) => q.id < base || q.id >= base + n)), LIFE_MS)
    },
    [reduced],
  )

  return (
    <BurstContext value={fire}>
      {children}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
        {parts.map((p) => (
          <motion.span
            key={p.id}
            className="absolute"
            style={{ left: p.x, top: p.y, marginLeft: -p.size / 2, marginTop: -p.size / 2, color: p.color }}
            initial={{ x: 0, y: 0, scale: 0.3, opacity: 1, rotate: 0 }}
            animate={{
              x: [0, p.dx, p.dx * 1.08],
              // лёгкая «гравитация» в конце полёта
              y: [0, p.dy, p.dy + 46],
              scale: [0.3, 1, 0.7],
              opacity: [1, 1, 0],
              rotate: [0, p.rotate, p.rotate * 1.4],
            }}
            transition={{ duration: 0.95, delay: p.delay, times: [0, 0.55, 1], ease: 'easeOut' }}
          >
            {p.kind === 'hearts' ? (
              <svg width={p.size} height={p.size} viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
            ) : (
              <span
                className="block rounded-full"
                style={{ width: p.size, height: p.size, background: 'currentColor' }}
              />
            )}
          </motion.span>
        ))}
      </div>
    </BurstContext>
  )
}

/** Вызвать разлёт из точки или из центра элемента. */
export function useBurst(): (origin: Origin, kind?: Kind) => void {
  return use(BurstContext)
}
