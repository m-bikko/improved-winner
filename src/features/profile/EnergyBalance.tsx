import { useQuery } from '@tanstack/react-query'
import { Scale, TrendingDown } from 'lucide-react'
import { shiftDays, todayLocal } from '@/lib/date'
import { formatDayMonth, fromLocalISO } from '@/lib/date'
import { supabase } from '@/lib/supabase'
import { dynamicKey, useT } from '@/lib/i18n'

/** Окно наблюдения. Короче месяца вес меняет вода, а не жир. */
const WINDOW_DAYS = 28

/** Горизонт прогноза. Дальше он перестаёт быть прогнозом. */
const FORECAST_DAYS = 30

type Balance = {
  loggedDays: number
  windowDays: number
  meanKcal: number
  weighIns: number
  /** Кг в день. Отрицательный - вес снижается. */
  slope: number
  slopeError: number
  fitToday: number | null
  tdee: number | null
  tdeeError: number
  /** Ключ словаря, объясняющий, чего не хватает. null - хватает. */
  gap: string | null
}

export function useEnergyBalance(userId: string) {
  const today = todayLocal()
  return useQuery({
    queryKey: ['energy-balance', userId, today],
    enabled: userId !== '',
    queryFn: async (): Promise<Balance | null> => {
      const { data, error } = await supabase.rpc('energy_balance', {
        target: userId,
        today,
        days: WINDOW_DAYS,
      })
      if (error) throw error
      const r = data?.[0]
      if (!r) return null
      return {
        loggedDays: r.logged_days,
        windowDays: r.window_days,
        meanKcal: Number(r.mean_kcal),
        weighIns: r.weigh_ins,
        slope: Number(r.slope),
        slopeError: Number(r.slope_error ?? 0),
        fitToday: r.fit_today === null ? null : Number(r.fit_today),
        tdee: r.tdee === null ? null : Number(r.tdee),
        tdeeError: Number(r.tdee_error ?? 0),
        gap: r.gap,
      }
    },
  })
}

/**
 * Расход, измеренный по своим данным, и куда идёт вес.
 *
 * Формула Миффлина оценивает расход по анкете: рост, вес, возраст, коэффициент
 * активности. Но человек, который три недели записывал еду и взвешивался,
 * даёт возможность расход ИЗМЕРИТЬ - и измеренное число всегда ближе к правде,
 * чем оценка по средним значениям популяции.
 *
 * Блок молчит чаще, чем говорит, и это правильно. Данных не хватает почти
 * всегда: пропущенные дни в дневнике делают среднюю калорийность ложной,
 * а редкие взвешивания - наклон случайным. Показать число в такой ситуации
 * хуже, чем не показать: на него будут опираться месяц.
 *
 * Прогноз веса намеренно короткий, на месяц. Линейное продолжение дальше -
 * арифметика, а не предсказание: темп меняется сам собой, как только меняется
 * вес, и обещание «минус десять к весне» было бы обманом.
 */
export function EnergyBalance({ userId }: { userId: string }) {
  const t = useT()
  const balance = useEnergyBalance(userId)
  const b = balance.data

  if (!b) return null

  return (
    <div className="rounded-xl bg-raised px-4 py-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Scale size={15} aria-hidden />
        {t('balance.title')}
      </p>

      {b.gap !== null ? (
        <>
          <p className="mt-1 text-sm text-muted">{t(dynamicKey('balance', b.gap.slice(8)))}</p>
          <p className="mt-2 text-xs text-muted">
            {t('balance.have', {
              days: b.loggedDays,
              of: b.windowDays,
              weights: b.weighIns,
            })}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {b.tdee} {t('unit.kcal')}
            {b.tdeeError > 0 && (
              <span className="ml-1 text-base font-normal text-muted">± {b.tdeeError}</span>
            )}
          </p>
          <p className="mt-1 text-sm text-muted">
            {t('balance.from', {
              days: b.loggedDays,
              unit: t.plural('unit.day', b.loggedDays),
              kcal: b.meanKcal,
            })}
          </p>

          <Forecast slope={b.slope} slopeError={b.slopeError} fitToday={b.fitToday} />
        </>
      )}
    </div>
  )
}

/**
 * Куда идёт вес при нынешнем темпе.
 *
 * Наклон считается регрессией по взвешиваниям, а не разностью «было - стало»:
 * одно взвешивание после солёного ужина сдвинуло бы разность на килограмм.
 *
 * Если наклон неотличим от нуля - а «неотличим» значит меньше двух своих
 * стандартных ошибок, - показывается «вес стоит». Продолжать шум прямой
 * значило бы выдать случайность за направление.
 */
function Forecast({
  slope,
  slopeError,
  fitToday,
}: {
  slope: number
  slopeError: number
  fitToday: number | null
}) {
  const t = useT()
  if (fitToday === null) return null

  const significant = Math.abs(slope) > 2 * slopeError && slopeError > 0
  if (!significant) {
    return (
      <p className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-sm text-muted">
        <TrendingDown size={15} aria-hidden className="mt-0.5 shrink-0" />
        {t('balance.flat')}
      </p>
    )
  }

  const perWeek = slope * 7
  const target = fitToday + slope * FORECAST_DAYS
  // Разброс растёт вместе с горизонтом: ошибка наклона умножается на то же
  // число дней, на которое продолжена прямая
  const spread = 2 * slopeError * FORECAST_DAYS
  const when = formatDayMonth(fromLocalISO(shiftDays(todayLocal(), FORECAST_DAYS)))

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="flex items-start gap-2 text-sm">
        <TrendingDown size={15} aria-hidden className="mt-0.5 shrink-0 text-muted" />
        <span>
          {t('balance.pace', {
            sign: perWeek > 0 ? '+' : '−',
            n: Math.abs(perWeek).toFixed(1),
          })}
        </span>
      </p>
      <p className="mt-1 text-sm text-muted">
        {t('balance.forecast', {
          when,
          kg: target.toFixed(1),
          spread: spread.toFixed(1),
        })}
      </p>
    </div>
  )
}
