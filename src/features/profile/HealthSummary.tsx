import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, ClipboardList, Copy } from 'lucide-react'
import { formatDayMonth, fromLocalISO, todayLocal } from '@/lib/date'
import { supabase } from '@/lib/supabase'
import { tr, useT } from '@/lib/i18n'
import { Button } from '@/ui/Button'
import { Sheet } from '@/ui/Sheet'
import { Loading } from '@/ui/States'
import { IconBadge } from '@/ui/IconBadge'

/** Окно наблюдения. Три месяца - то, о чём врач спрашивает на приёме. */
const DAYS = 90

type Summary = {
  from: string
  to: string
  diaryDays: number
  meanKcal: number | null
  meanProtein: number | null
  weighIns: number
  weightFrom: number | null
  weightTo: number | null
  weightLow: number | null
  weightHigh: number | null
  checkinDays: number
  headache: number
  stomach: number
  exhausted: number
  sick: number
}

function useHealthSummary(open: boolean) {
  const today = todayLocal()
  return useQuery({
    queryKey: ['health-summary', today],
    enabled: open,
    queryFn: async (): Promise<Summary> => {
      const { data, error } = await supabase.rpc('health_summary', { today, days: DAYS })
      if (error) throw error
      return data as unknown as Summary
    },
  })
}

/** Строки для экрана и для буфера - одни и те же, иначе врач увидит другое. */
function lines(s: Summary): string[] {
  const out: string[] = []
  const day = (iso: string): string => formatDayMonth(fromLocalISO(iso))

  out.push(tr('summary.period', { from: day(s.from), to: day(s.to) }))

  if (s.weighIns >= 2 && s.weightFrom !== null && s.weightTo !== null) {
    out.push(
      tr('summary.weight', {
        from: s.weightFrom,
        to: s.weightTo,
        low: s.weightLow ?? s.weightFrom,
        high: s.weightHigh ?? s.weightTo,
      }),
    )
  } else {
    out.push(tr('summary.weightNone'))
  }

  if (s.diaryDays >= 7 && s.meanKcal !== null) {
    out.push(
      tr('summary.food', {
        days: s.diaryDays,
        kcal: s.meanKcal,
        protein: s.meanProtein ?? 0,
      }),
    )
  } else {
    out.push(tr('summary.foodNone', { days: s.diaryDays }))
  }

  // Самочувствие - только то, что врач спросит сам: боль, слабость, болезнь.
  // Остальные сорок состояний к приёму отношения не имеют
  const marks: [string, number][] = [
    ['summary.headache', s.headache],
    ['summary.stomach', s.stomach],
    ['summary.exhausted', s.exhausted],
    ['summary.sick', s.sick],
  ]
  const seen = marks.filter(([, n]) => n > 0)
  if (s.checkinDays > 0) {
    out.push(
      seen.length > 0
        ? tr('summary.states', {
            days: s.checkinDays,
            list: seen.map(([k, n]) => `${tr(k as never)} ${n}`).join(', '),
          })
        : tr('summary.statesNone', { days: s.checkinDays }),
    )
  }

  out.push(tr('summary.footer'))
  return out
}

/**
 * Короткая сводка о себе - то, что показывают врачу.
 *
 * Шторка, а не страница, и намеренно на несколько строк. Длинную выписку
 * никто не дочитывает: врачу нужны диапазон наблюдения и несколько чисел,
 * остальное он спросит сам. Полная история цикла живёт отдельно - она про
 * другое и нужна другому специалисту.
 *
 * Про ВЫЗЫВАЮЩЕГО и ни про кого больше: у функции в базе нет параметра
 * «чья», и подменить его нечем. Выписка - документ про себя.
 *
 * Где данных мало, строка прямо говорит, что их мало, а не исчезает. Врач,
 * увидевший три пункта вместо четырёх, не узнает, что четвёртого не хватило.
 */
export function HealthSummary() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const summary = useHealthSummary(open)

  const text = summary.data ? lines(summary.data).join('\n') : ''

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Буфер может быть закрыт настройками - текст всё равно виден
      // и выделяется руками
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-14 items-center gap-3 rounded-3xl bg-surface px-4 py-3 text-left
                   shadow-card transition-transform active:scale-[0.98]"
      >
        <IconBadge icon={ClipboardList} tone="indigo" size="sm" />
        <span className="min-w-0 flex-1 text-[15px] font-semibold">{t('summary.title')}</span>
        <ChevronRight size={18} aria-hidden className="shrink-0 text-muted/70" />
      </button>

      {open && (
        <Sheet open onClose={() => setOpen(false)} title={t('summary.title')}>
          {summary.isPending ? (
            <Loading />
          ) : (
            <div className="flex flex-col gap-4">
              {/* pre, а не абзацы: текст на экране и текст в буфере должны
                  совпадать дословно, иначе врач и приложение увидят разное */}
              <pre className="overflow-x-auto rounded-xl bg-raised p-4 text-sm leading-relaxed whitespace-pre-wrap">
                {text}
              </pre>
              <Button onClick={() => void copy()}>
                {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
                {copied ? t('cycle.copied') : t('cycle.copy')}
              </Button>
            </div>
          )}
        </Sheet>
      )}
    </>
  )
}
