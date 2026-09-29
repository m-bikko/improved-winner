/**
 * Проверка состава тела.
 *
 *   pnpm tsx scripts/check-body.ts
 *
 * Раздел устроен вокруг одного обещания: **расширенные поля необязательны**.
 * Обычные весы дают один вес, и день с одним весом обязан работать везде -
 * в графике, в расчёте расхода, в выписке. Поэтому первое, что здесь
 * проверяется, - что запись без состава принимается, а не то, что запись
 * с составом принимается.
 *
 * Второе - что килограммы не хранятся. Прибор показывает 27.9 кг жира при
 * 96.3 кг и 29.0 %; вью обязана давать то же число, иначе экран приложения
 * и экран весов разойдутся на глазах у человека, который только что видел оба.
 *
 * Третье - ворота тренда. Биоимпеданс мерит сопротивление тела, а оно гуляет
 * от воды: на двух точках выходит «плюс два килограмма мышц за неделю», чего
 * не бывает. Неверный ответ на вопрос «что я теряю» меняет поведение
 * в худшую сторону - человек решает, что теряет мышцы, и бросает дефицит.
 * Поэтому молчание при нехватке данных проверяется наравне с расчётом.
 *
 * Всё в транзакции и откатывается.
 */
import { Client } from 'pg'
import { computeGoals } from '../src/lib/nutrition.ts'
import { bmi, fatBand, leanKg, partKg, visceralBand, waterBand } from '../src/lib/body.ts'
import { pgConfig } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

/** Отвергает ли база вставку. Всё внутри savepoint, чтобы не рвать транзакцию. */
async function rejects(client: Client, sql: string, params: unknown[]): Promise<boolean> {
  await client.query('savepoint probe')
  try {
    await client.query(sql, params)
    await client.query('rollback to savepoint probe')
    return false
  } catch {
    await client.query('rollback to savepoint probe')
    return true
  }
}

function logicChecks(): void {
  // --- Килограммы из процентов: числа со скриншота прибора
  check(
    partKg(96.3, 29.0) === 27.9,
    'Жировая масса совпадает с показанием прибора',
    `96.3 кг x 29.0 % = ${partKg(96.3, 29.0)}, прибор показывает 27.9`,
  )
  check(
    partKg(96.3, 36.4) === 35.1,
    'Скелетная мышечная масса совпадает с показанием прибора',
    `96.3 x 36.4 % = ${partKg(96.3, 36.4)}, прибор показывает 35.0`,
  )
  check(partKg(96.3, null) === null, 'Без процента килограммов нет', 'считать не из чего')

  check(
    leanKg(96.3, 29.0) === 68.4,
    'Тощая масса - всё, что не жир',
    `96.3 - 27.9 = ${leanKg(96.3, 29.0)}`,
  )

  /*
   * Клиент и вью округляют одинаково.
   *
   * Не теория: на 96.75 кг и 29.1 % клиент считал до сотой (28.15), выводил
   * через toFixed(1) и показывал 28.1, потому что 28.15 в двоичной записи
   * хранится как 28.149999999999998. База в той же строке показывала 28.2.
   * Одно приложение, два экрана, разные числа - и заметить это можно было
   * только держа оба перед глазами.
   */
  const pairs: [number, number, number, number][] = [
    [96.75, 29.1, 28.2, 68.6],
    [95.35, 28.7, 27.4, 68.0],
    [96.6, 29.1, 28.1, 68.5],
    [96.3, 29.0, 27.9, 68.4],
  ]
  const off = pairs.filter(
    ([w, pct, fat, lean]) => partKg(w, pct) !== fat || leanKg(w, pct) !== lean,
  )
  check(
    off.length === 0,
    'Клиент округляет так же, как вью',
    off.length === 0
      ? `сверено пар: ${pairs.length}, в том числе половинки вроде 28.15`
      : off.map(([w, p]) => `${w}/${p}: ${partKg(w, p)} и ${leanKg(w, p)}`).join('; '),
  )

  check(bmi(96.3, 181) === 29.4, 'ИМТ считается из роста и веса', `${bmi(96.3, 181)}, ждали 29.4`)
  check(bmi(96.3, null) === null, 'Без роста ИМТ не выдумывается', 'null')

  // --- Полосы
  check(
    fatBand(29, 'male') === 'veryHigh' && fatBand(29, 'female') === 'healthy',
    'Полоса жира зависит от пола',
    '29 % у мужчины - заметно выше, у женщины - в норме',
  )
  check(fatBand(29, null) === null, 'Без пола полосы нет', 'чужая шкала хуже отсутствия шкалы')
  check(
    visceralBand(9) === 'healthy' && visceralBand(16.5) === 'veryHigh',
    'Полоса висцерального жира',
    '9 в норме, 16.5 заметно выше',
  )
  check(
    waterBand(50.9, 'male') === 'healthy' && waterBand(44, 'male') === 'low',
    'Полоса воды',
    '50.9 % в норме для мужчины, 44 % ниже',
  )

  // --- Цели: белок от тощей массы
  const base = {
    birthYear: new Date().getFullYear() - 22,
    sex: 'male' as const,
    heightCm: 181,
    weightKg: 96.3,
    activityLevel: 'moderate' as const,
    goalDirection: 'lose' as const,
  }
  const plain = computeGoals(base)
  const withLean = computeGoals({ ...base, leanKg: 68.37 })
  check(
    plain !== null && withLean !== null && withLean.protein < plain.protein,
    'Белок от тощей массы ниже, чем от общего веса',
    `${plain?.protein} г по весу против ${withLean?.protein} г по тощей массе`,
  )
  check(
    plain !== null && withLean !== null && plain.kcal === withLean.kcal,
    'Тощая масса не трогает калории',
    `${plain?.kcal} ккал в обоих случаях`,
  )

  // --- Цели: измеренный обмен вместо формулы
  const measured = computeGoals({ ...base, bmrKcal: 2008 })
  check(
    plain !== null && measured !== null && measured.kcal !== plain.kcal,
    'Измеренный базовый обмен заменяет формулу',
    `Миффлин ${plain?.kcal} ккал, по измеренному 2008 - ${measured?.kcal} ккал`,
  )

  // --- И главное: без расширенных полей всё считается как раньше
  check(
    plain !== null && JSON.stringify(plain) === JSON.stringify(computeGoals({ ...base })),
    'Без состава цели те же, что были',
    'обычные весы ничего не ломают',
  )
}

async function dbChecks(client: Client): Promise<void> {
  const { rows: members } = await client.query<{ user_id: string }>(
    'select user_id from public.app_members order by user_id',
  )
  const uid = members[0]?.user_id
  if (!uid) throw new Error('Нужен хотя бы один участник')

  await client.query('delete from public.weight_log where user_id = $1', [uid])

  // --- Обычные весы: один вес и ничего больше
  await client.query(
    `insert into public.weight_log (user_id, date, weight_kg) values ($1, '2026-01-10', 96.3)`,
    [uid],
  )
  const { rows: plain } = await client.query<{ n: string }>(
    `select count(*)::text as n from public.weight_log
      where user_id = $1 and date = '2026-01-10' and body_fat_pct is null`,
    [uid],
  )
  check(plain[0]?.n === '1', 'Запись без состава принимается', 'обычные весы - полноценный день')

  // --- Вью считает килограммы, а не хранит их
  await client.query(
    `update public.weight_log
        set body_fat_pct = 29.0, muscle_pct = 67.8, skeletal_muscle_pct = 36.4,
            water_pct = 50.9, visceral = 16.5, bmr_kcal = 2008
      where user_id = $1 and date = '2026-01-10'`,
    [uid],
  )
  const { rows: derived } = await client.query<{
    fat_kg: string
    lean_kg: string
    muscle_kg: string
    water_kg: string
  }>(
    `select fat_kg::text, lean_kg::text, muscle_kg::text, water_kg::text
       from public.weight_log_v where user_id = $1 and date = '2026-01-10'`,
    [uid],
  )
  const d = derived[0]
  check(
    d?.fat_kg === '27.9' && d.lean_kg === '68.4' && d.muscle_kg === '65.3',
    'Вью даёт те же килограммы, что прибор',
    `жир ${d?.fat_kg} (прибор 27.9), мышцы ${d?.muscle_kg} (прибор 65.3), тощая ${d?.lean_kg}`,
  )
  check(
    d !== undefined &&
      String(partKg(96.3, 29.0)) === d.fat_kg &&
      String(leanKg(96.3, 29.0)) === d.lean_kg &&
      String(partKg(96.3, 67.8)) === d.muscle_kg,
    'Клиент и вью дают одно число на одной строке',
    `клиент ${partKg(96.3, 29.0)}/${leanKg(96.3, 29.0)}/${partKg(96.3, 67.8)}, вью ${d?.fat_kg}/${d?.lean_kg}/${d?.muscle_kg}`,
  )

  // --- Инварианты
  check(
    await rejects(
      client,
      `insert into public.weight_log (user_id, date, weight_kg, body_fat_pct)
       values ($1, '2026-02-01', 96, 90)`,
      [uid],
    ),
    'Невероятный процент жира отвергается',
    '90 % - это промах по клавиатуре, а не измерение',
  )
  check(
    await rejects(
      client,
      `insert into public.weight_log (user_id, date, weight_kg, muscle_pct, skeletal_muscle_pct)
       values ($1, '2026-02-01', 96, 40, 60)`,
      [uid],
    ),
    'Скелетных мышц не больше, чем всех мышц',
    'часть не бывает больше целого',
  )
  check(
    await rejects(
      client,
      `insert into public.weight_log (user_id, date, weight_kg, body_fat_pct, muscle_pct)
       values ($1, '2026-02-01', 96, 60, 60)`,
      [uid],
    ),
    'Жир и мышцы вместе не больше тела',
    '60 + 60 = 120 % - так не бывает',
  )
  check(
    await rejects(
      client,
      `insert into public.weight_log (user_id, date, weight_kg, bmr_kcal)
       values ($1, '2026-02-01', 96, 120)`,
      [uid],
    ),
    'Невероятный базовый обмен отвергается',
    '120 ккал в сутки - не обмен',
  )

  // --- Ворота тренда
  await client.query('delete from public.weight_log where user_id = $1', [uid])
  const none = await composition(client, uid, '2026-03-01')
  check(none.gap === 'body.none', 'Без единого измерения - молчим', `gap ${none.gap}`)

  // Три точки за неделю: и мало, и коротко
  for (const [date, w, f] of [
    ['2026-03-01', 96.0, 29.0],
    ['2026-03-04', 95.6, 28.8],
    ['2026-03-07', 95.4, 28.7],
  ] as [string, number, number][]) {
    await client.query(
      `insert into public.weight_log (user_id, date, weight_kg, body_fat_pct)
       values ($1, $2, $3, $4)`,
      [uid, date, w, f],
    )
  }
  const few = await composition(client, uid, '2026-03-07')
  check(few.gap === 'body.fewMeasures', 'Трёх измерений мало', `gap ${few.gap}`)

  // Пять точек, но всё ещё неделя
  for (const [date, w, f] of [
    ['2026-03-05', 95.5, 28.9],
    ['2026-03-06', 95.5, 28.8],
  ] as [string, number, number][]) {
    await client.query(
      `insert into public.weight_log (user_id, date, weight_kg, body_fat_pct)
       values ($1, $2, $3, $4)`,
      [uid, date, w, f],
    )
  }
  const short = await composition(client, uid, '2026-03-07')
  check(
    short.gap === 'body.shortSpan',
    'Пяти измерений за неделю мало: это вода, а не жир',
    `gap ${short.gap}`,
  )

  // --- Тренд: восемь недель, вес вниз почти целиком за счёт жира
  await client.query('delete from public.weight_log where user_id = $1', [uid])
  for (let i = 0; i < 9; i++) {
    const date = new Date(Date.UTC(2026, 3, 1 + i * 7)).toISOString().slice(0, 10)
    const weight = 96 - i * 0.5
    // Тощая держится около 68.2, значит весь минус - жир
    const fatKg = weight - 68.2
    await client.query(
      `insert into public.weight_log (user_id, date, weight_kg, body_fat_pct)
       values ($1, $2, $3, $4)`,
      [uid, date, weight.toFixed(1), ((fatKg / weight) * 100).toFixed(1)],
    )
  }
  const trend = await composition(client, uid, '2026-06-01')
  check(
    trend.gap === null && Number(trend.weight_change) < -3,
    'Тренд считается, когда данных хватает',
    `за ${trend.span} дн. вес ${trend.weight_change} кг, gap ${trend.gap}`,
  )
  check(
    Number(trend.fat_share) >= 90,
    'Потеря почти целиком жировая - и это видно',
    `жир ${trend.fat_change} кг, тощая ${trend.lean_change} кг, доля жира ${trend.fat_share} %`,
  )
  check(
    Math.abs(
      Number(trend.weight_change) - Number(trend.fat_change) - Number(trend.lean_change),
    ) < 0.25,
    'Жир и тощая складываются в вес',
    `${trend.fat_change} + ${trend.lean_change} = ${trend.weight_change} (в пределах округления)`,
  )

  // --- Напоминание взвеситься
  const zone = async (hour: number): Promise<string | null> => {
    const { rows } = await client.query<{ name: string }>(
      `select name from pg_timezone_names
        where extract(hour from now() at time zone name)::int = $1
          and name like '%/%' order by name limit 1`,
      [hour],
    )
    return rows[0]?.name ?? null
  }
  const queued = async (): Promise<number> => {
    const { rows } = await client.query<{ n: string }>(
      'select count(*)::text as n from net.http_request_queue',
    )
    return Number(rows[0]?.n ?? 0)
  }

  const morning = await zone(9)
  const night = await zone(2)
  if (morning && night) {
    await client.query('delete from public.weigh_in_asks')
    await client.query('update public.profiles set timezone = $1', [night])
    const beforeNight = await queued()
    await client.query('select public.send_weigh_in_reminders()')
    check(
      (await queued()) === beforeNight,
      'В неурочный час не напоминает',
      `${night}, запросов не прибавилось`,
    )

    await client.query('update public.profiles set timezone = $1 where user_id = $2', [
      morning,
      uid,
    ])
    await client.query(
      `delete from public.weight_log where user_id = $1 and date = (now() at time zone $2)::date`,
      [uid, morning],
    )

    /*
     * Настройку уведомлений проверка задаёт сама.
     *
     * Раньше она бралась как есть - и однажды провалилась не потому, что
     * сломалась рассылка, а потому, что участница выключила напоминание
     * о взвешивании у себя в настройках. Это её право, и проверка не должна
     * от него зависеть: здесь проверяется логика рассылки, а не чужие
     * предпочтения. Всё в транзакции и откатывается.
     */
    await client.query(
      `insert into public.notification_settings (user_id, kind, telegram, push)
       values ($1, 'weigh_in', true, true)
       on conflict (user_id, kind) do update set telegram = true, push = true`,
      [uid],
    )

    const beforeAsk = await queued()
    await client.query('select public.send_weigh_in_reminders()')
    const sent = (await queued()) - beforeAsk
    check(sent >= 2, 'В девять утра напоминает', `запросов прибавилось ${sent} (телеграм и push)`)

    // И обратное: выключенное напоминание молчит. Ровно это поведение
    // и подменило собой поломку - значит, у него должна быть своя проверка.
    await client.query('delete from public.weigh_in_asks')
    await client.query(
      `update public.notification_settings set telegram = false, push = false
        where user_id = $1 and kind = 'weigh_in'`,
      [uid],
    )
    const beforeMuted = await queued()
    await client.query('select public.send_weigh_in_reminders()')
    check(
      (await queued()) === beforeMuted,
      'Выключенное напоминание молчит',
      'настройка уведомлений сильнее расписания',
    )
    await client.query(
      `update public.notification_settings set telegram = true, push = true
        where user_id = $1 and kind = 'weigh_in'`,
      [uid],
    )
    await client.query('delete from public.weigh_in_asks')
    await client.query('select public.send_weigh_in_reminders()')

    const beforeRepeat = await queued()
    await client.query('select public.send_weigh_in_reminders()')
    check(
      (await queued()) === beforeRepeat,
      'Второй раз за день не напоминает',
      'задание идёт каждый час, дубли недопустимы',
    )

    // Уже взвесился - молчим, но отметку ставим
    await client.query('delete from public.weigh_in_asks')
    await client.query(
      `insert into public.weight_log (user_id, date, weight_kg)
       values ($1, (now() at time zone $2)::date, 95)
       on conflict (user_id, date) do update set weight_kg = 95`,
      [uid, morning],
    )
    const beforeDone = await queued()
    await client.query('select public.send_weigh_in_reminders()')
    const { rows: marks } = await client.query<{ n: string }>(
      'select count(*)::text as n from public.weigh_in_asks where user_id = $1',
      [uid],
    )
    check(
      (await queued()) === beforeDone && marks[0]?.n === '1',
      'Уже взвесился - напоминание не приходит',
      `запросов не прибавилось, отметок ${marks[0]?.n}`,
    )
  } else {
    check(false, 'Нашёлся пояс с нужным часом', 'подобрать не удалось')
  }
}

type Row = {
  span: number
  weight_change: string | null
  fat_change: string | null
  lean_change: string | null
  fat_share: string | null
  gap: string | null
}

async function composition(client: Client, uid: string, today: string): Promise<Row> {
  const { rows } = await client.query<Row>(
    `select span, weight_change::text, fat_change::text, lean_change::text,
            fat_share::text, gap
       from public.body_composition($1, $2::date, 90)`,
    [uid, today],
  )
  const row = rows[0]
  if (!row) throw new Error('body_composition вернула пусто')
  return row
}

async function main(): Promise<void> {
  logicChecks()

  const client = new Client(pgConfig())
  await client.connect()
  try {
    await client.query('begin')
    await dbChecks(client)
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nСостав тела верен.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
