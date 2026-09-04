import { useMemo, useState } from 'react'
import { Droplet, Info, Plus, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { useProfiles } from '@/features/profile/api'
import { todayLocal, shiftDays, formatDayLabel } from '@/lib/date'
import { Button } from '@/ui/Button'
import { Sheet } from '@/ui/Sheet'
import {
  DEFAULT_SETTINGS,
  useCycleSettings,
  useDeletePeriod,
  usePeriods,
  useSaveCycleSettings,
  useSavePeriod,
  useStartPeriod,
} from './api'
import {
  PHASE_LABELS,
  cycleDay,
  cycleStats,
  warnings,
  type CycleDay,
  type Period,
} from './cycle'
import { PHASE_SUMMARY, tipsFor } from './tips'

/**
 * Раздел цикла.
 *
 * Устроен не как остальные разделы, и это главное, что о нём надо знать.
 * Везде в приложении оба видят данные друг друга — так было решено с самого
 * начала. Здесь не так: раздел выключен, пока владелец его не включит,
 * и не виден партнёру, пока владелец не откроет. Остальные данные — общий
 * быт, а эти про тело одного человека, и решать, показывать ли их, должен он.
 *
 * Отсюда четыре состояния страницы: свой цикл, чужой открытый, оба сразу
 * и ничего. Последнее — не пустой экран, а объяснение, что это за раздел
 * и что включение ничего никому не откроет само по себе.
 */
export function CyclePage() {
  const userId = useUserId()
  const profiles = useProfiles()
  const settings = useCycleSettings()
  const partner = profiles.data?.find((p) => p.userId !== userId)

  const mine = usePeriods(userId)
  // Партнёрский запрос вернёт пусто, если раздел не открыт: так решает RLS.
  const theirs = usePeriods(partner?.userId ?? '')

  const [tab, setTab] = useState<'mine' | 'theirs'>('mine')
  const [editing, setEditing] = useState<Period | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const tracking = settings.data?.trackingEnabled ?? false
  const theirsShared = (theirs.data?.length ?? 0) > 0

  if (settings.isPending || profiles.isPending) {
    return <p className="px-4 py-10 text-center text-muted">Загрузка…</p>
  }

  if (!tracking && !theirsShared) {
    return <Intro onEnable={() => setSettingsOpen(true)} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
  }

  const showTabs = tracking && theirsShared
  const active = showTabs ? tab : tracking ? 'mine' : 'theirs'
  const periods = active === 'mine' ? (mine.data ?? []) : (theirs.data ?? [])
  const owned = active === 'mine'

  return (
    <div className="px-4 py-4">
      {showTabs && (
        <div className="mb-4 flex gap-1 rounded-xl bg-raised p-1">
          <Tab active={tab === 'mine'} onClick={() => setTab('mine')}>
            Мой
          </Tab>
          <Tab active={tab === 'theirs'} onClick={() => setTab('theirs')}>
            {partner?.nickname ?? 'Партнёр'}
          </Tab>
        </div>
      )}

      <CycleBody
        periods={periods}
        lutealDays={settings.data?.lutealDays ?? DEFAULT_SETTINGS.lutealDays}
        owned={owned}
        onEdit={setEditing}
        onSettings={() => setSettingsOpen(true)}
      />

      {editing && <PeriodSheet period={editing} onClose={() => setEditing(null)} />}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function CycleBody({
  periods,
  lutealDays,
  owned,
  onEdit,
  onSettings,
}: {
  periods: Period[]
  lutealDays: number
  owned: boolean
  onEdit: (p: Period) => void
  onSettings: () => void
}) {
  const today = todayLocal()
  const start = useStartPeriod()
  const save = useSavePeriod()

  const state = useMemo(() => cycleDay(periods, today, lutealDays), [periods, today, lutealDays])
  const stats = useMemo(() => cycleStats(periods), [periods])
  const alerts = useMemo(() => warnings(periods, today), [periods, today])

  const last = [...periods].sort((a, b) => (a.startedOn < b.startedOn ? -1 : 1)).at(-1)
  const ongoing = last && last.endedOn === null ? last : null

  // Сегодняшний день уже внутри какой-то записи?
  //
  // Без этой проверки кнопка «Началась сегодня» предлагалась и в день, когда
  // менструация только что отмечена завершившейся, — а вставка упёрлась бы
  // в ограничение пересечения и вернула человеку текст ошибки Postgres.
  // Инвариант держит база, и это правильно; но предлагать действие, которое
  // база обязана отклонить, интерфейс не должен.
  const coversToday = periods.some(
    (p) => today >= p.startedOn && (p.endedOn === null || today <= p.endedOn),
  )

  if (!state || !last) {
    return (
      <div className="rounded-2xl bg-surface p-5 ring-1 ring-line">
        <p className="text-sm text-muted">
          {owned
            ? 'Записей пока нет. Отметьте день, когда началась менструация, — от него считается всё остальное.'
            : 'Записей пока нет.'}
        </p>
        {owned && (
          <div className="mt-4">
            <Button onClick={() => void start.mutateAsync(today)} loading={start.isPending}>
              <Droplet size={18} aria-hidden />
              Началась сегодня
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Today state={state} stats={stats} />

      <PhaseStrip state={state} />

      {owned && (
        <div className="flex flex-col gap-2">
          {ongoing ? (
            <Button
              onClick={() =>
                void save.mutateAsync({
                  id: ongoing.id,
                  startedOn: ongoing.startedOn,
                  endedOn: today,
                  note: ongoing.note,
                })
              }
              loading={save.isPending}
            >
              Закончилась сегодня
            </Button>
          ) : coversToday ? (
            <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted ring-1 ring-line">
              Сегодняшний день уже отмечен. Поправить даты можно в истории ниже.
            </p>
          ) : (
            <Button onClick={() => void start.mutateAsync(today)} loading={start.isPending}>
              <Droplet size={18} aria-hidden />
              Началась сегодня
            </Button>
          )}
        </div>
      )}

      {alerts.length > 0 && (
        <section className="flex flex-col gap-2">
          {alerts.map((w) => (
            <div
              key={w.id}
              className={`rounded-2xl p-4 ring-1 ${
                w.level === 'attention' ? 'bg-surface ring-danger/40' : 'bg-surface ring-line'
              }`}
            >
              <p className="flex items-center gap-2 font-medium">
                {w.level === 'attention' ? (
                  <TriangleAlert size={17} className="text-danger" aria-hidden />
                ) : (
                  <Info size={17} className="text-muted" aria-hidden />
                )}
                {w.title}
              </p>
              <p className="mt-1.5 text-sm text-muted">{w.body}</p>
            </div>
          ))}
          <p className="px-1 text-xs text-muted">
            Приложение сравнивает числа с общепринятыми границами. Диагнозов оно не ставит
            и поставить не может.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm text-muted">Сегодня стоит знать</h2>
        {tipsFor(state).map((tip) => (
          <div key={tip.id} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <p className="font-medium">{tip.title}</p>
            <p className="mt-1.5 text-sm text-muted">{tip.body}</p>
          </div>
        ))}
      </section>

      <History periods={periods} owned={owned} onEdit={onEdit} />

      {owned && (
        <button
          type="button"
          onClick={onSettings}
          className="self-start px-1 text-sm text-accent underline"
        >
          Настройки раздела
        </button>
      )}
    </div>
  )
}

function Today({ state, stats }: { state: CycleDay; stats: ReturnType<typeof cycleStats> }) {
  return (
    <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
      <p className="text-sm text-muted">{PHASE_LABELS[state.phase]}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-4xl font-semibold">День {state.day}</span>
        <span className="text-sm text-muted">из ~{state.cycleLength}</span>
      </p>
      <p className="mt-2 text-sm text-muted">{PHASE_SUMMARY[state.phase]}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-raised px-3 py-2.5">
          <dt className="text-xs text-muted">Следующая</dt>
          <dd className="mt-0.5 font-medium">
            {state.daysToNext > 0
              ? `через ${state.daysToNext} дн.`
              : state.daysToNext === 0
                ? 'сегодня'
                : `задержка ${-state.daysToNext} дн.`}
          </dd>
          <dd className="text-xs text-muted">{formatDayLabel(state.nextStart)}</dd>
        </div>
        <div className="rounded-xl bg-raised px-3 py-2.5">
          <dt className="text-xs text-muted">Средний цикл</dt>
          <dd className="mt-0.5 font-medium">
            {stats.avgCycle === null ? 'нет данных' : `${Math.round(stats.avgCycle)} дн.`}
          </dd>
          <dd className="text-xs text-muted">
            {stats.cyclesCounted === 0
              ? 'нужен второй цикл'
              : `по ${stats.cyclesCounted} посл.`}
          </dd>
        </div>
      </dl>
    </section>
  )
}

/**
 * Полоса цикла: где мы внутри круга.
 *
 * Два цвета, а не четыре. Акцент — дни менструации, зелёный — фертильное окно,
 * остальное нейтральное. Оба цвета уже прогнаны через валидатор палитры вместе
 * со всей гаммой; выдумывать под фазы ещё две краски значило бы проверять
 * заново весь набор ради оттенка, который ничего не добавляет.
 */
function PhaseStrip({ state }: { state: CycleDay }) {
  const firstDay = shiftDays(state.nextStart, -state.cycleLength)
  const days = Array.from({ length: state.cycleLength }, (_, i) => shiftDays(firstDay, i))

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="flex items-center gap-[2px]">
        {days.map((iso, i) => {
          const isToday = i + 1 === state.day
          // Средняя длина менструации, а не пятёрка на глаз: если у человека
          // она шесть дней, полоса врала бы каждый месяц на день.
          const bleeding = i < state.periodLength
          const fertile = iso >= state.fertileFrom && iso <= state.fertileTo
          return (
            <span
              key={iso}
              aria-hidden
              // Сегодняшний день выше остальных. Обводка на трёхпиксельном
              // сегменте не читается — проверено на снимке.
              className={`flex-1 ${isToday ? 'h-6 rounded-sm bg-ink' : 'h-3'} ${
                isToday ? '' : bleeding ? 'bg-accent' : fertile ? 'bg-carbs' : 'bg-raised'
              }`}
            />
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-ink" aria-hidden />
          сегодня
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-accent" aria-hidden />
          менструация
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-carbs" aria-hidden />
          фертильное окно, {formatDayLabel(state.fertileFrom)} — {formatDayLabel(state.fertileTo)}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted">
        Окно посчитано по календарю и в реальном цикле сдвигается. Как способ
        предохранения это не работает.
      </p>
    </section>
  )
}

function History({
  periods,
  owned,
  onEdit,
}: {
  periods: Period[]
  owned: boolean
  onEdit: (p: Period) => void
}) {
  const sorted = [...periods].sort((a, b) => (a.startedOn < b.startedOn ? 1 : -1))
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm text-muted">История</h2>
      <ul className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
        {sorted.map((p) => (
          <li key={p.id} className="border-b border-line last:border-0">
            <button
              type="button"
              disabled={!owned}
              onClick={() => onEdit(p)}
              className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left disabled:opacity-100"
            >
              <span className="min-w-0">
                <span className="block text-sm">
                  {formatDayLabel(p.startedOn)}
                  {p.endedOn ? ` — ${formatDayLabel(p.endedOn)}` : ' — идёт'}
                </span>
                {p.note && <span className="block text-xs text-muted">{p.note}</span>}
              </span>
              <span className="shrink-0 text-sm text-muted">
                {p.periodDays !== null && `${p.periodDays} дн.`}
                {p.cycleDays !== null && ` · цикл ${p.cycleDays}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PeriodSheet({ period, onClose }: { period: Period; onClose: () => void }) {
  const save = useSavePeriod()
  const remove = useDeletePeriod()
  const [startedOn, setStartedOn] = useState(period.startedOn)
  const [endedOn, setEndedOn] = useState(period.endedOn ?? '')
  const [note, setNote] = useState(period.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      await save.mutateAsync({
        id: period.id,
        startedOn,
        endedOn: endedOn || null,
        note: note.trim() || null,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title="Менструация">
      <div className="flex min-w-0 flex-col gap-5 px-4 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Началась</span>
          <input
            type="date"
            value={startedOn}
            onChange={(e) => setStartedOn(e.target.value)}
            className="w-full min-w-0 rounded-xl bg-surface px-4 py-3 ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Закончилась</span>
          <input
            type="date"
            value={endedOn}
            onChange={(e) => setEndedOn(e.target.value)}
            className="w-full min-w-0 rounded-xl bg-surface px-4 py-3 ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="text-xs text-muted">Пусто — значит идёт прямо сейчас.</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Заметка</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="самочувствие, что помогло"
            className="w-full min-w-0 resize-none rounded-xl bg-surface px-4 py-3 ring-1 ring-line outline-none focus:ring-2 focus:ring-accent placeholder:text-muted"
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} loading={save.isPending}>
          Сохранить
        </Button>
        <Button
          variant="danger"
          loading={remove.isPending}
          onClick={() => void remove.mutateAsync(period.id).then(onClose)}
        >
          <Trash2 size={18} aria-hidden />
          Удалить
        </Button>
      </div>
    </Sheet>
  )
}

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const settings = useCycleSettings()
  const save = useSaveCycleSettings()
  const current = settings.data ?? DEFAULT_SETTINGS
  const [error, setError] = useState<string | null>(null)

  const update = async (patch: Partial<typeof current>) => {
    setError(null)
    try {
      await save.mutateAsync({ ...current, ...patch })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title="Настройки раздела">
      <div className="flex min-w-0 flex-col gap-5 px-4 py-4">
        <Toggle
          label="Вести цикл"
          hint="Раздел появляется только у вас."
          checked={current.trackingEnabled}
          onChange={(v) => void update({ trackingEnabled: v })}
        />

        <Toggle
          label="Показывать партнёру"
          hint="Партнёр увидит даты, фазу и прогноз. Выключите — и он снова не увидит ничего. Это единственное место в приложении, где данные не общие по умолчанию."
          checked={current.shareWithPartner}
          disabled={!current.trackingEnabled}
          onChange={(v) => void update({ shareWithPartner: v })}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Лютеиновая фаза, дней</span>
          <input
            inputMode="numeric"
            value={String(current.lutealDays)}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, '')
              if (raw === '') return
              const n = Math.min(20, Math.max(8, Number(raw)))
              void update({ lutealDays: n })
            }}
            className="w-20 rounded-lg bg-surface px-3 py-2 text-center ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="text-xs text-muted">
            От неё считается овуляция — назад от следующей менструации. У большинства
            12–16 дней; 14 стоит по умолчанию.
          </span>
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  )
}

function Intro({
  onEnable,
  open,
  onClose,
}: {
  onEnable: () => void
  open: boolean
  onClose: () => void
}) {
  return (
    <div className="px-4 py-6">
      <div className="rounded-2xl bg-surface p-5 ring-1 ring-line">
        <p className="flex items-center gap-2 text-base font-medium">
          <ShieldCheck size={18} className="text-accent" aria-hidden />
          Раздел выключен
        </p>
        <p className="mt-2 text-sm text-muted">
          Здесь отмечаются даты менструаций. Из них считаются фаза, средняя длина цикла,
          прогноз следующей и предупреждения, если числа выходят за общепринятые границы.
        </p>
        <p className="mt-3 text-sm text-muted">
          Во всём остальном приложении вы двое видите данные друг друга. Здесь — нет:
          пока вы сами не откроете раздел партнёру, он не увидит ничего, даже что раздел
          включён.
        </p>
        <div className="mt-4">
          <Button onClick={onEnable}>
            <Plus size={18} aria-hidden />
            Включить
          </Button>
        </div>
      </div>
      {open && <SettingsSheet onClose={onClose} />}
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${disabled ? 'opacity-50' : ''}`}>
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="size-6 accent-accent"
        />
      </span>
      <span className="text-xs text-muted">{hint}</span>
    </label>
  )
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
        active ? 'bg-surface text-ink shadow-sm' : 'text-muted'
      }`}
    >
      {children}
    </button>
  )
}
