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

  // --- зеркало расчёта в SQL ---
  //
  // Фазы считает клиент, а рассылает база, и расчёт продублирован. Дублирование
  // здесь неизбежно, но молчаливое расхождение недопустимо: приложение
  // показывало бы одну фазу, а уведомление называло другую, и человек узнал бы
  // об этом только сверив два экрана.
  await client.query(
    `insert into public.cycle_settings (user_id, tracking_enabled, luteal_days)
     values ($1, true, 14)
     on conflict (user_id) do update set tracking_enabled = true, luteal_days = 14`,
    [uid],
  )
  await client.query('delete from public.periods where user_id = $1', [uid])
  for (const [s0, e0] of [
    ['2026-06-01', '2026-06-05'],
    ['2026-06-29', '2026-07-03'],
    ['2026-07-27', '2026-07-31'],
  ]) {
    await client.query(ins, [uid, s0, e0])
  }

  const mirror: Period[] = [
    withPeriodDays(period('2026-06-01', '2026-06-05', 28), 5),
    withPeriodDays(period('2026-06-29', '2026-07-03', 28), 5),
    withPeriodDays(period('2026-07-27', '2026-07-31', null), 5),
  ]

  for (const iso of ['2026-07-27', '2026-08-05', '2026-08-09', '2026-08-17', '2026-08-23']) {
    // Даты берём ТЕКСТОМ. Драйвер отдаёт колонку date объектом Date
    // в местной полуночи, и toISOString уводит её на день назад - ровно
    // та ловушка, из-за которой в проекте запрещён current_date.
    const { rows: sql } = await client.query<{
      day: number
      phase: string
      cycle_length: number
      next_start: string
      ovulation: string
    }>(
      `select day, phase, cycle_length,
              next_start::text as next_start, ovulation::text as ovulation
         from public.cycle_state($1, $2::date)`,
      [uid, iso],
    )
    const ts = cycleDay(mirror, iso, 14)
    const row = sql[0]
    const same =
      row !== undefined &&
      ts !== null &&
      row.day === ts.day &&
      row.phase === ts.phase &&
      row.cycle_length === ts.cycleLength &&
      row.next_start === ts.nextStart &&
      row.ovulation === ts.ovulation
    check(
      same,
      `SQL и клиент согласны на ${iso}`,
      `SQL ${row?.day} ${row?.phase} цикл ${row?.cycle_length} след ${row?.next_start} овул ${row?.ovulation} | ` +
        `TS ${ts?.day} ${ts?.phase} цикл ${ts?.cycleLength} след ${ts?.nextStart} овул ${ts?.ovulation}`,
    )
  }

  // --- рассылка ---
  //
  // Час проверяем подбором пояса, где сейчас 13: ждать тринадцати часов
  // ради проверки нельзя, а заодно это проверяет главное свойство функции -
  // решение принимается по местному времени профиля, а не сервера.
  const queued = async (): Promise<number> => {
    const { rows } = await client.query<{ n: string }>(
      'select count(*)::text as n from net.http_request_queue',
    )
    return Number(rows[0]?.n ?? 0)
  }

  const { rows: zones } = await client.query<{ name: string }>(
    `select name from pg_timezone_names
      where extract(hour from now() at time zone name)::int = 13
        and name like '%/%' order by name limit 1`,
  )
  const noonZone = zones[0]?.name
  const { rows: quiet } = await client.query<{ name: string }>(
    `select name from pg_timezone_names
      where extract(hour from now() at time zone name)::int = 3
        and name like '%/%' order by name limit 1`,
  )

  if (noonZone && quiet[0]) {
    // Ставим последнюю менструацию так, чтобы сегодня была середина цикла:
    // ни начала, ни смены фазы - только подсказка дня.
    await client.query('delete from public.periods where user_id = $1', [uid])
    await client.query('delete from public.cycle_notices where user_id = $1', [uid])
    await client.query(
      `insert into public.periods (user_id, started_on, ended_on)
       values ($1, (now() at time zone $2)::date - 8, (now() at time zone $2)::date - 4)`,
      [uid, noonZone],
    )

    await client.query('update public.profiles set timezone = $1 where user_id = $2', [
      quiet[0].name,
      uid,
    ])
    const beforeQuiet = await queued()
    await client.query('select public.send_cycle_notices()')
    check(
      (await queued()) === beforeQuiet,
      'В неурочный час рассылки нет',
      `${quiet[0].name}, запросов не прибавилось`,
    )

    await client.query('update public.profiles set timezone = $1 where user_id = $2', [
      noonZone,
      uid,
    ])
    await client.query('update public.cycle_settings set share_with_partner = true where user_id = $1', [uid])
    const beforeTip = await queued()
    await client.query('select public.send_cycle_notices()')
    const tipRequests = (await queued()) - beforeTip
    check(
      tipRequests === 2,
      'Подсказка дня уходит ТОЛЬКО владельцу, даже при открытом доступе',
      `запросов ${tipRequests} (ожидалось 2: телеграм и push одному человеку)`,
    )

    const beforeRepeat = await queued()
    await client.query('select public.send_cycle_notices()')
    check(
      (await queued()) === beforeRepeat,
      'Повторный запуск в тот же день молчит',
      'дубли недопустимы: задание идёт каждый час',
    )
  }

  await client.query('delete from public.periods where user_id = $1', [uid])
  for (const [s1, e1] of [
    ['2026-01-01', '2026-01-05'],
    ['2026-02-01', null],
  ] as [string, string | null][]) {
    await client.query(ins, [uid, s1, e1])
  }

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
      (t) => ownerIds.has(t.id) && !['intimacy', 'practices', 'benefits'].includes(t.category),
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
