import { useQuery } from '@tanstack/react-query'
import { PersonStanding } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDayMonth, fromLocalISO, todayLocal } from '@/lib/date'
import { dynamicKey, useT } from '@/lib/i18n'
import {
  bandTone,
  bmi,
  fatBand,
  partKg,
  visceralBand,
  waterBand,
  type Band,
  type BodyGap,
} from '@/lib/body'
import type { Sex } from '@/lib/nutrition'
import { Loading } from '@/ui/States'
import { IconBadge } from '@/ui/IconBadge'

/**
 * Окно наблюдения - восемь недель.
 *
 * Вдвое длиннее, чем у расхода, и не по невнимательности. Биоимпеданс мерит
 * сопротивление тела, а оно гуляет от воды: солёный ужин или тренировка
 * накануне сдвигают процент жира на единицу-полторы. За месяц реальное
 * изменение состава меньше этой ряби, и прямая проводится по шуму.
 */
const WINDOW_DAYS = 56

type Composition = {
  measures: number
  span: number
  weightChange: number | null
  fatChange: number | null
  leanChange: number | null
  fatShare: number | null
  lastDate: string | null
  lastFatPct: number | null
  lastVisceral: number | null
  lastWaterPct: number | null
  lastMusclePct: number | null
  lastSkeletalPct: number | null
  lastBmr: number | null
  lastLeanKg: number | null
  lastFatKg: number | null
  gap: BodyGap | null
}

export function useBodyComposition(userId: string) {
  const today = todayLocal()
  return useQuery({
    queryKey: ['body-composition', userId, today],
    enabled: userId !== '',
    queryFn: async (): Promise<Composition | null> => {
      const { data, error } = await supabase.rpc('body_composition', {
        target: userId,
        today,
        days: WINDOW_DAYS,
      })
      if (error) throw error
      const r = data?.[0]
      if (!r) return null
      const n = (v: string | number | null): number | null => (v === null ? null : Number(v))
      return {
        measures: r.measures,
        span: r.span,
        weightChange: n(r.weight_change),
        fatChange: n(r.fat_change),
        leanChange: n(r.lean_change),
        fatShare: n(r.fat_share),
        lastDate: r.last_date,
        lastFatPct: n(r.last_fat_pct),
        lastVisceral: n(r.last_visceral),
        lastWaterPct: n(r.last_water_pct),
        lastMusclePct: n(r.last_muscle_pct),
        lastSkeletalPct: n(r.last_skeletal_pct),
        lastBmr: r.last_bmr,
        lastLeanKg: n(r.last_lean_kg),
        lastFatKg: n(r.last_fat_kg),
        gap: r.gap as BodyGap | null,
      }
    },
  })
}

/**
 * Состав тела.
 *
 * Карточка отвечает на один вопрос, ради которого умные весы и покупают:
 * **минус три килограмма - это минус три килограмма жира или полтора жира
 * и полтора мышц?** Обычные весы на него не отвечают в принципе, и человек
 * месяцами не знает, что именно теряет.
 *
 * Поэтому тренд стоит выше таблицы с сегодняшними процентами. Отдельно взятые
 * 29 % жира не говорят почти ничего: шкалы приборов расходятся, и сравнивать
 * своё число с чужой таблицей бессмысленно. А вот «за восемь недель минус
 * 3.2 кг, из них 2.8 жира» - это про себя, измеренное одним и тем же прибором,
 * и это уже решение: продолжать или менять.
 *
 * Весь раздел появляется, только если состав вводили. Ни одно другое место
 * приложения от него не зависит: обычные весы дают вес, и этого достаточно.
 */
export function BodyComposition({
  userId,
  sex,
  heightCm,
  weightKg,
}: {
  userId: string
  sex: Sex | null
  heightCm: number | null
  weightKg: number | null
}) {
  const t = useT()
  const composition = useBodyComposition(userId)

  if (composition.isPending) return <Loading />
  const c = composition.data
  // Ни одного взвешивания с составом - карточки нет вовсе. Приглашать ввести
  // то, чего у человека нет прибора измерить, незачем.
  if (!c || c.gap === 'body.none') return null

  const index = weightKg === null ? null : bmi(weightKg, heightCm)

  return (
    <section className="rounded-3xl bg-surface px-4 py-4 shadow-card">
      <p className="flex items-center gap-2.5 font-display text-[17px] font-bold">
        <IconBadge icon={PersonStanding} tone="green" size="sm" />
        {t('body.title')}
      </p>

      {c.gap === null && c.weightChange !== null && c.fatChange !== null ? (
        <div className="mt-3 rounded-2xl bg-raised/70 px-3.5 py-3">
          <p className="text-sm">
            {t('body.overSpan', {
              n: c.span,
              unit: t.plural('unit.day', c.span),
              weight: signed(c.weightChange),
            })}
          </p>
          <p className="mt-1.5 text-sm font-medium">
            {t('body.ofThatFat', {
              fat: signed(c.fatChange),
              lean: signed(c.leanChange ?? 0),
            })}
          </p>
          {/* Доля - главный вывод, и она же самая хрупкая: при почти
              неизменном весе её не бывает, и база возвращает null. */}
          {c.fatShare !== null && (
            <p className="mt-1.5 text-xs text-muted">
              {t(verdictKey(c.weightChange, c.fatShare))}
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            {t('body.byMeasures', { n: c.measures })}
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-raised px-3 py-3 text-sm text-muted">
          {t(c.gap ?? 'body.none')}
        </p>
      )}

      <dl className="mt-3 flex flex-col divide-y divide-line border-t border-line">
        {c.lastFatPct !== null && (
          <Row
            label={t('body.fatPct')}
            value={`${c.lastFatPct} %`}
            extra={c.lastFatKg === null ? null : t('profile.kgSuffix', { n: c.lastFatKg })}
            band={fatBand(c.lastFatPct, sex)}
          />
        )}
        {c.lastLeanKg !== null && (
          <Row
            label={t('body.lean')}
            value={t('profile.kgSuffix', { n: c.lastLeanKg })}
            extra={t('body.leanHint')}
            band={null}
          />
        )}
        {c.lastMusclePct !== null && weightKg !== null && (
          <Row
            label={t('body.musclePct')}
            value={`${c.lastMusclePct} %`}
            extra={kg(t, partKg(weightKg, c.lastMusclePct))}
            band={null}
          />
        )}
        {c.lastSkeletalPct !== null && weightKg !== null && (
          <Row
            label={t('body.skeletalPct')}
            value={`${c.lastSkeletalPct} %`}
            extra={kg(t, partKg(weightKg, c.lastSkeletalPct))}
            band={null}
          />
        )}
        {c.lastWaterPct !== null && (
          <Row
            label={t('body.waterPct')}
            value={`${c.lastWaterPct} %`}
            extra={weightKg === null ? null : kg(t, partKg(weightKg, c.lastWaterPct))}
            band={waterBand(c.lastWaterPct, sex)}
          />
        )}
        {c.lastVisceral !== null && (
          <Row
            label={t('body.visceral')}
            value={String(c.lastVisceral)}
            extra={t('body.visceralHint')}
            band={visceralBand(c.lastVisceral)}
          />
        )}
        {c.lastBmr !== null && (
          <Row
            label={t('body.bmr')}
            value={t('body.kcalPerDay', { n: c.lastBmr })}
            extra={t('body.bmrHint')}
            band={null}
          />
        )}
        {index !== null && (
          <Row label={t('body.bmi')} value={String(index)} extra={t('body.bmiHint')} band={null} />
        )}
      </dl>

      {c.lastDate !== null && (
        <p className="mt-3 text-xs text-muted">
          {t('body.measuredOn', { date: formatDayMonth(fromLocalISO(c.lastDate)) })}
        </p>
      )}
      <p className="mt-1 text-xs text-muted">{t('body.disclaimer')}</p>
    </section>
  )
}

/**
 * Вывод одной строкой.
 *
 * Четыре случая, и в каждом важно не похвалить и не отругать, а назвать то,
 * что произошло. «Минус три килограмма» без разбивки человек трактует сам,
 * и трактует обычно оптимистичнее, чем есть.
 */
function verdictKey(weightChange: number, fatShare: number): 'body.mostlyFat' |
  'body.someLean' | 'body.mostlyLean' | 'body.gainedLean' | 'body.gainedFat' {
  if (weightChange < 0) {
    if (fatShare >= 75) return 'body.mostlyFat'
    if (fatShare >= 40) return 'body.someLean'
    return 'body.mostlyLean'
  }
  return fatShare >= 50 ? 'body.gainedFat' : 'body.gainedLean'
}

function signed(kgValue: number): string {
  return `${kgValue > 0 ? '+' : ''}${kgValue.toFixed(1)}`
}

function kg(t: ReturnType<typeof useT>, value: number | null): string | null {
  return value === null ? null : t('profile.kgSuffix', { n: value })
}

function Row({
  label,
  value,
  extra,
  band,
}: {
  label: string
  value: string
  extra: string | null
  band: Band | null
}) {
  const t = useT()
  const tone = band === null ? null : bandTone(band)
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="min-w-0 text-sm">
        {label}
        {extra !== null && <span className="mt-0.5 block text-xs text-muted">{extra}</span>}
      </dt>
      <dd className="shrink-0 text-right">
        <span className="text-sm font-medium">{value}</span>
        {band !== null && tone !== null && (
          <span
            className={`mt-0.5 block text-xs ${
              tone === 'ok' ? 'text-carbs' : tone === 'danger' ? 'text-danger' : 'text-muted'
            }`}
          >
            {t(dynamicKey('band', band))}
          </span>
        )}
      </dd>
    </div>
  )
}
