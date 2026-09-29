import { useQuery } from '@tanstack/react-query'
import { UtensilsCrossed } from 'lucide-react'
import { todayLocal } from '@/lib/date'
import { supabase } from '@/lib/supabase'
import { dynamicKey, useT } from '@/lib/i18n'
import { Card } from '@/ui/Card'
import { IconBadge } from '@/ui/IconBadge'
import type { Phase } from './cycle'

type PhaseRow = {
  phase: Phase
  days: number
  meanKcal: number
  meanProtein: number
  meanCarbs: number
  weighIns: number
  /** Отклонение от среднего веса за окно, кг. null - взвешиваний мало. */
  weightDelta: number | null
}

function useDiaryByPhase(ownerId: string) {
  const today = todayLocal()
  return useQuery({
    queryKey: ['cycle-diary', ownerId, today],
    enabled: ownerId !== '',
    queryFn: async (): Promise<PhaseRow[]> => {
      const { data, error } = await supabase.rpc('cycle_diary_stats', {
        owner: ownerId,
        today,
        months: 6,
      })
      if (error) throw error
      return (data ?? []).map((r) => ({
        phase: r.phase as Phase,
        days: r.days,
        meanKcal: Number(r.mean_kcal),
        meanProtein: Number(r.mean_protein),
        meanCarbs: Number(r.mean_carbs),
        weighIns: r.weigh_ins,
        weightDelta: r.weight_delta === null ? null : Number(r.weight_delta),
      }))
    },
  })
}

/**
 * Дневник в разрезе фаз цикла.
 *
 * Подсказки раздела утверждают, что во второй половине тянет на сладкое,
 * а вес выше на кило-два от воды. До сих пор приложение это только
 * пересказывало: фазы, дневник и журнал веса лежали рядом и ни разу
 * не сводились вместе.
 *
 * Вес показан ОТКЛОНЕНИЕМ от среднего за полгода, а не абсолютным числом.
 * Вопрос не «сколько она весит в лютеиновой фазе», а «отличается ли эта фаза
 * от остальных»; абсолютное число ничего не добавляет и лишний раз выносит
 * вес на экран.
 *
 * Пустой блок - нормальное состояние: база молчит, пока в фазе меньше трёх
 * дней с записями. Среднее из двух дней это не среднее.
 */
export function DiaryByPhase({ ownerId }: { ownerId: string }) {
  const t = useT()
  const stats = useDiaryByPhase(ownerId)

  const rows = stats.data ?? []
  // Одна фаза не сравнение: показывать «в менструальной 1900 ккал» не с чем
  if (rows.length < 2) return null

  const maxKcal = Math.max(...rows.map((r) => r.meanKcal))

  return (
    <Card as="section" className="p-4">
      {/* Тон дневника, а не цикла: это еда из дневника, разложенная по фазам,
          и узнаваться блок должен по тому, откуда данные */}
      <div className="flex items-center gap-3">
        <IconBadge icon={UtensilsCrossed} tone="amber" size="sm" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[17px] leading-tight font-bold">{t('phaseDiary.title')}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{t('phaseDiary.window')}</p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-4">
        {rows.map((r) => (
          <li key={r.phase}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[15px] font-medium">
                {t(dynamicKey('phase', r.phase))}
              </span>
              <span className="shrink-0 text-[13px] text-muted tabular-nums">
                <span className="font-display text-[17px] font-bold text-ink">{r.meanKcal}</span>{' '}
                {t('unit.kcal')}
              </span>
            </div>

            {/* Полоса от максимума, а не от нормы: сравниваются фазы между
                собой, и норма тут сбивала бы с толку - она про день, а не
                про фазу */}
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${maxKcal > 0 ? (r.meanKcal / maxKcal) * 100 : 0}%` }}
              />
            </div>

            <p className="mt-1.5 text-[13px] text-muted tabular-nums">
              {t('phaseDiary.row', {
                days: r.days,
                unit: t.plural('unit.day', r.days),
                protein: r.meanProtein,
                carbs: r.meanCarbs,
              })}
              {r.weightDelta !== null && r.weightDelta !== 0 && (
                <>
                  {' · '}
                  {t('phaseDiary.weight', {
                    sign: r.weightDelta > 0 ? '+' : '−',
                    n: Math.abs(r.weightDelta).toFixed(1),
                  })}
                </>
              )}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-line pt-3 text-[13px] leading-relaxed text-muted">
        {t('phaseDiary.note')}
      </p>
    </Card>
  )
}
