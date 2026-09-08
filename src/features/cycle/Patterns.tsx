import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { todayLocal } from '@/lib/date'
import { plural } from '@/lib/plural'
import { supabase } from '@/lib/supabase'
import { STATE_BY_ID } from '@/features/checkin/states'
import { PHASE_LABELS, type Phase } from './cycle'

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
  const found = usePatterns(ownerId)

  // Молча ничего не показываем: и пока данных мало, и если доступ закрыт.
  // Пустой заголовок «Закономерности» без содержимого выглядит поломкой
  if (!found.data || found.data.length === 0) return null

  const observed = found.data[0]?.observedDays ?? 0

  return (
    <section className="mt-5 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="flex items-center gap-2 font-medium">
        <Sparkles size={17} aria-hidden className="text-accent" />
        Закономерности
      </h2>
      <p className="mt-1 text-sm text-muted">
        По {observed} отмеченным {plural(observed, 'дню', 'дням', 'дням')} за полгода
      </p>

      <ul className="mt-3 flex flex-col gap-3">
        {found.data.map((p) => (
          <li key={`${p.state}-${p.phase}`} className="text-sm">
            <span className="font-medium">{STATE_BY_ID[p.state]?.label ?? p.state}</span>
            <span className="text-muted">
              {' — '}
              {phrase(p)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        Это совпадения в отметках, а не диагноз. Совпадение может быть и случайным,
        и общим следствием чего-то третьего.
      </p>
    </section>
  )
}

function phrase(p: Pattern): string {
  const phase = PHASE_LABELS[p.phase].toLowerCase()
  const share = `${p.hits} ${plural(p.hits, 'раз', 'раза', 'раз')} из ${p.daysInPhase}`

  // Ноль за пределами фазы - это не «в 99 раз чаще», а «только здесь».
  // Отношение к нулю не имеет смысла, и показывать его числом нельзя
  if (p.otherRate === 0) {
    return `отмечено только в эту фазу (${phase}), ${share}`
  }
  const times = p.ratio >= 10 ? Math.round(p.ratio) : Math.round(p.ratio * 10) / 10
  return `в ${times} ${plural(Math.round(times), 'раз', 'раза', 'раз')} чаще в эту фазу (${phase}), ${share}`
}
