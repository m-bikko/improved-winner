import { useEffect, useState } from 'react'

export type ViewportInset = {
  /** Высота клавиатуры в пикселях макета. 0 - клавиатуры нет. */
  keyboard: number
  /** Реально видимая высота окна. 0 - измерить нечем. */
  visible: number
}

const NONE: ViewportInset = { keyboard: 0, visible: 0 }

function measure(): ViewportInset {
  const vv = window.visualViewport
  if (!vv) return NONE
  // Пространство под видимой областью в координатах макета - это и есть
  // клавиатура. Через offsetTop, потому что браузер может сдвинуть
  // видимую область вверх, подтягивая поле к себе
  const keyboard = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
  return { keyboard, visible: Math.round(vv.height) }
}

/**
 * Сколько снизу занимает клавиатура.
 *
 * На iOS layout viewport при открытии клавиатуры НЕ сжимается: `position:
 * fixed` остаётся привязанным к полной высоте окна, и прижатая к низу шторка
 * оказывается ПОД клавиатурой. Пока шторка высокая, этого не видно - браузер
 * сам подтягивает поле ввода в зону видимости. Но стоит списку под поиском
 * схлопнуться до пары строк, и вся шторка вместе с полем уезжает вниз.
 *
 * Единственный способ узнать высоту клавиатуры в вебе - visualViewport;
 * события `resize` у окна при её появлении на iOS не приходит вовсе.
 *
 * Слушаем только пока нужно: подписка живёт вместе с открытой шторкой.
 */
export function useKeyboardInset(active: boolean): ViewportInset {
  const [inset, setInset] = useState<ViewportInset>(NONE)

  useEffect(() => {
    if (!active) {
      setInset(NONE)
      return
    }
    const vv = window.visualViewport
    if (!vv) return

    const update = () => setInset(measure())
    update()

    // scroll тоже нужен: при прокрутке с открытой клавиатурой меняется
    // offsetTop, а вместе с ним и расстояние до низа макета
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [active])

  return inset
}
