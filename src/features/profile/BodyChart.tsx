import { useId, useMemo, useState } from 'react'
import { Table2, TrendingUp } from 'lucide-react'
import { formatDayMonth, fromLocalISO, shiftDays, todayLocal } from '@/lib/date'
import { useT, type Key } from '@/lib/i18n'
import { leanKg, partKg } from '@/lib/body'
import type { WeightPoint } from './api'

/**
 * Динамика всех показателей на одном графике.
 *
 * Три правила, из которых вырос весь компонент.
 *
 * **Одна ось.** Вес 96 кг, висцеральный индекс 16.5 и обмен 2008 ккал
 * на общей вертикали превратились бы в три прямые: две у самого низа и одна
 * у потолка. Вторая ось для второй серии - самая частая ошибка в графиках
 * и всегда враньё о соотношении. Поэтому единица выбирается переключателем,
 * а список показателей сужается до тех, у кого она есть.
 *
 * **Не больше трёх линий сразу.** Не из экономии, а по проверке палитры:
 * на тройке цветов все шесть проверок проходят в обеих темах, на четвёрке
 * зелёный и акцентный при дейтеранопии расходятся на ΔE 5.1 при минимуме 8.
 * Добавить седьмой цвет нельзя - в тёмной теме полоса светлоты узкая, и любой
 * новый оттенок сливается с соседним. Четыре линии на экране шириной
 * в 390 точек нечитаемы и без всякой палитры.
 *
 * **Цвет принадлежит показателю, а не его номеру.** Выключив одну линию,
 * человек не должен увидеть, как две оставшиеся перекрасились: слот
 * закрепляется за показателем при включении и освобождается при выключении.
 */

const WIDTH = 320
const HEIGHT = 150
const PAD_X = 10
const PAD_TOP = 12
const PAD_BOTTOM = 22

/** Единицы. Каждая - своя вертикальная ось, и смешивать их нельзя. */
export const UNITS = ['kg', 'pct', 'index', 'kcal'] as const
export type Unit = (typeof UNITS)[number]

export const METRICS = [
  'weight',
  'fat',
  'lean',
  'muscle',
  'skeletal',
  'water',
  'visceral',
  'bmr',
] as const
export type MetricId = (typeof METRICS)[number]

/** В каких единицах показатель вообще существует. */
const UNITS_OF: Record<MetricId, readonly Unit[]> = {
  weight: ['kg'],
  fat: ['kg', 'pct'],
  lean: ['kg', 'pct'],
  muscle: ['kg', 'pct'],
  skeletal: ['kg', 'pct'],
  water: ['kg', 'pct'],
  visceral: ['index'],
  bmr: ['kcal'],
}

const LABEL_OF: Record<MetricId, Key> = {
  weight: 'profile.weight',
  fat: 'body.fatPct',
  lean: 'body.lean',
  muscle: 'body.musclePct',
  skeletal: 'body.skeletalPct',
  water: 'body.waterPct',
  visceral: 'body.visceral',
  bmr: 'body.bmr',
}

const UNIT_LABEL: Record<Unit, Key> = {
  kg: 'unit.kg',
  pct: 'chart.pct',
  index: 'chart.index',
  kcal: 'unit.kcal',
}

/**
 * Значение показателя в выбранной единице. null - в этот день его не мерили.
 *
 * Килограммы считаются здесь же, из веса и процента: хранить их значило бы
 * держать вторую копию одного числа, и она однажды разойдётся с первой.
 */
export function valueOf(p: WeightPoint, metric: MetricId, unit: Unit): number | null {
  switch (metric) {
    case 'weight':
      return p.weightKg
    case 'fat':
      return unit === 'pct' ? p.bodyFatPct : partKg(p.weightKg, p.bodyFatPct)
    case 'lean':
      return unit === 'pct'
        ? p.bodyFatPct === null
          ? null
          : Math.round((100 - p.bodyFatPct) * 10) / 10
        : leanKg(p.weightKg, p.bodyFatPct)
    case 'muscle':
      return unit === 'pct' ? p.musclePct : partKg(p.weightKg, p.musclePct)
    case 'skeletal':
      return unit === 'pct' ? p.skeletalMusclePct : partKg(p.weightKg, p.skeletalMusclePct)
    case 'water':
      return unit === 'pct' ? p.waterPct : partKg(p.weightKg, p.waterPct)
    case 'visceral':
      return p.visceral
    case 'bmr':
      return p.bmrKcal
  }
}

/**
 * Диапазоны. Ноль - вся история, -1 - выбранный руками. По умолчанию месяц.
 *
 * Подписи короткие намеренно: под переключателем всегда стоит строка
 * с настоящими датами, и расшифровывать «Мес» словом незачем. Раньше
 * подписи были длинными, а дат не было вовсе - человек видел «Месяц»
 * и не знал, от какого числа и по какое.
 */
const CUSTOM = -1
const RANGES = [
  { days: 7, key: 'chart.range.week' },
  { days: 30, key: 'chart.range.month' },
  { days: 90, key: 'chart.range.quarter' },
  { days: 365, key: 'chart.range.year' },
  { days: 0, key: 'chart.range.all' },
  { days: CUSTOM, key: 'chart.range.custom' },
] as const satisfies readonly { days: number; key: Key }[]

/**
 * Два способа показать одно и то же, и каждый отвечает на свой вопрос.
 *
 * `abs` - настоящие значения, **каждый показатель на своей панели**.
 * Отвечает на «сколько у меня сейчас и куда это идёт». Панелями, а не одной
 * линией поверх другой, по простой причине: на общей вертикали вес 96 кг
 * и жир 27 кг разносит так, что собственное движение каждого - полтора
 * килограмма - становится невидимым. Получался график, на котором «видно
 * только вес». Своя шкала у каждой панели - это не вторая ось: линии
 * не сравниваются между собой, они стоят рядом, и подписи у каждой свои.
 *
 * `delta` - изменение от начала периода, все линии на одном поле и стартуют
 * с нуля. Отвечает на другой вопрос: «что менялось сильнее». Это единственный
 * честный способ положить разномасштабные величины на одну ось - привести их
 * к общему началу.
 *
 * Умолчание - `abs`: чаще нужно знать, сколько сейчас.
 */
export const MODES = ['abs', 'delta'] as const
export type Mode = (typeof MODES)[number]

const SLOTS = 3
const SLOT_COLOR: readonly [string, string, string] = [
  'var(--color-series-1)',
  'var(--color-series-2)',
  'var(--color-series-3)',
]

export function BodyChart({ points }: { points: WeightPoint[] }) {
  const t = useT()
  const [unit, setUnit] = useState<Unit>('kg')
  const [days, setDays] = useState(30)
  const [table, setTable] = useState(false)
  const [mode, setMode] = useState<Mode>('abs')
  // Слот закреплён за показателем, пока тот включён. Выключение одной линии
  // не перекрашивает оставшиеся.
  const [slots, setSlots] = useState<(MetricId | null)[]>(() => initial(points))

  const today = todayLocal()
  const earliest = points[0]?.date ?? today
  const [customFrom, setCustomFrom] = useState(() => shiftDays(today, -29))
  const [customTo, setCustomTo] = useState(today)

  // Границы считаются одним местом и здесь же показываются человеку -
  // иначе «Месяц» остаётся обещанием, которое нечем проверить.
  const from =
    days === CUSTOM ? customFrom : days === 0 ? earliest : shiftDays(today, -(days - 1))
  const to = days === CUSTOM ? customTo : today
  const window = useMemo(
    () => points.filter((p) => p.date >= from && p.date <= to),
    [points, from, to],
  )
  const spanDays = daysInclusive(from, to)

  // Показатель предлагается, только если он есть в выбранной единице И хоть раз
  // измерен за период. Пустой чип, который ничего не рисует, - обещание данных,
  // которых нет.
  const available = METRICS.filter(
    (m) => UNITS_OF[m].includes(unit) && window.some((p) => valueOf(p, m, unit) !== null),
  )

  const active = slots.filter((s): s is MetricId => s !== null && available.includes(s))
  const full = slots.filter((s) => s !== null).length >= SLOTS

  const switchUnit = (next: Unit): void => {
    setUnit(next)
    setSlots((prev) => keepInUnit(prev, next))
  }

  const series = active.map((metric) => ({
    metric,
    color: SLOT_COLOR[Math.max(slots.indexOf(metric), 0) % SLOT_COLOR.length] ?? SLOT_COLOR[0],
    pts: window
      .map((p) => ({ date: p.date, value: valueOf(p, metric, unit) }))
      .filter((v): v is { date: string; value: number } => v.value !== null),
  }))

  const drawable = series.filter((s) => s.pts.length >= 2)

  // Текущий вес - самое востребованное число раздела, и оно не должно
  // зависеть от того, какой режим и какие линии выбраны. В режиме изменения
  // его иначе не увидеть вовсе: там у всех линий подписано движение, а не вес.
  const last = points[points.length - 1]
  const firstInWindow = window[0]
  const change =
    last && firstInWindow && window.length >= 2 ? last.weightKg - firstInWindow.weightKg : null

  return (
    <div className="flex flex-col gap-3">
      {last && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-2xl font-semibold">
            {t('weight.value', { n: last.weightKg.toFixed(1) })}
          </span>
          <span className="text-sm text-muted">
            {change === null || Math.abs(change) < 0.05
              ? t('weight.noChange')
              : t('weight.delta', {
                  delta: `${change > 0 ? '+' : ''}${change.toFixed(1)}`,
                })}
          </span>
        </div>
      )}

      {/* Управление: три компактных ряда вместо четырёх подписанных блоков.
          Подписи «Единица», «Период», «Показать» ушли в aria-label - на экране
          они занимали по строке каждая и ничего не объясняли: «кг» и «7 д»
          понятны без заголовка. */}
      <Segmented
        ariaLabel={t('chart.unit')}
        items={UNITS.filter((u) =>
          METRICS.some((m) => UNITS_OF[m].includes(u) && points.some((p) => valueOf(p, m, u) !== null)),
        ).map((u) => ({ id: u, label: t(UNIT_LABEL[u]), active: u === unit }))}
        onPick={(id) => switchUnit(id as Unit)}
      />

      <div className="flex flex-col gap-1.5">
        <Segmented
          ariaLabel={t('chart.range')}
          items={RANGES.map((r) => ({
            id: String(r.days),
            label: t(r.key),
            active: r.days === days,
          }))}
          onPick={(id) => setDays(Number(id))}
        />

        {days === CUSTOM ? (
          <div className="flex items-center gap-2">
            <DateField
              label={t('chart.from')}
              value={customFrom}
              min={earliest}
              max={customTo}
              onChange={setCustomFrom}
            />
            <span aria-hidden className="text-xs text-muted">
              &mdash;
            </span>
            <DateField
              label={t('chart.to')}
              value={customTo}
              min={customFrom}
              max={today}
              onChange={setCustomTo}
            />
          </div>
        ) : (
          <p className="px-0.5 text-xs text-muted">
            {t('chart.span', {
              from: formatDayMonth(fromLocalISO(from)),
              to: formatDayMonth(fromLocalISO(to)),
              n: spanDays,
              unit: t.plural('unit.day', spanDays),
            })}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('chart.show')}>
        {available.map((metric) => {
          const on = slots.includes(metric)
          const color = SLOT_COLOR[slots.indexOf(metric)]
          return (
            <button
              key={metric}
              type="button"
              onClick={() => setSlots((prev) => toggleSlot(prev, metric))}
              disabled={!on && full}
              aria-pressed={on}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs
                          ring-1 disabled:opacity-40 ${
                            on ? 'bg-raised ring-line' : 'bg-surface text-muted ring-line'
                          }`}
            >
              {/* Метка цветом стоит рядом с названием, а не вместо него:
                  цвет здесь - опознаватель линии, а не единственный признак. */}
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: on && color ? color : 'var(--color-line)' }}
              />
              {t(LABEL_OF[metric])}
            </button>
          )
        })}
        {full && <span className="self-center px-0.5 text-xs text-muted">{t('chart.max')}</span>}
      </div>

      {drawable.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          {window.length === 0 ? t('chart.noData') : t('chart.needMore')}
        </p>
      ) : table ? (
        <Readout series={drawable} unit={unit} />
      ) : mode === 'abs' ? (
        <Panels series={drawable} unit={unit} />
      ) : (
        <Plot series={drawable} unit={unit} mode={mode} />
      )}

      {/* Режим и таблица - одной строкой внизу, а не отдельными рядами сверху.
          Оба вторичны: сверху человек выбирает ЧТО смотреть, здесь - КАК.
          В таблице режим не при чём - там всегда точные значения, за этим
          в неё и заходят. */}
      <div className="flex items-center justify-between gap-3">
        {table ? (
          <span />
        ) : (
          <Segmented
            ariaLabel={t('chart.mode')}
            full={false}
            items={MODES.map((m) => ({
              id: m,
              label: t(m === 'delta' ? 'chart.mode.delta' : 'chart.mode.abs'),
              active: m === mode,
            }))}
            onPick={(id) => setMode(id as Mode)}
          />
        )}

        <button
          type="button"
          onClick={() => setTable((v) => !v)}
          className="flex shrink-0 items-center gap-1.5 px-0.5 text-xs text-accent"
        >
          {table ? <TrendingUp size={14} aria-hidden /> : <Table2 size={14} aria-hidden />}
          {table ? t('chart.asChart') : t('chart.asTable')}
        </button>
      </div>
    </div>
  )
}

/**
 * Включить или выключить показатель.
 *
 * Чистая функция и вынесена наружу не ради красоты: именно здесь живёт
 * обещание «цвет принадлежит показателю, а не его номеру». Слот, освободившийся
 * в середине, остаётся дырой - иначе выключение первой линии сдвинуло бы
 * вторую на её цвет, и человек увидел бы, как график перекрасился сам.
 */
export function toggleSlot(
  prev: (MetricId | null)[],
  metric: MetricId,
): (MetricId | null)[] {
  const at = prev.indexOf(metric)
  if (at >= 0) return prev.map((s, i) => (i === at ? null : s))
  const free = prev.indexOf(null)
  if (free < 0) return prev
  return prev.map((s, i) => (i === free ? metric : s))
}

/**
 * Что остаётся при смене единицы.
 *
 * Показатели, которых в новой единице не бывает, гаснут; остальные держат
 * свои слоты. Вес при переходе в проценты исчезает - процента веса не бывает,
 * - а жир и тощая остаются теми же цветами, что были в килограммах.
 */
export function keepInUnit(prev: (MetricId | null)[], unit: Unit): (MetricId | null)[] {
  return prev.map((s) => (s !== null && UNITS_OF[s].includes(unit) ? s : null))
}

/**
 * Что включено при первом открытии.
 *
 * Вес есть всегда. Жир и тощая добавляются, только если состав вообще
 * вводили: именно эта тройка отвечает на вопрос, ради которого умные весы
 * и покупают - чем были потерянные килограммы.
 */
function initial(points: WeightPoint[]): (MetricId | null)[] {
  const hasComposition = points.some((p) => p.bodyFatPct !== null)
  return hasComposition ? ['weight', 'fat', 'lean'] : ['weight', null, null]
}

type Series = { metric: MetricId; color: string; pts: { date: string; value: number }[] }

function Plot({ series, unit, mode }: { series: Series[]; unit: Unit; mode: Mode }) {
  const t = useT()
  const clipId = useId()
  const [hover, setHover] = useState<number | null>(null)

  // В режиме изменения каждая серия отсчитывается от СВОЕЙ первой точки
  // в периоде, а не от общего начала: у жира и веса первые взвешивания
  // приходятся на разные дни, и общая точка отсчёта сдвинула бы одну из линий
  // на величину, которой не было.
  const shown = series.map((s) => {
    if (mode === 'abs') return s
    const base = s.pts[0]?.value ?? 0
    return { ...s, pts: s.pts.map((p) => ({ ...p, value: Math.round((p.value - base) * 10) / 10 })) }
  })

  // Ось времени - по датам, а не по номеру точки. Взвешивания идут неровно,
  // и равномерная сетка растянула бы неделю с тремя отметками в ту же ширину,
  // что и неделю с семью.
  const all = shown.flatMap((s) => s.pts)
  const times = all.map((p) => fromLocalISO(p.date).getTime())
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  const tSpan = tMax - tMin || 1

  const values = all.map((p) => p.value)
  const vMin = Math.min(...values)
  const vMax = Math.max(...values)
  const pad = (vMax - vMin) * 0.12 || Math.max(Math.abs(vMax) * 0.02, 0.5)
  const lo = vMin - pad
  const hi = vMax + pad

  const x = (iso: string): number =>
    PAD_X + ((fromLocalISO(iso).getTime() - tMin) / tSpan) * (WIDTH - PAD_X * 2)
  const y = (v: number): number =>
    PAD_TOP + (1 - (v - lo) / (hi - lo)) * (HEIGHT - PAD_TOP - PAD_BOTTOM)

  // Все даты, где есть хоть одно измерение - к ним и притягивается перекрестье.
  const dates = [...new Set(all.map((p) => p.date))].sort()
  const hovered = hover === null ? null : dates[hover]

  const pick = (clientX: number, rect: DOMRect): void => {
    const ratio = (clientX - rect.left) / rect.width
    const time = tMin + ratio * tSpan
    let best = 0
    let bestGap = Infinity
    dates.forEach((d, i) => {
      const gap = Math.abs(fromLocalISO(d).getTime() - time)
      if (gap < bestGap) {
        bestGap = gap
        best = i
      }
    })
    setHover(best)
  }

  return (
    <div>
      {/* Показания вынесены НАД графиком, а не во всплывающую подсказку.
          На телефоне палец закрывает ровно то место, где она бы появилась,
          а у края экрана ей ещё и некуда раскрыться. */}
      <dl className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <dt className="sr-only">{t('chart.date')}</dt>
        <dd className="text-xs text-muted">
          {formatDayMonth(fromLocalISO(hovered ?? dates[dates.length - 1] ?? ''))}
        </dd>
        {shown.map((s) => {
          const at = s.pts.find((p) => p.date === (hovered ?? dates[dates.length - 1]))
          const point = at ?? s.pts[s.pts.length - 1]
          return (
            <div key={s.metric} className="flex items-baseline gap-1.5">
              <span
                aria-hidden
                className="size-2.5 shrink-0 translate-y-px rounded-full"
                style={{ background: s.color }}
              />
              <dt className="text-xs text-muted">{t(LABEL_OF[s.metric])}</dt>
              <dd className="text-sm font-medium">
                {point ? format(point.value, unit, mode) : '—'}
                {at === undefined && point && (
                  <span className="ml-1 text-xs text-muted">{t('chart.lastKnown')}</span>
                )}
              </dd>
            </div>
          )
        })}
      </dl>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none"
        role="img"
        aria-label={t('chart.aria', {
          list: shown.map((s) => t(LABEL_OF[s.metric])).join(', '),
          from: formatDayMonth(fromLocalISO(dates[0] ?? '')),
          to: formatDayMonth(fromLocalISO(dates[dates.length - 1] ?? '')),
        })}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerMove={(e) => {
          if (e.buttons > 0 || e.pointerType === 'mouse') {
            pick(e.clientX, e.currentTarget.getBoundingClientRect())
          }
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={WIDTH} height={HEIGHT - PAD_BOTTOM + 6} />
          </clipPath>
        </defs>

        {/* Сетка приглушена намеренно: она помогает читать, но спорить
            с линиями за внимание не должна. */}
        {[0, 0.5, 1].map((f) => {
          const value = lo + f * (hi - lo)
          return (
            <g key={f}>
              <line
                x1={PAD_X}
                x2={WIDTH - PAD_X}
                y1={y(value)}
                y2={y(value)}
                stroke="var(--color-line)"
                strokeWidth="1"
              />
              {/* Подпись сидит НА линии сетки, а не под графиком: снизу она
                  оказывалась рядом с датами и читалась как ещё одна дата. */}
              <text
                x={PAD_X + 2}
                y={y(value) - 3}
                className="fill-muted"
                fontSize="9"
              >
                {format(value, unit, mode)}
              </text>
            </g>
          )
        })}

        {hovered !== undefined && hovered !== null && (
          <line
            x1={x(hovered)}
            x2={x(hovered)}
            y1={PAD_TOP - 6}
            y2={HEIGHT - PAD_BOTTOM}
            stroke="var(--color-muted)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        <g clipPath={`url(#${clipId})`}>
          {shown.map((s) => (
            <g key={s.metric}>
              <path
                d={s.pts
                  .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
                  .join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Кольцо цвета подложки под точкой: там, где линии пересекаются,
                  без него две точки сливаются в одно пятно. */}
              {(() => {
                const at = hovered === undefined || hovered === null
                  ? s.pts[s.pts.length - 1]
                  : s.pts.find((p) => p.date === hovered)
                if (!at) return null
                return (
                  <circle
                    cx={x(at.date)}
                    cy={y(at.value)}
                    r="4"
                    fill={s.color}
                    stroke="var(--color-surface)"
                    strokeWidth="2"
                  />
                )
              })()}
            </g>
          ))}
        </g>

        <text x={PAD_X} y={HEIGHT - 6} className="fill-muted" fontSize="9">
          {formatDayMonth(fromLocalISO(dates[0] ?? ''))}
        </text>
        <text x={WIDTH - PAD_X} y={HEIGHT - 6} textAnchor="end" className="fill-muted" fontSize="9">
          {formatDayMonth(fromLocalISO(dates[dates.length - 1] ?? ''))}
        </text>
      </svg>

    </div>
  )
}

/**
 * Настоящие значения - по панели на показатель.
 *
 * Ось времени общая у всех панелей, вертикальная - своя: только так движение
 * жира видно наравне с движением веса. Перекрестье тоже общее - оно и делает
 * стопку панелей единым графиком, а не тремя картинками: ведя пальцем,
 * человек читает все показатели одного дня сразу.
 */
function Panels({ series, unit }: { series: Series[]; unit: Unit }) {
  const dates = [...new Set(series.flatMap((s) => s.pts.map((p) => p.date)))].sort()
  const [hover, setHover] = useState<string | null>(null)

  const times = dates.map((d) => fromLocalISO(d).getTime())
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)

  return (
    <div className="flex flex-col gap-4">
      {series.map((s) => (
        <Panel
          key={s.metric}
          series={s}
          unit={unit}
          tMin={tMin}
          tMax={tMax}
          hover={hover}
          onHover={setHover}
          dates={dates}
        />
      ))}
      <div className="flex justify-between px-0.5 text-xs text-muted">
        <span>{formatDayMonth(fromLocalISO(dates[0] ?? ''))}</span>
        <span>{formatDayMonth(fromLocalISO(dates[dates.length - 1] ?? ''))}</span>
      </div>
    </div>
  )
}

const PANEL_HEIGHT = 74

function Panel({
  series,
  unit,
  tMin,
  tMax,
  hover,
  onHover,
  dates,
}: {
  series: Series
  unit: Unit
  tMin: number
  tMax: number
  hover: string | null
  onHover: (date: string | null) => void
  dates: string[]
}) {
  const t = useT()
  const tSpan = tMax - tMin || 1

  const values = series.pts.map((p) => p.value)
  const vMin = Math.min(...values)
  const vMax = Math.max(...values)
  const pad = (vMax - vMin) * 0.18 || Math.max(Math.abs(vMax) * 0.02, 0.5)
  const lo = vMin - pad
  const hi = vMax + pad

  const x = (iso: string): number =>
    PAD_X + ((fromLocalISO(iso).getTime() - tMin) / tSpan) * (WIDTH - PAD_X * 2)
  const y = (v: number): number => 10 + (1 - (v - lo) / (hi - lo)) * (PANEL_HEIGHT - 20)

  const at = hover === null ? undefined : series.pts.find((p) => p.date === hover)
  const shown = at ?? series.pts[series.pts.length - 1]

  const pick = (clientX: number, rect: DOMRect): void => {
    const time = tMin + ((clientX - rect.left) / rect.width) * tSpan
    let best = dates[0] ?? null
    let bestGap = Infinity
    for (const d of dates) {
      const gap = Math.abs(fromLocalISO(d).getTime() - time)
      if (gap < bestGap) {
        bestGap = gap
        best = d
      }
    }
    onHover(best)
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 text-sm">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: series.color }}
          />
          {t(LABEL_OF[series.metric])}
        </span>
        <span className="text-sm">
          <span className="font-medium">{shown ? format(shown.value, unit) : '—'}</span>
          {hover !== null && (
            <span className="ml-1.5 text-xs text-muted">
              {formatDayMonth(fromLocalISO(hover))}
            </span>
          )}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${PANEL_HEIGHT}`}
        className="w-full touch-none"
        role="img"
        aria-label={t('chart.panelAria', {
          name: t(LABEL_OF[series.metric]),
          from: format(series.pts[0]?.value ?? 0, unit),
          to: format(series.pts[series.pts.length - 1]?.value ?? 0, unit),
        })}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerMove={(e) => {
          if (e.buttons > 0 || e.pointerType === 'mouse') {
            pick(e.clientX, e.currentTarget.getBoundingClientRect())
          }
        }}
        onPointerLeave={() => onHover(null)}
      >
        {[lo + pad, hi - pad].map((value, i) => (
          <g key={i}>
            <line
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--color-line)"
              strokeWidth="1"
            />
            <text x={PAD_X + 2} y={y(value) - 3} className="fill-muted" fontSize="9">
              {format(value, unit)}
            </text>
          </g>
        ))}

        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1="2"
            y2={PANEL_HEIGHT - 2}
            stroke="var(--color-muted)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        <path
          d={series.pts
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
            .join(' ')}
          fill="none"
          stroke={series.color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {shown && (
          <circle
            cx={x(shown.date)}
            cy={y(shown.value)}
            r="4"
            fill={series.color}
            stroke="var(--color-surface)"
            strokeWidth="2"
          />
        )}
      </svg>
    </div>
  )
}

/**
 * Те же данные таблицей.
 *
 * Не запасной вариант «на случай если», а обязательная часть: линия
 * не читается ни скринридером, ни в чёрно-белой печати, ни тем, кто
 * различает не все цвета. Точное число тут доступно всегда.
 */
function Readout({ series, unit }: { series: Series[]; unit: Unit }) {
  const t = useT()
  const dates = [...new Set(series.flatMap((s) => s.pts.map((p) => p.date)))].sort().reverse()

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="px-1 py-1.5 text-left font-normal">
              {t('chart.date')}
            </th>
            {series.map((s) => (
              <th key={s.metric} scope="col" className="px-1 py-1.5 text-right font-normal">
                {t(LABEL_OF[s.metric])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => (
            <tr key={date} className="border-t border-line">
              <th scope="row" className="px-1 py-1.5 text-left font-normal text-muted">
                {formatDayMonth(fromLocalISO(date))}
              </th>
              {series.map((s) => {
                const at = s.pts.find((p) => p.date === date)
                return (
                  <td key={s.metric} className="px-1 py-1.5 text-right tabular-nums">
                    {at ? format(at.value, unit) : '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function format(value: number, unit: Unit, mode: Mode = 'abs'): string {
  const n = unit === 'kcal' ? String(Math.round(value)) : value.toFixed(1)
  // В режиме изменения знак обязателен: «1.4» и «-1.4» иначе неразличимы
  // на глаз в колонке чисел, а разница между ними - вся суть графика.
  return mode === 'delta' && value > 0 ? `+${n}` : n
}

/**
 * Сегментированный переключатель - одна пилюля с делениями, а не россыпь
 * отдельных кнопок.
 *
 * Разница не косметическая. Отдельные пилюли с зазорами занимали по ряду
 * на каждый выбор плюс ряд на подпись: четыре набора разворачивались
 * в восемь строк, и график уезжал под сгиб экрана. Сегменты в общей рамке
 * читаются как один выбор из нескольких, подпись им не нужна, и весь набор
 * помещается в одну строку.
 *
 * `full` растягивает сегменты на всю ширину поровну - так ряд выглядит
 * рядом, а не обрывком. Для пары «значения / изменение» это лишнее:
 * два широких сегмента во всю ширину выглядели бы главным выбором экрана,
 * которым они не являются.
 */
function Segmented({
  ariaLabel,
  items,
  onPick,
  full = true,
}: {
  ariaLabel: string
  items: { id: string; label: string; active: boolean }[]
  onPick: (id: string) => void
  full?: boolean
}) {
  if (items.length < 2) return null
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex gap-0.5 rounded-lg bg-raised p-0.5 ring-1 ring-line"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item.id)}
          aria-pressed={item.active}
          className={`rounded-md px-2 py-1.5 text-xs whitespace-nowrap ${
            full ? 'flex-1' : ''
          } ${item.active ? 'bg-accent font-medium text-accent-ink' : 'text-muted'}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Поле даты для своего периода.
 *
 * Родное `input[type=date]` намеренно: оно даёт системный календарь,
 * который на телефоне удобнее любого своего, и понимает локаль без нашего
 * участия. Границы задаются `min`/`max`, поэтому перевернуть период
 * местами нельзя - начало не пускают дальше конца.
 */
function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: string
  min: string
  max: string
  onChange: (value: string) => void
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value !== '' && onChange(e.target.value)}
        className="w-full min-w-0 rounded-lg bg-raised px-2 py-1.5 text-xs ring-1 ring-line
                   outline-none focus:ring-2 focus:ring-accent"
      />
    </label>
  )
}

/** Длина периода в днях, включая обе границы. */
function daysInclusive(from: string, to: string): number {
  const ms = fromLocalISO(to).getTime() - fromLocalISO(from).getTime()
  return Math.max(Math.round(ms / 86_400_000) + 1, 1)
}
