import { useT } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
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
      onClick={() => send.mutate()}
      disabled={cooling || send.isPending}
      className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-4 text-sm font-medium
                  transition-colors ${
                    cooling
                      ? 'bg-surface text-muted ring-1 ring-line'
                      : 'bg-accent text-accent-ink active:opacity-90'
                  }`}
    >
      <Heart size={17} aria-hidden className={cooling ? '' : 'fill-current'} />
      {/* Без имени: склонять ник по падежам - «думаю о Аминош» - хуже,
          чем не склонять вовсе, а правил тут не напасёшься */}
      {cooling ? t('nudge.cooling', { n: minutes }) : t('nudge.send')}
    </button>
  )
}
