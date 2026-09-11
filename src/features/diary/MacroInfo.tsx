import type { GoalDirection } from '@/lib/nutrition'
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
        <div className="flex flex-col gap-4">
          <Block label={t('macro.role')}>{part('role')}</Block>
          <Block label={t('macro.under')}>{part('under')}</Block>
          <Block label={t('macro.over')}>{part('over')}</Block>

          <div className="rounded-xl bg-raised px-4 py-3">
            <p className="mb-1 text-sm font-medium text-accent">{t('macro.forGoal')}</p>
            <p className="text-sm">{part(goalDirection)}</p>
          </div>

          <p className="text-xs text-muted">{t('macro.disclaimer')}</p>
        </div>
      )}
    </Sheet>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-muted">{label}</p>
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  )
}
