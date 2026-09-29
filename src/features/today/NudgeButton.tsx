import { useT } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { motion } from 'motion/react'
import { SPRING } from '@/ui/motion'
import { useBurst } from '@/ui/Burst'
import { NUDGE_COOLDOWN_MS, useLastNudge, useSendNudge } from './nudge'

/**
 * «Думаю о тебе» - одна кнопка на главной.
 *
 * Без текста и без повода: сообщение целиком в самом факте. Написать
 * «скучаю» мешает не отсутствие чувства, а необходимость подобрать слова, -
 * кнопка убирает именно это.
 *
 * После нажатия она остывает полчаса и честно показывает, сколько осталось.
 * Настоящее ограничение стоит в базе: заблокированную кнопку обходят
 * перезагрузкой страницы.
 */
export function NudgeButton() {
  const t = useT()
  const last = useLastNudge()
  const send = useSendNudge()
  const burst = useBurst()
  const [now, setNow] = useState(() => Date.now())

  const until = last.data ? new Date(last.data).getTime() + NUDGE_COOLDOWN_MS : 0
  const left = until - now

  // Тикаем только пока идёт остывание: таймер, работающий весь день ради
  // надписи, которой нет, - это разряженная батарея
  useEffect(() => {
    if (left <= 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [left])

  const cooling = left > 0
  const minutes = Math.ceil(left / 60_000)

  return (
    <motion.button
      type="button"
      onClick={(e) => {
        navigator.vibrate?.(12)
        const button = e.currentTarget
        // Сердца - только когда «Думаю о тебе» правда ушло: разлёт при ошибке
        // сети обещал бы то, чего не случилось
        send.mutate(undefined, { onSuccess: () => burst(button, 'hearts') })
      }}
      disabled={cooling || send.isPending}
      whileTap={cooling ? {} : { scale: 0.97 }}
      transition={SPRING}
      className={`flex min-h-16 items-center justify-center gap-2.5 rounded-3xl px-4 font-display
                  text-[17px] font-bold transition-colors ${
                    cooling
                      ? 'bg-surface text-muted shadow-card'
                      : 'bg-accent text-accent-ink shadow-[0_12px_28px_-12px_var(--c-accent)]'
                  }`}
    >
      {/* Сердце «бьётся» один раз в момент отправки - ответ на нажатие,
          который видно, даже если кнопка тут же ушла в остывание */}
      <motion.span
        key={last.data ?? 'idle'}
        initial={last.data ? { scale: 1.6 } : false}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 12 }}
        className="flex"
      >
        <Heart size={20} aria-hidden className={cooling ? '' : 'fill-current'} />
      </motion.span>
      {/* Без имени: склонять ник по падежам - «думаю о Аминош» - хуже,
          чем не склонять вовсе, а правил тут не напасёшься */}
      {cooling ? t('nudge.cooling', { n: minutes }) : t('nudge.send')}
    </motion.button>
  )
}
