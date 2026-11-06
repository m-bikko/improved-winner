import { useT } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { motion } from 'motion/react'
import { haptic } from '@/lib/haptics'
import { useBurst } from '@/ui/Burst'
import { NUDGE_COOLDOWN_MS, useLastNudge, useSendNudge } from './nudge'

/**
 * «Думаю о тебе» - строка-действие в карточке «мы двое».
 *
 * Без текста и без повода: сообщение целиком в самом факте. Написать
 * «скучаю» мешает не отсутствие чувства, а необходимость подобрать слова, -
 * кнопка убирает именно это.
 *
 * Стоит рядом с тем, кому адресована: строкой под именем второго, а не отдельным
 * цветным блоком на всю ширину, который спорил со всем экраном.
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
    <button
      type="button"
      onClick={(e) => {
        haptic('commit')
        const button = e.currentTarget
        // Сердца - только когда «Думаю о тебе» правда ушло: разлёт при ошибке
        // сети обещал бы то, чего не случилось
        send.mutate(undefined, { onSuccess: () => burst(button, 'hearts') })
      }}
      disabled={cooling || send.isPending}
      className={`flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-2 text-left text-[17px] transition-colors duration-200
                  active:bg-raised active:duration-0 disabled:active:bg-transparent [--sep:4rem] ${
                    cooling ? 'text-muted' : 'font-semibold text-tone-rose'
                  }`}
    >
      {/* Сердце «бьётся» один раз в момент отправки - ответ на нажатие,
          который видно, даже если кнопка тут же ушла в остывание */}
      <motion.span
        key={last.data ?? 'idle'}
        initial={last.data ? { scale: 1.6 } : false}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 12 }}
        className="flex size-9 shrink-0 items-center justify-center"
      >
        <Heart size={25} aria-hidden className={cooling ? '' : 'fill-love text-love'} />
      </motion.span>
      {/* Без имени: склонять ник по падежам - «думаю о Аминош» - хуже,
          чем не склонять вовсе, а правил тут не напасёшься */}
      <span className="min-w-0 flex-1 truncate">{cooling ? t('nudge.cooling', { n: minutes }) : t('nudge.send')}</span>
    </button>
  )
}
