import type { Transition } from 'motion/react'

/**
 * Общие настройки движения - чтобы нажатия и появления во всём приложении
 * ощущались одинаково, а не каждый компонент со своей пружиной.
 */

/** Быстрая упругая пружина: нажатия, подложки переключателей, вкладки. */
export const SPRING: Transition = { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 }

/** Мягче и дольше: шторки и крупные блоки. */
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 380, damping: 36 }

/** Нажатие на карточку или плитку - заметно, но без «резинки». */
export const PRESS = { scale: 0.975 } as const
