/**
 * Проверка раздела цикла: инварианты базы и арифметика прогноза.
 *
 *   pnpm tsx scripts/check-cycle.ts
 *
 * Две половины и обе обязательны.
 *
 * База: каждый запрещённый случай должен УПАСТЬ. Если он проходит, значит
 * инвариант держит не база, а форма - а форму можно обойти.
 *
 * Арифметика: фазы и прогноз считаются на клиенте, и проверять их надо
 * отдельно от базы. Главное здесь - что овуляция отсчитывается назад
 * от следующего начала, а не вперёд от прошлого: при цикле в 34 дня
 * разница между этими способами составляет шесть дней.
 *
 * Всё в транзакции и откатывается.
 */
import { Client } from 'pg'
import {
  DEFAULT_CYCLE_DAYS,
  DEFAULT_PERIOD_DAYS,
  cycleDay,
  cycleStats,
  forecast,
  warnings,
  type Period,
} from '../src/features/cycle/cycle.ts'
import {
  TIP_CATEGORIES,
  tipsByCategory,
  tipsFor,
  tipsForPartner,
} from '../src/features/cycle/tips.ts'
import { pgConfig } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

/** Запрещённая вставка обязана упасть. */
async function mustFail(
  client: Client,
  name: string,
  sql: string,
  params: unknown[],
): Promise<void> {
  await client.query('savepoint s')
  try {
    await client.query(sql, params)
    await client.query('rollback to savepoint s')
    check(false, name, 'вставка ПРОШЛА, хотя должна была упасть')
  } catch (e) {
    await client.query('rollback to savepoint s')
    const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
    check(true, name, msg ?? '')
  }
}

function period(startedOn: string, endedOn: string | null, cycleDays: number | null): Period {
  return {
    id: startedOn,
    startedOn,
    endedOn,
    note: null,
    periodDays: endedOn === null ? null : null,
    cycleDays,
  }
}

function withPeriodDays(p: Period, days: number): Period {
  return { ...p, periodDays: days }
}

async function schemaChecks(client: Client): Promise<void> {
  const { rows } = await client.query<{ user_id: string }>(
    'select user_id from public.app_members limit 1',
  )
  const uid = rows[0]?.user_id
  if (!uid) throw new Error('Нет участников')

  const ins = `insert into public.periods (user_id, started_on, ended_on) values ($1, $2, $3)`

  await client.query(ins, [uid, '2026-01-01', '2026-01-05'])

  await mustFail(client, 'Конец раньше начала отвергается', ins, [uid, '2026-03-10', '2026-03-01'])

  await mustFail(client, 'Две менструации не пересекаются', ins, [
    uid,
    '2026-01-03',
    '2026-01-08',
  ])

  await mustFail(client, 'Повтор той же даты начала отвергается', ins, [
    uid,
    '2026-01-01',
    '2026-01-04',
  ])

  await mustFail(client, 'Кровотечение длиннее восьми недель отвергается', ins, [
    uid,
    '2026-06-01',
    '2026-08-01',
  ])

  // Одна незакрытая - можно, вторая - нельзя
  await client.query(ins, [uid, '2026-02-01', null])
  await mustFail(client, 'Две идущие одновременно отвергаются', ins, [uid, '2026-04-01', null])

  // --- отметки по дням ---
  const insDay = `insert into public.cycle_days (user_id, date, flow, pain, mood, symptoms, note)
                  values ($1, $2, $3, $4, $5, $6, $7)`

  await client.query(insDay, [uid, '2026-01-02', 'medium', 2, 'low', ['cramps'], null])

  await mustFail(client, 'Пустая отметка отвергается', insDay, [
    uid, '2026-01-03', null, null, null, [], null,
  ])
  await mustFail(client, 'Неизвестный симптом отвергается', insDay, [
    uid, '2026-01-04', null, null, null, ['телепатия'], null,
  ])
  await mustFail(client, 'Обильность вне словаря отвергается', insDay, [
    uid, '2026-01-05', 'ужасно', null, null, [], null,
  ])
  await mustFail(client, 'Боль вне шкалы отвергается', insDay, [
    uid, '2026-01-06', null, 7, null, [], null,
  ])
  await mustFail(client, 'Две отметки на один день отвергаются', insDay, [
    uid, '2026-01-02', 'light', null, null, [], null,
  ])
  await mustFail(client, 'Отметка из пробелов отвергается', insDay, [
    uid, '2026-01-07', null, null, null, [], '   ',
  ])

  // Вью считает длины
  const { rows: hist } = await client.query<{ period_days: number; cycle_days: number }>(
    `select period_days, cycle_days from public.periods_v
      where user_id = $1 and started_on = '2026-01-01'`,
    [uid],
  )
  check(
    hist[0]?.period_days === 5 && hist[0]?.cycle_days === 31,
    'Вью считает длину менструации и цикла',
    `менструация ${hist[0]?.period_days} дн. (ждали 5), цикл ${hist[0]?.cycle_days} дн. (ждали 31)`,
  )
}

function logicChecks(): void {
  // Ровный цикл 28 дней, менструация 5 дней
  const even: Period[] = [
    withPeriodDays(period('2026-06-01', '2026-06-05', 28), 5),
    withPeriodDays(period('2026-06-29', '2026-07-03', 28), 5),
    withPeriodDays(period('2026-07-27', '2026-07-31', null), 5),
  ]

  const stats = cycleStats(even)
  check(
    stats.avgCycle === 28 && stats.avgPeriod === 5 && stats.spread === 0,
    'Средние по ровному циклу',
    `цикл ${stats.avgCycle}, менструация ${stats.avgPeriod}, разброс ${stats.spread}`,
  )

  const d1 = cycleDay(even, '2026-07-27', 14)
  check(d1?.day === 1 && d1.phase === 'menstrual', 'Первый день - менструальная фаза', `день ${d1?.day}, фаза ${d1?.phase}`)

  const d10 = cycleDay(even, '2026-08-05', 14)
  check(d10?.phase === 'follicular', 'Десятый день - фолликулярная', `день ${d10?.day}, фаза ${d10?.phase}`)

  const d14 = cycleDay(even, '2026-08-09', 14)
  check(
    d14?.phase === 'ovulation' && d14.ovulation === '2026-08-10',
    'Овуляция около 14-го дня при цикле 28',
    `день ${d14?.day}, фаза ${d14?.phase}, овуляция ${d14?.ovulation}`,
  )

  const d22 = cycleDay(even, '2026-08-17', 14)
  check(d22?.phase === 'luteal', 'Двадцать второй день - лютеиновая', `день ${d22?.day}, фаза ${d22?.phase}`)

  check(
    d1?.nextStart === '2026-08-24' && d1.daysToNext === 28,
    'Прогноз следующего начала',
    `следующее ${d1?.nextStart}, через ${d1?.daysToNext} дн.`,
  )

  // ГЛАВНОЕ: при длинном цикле овуляция считается назад, а не вперёд.
  const long: Period[] = [
    withPeriodDays(period('2026-05-01', '2026-05-05', 34), 5),
    withPeriodDays(period('2026-06-04', '2026-06-08', 34), 5),
    withPeriodDays(period('2026-07-08', '2026-07-12', null), 5),
  ]
  const longDay = cycleDay(long, '2026-07-08', 14)
  check(
    longDay?.ovulation === '2026-07-28',
    'При цикле 34 овуляция на 21-й день, а не на 14-й',
    `овуляция ${longDay?.ovulation} (отсчёт вперёд дал бы 2026-07-21 - ошибка в 7 дней)`,
  )

  // Фертильное окно: пять дней до овуляции и один после
  check(
    longDay?.fertileFrom === '2026-07-23' && longDay.fertileTo === '2026-07-29',
    'Фертильное окно - пять дней до и один после',
    `${longDay?.fertileFrom} … ${longDay?.fertileTo}`,
  )

  // Предупреждения
  const short: Period[] = [
    withPeriodDays(period('2026-06-01', '2026-06-04', 19), 4),
    withPeriodDays(period('2026-06-20', '2026-06-23', 19), 4),
    withPeriodDays(period('2026-07-09', '2026-07-12', null), 4),
  ]
  const wShort = warnings(short, '2026-07-10')
  check(
    wShort.some((w) => w.id === 'cycle-short'),
    'Короткий средний цикл даёт предупреждение',
    `выдано: ${wShort.map((w) => w.id).join(', ') || 'ничего'}`,
  )

  const irregular: Period[] = [
    withPeriodDays(period('2026-01-01', '2026-01-05', 24), 5),
    withPeriodDays(period('2026-01-25', '2026-01-29', 38), 5),
    withPeriodDays(period('2026-03-04', '2026-03-08', null), 5),
  ]
  const wIrr = warnings(irregular, '2026-03-05')
  check(
    wIrr.some((w) => w.id === 'irregular'),
    'Разброс больше девяти дней даёт предупреждение',
    `выдано: ${wIrr.map((w) => w.id).join(', ') || 'ничего'}`,
  )

  const bleeding: Period[] = [period('2026-07-01', null, null)]
  const wBleed = warnings(bleeding, '2026-07-11')
  check(
    wBleed.some((w) => w.id === 'bleeding-long'),
    'Затянувшееся кровотечение даёт предупреждение',
    `выдано: ${wBleed.map((w) => w.id).join(', ') || 'ничего'}`,
  )

  const absent: Period[] = [withPeriodDays(period('2026-01-01', '2026-01-05', null), 5)]
  const wAbs = warnings(absent, '2026-05-01')
  check(
    wAbs.some((w) => w.id === 'absent'),
    'Отсутствие менструации 90+ дней даёт предупреждение',
    `выдано: ${wAbs.map((w) => w.id).join(', ') || 'ничего'}`,
  )

  check(
    warnings(even, '2026-07-29').length === 0,
    'Ровный цикл не даёт ложных тревог',
    `выдано: ${warnings(even, '2026-07-29').map((w) => w.id).join(', ') || 'ничего'}`,
  )

  // Пустая история не должна ронять расчёт
  check(cycleDay([], '2026-07-01', 14) === null, 'Без записей расчёта нет, а не падение', 'вернулся null')

  // Прогноз на несколько циклов вперёд
  const f = forecast(even, 14, 3)
  check(
    f.length === 3 && f[0]?.start === '2026-08-24' && f[2]?.start === '2026-10-19',
    'Прогноз считает три цикла вперёд',
    `${f.map((x) => x.start).join(', ') || 'пусто'}`,
  )
  check(
    f[0]?.end === '2026-08-28',
    'Длина ожидаемой менструации - по средней, а не по константе',
    `${f[0]?.start} - ${f[0]?.end} (среднее 5 дн.)`,
  )
  check(forecast([], 14, 3).length === 0, 'Без истории прогноза нет', 'вернулся пустой список')

  // Однодневная отметка НЕ должна становиться законом.
  //
  // Ровно эта поломка была на живом приложении: человек отметил один день,
  // приложение посчитало «среднюю длину менструации» по одному наблюдению,
  // получило единицу и стало рисовать ею все будущие менструации.
  const oneDay: Period[] = [withPeriodDays(period('2026-09-04', '2026-09-04', null), 1)]
  const oneDayState = cycleDay(oneDay, '2026-09-04', 14)
  check(
    oneDayState?.periodLength === DEFAULT_PERIOD_DAYS,
    'Однодневная отметка не задаёт длину будущих менструаций',
    `в прогнозе ${oneDayState?.periodLength} дн., ждали умолчание ${DEFAULT_PERIOD_DAYS}`,
  )
  const oneDayForecast = forecast(oneDay, 14, 1)
  check(
    oneDayForecast[0]?.start === '2026-10-02' && oneDayForecast[0]?.end === '2026-10-06',
    'Прогноз после однодневной отметки берёт умолчания',
    `${oneDayForecast[0]?.start} - ${oneDayForecast[0]?.end}`,
  )
  check(
    warnings(oneDay, '2026-09-04').some((w) => w.id === 'period-short'),
    'Но предупреждение об однодневной менструации остаётся',
    `выдано: ${warnings(oneDay, '2026-09-04').map((w) => w.id).join(', ') || 'ничего'}`,
  )

  // Запись с началом в будущем не должна давать «День 0»
  const future: Period[] = [
    withPeriodDays(period('2026-08-01', '2026-08-05', 35), 5),
    withPeriodDays(period('2026-09-05', null, null), 5),
  ]
  const beforeStart = cycleDay(future, '2026-09-04', 16)
  check(
    beforeStart !== null && beforeStart.day >= 1,
    'Запись с началом завтра не даёт «День 0»',
    `день ${beforeStart?.day} (считается от предыдущей начавшейся, а не от будущей)`,
  )
  check(
    beforeStart?.day === 35,
    'Считается от последней НАЧАВШЕЙСЯ записи',
    `день ${beforeStart?.day}, ждали 35 (01.08 -> 04.09)`,
  )
  const onlyFuture = cycleDay([withPeriodDays(period('2026-12-01', null, null), 5)], '2026-09-04', 14)
  check(onlyFuture === null, 'Если все записи в будущем, расчёта нет', 'вернулся null')

  // Две однодневные подряд не должны дать «средний цикл 1 день»
  const twoShort: Period[] = [
    withPeriodDays(period('2026-09-04', '2026-09-04', 1), 1),
    withPeriodDays(period('2026-09-05', '2026-09-05', null), 1),
  ]
  const twoState = cycleDay(twoShort, '2026-09-05', 14)
  check(
    twoState?.cycleLength === DEFAULT_CYCLE_DAYS,
    'Две отметки подряд не задают длину цикла в один день',
    `в прогнозе цикл ${twoState?.cycleLength} дн., ждали умолчание ${DEFAULT_CYCLE_DAYS}`,
  )

  // Длинный, но реальный цикл прогноз ломать не должен: 40 дней вне нормы,
  // однако это измерение, а не промах по кнопке.
  const long40: Period[] = [
    withPeriodDays(period('2026-01-01', '2026-01-06', 40), 6),
    withPeriodDays(period('2026-02-10', '2026-02-15', 40), 6),
    withPeriodDays(period('2026-03-22', '2026-03-27', null), 6),
  ]
  const longState = cycleDay(long40, '2026-03-22', 14)
  check(
    longState?.cycleLength === 40,
    'Цикл вне нормы, но правдоподобный, прогноз использует как есть',
    `в прогнозе ${longState?.cycleLength} дн., подменять на ${DEFAULT_CYCLE_DAYS} нельзя`,
  )
  check(
    warnings(long40, '2026-03-22').some((w) => w.id === 'cycle-long'),
    'И одновременно предупреждает, что это выше нормы',
    `выдано: ${warnings(long40, '2026-03-22').map((w) => w.id).join(', ') || 'ничего'}`,
  )

  // Подсказки: в каждой фазе есть что сказать, и ничего не теряется
  // при группировке. Пропавшая подсказка - тихая потеря: экран выглядит
  // рабочим, просто в нём меньше пользы, чем задумано.
  const phaseDays = [
    { iso: '2026-07-27', name: 'менструация' },
    { iso: '2026-08-05', name: 'фолликулярная' },
    { iso: '2026-08-09', name: 'овуляция' },
    { iso: '2026-08-17', name: 'лютеиновая' },
  ]
  // Наблюдателю показывают ДРУГОЙ набор.
  //
  // Владельцу говорят «уменьши объём тренировки» - партнёру это сказать
  // нельзя, это не его тело. Пересечение этих двух наборов должно быть
  // только по общим темам, и если однажды сюда просочится подсказка
  // из личных, заметить это по экрану будет нечем.
  for (const { iso, name } of phaseDays) {
    const st = cycleDay(even, iso, 14)
    if (!st) continue
    const ownerIds = new Set(tipsFor(st).map((t) => t.id))
    const partnerTips = tipsForPartner(st)
    const leaked = partnerTips.filter(
      (t) => ownerIds.has(t.id) && !['intimacy', 'benefits'].includes(t.category),
    )
    check(
      partnerTips.length >= 8 && leaked.length === 0,
      `Наблюдателю в фазе «${name}» показывают свой набор`,
      `${partnerTips.length} шт., чужих личных подсказок: ${leaked.map((t) => t.id).join(', ') || 'нет'}`,
    )
    const grouped = tipsByCategory(st, 'partner').flatMap((g) => g.tips)
    check(
      grouped.length === partnerTips.length,
      `Группировка для наблюдателя в фазе «${name}» ничего не теряет`,
      `${grouped.length} из ${partnerTips.length}`,
    )
  }

  for (const { iso, name } of phaseDays) {
    const st = cycleDay(even, iso, 14)
    if (!st) {
      check(false, `Подсказки для фазы «${name}»`, 'расчёт вернул null')
      continue
    }
    const flat = tipsFor(st)
    const grouped = tipsByCategory(st).flatMap((g) => g.tips)
    const known = flat.every((t) => (TIP_CATEGORIES as readonly string[]).includes(t.category))
    const ids = new Set(flat.map((t) => t.id))
    check(
      flat.length >= 20 && grouped.length === flat.length && known && ids.size === flat.length,
      `Подсказки для фазы «${name}»`,
      `${flat.length} шт. (минимум 20), в группах ${grouped.length}, темы известны: ${known}, дублей нет: ${ids.size === flat.length}`,
    )
  }
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()
  try {
    await client.query('begin')
    await schemaChecks(client)
    logicChecks()
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nРаздел цикла верен.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
