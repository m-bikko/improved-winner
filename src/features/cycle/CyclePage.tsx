import { dynamicKey, useT } from '@/lib/i18n'
import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  CalendarCheck,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Droplet,
  FileText,
  Info,
  Lightbulb,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Undo2,
} from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { useProfiles } from '@/features/profile/api'
import { todayLocal, shiftDays, formatDayLabel } from '@/lib/date'
import { Button } from '@/ui/Button'
import { Loading } from '@/ui/States'
import { Sheet } from '@/ui/Sheet'
import { Card, CardLink, SectionTitle } from '@/ui/Card'
import { Tag } from '@/ui/Chip'
import { IconBadge } from '@/ui/IconBadge'
import { ListGroup, ListRow } from '@/ui/List'
import { Switch } from '@/ui/Switch'
import { INPUT_CLASS } from '@/ui/Field'
import {
  DEFAULT_SETTINGS,
  useCycleDays,
  useCycleSettings,
  useCycleShared,
  useDeletePeriod,
  usePeriods,
  useSaveCycleSettings,
  useAddPeriod,
  useSavePeriod,
  useStartPeriod,
} from './api'
import { CycleCalendar } from './CycleCalendar'
import { DaySheet } from './DaySheet'
import { Patterns } from './Patterns'
import { DiaryByPhase } from './DiaryByPhase'
import { emptyLog, type DayLog } from './dayLog'
import {
  cycleDay,
  cycleStats,
  forecast,
  warnings,
  NORMS,
  type CycleDay,
  type Period,
} from './cycle'
import { tipsLibrary, tipsToday } from './tips'
import { Segmented } from '@/ui/Segmented'

/**
 * Раздел цикла.
 *
 * Устроен не как остальные разделы, и это главное, что о нём надо знать.
 * Везде в приложении оба видят данные друг друга - так было решено с самого
 * начала. Здесь не так: раздел выключен, пока владелец его не включит,
 * и не виден партнёру, пока владелец не откроет. Остальные данные - общий
 * быт, а эти про тело одного человека, и решать, показывать ли их, должен он.
 *
 * Отсюда четыре состояния страницы: свой цикл, чужой открытый, оба сразу
 * и ничего. Последнее - не пустой экран, а объяснение, что это за раздел
 * и что включение ничего никому не откроет само по себе.
 */
export function CyclePage() {
  const t = useT()
  const userId = useUserId()
  const profiles = useProfiles()
  const settings = useCycleSettings()
  const partner = profiles.data?.find((p) => p.userId !== userId)

  const mine = usePeriods(userId)
  // Партнёрский запрос вернёт пусто, если раздел не открыт: так решает RLS.
  const theirs = usePeriods(partner?.userId ?? '')
  const myDays = useCycleDays(userId)
  const theirDays = useCycleDays(partner?.userId ?? '')
  // Спрашиваем прямо, а не гадаем по наличию записей: партнёр мог открыть
  // доступ, ещё ничего не отметив, - и раньше это было неотличимо от «закрыто».
  const shared = useCycleShared(partner?.userId ?? '')

  const [tab, setTab] = useState<'mine' | 'theirs' | null>(null)
  const [editing, setEditing] = useState<Period | 'new' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const tracking = settings.data?.trackingEnabled ?? false
  const theirsShared = shared.data === true

  if (settings.isPending || profiles.isPending || shared.isPending) {
    return <Loading />
  }

  if (!tracking && !theirsShared) {
    return (
      <Intro
        partnerName={partner?.nickname ?? t('partner')}
        onEnable={() => setSettingsOpen(true)}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    )
  }

  const showTabs = tracking && theirsShared
  // Если свой цикл включён, но пуст, а партнёрский открыт - показываем
  // партнёрский. Человек, у которого нет своих записей, почти наверняка
  // зашёл смотреть чужие.
  const preferTheirs = theirsShared && (mine.data?.length ?? 0) === 0
  const active = showTabs
    ? (tab ?? (preferTheirs ? 'theirs' : 'mine'))
    : tracking
      ? 'mine'
      : 'theirs'
  const periods = active === 'mine' ? (mine.data ?? []) : (theirs.data ?? [])
  const logs = active === 'mine' ? (myDays.data ?? []) : (theirDays.data ?? [])
  const owned = active === 'mine'

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {showTabs && (
        <Segmented
          value={active}
          onChange={setTab}
          options={[
            { value: 'mine', label: t('cyc.tabMine') },
            { value: 'theirs', label: partner?.nickname ?? t('partner') },
          ]}
        />
      )}

      <CycleBody
        periods={periods}
        logs={logs}
        lutealDays={settings.data?.lutealDays ?? DEFAULT_SETTINGS.lutealDays}
        owned={owned}
        ownerId={owned ? userId : (partner?.userId ?? '')}
        onEdit={setEditing}
        onSettings={() => setSettingsOpen(true)}
      />

      {editing && (
        <PeriodSheet
          period={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function CycleBody({
  periods,
  logs,
  lutealDays,
  owned,
  ownerId,
  onEdit,
  onSettings,
}: {
  periods: Period[]
  logs: DayLog[]
  lutealDays: number
  owned: boolean
  ownerId: string
  onEdit: (p: Period | 'new') => void
  onSettings: () => void
}) {
  const t = useT()
  const today = todayLocal()
  const start = useStartPeriod()
  const save = useSavePeriod()
  const remove = useDeletePeriod()
  const [pickedDay, setPickedDay] = useState<string | null>(null)

  // Три цикла вперёд, не больше: дальше прогноз всё равно расходится
  // с жизнью, и рисовать его значило бы выдавать догадку за расписание.
  const forecasts = useMemo(
    () => forecast(periods, lutealDays, 3),
    [periods, lutealDays],
  )

  const state = useMemo(() => cycleDay(periods, today, lutealDays), [periods, today, lutealDays])
  const stats = useMemo(() => cycleStats(periods), [periods])
  const alerts = useMemo(() => warnings(periods, today), [periods, today])

  const last = [...periods].sort((a, b) => (a.startedOn < b.startedOn ? -1 : 1)).at(-1)
  const ongoing = last && last.endedOn === null ? last : null

  // Сегодняшний день уже внутри какой-то записи?
  //
  // Без этой проверки кнопка «{t('cyc.startedToday')}» предлагалась и в день, когда
  // менструация только что отмечена завершившейся, - а вставка упёрлась бы
  // в ограничение пересечения и вернула человеку текст ошибки Postgres.
  // Инвариант держит база, и это правильно; но предлагать действие, которое
  // база обязана отклонить, интерфейс не должен.
  const coversToday = periods.some(
    (p) => today >= p.startedOn && (p.endedOn === null || today <= p.endedOn),
  )

  // Запись, начатая сегодня: только её предлагаем убрать одним нажатием
  const startedToday = periods.find((p) => p.startedOn === today)

  // Записей ещё нет. Фазу, прогноз и календарь показать не из чего - но
  // справочная часть от цикла не зависит, и прятать её до первой отметки
  // значило бы отдавать пустой экран тому, кто только что включил раздел.
  if (!state || !last) {
    return (
      <div className="flex flex-col gap-3">
        <Card as="section" className="p-5">
          <div className="flex items-start gap-3">
            <IconBadge icon={Droplet} tone="plum" />
            <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-muted">
              {t(owned ? 'cyc.emptyMine' : 'cyc.emptyTheirs')}
            </p>
          </div>
          {owned && (
            <div className="mt-5 flex flex-col gap-2">
              <Button onClick={() => void start.mutateAsync(today)} loading={start.isPending}>
                <Droplet size={18} aria-hidden />
                {t('cyc.startedToday')}
              </Button>
              {/* Для того, кто только начал, это важнее кнопки «сегодня»:
                  без прошлых циклов средней длины нет, и прогноз молчит
                  до следующей менструации */}
              <Button variant="soft" onClick={() => onEdit('new')}>
                <CalendarPlus size={18} aria-hidden />
                {t('cyc.addPast')}
              </Button>
              <p className="px-1 text-[13px] leading-relaxed text-muted">{t('cyc.addPastHint')}</p>
            </div>
          )}
        </Card>

        <LibraryCard owned={owned} />

        {/* Ссылка нужна именно здесь. Без неё человек, случайно включивший
            ведение своего цикла, попадал в тупик: на пустом экране нет
            ни одной кнопки, ведущей к тумблеру «Вести цикл». */}
        {owned && <SettingsRow onClick={onSettings} />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Today state={state} stats={stats} />

      {/* Отметка «началась/закончилась сегодня» - сразу под статусом, а не под
          календарём: это главное действие раздела, и ниже первого экрана
          до него приходилось листать */}
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
              {t('cyc.endedToday')}
            </Button>
          ) : coversToday ? (
            <Card className="flex items-center gap-3 p-4">
              <IconBadge icon={CalendarCheck} tone="plum" size="sm" />
              <p className="min-w-0 flex-1 text-sm text-muted">{t('cyc.alreadyMarked')}</p>
            </Card>
          ) : (
            <Button onClick={() => void start.mutateAsync(today)} loading={start.isPending}>
              <Droplet size={18} aria-hidden />
              {t('cyc.startedToday')}
            </Button>
          )}

          {/* Отмена там же, где промах. «Началась сегодня» - самая заметная
              кнопка экрана, и случайное нажатие по ней вероятнее любого
              другого; исправлять его пролистыванием до истории значит
              просить человека искать то, что он только что не хотел делать.
              Только за сегодня: правка вчерашней записи - осознанное
              действие, и для него есть история. */}
          {startedToday && (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => void remove.mutateAsync(startedToday.id)}
              className="flex min-h-11 items-center gap-1.5 self-center rounded-full bg-raised px-4
                         text-sm font-semibold text-muted transition-transform active:scale-95
                         disabled:opacity-50"
            >
              <Undo2 size={16} aria-hidden />
              {t('cyc.undoToday')}
            </button>
          )}
        </div>
      )}

      <PhaseStrip state={state} />

      <CycleCalendar
        periods={periods}
        current={state}
        forecasts={forecasts}
        logs={logs}
        selected={pickedDay ?? today}
        onSelect={setPickedDay}
      />

      {pickedDay && (
        <DaySheet
          log={logs.find((l) => l.date === pickedDay) ?? emptyLog(pickedDay)}
          readOnly={!owned}
          onClose={() => setPickedDay(null)}
        />
      )}

      {alerts.length > 0 && (
        <section className="flex flex-col gap-3">
          {alerts.map((w) => {
            const attention = w.level === 'attention'
            return (
              <Card key={w.id} className="p-4">
                <div className="flex items-start gap-3">
                  {/* Оранжевый, а не тон раздела: он ближе всех к цвету
                      опасности, и значок с заголовком говорят одним цветом */}
                  <IconBadge
                    icon={attention ? TriangleAlert : Info}
                    tone={attention ? 'orange' : 'slate'}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`font-display text-[17px] leading-snug font-bold ${
                        attention ? 'text-danger' : ''
                      }`}
                    >
                      {w.title}
                    </p>
                    <p className="mt-1 text-[15px] leading-relaxed text-muted">{w.body}</p>
                  </div>
                </div>
                {/* Третья строка - что делать. Первых двух не хватало: человек
                    узнавал, что число вышло за коридор, и оставался с этим один.
                    Наблюдателю она не показывается: «сделайте тест», «запишитесь
                    к врачу», «отметьте последний день» - это действия с чужим
                    телом и чужими записями. Что число вышло за коридор, он видит;
                    что с этим делать - решает она. */}
                {owned && (
                  <p className="mt-3 rounded-2xl bg-raised/60 px-3.5 py-2.5 text-[15px] leading-relaxed">
                    {w.action}
                  </p>
                )}
              </Card>
            )
          })}
          <p className="px-1 text-[13px] leading-relaxed text-muted">
            {t('cyc.noDiagnosis')}
          </p>
        </section>
      )}

      <Patterns ownerId={ownerId} />

      <DiaryByPhase ownerId={ownerId} />

      <TodayTips state={state} owned={owned} />

      <LibraryCard owned={owned} />

      {owned && (
        <ListGroup>
          <ListRow to="/cycle/report" icon={FileText} tone="plum" title={t('cyc.report')} />
        </ListGroup>
      )}

      <History periods={periods} owned={owned} onEdit={onEdit} />

      {owned && <SettingsRow onClick={onSettings} />}
    </div>
  )
}

/** Вход в настройки раздела - строкой, а не подчёркнутой ссылкой: в неё надо попасть пальцем. */
function SettingsRow({ onClick }: { onClick: () => void }) {
  const t = useT()
  return (
    <ListGroup>
      <ListRow onClick={onClick} icon={Settings} tone="slate" title={t('cyc.settings')} />
    </ListGroup>
  )
}

/**
 * Советы на сегодня - отдельная раскрывашка.
 *
 * Раньше «сегодня» и вся справка лежали одним списком из двух сотен карточек,
 * и разница между «сегодня третий день, вот что с этим делать» и справкой
 * про щитовидку стиралась: и то и другое было очередной строкой в очередной
 * свёрнутой теме.
 *
 * Теперь здесь только то, что зависит от дня: фаза, конкретный день цикла
 * и задержка. Этого мало - десяток карточек, - и раскрывашка открыта сразу.
 * Всё остальное живёт в базе знаний и открывается по желанию.
 */
function TodayTips({ state, owned }: { state: CycleDay; owned: boolean }) {
  const t = useT()
  const groups = tipsToday(state, owned ? 'owner' : 'partner')
  const [open, setOpen] = useState(true)
  const count = groups.reduce((n, g) => n + g.tips.length, 0)

  return (
    <Card as="section" className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors
                   active:bg-raised"
      >
        <IconBadge icon={Lightbulb} tone="plum" size="sm" />
        <span className="min-w-0 flex-1 truncate font-display text-[17px] font-bold">
          {t('cyc.tipsToday')}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-muted">
          <span className="rounded-full bg-raised px-2.5 py-0.5 text-[13px] font-semibold tabular-nums">
            {count}
          </span>
          <ChevronDown
            size={18}
            aria-hidden
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-5 border-t border-line px-4 pt-4 pb-5">
          {count === 0 ? (
            <p className="text-[15px] leading-relaxed text-muted">{t('cyc.tipsTodayNone')}</p>
          ) : (
            groups.map(({ category, tips }) => (
              <div key={category}>
                <p className="text-[13px] font-semibold text-muted">
                  {t(dynamicKey('tipCat', category))}
                </p>
                <div className="mt-2 flex flex-col gap-4">
                  {tips.map((tip) => (
                    <div key={tip.id}>
                      <p className="text-[15px] leading-snug font-semibold">
                        {tip.title ?? t(dynamicKey('tip', `${tip.id}.title`))}
                      </p>
                      {/* Тело не приглушённым цветом: это то, ради чего
                          карточку открыли, а серый длинный текст читать тяжело */}
                      <p className="mt-1 text-[15px] leading-relaxed text-ink/80">
                        {t(dynamicKey('tip', `${tip.id}.body`))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  )
}

/**
 * Вход в базу знаний.
 *
 * Отдельной страницей, а не ещё одним аккордеоном внизу: полторы сотни
 * карточек под календарём означают, что до истории менструаций никто
 * не долистает. Здесь - только обещание и число, чтобы было видно, что
 * там есть что читать.
 */
function LibraryCard({ owned }: { owned: boolean }) {
  const t = useT()
  const count = tipsLibrary(owned ? 'owner' : 'partner').reduce(
    (n, g) => n + g.tips.length,
    0,
  )

  return (
    <CardLink to="/cycle/library" className="flex items-center gap-3 p-4">
      <IconBadge icon={BookOpen} tone="plum" />
      {/* Подсказка переносится, а не обрезается: она и есть обещание,
          ради которого сюда заходят, и половина её ничего не обещает */}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{t('cyc.library')}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted">
          {t('cyc.libraryHint')}
        </span>
        <span className="mt-1 block text-[13px] font-semibold text-tone-plum tabular-nums">
          {count} {t.plural('unit.card', count)}
        </span>
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-muted/70" />
    </CardLink>
  )
}

/**
 * Шапка: где мы сегодня.
 *
 * Крупной строкой стоит то, что человек пришёл узнать. Обычно это день цикла;
 * при задержке - сама задержка, потому что «День 47 из ~28» на неё только
 * намекает, а считать разницу в уме экран просить не должен.
 *
 * Карточка слева при этом перестаёт называться «Следующая»: дата в ней уже
 * прошла, и заголовок, обещающий будущее, противоречил значению. Отдельной
 * строкой сказано, что прогноз не пересчитается сам, - иначе остаётся
 * впечатление, что приложение сломалось.
 */
function Today({ state, stats }: { state: CycleDay; stats: ReturnType<typeof cycleStats> }) {
  const t = useT()
  const delay = state.delay
  const alarming = delay !== null && (delay.level === 'long' || delay.level === 'absent')

  return (
    <Card as="section" className="p-5">
      <div className="flex items-center gap-2.5">
        <IconBadge icon={Droplet} tone="plum" size="sm" />
        <Tag>{t(dynamicKey('phase', state.phase))}</Tag>
      </div>

      {delay !== null ? (
        <>
          <p
            className={`mt-4 font-display text-[34px] leading-[1.1] font-extrabold tracking-tight
                        tabular-nums ${alarming ? 'text-danger' : ''}`}
          >
            {t('cyc.delayBig', {
              n: delay.days,
              unit: t.plural('unit.day', delay.days),
            })}
          </p>
          <p className="mt-1.5 text-[15px] text-muted tabular-nums">
            {t('cyc.dayN', { n: state.day })} {t('cyc.ofAbout', { n: state.cycleLength })}
          </p>
        </>
      ) : (
        // Число отдельно от слова «день»: крупным стоит то, что меняется
        // каждое утро, а подпись над ним - неизменная, ей хватит мелкого
        <div className="mt-4">
          <p className="text-sm text-muted">{t('cyc.dayOfCycle')}</p>
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="font-display text-[56px] leading-none font-extrabold tracking-tight tabular-nums">
              {state.day}
            </span>
            <span className="text-[17px] font-semibold text-muted tabular-nums">
              {t('cyc.ofAbout', { n: state.cycleLength })}
            </span>
          </p>
        </div>
      )}

      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        {t(dynamicKey('phaseSummary', state.phase))}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-2.5">
        {/* Дата берётся из задержки, а не из прогноза, и это не придирка.
            Прогноз рисуется от двадцати восьми дней, пока своего среднего нет,
            а задержка считается от тридцати пяти - и на экране оказывалось
            два разных числа сразу: «Задержка 11 дней» крупно и «задержка
            18 дней» в карточке под ней. Соседние строки обязаны отвечать
            одинаково; календарь живёт своей жизнью и рисует прогноз. */}
        <div className="min-w-0 rounded-2xl bg-raised/60 px-3.5 py-3">
          <dt className="text-[13px] text-muted">
            {state.daysToNext < 0 ? t('cyc.expected') : t('cyc.next')}
          </dt>
          <dd className="mt-1 font-display text-[17px] leading-tight font-bold tabular-nums">
            {state.daysToNext > 0
              ? t('cyc.inDays', {
                  n: state.daysToNext,
                  unit: t.plural('unit.day', state.daysToNext),
                })
              : state.daysToNext === 0
                ? t('cyc.todayLower')
                : formatDayLabel(delay?.expectedOn ?? state.nextStart)}
          </dd>
          {state.daysToNext >= 0 && (
            <dd className="mt-0.5 text-[13px] text-muted">{formatDayLabel(state.nextStart)}</dd>
          )}
        </div>
        <div className="min-w-0 rounded-2xl bg-raised/60 px-3.5 py-3">
          <dt className="text-[13px] text-muted">{t('cyc.avgCycle')}</dt>
          {/* usableCycle, а не avgCycle: показывать надо то число, которым
              приложение реально считает прогноз. Иначе в шапке стояло бы одно,
              а «Следующая» была бы посчитана из другого - и разойтись они
              могут ровно тогда, когда данные подозрительные. */}
          <dd className="mt-1 font-display text-[17px] leading-tight font-bold tabular-nums">
            {stats.usableCycle === null
              ? t('cyc.noData')
              : `${Math.round(stats.usableCycle)} ${t.plural('unit.day', Math.round(stats.usableCycle))}`}
          </dd>
          <dd className="mt-0.5 text-[13px] text-muted">
            {stats.usableCycle === null
              ? t('cyc.needSecond')
              : t('cyc.byLast', { n: stats.cyclesCounted })}
          </dd>
        </div>
      </dl>

      {state.daysToNext < 0 && (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">{t('cyc.forecastHold')}</p>
      )}
      {/* Откуда взялось число задержки. Без этой строки «задержка 12 дней»
          при пустом «среднем цикле» выглядит как противоречие: приложение
          говорит, что данных нет, и тут же считает от чего-то. */}
      {delay?.basis === 'assumed' && (
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          {t('cyc.assumedBasis', { max: NORMS.cycleMax })}
        </p>
      )}
    </Card>
  )
}

/**
 * Полоса цикла: где мы внутри круга.
 *
 * Два цвета, а не четыре. Акцент - дни менструации, зелёный - фертильное окно,
 * остальное нейтральное. Оба цвета уже прогнаны через валидатор палитры вместе
 * со всей гаммой; выдумывать под фазы ещё две краски значило бы проверять
 * заново весь набор ради оттенка, который ничего не добавляет.
 */
function PhaseStrip({ state }: { state: CycleDay }) {
  const t = useT()
  const firstDay = shiftDays(state.nextStart, -state.cycleLength)
  // Полоса длиной в цикл теряла сегодняшний день, как только начиналась
  // задержка: день 47 в двадцативосьмидневной полосе просто некуда поставить,
  // и белая отметка исчезала с экрана, оставаясь в легенде. Тянем полосу
  // до сегодняшнего дня; лишние дни - нейтральные, они уже сверх ожидаемого.
  const span = Math.max(state.cycleLength, state.day)
  const days = Array.from({ length: span }, (_, i) => shiftDays(firstDay, i))

  return (
    <Card as="section" className="p-4">
      <div className="flex items-center gap-[2px]">
        {days.map((iso, i) => {
          const isToday = i + 1 === state.day
          // Средняя длина менструации, а не пятёрка на глаз: если у человека
          // она шесть дней, полоса врала бы каждый месяц на день.
          const bleeding = i < state.periodLength
          const fertile = iso >= state.fertileFrom && iso <= state.fertileTo
          const overdue = i >= state.cycleLength
          return (
            <span
              key={iso}
              aria-hidden
              // Сегодняшний день выше остальных. Обводка на трёхпиксельном
              // сегменте не читается - проверено на снимке.
              className={`flex-1 ${isToday ? 'h-6 rounded-sm bg-ink' : 'h-3 rounded-[2px]'} ${
                isToday
                  ? ''
                  : overdue
                    ? 'bg-raised/50'
                    : bleeding
                      ? 'bg-accent'
                      : fertile
                        ? 'bg-carbs'
                        : 'bg-raised'
              }`}
            />
          )
        })}
      </div>
      <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-ink" aria-hidden />
          {t('cyc.todayLower')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-accent" aria-hidden />
          {t('cyc.legendPeriod')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-carbs" aria-hidden />
          {t('cyc.legendFertile', {
            from: formatDayLabel(state.fertileFrom),
            to: formatDayLabel(state.fertileTo),
          })}
        </span>
      </div>
      <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
        {t('cyc.fertileNote')}
      </p>
    </Card>
  )
}

function History({
  periods,
  owned,
  onEdit,
}: {
  periods: Period[]
  owned: boolean
  onEdit: (p: Period | 'new') => void
}) {
  const t = useT()
  const sorted = [...periods].sort((a, b) => (a.startedOn < b.startedOn ? 1 : -1))
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle
        action={
          owned && (
            <button
              type="button"
              onClick={() => onEdit('new')}
              className="flex min-h-9 items-center gap-1 rounded-full bg-accent-soft px-3 text-[13px]
                         font-semibold text-accent-soft-ink transition-transform active:scale-95"
            >
              <Plus size={15} aria-hidden />
              {t('cyc.addPast')}
            </button>
          )
        }
      >
        {t('cyc.history')}
      </SectionTitle>
      <Card as="div" className="overflow-hidden">
        <ul className="divide-y divide-line">
          {sorted.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={!owned}
                onClick={() => onEdit(p)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors
                           enabled:active:bg-raised disabled:opacity-100"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">
                    {formatDayLabel(p.startedOn)}
                    {p.endedOn ? ` - ${formatDayLabel(p.endedOn)}` : ` - ${t('cyc.ongoing')}`}
                  </span>
                  {p.note && (
                    <span className="mt-0.5 block text-[13px] text-muted">{p.note}</span>
                  )}
                </span>
                <span className="shrink-0 text-right text-[13px] text-muted tabular-nums">
                  {p.periodDays !== null &&
                    `${p.periodDays} ${t.plural('unit.day', p.periodDays)}`}
                  {p.cycleDays !== null && ` · ${t('cyc.cycleN', { n: p.cycleDays })}`}
                </span>
                {owned && (
                  <ChevronRight size={18} aria-hidden className="-mr-1 shrink-0 text-muted/70" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}

/**
 * Менструация: правка существующей или запись задним числом.
 *
 * Одна форма на оба случая, потому что поля те же. Отличается только то,
 * что у новой записи нечего удалять, а даты начинаются пустыми.
 *
 * Дата начала ограничена сегодняшним днём: менструация, начавшаяся в будущем, -
 * это опечатка, а не запись. Ограничение стоит на поле, а не в базе: день
 * считает клиент, и `current_date` в проверке смотрел бы на пояс сервера.
 */
function PeriodSheet({ period, onClose }: { period: Period | null; onClose: () => void }) {
  const t = useT()
  const add = useAddPeriod()
  const save = useSavePeriod()
  const remove = useDeletePeriod()
  const [startedOn, setStartedOn] = useState(period?.startedOn ?? '')
  const [endedOn, setEndedOn] = useState(period?.endedOn ?? '')
  const [note, setNote] = useState(period?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (startedOn === '') {
      setError(t('cyc.needStart'))
      return
    }
    try {
      if (period) {
        await save.mutateAsync({
          id: period.id,
          startedOn,
          endedOn: endedOn || null,
          note: note.trim() || null,
        })
      } else {
        await add.mutateAsync({
          startedOn,
          endedOn: endedOn || null,
          note: note.trim() || null,
        })
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={t('phase.menstrual')}>
      <div className="flex min-w-0 flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('cyc.startedOn')}</span>
          <input
            type="date"
            value={startedOn}
            max={todayLocal()}
            onChange={(e) => setStartedOn(e.target.value)}
            className={`${INPUT_CLASS} min-w-0`}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('cyc.endedOn')}</span>
          <input
            type="date"
            value={endedOn}
            onChange={(e) => setEndedOn(e.target.value)}
            className={`${INPUT_CLASS} min-w-0`}
          />
          <span className="text-[13px] text-muted">{t('cyc.emptyMeansOngoing')}</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('day.note')}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={t('cyc.notePlaceholder')}
            className={`${INPUT_CLASS} min-w-0 resize-none`}
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} loading={save.isPending || add.isPending}>
          {t('common.save')}
        </Button>
        {period && (
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => void remove.mutateAsync(period.id).then(onClose)}
          >
            <Trash2 size={18} aria-hidden />
            {t('common.delete')}
          </Button>
        )}
      </div>
    </Sheet>
  )
}

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
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
    <Sheet open onClose={onClose} title={t('cyc.settings')}>
      <div className="flex min-w-0 flex-col gap-5">
        <Toggle
          label={t('cyc.trackLabel')}
          hint={t('cyc.trackHint')}
          checked={current.trackingEnabled}
          onChange={(v) => void update({ trackingEnabled: v })}
        />

        <Toggle
          label={t('cyc.shareLabel')}
          hint={t('cyc.shareHint')}
          checked={current.shareWithPartner}
          disabled={!current.trackingEnabled}
          onChange={(v) => void update({ shareWithPartner: v })}
        />

        <LutealField
          value={current.lutealDays}
          onCommit={(days) => void update({ lutealDays: days })}
        />

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  )
}

/**
 * Длина лютеиновой фазы.
 *
 * Отдельным компонентом из-за двух поломок, которые были здесь одновременно.
 *
 * Первая: значение бралось прямо из загруженных настроек, а введённое тут же
 * зажималось в 8-20. Набираешь «1» - получаешь 8, и «12» набрать невозможно
 * в принципе. Ровно эта ошибка уже была в NumberField, и лечится она так же:
 * набранный текст живёт отдельно от числа.
 *
 * Вторая: запись шла в базу на каждое нажатие, а следом инвалидировались
 * настройки и обе истории. В логе запросов это выглядело как сотня обращений
 * на одно поле. Теперь запись происходит на потере фокуса и только если
 * значение действительно изменилось.
 */
function LutealField({
  value,
  onCommit,
}: {
  value: number
  onCommit: (days: number) => void
}) {
  const t = useT()
  const [text, setText] = useState(String(value))

  // Значение пришло снаружи (загрузились настройки, откатилась запись) -
  // подхватываем, но только когда оно отличается от набранного, иначе
  // затрём то, что человек печатает прямо сейчас.
  useEffect(() => {
    if (Number(text) !== value) setText(String(value))
    // text намеренно вне зависимостей: эффект реагирует на внешнее значение
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = () => {
    const raw = text.replace(/\D/g, '')
    // Пустое поле - это не «ноль», а «передумал»: возвращаем прежнее.
    if (raw === '') {
      setText(String(value))
      return
    }
    const days = Math.min(20, Math.max(8, Number(raw)))
    setText(String(days))
    if (days !== value) onCommit(days)
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{t('cyc.luteal')}</span>
      <input
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        className="w-20 rounded-2xl bg-raised px-3 py-3 text-center tabular-nums ring-1 ring-transparent
                   outline-none transition-shadow focus:bg-surface focus:ring-2 focus:ring-accent"
      />
      <span className="text-[13px] leading-relaxed text-muted">
        {t('cyc.lutealHint')}
      </span>
    </label>
  )
}

/**
 * Вход в раздел, когда показывать ещё нечего.
 *
 * Переписан после того, как автор нажал «Включить» и получил предложение
 * отметить СВОЮ менструацию. Кнопка была одна, и она включала ведение
 * собственного цикла - для человека, который зашёл смотреть партнёрский,
 * это бессмыслица, а выйти обратно с того экрана было нечем.
 *
 * Теперь роли названы вслух и разведены: вести свой - действие, доступное
 * прямо здесь; смотреть чужой - не действие, а следствие чужого решения,
 * и попросить об этом можно только словами.
 */
function Intro({
  partnerName,
  onEnable,
  open,
  onClose,
}: {
  partnerName: string
  onEnable: () => void
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  const settings = useCycleSettings()
  const save = useSaveCycleSettings()

  // Кнопка обязана делать то, что на ней написано. Раньше она только
  // открывала настройки, а раздел оставался выключенным, пока человек
  // не найдёт там тумблер.
  const enable = async () => {
    await save.mutateAsync({ ...(settings.data ?? DEFAULT_SETTINGS), trackingEnabled: true })
    onEnable()
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Card as="section" className="p-5">
        <div className="flex items-center gap-3">
          <IconBadge icon={Droplet} tone="plum" />
          <h2 className="min-w-0 flex-1 font-display text-[17px] leading-snug font-bold">
            {t('cyc.introMineTitle')}
          </h2>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {t('cyc.introMineBody')}
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {t('cyc.introMineOwn', { name: partnerName })}
        </p>
        <Button className="mt-5 w-full" onClick={() => void enable()} loading={save.isPending}>
          <Plus size={18} aria-hidden />
          {t('cyc.enable')}
        </Button>
      </Card>

      <Card as="section" className="p-5">
        <div className="flex items-center gap-3">
          <IconBadge icon={ShieldCheck} tone="slate" />
          <h2 className="min-w-0 flex-1 font-display text-[17px] leading-snug font-bold">
            {t('cyc.introTheirsTitle')}
          </h2>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {t('cyc.introTheirsBody', { name: partnerName })}
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {t('cyc.introTheirsWait', { name: partnerName })}
        </p>
      </Card>

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
    // label вокруг: нажатие по подписи тоже переключает - в полстроки текста
    // попасть проще, чем в сам переключатель. Приглушается текст, а не вся
    // строка: выключенный переключатель бледнеет сам, и общая прозрачность
    // сверху сделала бы его невидимым
    <label className="flex flex-col gap-1.5">
      <span className="flex min-h-11 items-center justify-between gap-3">
        <span className={`text-[15px] font-medium ${disabled ? 'opacity-50' : ''}`}>{label}</span>
        <Switch checked={checked} disabled={disabled} onChange={onChange} label={label} />
      </span>
      <span className={`text-[13px] leading-relaxed text-muted ${disabled ? 'opacity-50' : ''}`}>
        {hint}
      </span>
    </label>
  )
}

