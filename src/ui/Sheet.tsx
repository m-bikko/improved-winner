import { useT } from '@/lib/i18n'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { useKeyboardInset } from '@/lib/keyboardInset'
import { SPRING_SOFT } from './motion'

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

/** Столько надо протянуть вниз, чтобы шторка закрылась, - или бросить быстро. */
const CLOSE_OFFSET = 110
const CLOSE_VELOCITY = 600

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
 *
 * Закрывается свайпом вниз - жестом, которого на телефоне ждут от любой
 * шторки. Тянуть можно только за ручку и заголовок: если бы тянулась вся
 * шторка, прокрутка списка внутри спорила бы со свайпом, и длинный список
 * закрывался бы вместо того, чтобы листаться.
 */
export function Sheet({ open, onClose, title, children, bleed = false }: Props) {
  const t = useT()
  const { keyboard, visible } = useKeyboardInset(open)
  const drag = useDragControls()

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          key="sheet"
          className="fixed inset-0 z-50 flex flex-col justify-end"
          // Низ поднимается ровно на высоту клавиатуры
          style={{ bottom: keyboard }}
        >
          <motion.div
            className="absolute inset-0 bg-black/45"
            onClick={onClose}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SPRING_SOFT}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.8 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > CLOSE_OFFSET || info.velocity.y > CLOSE_VELOCITY) onClose()
            }}
            className="relative flex max-h-[88dvh] flex-col rounded-t-[28px] bg-bg pb-safe shadow-float"
            style={{
              // Потолок считаем от ВИДИМОЙ высоты, а не от dvh: с открытой
              // клавиатурой dvh на iOS остаётся полным, и 88% от него не влезут
              ...(visible > 0 && { maxHeight: Math.round(visible * 0.88) }),
              // Отступ под домашнюю полоску не нужен, когда снизу клавиатура:
              // он бы отодвинул шторку от неё пустой лентой
              ...(keyboard > 0 && { paddingBottom: 0 }),
            }}
          >
            {/* Ручка и заголовок - зона захвата для свайпа. touch-none, иначе
                браузер забирает вертикальный жест себе под прокрутку */}
            <div className="shrink-0 cursor-grab touch-none" onPointerDown={(e) => drag.start(e)}>
              <div className="flex justify-center pt-2.5 pb-1">
                <span className="h-1.5 w-10 rounded-full bg-line" aria-hidden />
              </div>
              <div className="flex items-center justify-between gap-3 px-5 pt-1 pb-3">
                <span className="min-w-0 truncate font-display text-lg font-bold tracking-tight">
                  {title}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  // Иначе нажатие на крестик начинало бы свайп
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label={t('common.close')}
                  className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-full
                             bg-raised text-muted transition-transform active:scale-90"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>
            </div>

            {/* overflow-x-hidden - страховка: один широкий нативный элемент внутри
                раздувал контейнер, и за экран уезжало всё содержимое шторки.
                Причину лечим в самих элементах, но пусть шторка не зависит
                от того, вспомню ли я об этом в следующий раз. */}
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
              {bleed ? children : <div className="min-w-0 px-5 pt-1 pb-5">{children}</div>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
