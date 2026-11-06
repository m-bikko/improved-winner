import { useT } from '@/lib/i18n'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { haptic } from '@/lib/haptics'
import { useKeyboardInset } from '@/lib/keyboardInset'
import { SPRING_SOFT, project, rubberband, velocityTracker } from './motion'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /**
   * Содержимое во всю ширину, без полей.
   *
   * Нужно спискам: строка на всю ширину - это и есть её область нажатия,
   * а поля превратили бы её в кнопку с промахами по краям. Такие шторки
   * ставят отступы сами и там, где им нужно.
   */
  bleed?: boolean
}

/**
 * Шторка снизу.
 *
 * Высота ограничена dvh, а не vh: на мобильном Safari vh считает по «свёрнутой»
 * панели браузера, из-за чего нижняя часть шторки уезжает под адресную строку.
 *
 * Клавиатура поднимает шторку над собой. Раньше тут стояло допущение,
 * что этого не нужно: содержимое скроллится внутри, а браузер сам подтянет
 * поле ввода. На iOS оно неверно - layout viewport при открытии клавиатуры
 * не сжимается, и прижатая к низу шторка оказывается ПОД ней. Пока шторка
 * высокая, спасает автопрокрутка браузера; но стоит списку под поиском
 * схлопнуться до пары строк, и вся шторка вместе с полем уезжает вниз.
 *
 * Боковые отступы ставит ШТОРКА, а не тот, кто её открыл. Раньше их
 * добавлял каждый вызывающий у себя, и это работало ровно до тех пор,
 * пока я не завёл три новых шторки подряд и не забыл про них во всех трёх:
 * поля упирались в края экрана. Договорённость, которую надо помнить,
 * рано или поздно забывают - поэтому теперь по умолчанию отступы есть,
 * а отказ от них выражается явным `bleed`.
 *
 * Рисуется порталом в body, а не там, где её открыли. Иначе `fixed` и z-50
 * считаются внутри ближайшего предка со своим слоем: шторка «Снять кадр»
 * лежала в карточке с `isolation: isolate` и оказывалась ПОД нижней
 * панелью (z-40) - кнопка «Отправить» уезжала под меню, а прокручивать
 * было нечего. Портал делает шторку независимой от того, кто её открыл.
 */
export function Sheet(props: Props) {
  return createPortal(<AnimatePresence>{props.open && <SheetBody key="sheet" {...props} />}</AnimatePresence>, document.body)
}

/**
 * Что нельзя перехватывать свайпом шторки: у этих элементов свой жест по вертикали.
 * Новому такому элементу достаточно поставить `data-sheet-lock`.
 */
const LOCKED = '[data-sheet-lock], input[type="range"], textarea, .leaflet-container'

/** Прокручен ли какой-нибудь список между пальцем и шторкой. */
function scrolledAbove(target: Element, root: Element): boolean {
  for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
    if (el.scrollTop > 0) {
      const overflow = getComputedStyle(el).overflowY
      if (overflow === 'auto' || overflow === 'scroll') return true
    }
  }
  return false
}

function SheetBody({ open, onClose, title, children, bleed = false }: Props) {
  const t = useT()
  const { keyboard, visible } = useKeyboardInset(open)
  const reduced = useReducedMotion()
  const panel = useRef<HTMLDivElement>(null)
  const grip = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  // Смещение шторки вниз, в пикселях. Затемнение привязано к нему же: тянешь -
  // фон светлеет вместе с пальцем, а не вспыхивает в конце
  const hidden = window.innerHeight
  const y = useMotionValue(reduced ? 0 : hidden)
  const scrim = useTransform(y, [0, hidden * 0.85], [1, 0])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    // Фокус внутрь и обратно: иначе с клавиатуры и скринридером шторки как бы нет
    const before = document.activeElement
    if (panel.current && !panel.current.contains(before)) panel.current.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
      if (before instanceof HTMLElement) before.focus({ preventScroll: true })
    }
  }, [])

  // Тянуть можно за ручку и заголовок, а когда список внутри прокручен до верха - и за
  // него: палец продолжает движение списка и переходит на шторку без отдельного жеста.
  useEffect(() => {
    const el = panel.current
    if (!el) return
    let gesture: { startX: number; startY: number; base: number; active: boolean; grip: boolean } | null = null
    let speed = velocityTracker()

    const begin = (target: EventTarget | null, x: number, py: number) => {
      if (!(target instanceof Element) || target.closest(LOCKED)) return
      const onGrip = grip.current?.contains(target) ?? false
      if (!onGrip && scrolledAbove(target, el)) return
      // Шторку можно перехватить на лету: движение продолжается с того места,
      // где она сейчас на экране, а не с места назначения
      y.stop()
      speed = velocityTracker()
      gesture = { startX: x, startY: py, base: y.get(), active: false, grip: onGrip }
    }

    const track = (x: number, py: number, cancel: () => void) => {
      if (!gesture) return
      const dy = py - gesture.startY
      if (!gesture.active) {
        // Порог, чтобы отличить жест от нажатия и от горизонтальной прокрутки чипов
        if (Math.abs(x - gesture.startX) > Math.abs(dy) && Math.abs(x - gesture.startX) > 8) {
          gesture = null
          return
        }
        if (Math.abs(dy) < 6) return
        if (dy < 0 && !gesture.grip) {
          gesture = null
          return
        }
        gesture.active = true
        gesture.startY = py
      }
      cancel()
      const next = gesture.base + (py - gesture.startY)
      speed.add(py)
      // Вверх идти некуда: сопротивление вместо упора
      y.set(next >= 0 ? next : -rubberband(-next, el.offsetHeight))
    }

    const finish = () => {
      if (!gesture?.active) {
        gesture = null
        return
      }
      gesture = null
      const velocity = speed.read()
      // Решает то, куда шторка летит: короткий бросок закрывает её так же,
      // как долгое перетаскивание через половину
      if (y.get() + project(velocity) > el.offsetHeight * 0.5) {
        haptic('tick')
        closeRef.current()
      } else {
        // Пружина стартует со скоростью пальца: шва между жестом и анимацией нет
        void animate(y, 0, { ...SPRING_SOFT, velocity })
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (touch && e.touches.length === 1) begin(e.target, touch.clientX, touch.clientY)
      else gesture = null
    }
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (touch) track(touch.clientX, touch.clientY, () => e.preventDefault())
    }
    // Мышью - только за ручку: на телефоне этого не бывает, а на ноутбуке тянуть
    // за содержимое значило бы мешать выделению текста
    const onMouseMove = (e: PointerEvent) => track(e.clientX, e.clientY, () => {})
    const onMouseUp = () => {
      window.removeEventListener('pointermove', onMouseMove)
      window.removeEventListener('pointerup', onMouseUp)
      finish()
    }
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !grip.current?.contains(e.target as Node)) return
      begin(e.target, e.clientX, e.clientY)
      window.addEventListener('pointermove', onMouseMove)
      window.addEventListener('pointerup', onMouseUp)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', finish)
    el.addEventListener('touchcancel', finish)
    el.addEventListener('pointerdown', onPointerDown)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', finish)
      el.removeEventListener('touchcancel', finish)
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onMouseMove)
      window.removeEventListener('pointerup', onMouseUp)
    }
  }, [y])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      // Низ поднимается ровно на высоту клавиатуры
      style={{ bottom: keyboard }}
    >
      <motion.div
        className="absolute inset-0 bg-[var(--c-scrim)]"
        onClick={onClose}
        aria-hidden
        style={reduced ? {} : { opacity: scrim }}
        {...(reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : { exit: { opacity: 0 } })}
      />

      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        {...(reduced
          ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } }
          : { animate: { y: 0 }, exit: { y: hidden }, transition: SPRING_SOFT })}
        className="elevated relative flex max-h-[90dvh] flex-col rounded-t-[20px] bg-bg pb-safe shadow-float outline-none"
        style={{
          ...(reduced ? {} : { y }),
          // Потолок считаем от ВИДИМОЙ высоты, а не от dvh: с открытой
          // клавиатурой dvh на iOS остаётся полным, и 88% от него не влезут
          ...(visible > 0 && { maxHeight: Math.round(visible * 0.9) }),
          // Отступ под домашнюю полоску не нужен, когда снизу клавиатура:
          // он бы отодвинул шторку от неё пустой лентой
          ...(keyboard > 0 && { paddingBottom: 0 }),
        }}
      >
        {/* Ручка и заголовок. touch-none: вертикальный жест здесь всегда про шторку */}
        <div ref={grip} className="shrink-0 cursor-grab touch-none">
          <div className="flex justify-center pt-2 pb-1">
            <span className="h-[5px] w-9 rounded-full bg-fill" aria-hidden />
          </div>
          {/* Заголовок по центру, крестик справа - как в системных шторках */}
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center px-2 pb-1">
            <span aria-hidden />
            <h2 className="truncate text-center type-headline">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="flex size-11 items-center justify-center"
            >
              <span className="flex size-[30px] items-center justify-center rounded-full bg-raised text-muted transition-opacity active:opacity-50 active:duration-0">
                <X size={16} strokeWidth={2.8} aria-hidden />
              </span>
            </button>
          </div>
        </div>

        {/* overflow-x-hidden - страховка: один широкий нативный элемент внутри
            раздувал контейнер, и за экран уезжало всё содержимое шторки.
            Причину лечим в самих элементах, но пусть шторка не зависит
            от того, вспомню ли я об этом в следующий раз. */}
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          {bleed ? children : <div className="min-w-0 px-4 pt-1 pb-5">{children}</div>}
        </div>
      </motion.div>
    </div>
  )
}
