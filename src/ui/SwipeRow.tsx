import { useRef, type MouseEvent, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useTransform, type PanInfo } from 'motion/react'
import { Trash2 } from 'lucide-react'
import { haptic } from '@/lib/haptics'
import { SPRING, project } from './motion'

/** Сколько открывается при обычном смахивании: кнопка целиком и запас под палец. */
const OPEN = 88

/**
 * Строка, которую можно смахнуть влево, чтобы удалить.
 *
 * Жест знаком по любому списку на телефоне: смахнул - появилась кнопка, смахнул
 * до конца - удалилось. Решает точка, куда строка летит, поэтому короткий бросок
 * работает так же, как длинное движение. Вертикальная прокрутка не страдает:
 * направление фиксируется в первые пиксели.
 */
export function SwipeRow({
  children,
  onDelete,
  label,
  disabled = false,
}: {
  children: ReactNode
  onDelete: () => void
  label: string
  disabled?: boolean
}) {
  const x = useMotionValue(0)
  const open = useRef(false)
  const box = useRef<HTMLDivElement>(null)
  // Кнопка растёт вместе с движением, поэтому видно, к чему идёт жест
  const scale = useTransform(x, [-OPEN, -24, 0], [1, 0.6, 0.6])
  const opacity = useTransform(x, [-OPEN * 0.8, -16, 0], [1, 0.4, 0])

  const settle = (target: number) => {
    open.current = target !== 0
    void animate(x, target, SPRING)
  }

  const remove = () => {
    const width = box.current?.offsetWidth ?? 400
    haptic('commit')
    void animate(x, -width, SPRING).then(onDelete)
  }

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const landing = x.get() + project(info.velocity.x)
    const width = box.current?.offsetWidth ?? 400
    // Удаление - только если строку действительно протащили: от короткого, но быстрого
    // смахивания кнопка просто откроется, а удалить можно будет одним нажатием
    if (x.get() < -width * 0.55 || (x.get() < -OPEN * 1.4 && landing < -width * 1.2)) remove()
    else settle(landing < -OPEN / 2 ? -OPEN : 0)
  }

  // Открытая строка закрывается нажатием и не открывает то, что под ней
  const onClickCapture = (e: MouseEvent) => {
    if (open.current) {
      e.stopPropagation()
      e.preventDefault()
      settle(0)
    }
  }

  return (
    <div ref={box} className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex w-[88px] items-stretch justify-end bg-danger">
        <button
          type="button"
          onClick={remove}
          aria-label={label}
          tabIndex={open.current ? 0 : -1}
          className="flex w-full items-center justify-center text-white"
        >
          <motion.span style={{ scale, opacity }} className="flex">
            <Trash2 size={22} aria-hidden />
          </motion.span>
        </button>
      </div>
      <motion.div
        style={{ x }}
        drag={disabled ? false : 'x'}
        dragDirectionLock
        dragConstraints={{ left: -9999, right: 0 }}
        dragElastic={{ left: 0, right: 0.12 }}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        onClickCapture={onClickCapture}
        className="relative touch-pan-y bg-surface"
      >
        {children}
      </motion.div>
    </div>
  )
}
