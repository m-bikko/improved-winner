import type { Transition } from 'motion/react'

/**
 * Общие настройки движения - чтобы всё в приложении ощущалось одинаково.
 *
 * Пружины, а не длительности: новая цель просто подхватывает движение с текущего
 * места и скорости, поэтому любой переход можно перехватить на полпути.
 *
 * По умолчанию без отскока (критическое затухание). Отскок заслужен только там,
 * где сам жест нёс импульс: брошенная карточка - да, появившаяся подложка - нет.
 */

/** Нажатия, подложки переключателей, вкладки, смена экрана. */
export const SPRING: Transition = { type: 'spring', bounce: 0, visualDuration: 0.28 }

/** Шторки и крупные блоки: крупному телу нужно чуть больше времени. */
export const SPRING_SOFT: Transition = { type: 'spring', bounce: 0, visualDuration: 0.36 }

/** После броска пальцем: лёгкий отскок выдаёт импульс, который в нём был. */
export const SPRING_FLICK: Transition = { type: 'spring', bounce: 0.18, visualDuration: 0.36 }

/** Нажатие на карточку или плитку - заметно, но без «резинки». */
export const PRESS = { scale: 0.98 } as const

/**
 * Куда придёт движение, если его отпустить, - как прокрутка по инерции.
 * Решать «закрыть или вернуть» надо по этой точке, а не по месту отпускания:
 * короткий бросок обязан срабатывать так же, как длинное перетаскивание.
 */
export function project(velocity: number, deceleration = 0.998): number {
  return ((velocity / 1000) * deceleration) / (1 - deceleration)
}

/**
 * Сопротивление за границей: чем дальше тянут, тем меньше объект следует за пальцем.
 * Жёсткий упор читается как зависание, резина - как «дальше ничего нет».
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

/**
 * Скорость пальца по последним точкам.
 *
 * По короткой истории, а не по двум последним событиям: при отпускании палец часто
 * успевает замереть на кадр, и «мгновенная» скорость бросок превращала бы в ноль.
 */
export function velocityTracker(): { add: (value: number) => void; read: () => number } {
  const WINDOW_MS = 100
  const samples: { value: number; at: number }[] = []
  return {
    add: (value) => {
      const at = performance.now()
      samples.push({ value, at })
      while (samples.length > 2 && at - (samples[0]?.at ?? at) > WINDOW_MS) samples.shift()
    },
    read: () => {
      const first = samples[0]
      const last = samples[samples.length - 1]
      if (!first || !last || first === last || performance.now() - last.at > WINDOW_MS) return 0
      return ((last.value - first.value) / (last.at - first.at)) * 1000
    },
  }
}

export function prefersCalm(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
