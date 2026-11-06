import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { SPRING } from './motion'

type ToastItem = {
  id: number
  text: string
  action?: { label: string; onClick: () => void } | undefined
  ms: number
}

let current: ToastItem | null = null
let nextId = 1
const listeners = new Set<() => void>()

function emit(next: ToastItem | null): void {
  current = next
  for (const l of listeners) l()
}

/** Короткое сообщение над панелью вкладок. Новое сменяет прежнее. */
export function toast(input: { text: string; action?: { label: string; onClick: () => void }; ms?: number }): void {
  emit({ id: nextId++, text: input.text, action: input.action, ms: input.ms ?? 3500 })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Один слой на приложение. Плашку можно смахнуть вниз или в сторону, а движение
 * идёт за пальцем: сообщение не должно ждать своего таймера, если уже прочитано.
 */
export function ToastHost() {
  const item = useSyncExternalStore(subscribe, () => current)

  useEffect(() => {
    if (!item) return
    const id = setTimeout(() => emit(null), item.ms)
    return () => clearTimeout(id)
  }, [item])

  return createPortal(
    <AnimatePresence>
      {item && (
        <motion.div
          key={item.id}
          role="status"
          initial={{ y: 24, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0, scale: 0.96 }}
          transition={SPRING}
          drag
          dragSnapToOrigin
          dragElastic={0.6}
          onDragEnd={(_, info) => {
            const far = Math.abs(info.offset.x) > 80 || info.offset.y > 30
            const fast = Math.abs(info.velocity.x) > 400 || info.velocity.y > 300
            if (far || fast) emit(null)
          }}
          className="material fixed inset-x-4 bottom-above-tabbar z-[45] mx-auto flex max-w-md min-h-13 touch-none items-center gap-2 rounded-2xl py-1.5 pr-1.5 pl-4 shadow-float"
        >
          <p className="min-w-0 flex-1 py-1.5 text-[15px] font-medium">{item.text}</p>
          {item.action && (
            <button
              type="button"
              onClick={() => {
                item.action?.onClick()
                emit(null)
              }}
              className="flex min-h-10 shrink-0 items-center rounded-2xl px-3 text-[15px] font-semibold text-accent active:opacity-50"
            >
              {item.action.label}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
