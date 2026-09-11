import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { todayLocal } from '@/lib/date'
import { supabase } from '@/lib/supabase'
import { STATE_BY_ID } from '@/features/checkin/states'
import { dynamicKey, tr, trPlural, useT } from '@/lib/i18n'
import { type Phase } from './cycle'

type Pattern = {
  state: string
  phase: Phase
  hits: number
  daysInPhase: number
  observedDays: number
  rate: number
  otherRate: number
  ratio: number
}

/**
 * Закономерности: что из «Как ты» совпадает с фазой цикла.
 *
 * Считает база - и считает ЧАСТОТУ, а не количество. Лютеиновая фаза вдвое
 * длиннее фолликулярной, и подсчёт «где чаще встречалось» назвал бы её
 * для любого состояния подряд.
 *
 * Пороги строгие намеренно: данных у пары мало, и находка из двух совпадений -
 * не наблюдение, а шум, который человек примет за факт о своём теле.
 * Поэтому пустой блок здесь - нормальное и частое состояние, а не ошибка.
 */
function usePatterns(ownerId: string) {
  const today = todayLocal()
  return useQuery({
    queryKey: ['cycle-patterns', ownerId, today],
    enabled: ownerId !== '',
    queryFn: async (): Promise<Pattern[]> => {
      const { data, error } = await supabase.rpc('checkin_cycle_patterns', {
        owner: ownerId,
        today,
        months: 6,
      })
      if (error) throw error
      return data.map((r) => ({
        state: r.state,
        phase: r.phase as Phase,
        hits: r.hits,
        daysInPhase: r.days_in_phase,
        observedDays: r.observed_days,
        rate: Number(r.rate),
        otherRate: Number(r.other_rate),
        ratio: Number(r.ratio),
      }))
    },
  })
}

export function Patterns({ ownerId }: { ownerId: string }) {
  const t = useT()
  const found = usePatterns(ownerId)

  // Молча ничего не показываем: и пока данных мало, и если доступ закрыт.
  // Пустой заголовок «Закономерности» без содержимого выглядит поломкой
  if (!found.data || found.data.length === 0) return null

  const observed = found.data[0]?.observedDays ?? 0

  return (
    <section className="mt-5 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="flex items-center gap-2 font-medium">
        <Sparkles size={17} aria-hidden className="text-accent" />
        {t('pat.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {t('pat.observed', { n: observed, unit: t.plural('unit.dayDat', observed) })}
      </p>

      <ul className="mt-3 flex flex-col gap-3">
        {found.data.map((p) => (
          <li key={`${p.state}-${p.phase}`} className="text-sm">
            <span className="font-medium">
              {STATE_BY_ID[p.state] ? t(dynamicKey('state', p.state)) : p.state}
            </span>
            <span className="text-muted">
              {' — '}
              {phrase(p)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        {t('pat.disclaimer')}
      </p>
    </section>
  )
}

function phrase(p: Pattern): string {
  const phase = tr(dynamicKey('phase', p.phase)).toLowerCase()
  const share = tr('pat.share', {
    n: p.hits,
    unit: trPlural('unit.time', p.hits),
    total: p.daysInPhase,
  })

  // Ноль за пределами фазы - это не «в 99 раз чаще», а «только здесь».
  // Отношение к нулю не имеет смысла, и показывать его числом нельзя
  if (p.otherRate === 0) {
    return tr('pat.onlyIn', { phase, share })
  }
  const times = p.ratio >= 10 ? Math.round(p.ratio) : Math.round(p.ratio * 10) / 10
  return tr('pat.moreOften', {
    times,
    unit: trPlural('unit.time', Math.round(times)),
    phase,
    share,
  })
}
