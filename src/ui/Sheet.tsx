import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useKeyboardInset } from '@/lib/keyboardInset'

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
 */
export function Sheet({ open, onClose, title, children, bleed = false }: Props) {
  const { keyboard, visible } = useKeyboardInset(open)

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

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      // Низ поднимается ровно на высоту клавиатуры
      style={{ bottom: keyboard }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[88dvh] flex-col rounded-t-2xl bg-bg pb-safe shadow-2xl"
        style={{
          // Потолок считаем от ВИДИМОЙ высоты, а не от dvh: с открытой
          // клавиатурой dvh на iOS остаётся полным, и 88% от него не влезут
          ...(visible > 0 && { maxHeight: Math.round(visible * 0.88) }),
          // Отступ под домашнюю полоску не нужен, когда снизу клавиатура:
          // он бы отодвинул шторку от неё пустой лентой
          ...(keyboard > 0 && { paddingBottom: 0 }),
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <span className="text-base font-medium">{title}</span>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="-mr-2 p-2 text-muted">
            <X size={20} aria-hidden />
          </button>
        </div>

        {/* overflow-x-hidden - страховка: один широкий нативный элемент внутри
            раздувал контейнер, и за экран уезжало всё содержимое шторки.
            Причину лечим в самих элементах, но пусть шторка не зависит
            от того, вспомню ли я об этом в следующий раз. */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          {bleed ? children : <div className="min-w-0 px-4 py-4">{children}</div>}
        </div>
      </div>
    </div>
  )
}
