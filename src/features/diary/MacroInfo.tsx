import type { GoalDirection } from '@/lib/nutrition'
import type { ReactNode } from 'react'
import { Target } from 'lucide-react'
import { dynamicKey, useT } from '@/lib/i18n'
import { Sheet } from '@/ui/Sheet'

export type Nutrient = 'kcal' | 'protein' | 'fat' | 'carbs'

/**
 * Справка по нутриентам.
 *
 * Текст зависит от цели: один и тот же перебор углеводов при наборе массы -
 * это норма, а при похудении - причина, по которой вес стоит. Показывать
 * обе трактовки сразу значит заставить человека самому выбирать нужную.
 *
 * Формулировки намеренно бытовые и без диагнозов: это подсказка к трекеру,
 * а не медицинская рекомендация.
 *
 * Сами тексты живут в словарях под `macro.<нутриент>.<раздел>`: статья это
 * четыре абзаца плюс по абзацу на каждую цель, и держать их таблицей в коде
 * значило бы держать три таблицы - по одной на язык.
 */
export function MacroInfoSheet({
  nutrient,
  goalDirection,
  onClose,
}: {
  nutrient: Nutrient | null
  goalDirection: GoalDirection
  onClose: () => void
}) {
  const t = useT()
  const part = (section: string): string =>
    nutrient ? t(dynamicKey('macro', `${nutrient}.${section}`)) : ''

  return (
    <Sheet open={nutrient !== null} onClose={onClose} title={part('title')}>
      {nutrient && (
        <div className="flex flex-col gap-5">
          {/* Трактовка под цель - первой: ради неё справку обычно и открывают,
              а общие абзацы ниже - для тех, кто хочет разобраться */}
          <div className="rounded-3xl bg-accent-soft px-4 py-3.5 text-accent-soft-ink">
            <p className="mb-1 flex items-center gap-1.5 font-display text-[15px] font-bold">
              <Target size={16} aria-hidden />
              {t('macro.forGoal')}
            </p>
            <p className="text-[15px] leading-relaxed">{part(goalDirection)}</p>
          </div>

          <Block label={t('macro.role')}>{part('role')}</Block>
          <Block label={t('macro.under')}>{part('under')}</Block>
          <Block label={t('macro.over')}>{part('over')}</Block>

          <p className="text-[13px] text-muted">{t('macro.disclaimer')}</p>
        </div>
      )}
    </Sheet>
  )
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 font-display text-[15px] font-bold">{label}</p>
      <p className="text-[15px] leading-relaxed text-ink/90">{children}</p>
    </div>
  )
}
