import { useEffect } from 'react'

/** Разница видимой высоты и высоты окна, после которой считаем, что открыта клавиатура. */
const KEYBOARD_MIN = 150

/**
 * Компенсация «съехавшего» экрана в PWA на iOS.
 *
 * После закрытия клавиатуры iOS иногда оставляет видимую область сдвинутой
 * вниз относительно раскладки (`visualViewport.offsetTop > 0`) - и держит так,
 * пока не прокрутишь. Всё, что прибито к краям раскладки, едет вместе с ней:
 * шапка уходит за верх экрана, панель вкладок висит посреди, а под ней видно
 * страницу. Со стороны это выглядит как «меню всплывает то вниз, то вверх».
 *
 * Хук пишет два значения в CSS-переменные на <html>:
 * - `--vv-top` - на сколько опустить то, что прибито к верху (шапка);
 * - `--vv-gap` - на сколько опустить то, что прибито к низу (панель, FAB,
 *   липкие кнопки «Сохранить»).
 *
 * Пока открыта клавиатура, обе переменные нулевые: сдвиг видимой области
 * в этот момент - штатное поведение iOS, подтягивающее поле ввода, и спорить
 * с ним нельзя. При зуме щипком - тоже ноль: там offsetTop означает другое.
 */
export function useViewportShift(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    let frame = 0

    const measure = () => {
      frame = 0
      const keyboard = window.innerHeight - vv.height > KEYBOARD_MIN
      const zoomed = vv.scale > 1.01
      const active = !keyboard && !zoomed
      const top = active ? Math.max(0, Math.round(vv.offsetTop)) : 0
      const gap = active ? Math.max(0, Math.round(vv.offsetTop + vv.height - window.innerHeight)) : 0
      root.style.setProperty('--vv-top', `${top}px`)
      root.style.setProperty('--vv-gap', `${gap}px`)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    // После ухода фокуса клавиатура закрывается с анимацией - меряем ещё раз,
    // когда она доехала, иначе застанем промежуточное состояние
    let late = 0
    const afterBlur = () => {
      schedule()
      window.clearTimeout(late)
      late = window.setTimeout(schedule, 400)
    }

    measure()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    document.addEventListener('focusout', afterBlur)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(late)
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('focusout', afterBlur)
      root.style.removeProperty('--vv-top')
      root.style.removeProperty('--vv-gap')
    }
  }, [])
}
