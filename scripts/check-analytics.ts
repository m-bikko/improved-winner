/**
 * Проверка счётчиков поверх дневника и веса.
 *
 *   pnpm tsx scripts/check-analytics.ts
 *
 * Эти три функции опаснее остальных в приложении, и вот почему: они не падают.
 * Ошибка в них не даёт ни исключения, ни пустого экрана - она даёт ЧИСЛО,
 * и число выглядит одинаково убедительно независимо от того, верное оно
 * или нет. Человек увидит «расход 2300» и построит на нём месяц еды.
 *
 * Поэтому здесь проверяется не «функция отвечает», а арифметика: данные
 * подкладываются такие, для которых правильный ответ известен заранее.
 *
 * Главный случай - пропущенные дни. День без записей это не день без еды,
 * и если среднее поделить на длину окна, расход уедет вниз в разы. Это самая
 * дорогая из возможных здесь ошибок: она всегда занижает норму, то есть
 * подталкивает есть меньше.
 *
 * Всё в транзакции и откатывается.
 */
import { Client } from 'pg'
import { pgConfig } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

/** Календарный сдвиг от якоря, чтобы не зависеть от текущей даты. */
function day(anchor: string, offset: number): string {
  const d = new Date(`${anchor}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()
  try {
    await client.query('begin')

    const { rows: members } = await client.query<{ user_id: string }>(
      'select user_id from public.app_members order by user_id',
    )
    const me = members[0]?.user_id
    if (!me) throw new Error('Нужен участник')

    const TODAY = '2026-06-30'
    const DAYS = 28

    // Чистим окно, чтобы настоящие записи не мешали арифметике
    await client.query(
      `delete from public.diary_entries where user_id = $1 and date between $2 and $3`,
      [me, day(TODAY, -(DAYS - 1)), TODAY],
    )
    await client.query(
      `delete from public.weight_log where user_id = $1 and date between $2 and $3`,
      [me, day(TODAY, -(DAYS - 1)), TODAY],
    )

    const eat = async (date: string, kcal: number): Promise<void> => {
      await client.query(
        // id генерирует клиент: он нужен офлайн-очереди, поэтому умолчания
        // у колонки нет
        `insert into public.diary_entries
           (id, user_id, date, meal, grams, name_snapshot,
            kcal_100, protein_100, fat_100, carbs_100)
         values (gen_random_uuid(), $1, $2, 'breakfast', 100, 'ТЕСТ', $3, 10, 10, 10)`,
        [me, date, kcal],
      )
    }
    const weigh = async (date: string, kg: number): Promise<void> => {
      await client.query(
        `insert into public.weight_log (user_id, date, weight_kg) values ($1, $2, $3)
         on conflict (user_id, date) do update set weight_kg = excluded.weight_kg`,
        [me, date, kg],
      )
    }
    const balance = async (): Promise<Record<string, string | null>> => {
      const { rows } = await client.query<Record<string, string | null>>(
        'select * from public.energy_balance($1, $2::date, $3)',
        [me, TODAY, DAYS],
      )
      return rows[0] ?? {}
    }

    // ---- Мало дней: считать нечего
    for (let i = 0; i < 10; i++) await eat(day(TODAY, -i), 2000)
    let r = await balance()
    check(
      r.gap === 'balance.fewDays' && r.tdee === null,
      'При десяти записанных днях расход не считается',
      `дней ${r.logged_days}, пропуск: ${r.gap}`,
    )

    // ---- Дыры в окне: доля записанных ниже порога
    for (let i = 10; i < 20; i++) await eat(day(TODAY, -i), 2000)
    r = await balance()
    check(
      r.gap === 'balance.gaps' && r.tdee === null,
      'При дырах больше пятой части окна расход не считается',
      `дней ${r.logged_days} из ${DAYS}, пропуск: ${r.gap}`,
    )

    // ---- Записи есть, взвешиваний нет
    for (let i = 20; i < DAYS; i++) await eat(day(TODAY, -i), 2000)
    r = await balance()
    check(
      r.gap === 'balance.fewWeights' && r.tdee === null,
      'Без взвешиваний расход не считается',
      `взвешиваний ${r.weigh_ins}, пропуск: ${r.gap}`,
    )

    // ---- Вес стоит: расход равен съеденному
    for (let i = 0; i < DAYS; i += 4) await weigh(day(TODAY, -i), 80)
    r = await balance()
    check(
      r.gap === null && Number(r.tdee) === 2000,
      'При стоящем весе расход равен съеденному',
      `съедено ${r.mean_kcal}, расход ${r.tdee}`,
    )

    // ---- Вес падает на 1 кг за 28 дней при 2000 ккал.
    // 1 кг ≈ 7700 ккал, размазанные по 27 дням между крайними точками:
    // расход ≈ 2000 + 7700/27 ≈ 2285
    await client.query(
      `delete from public.weight_log where user_id = $1 and date between $2 and $3`,
      [me, day(TODAY, -(DAYS - 1)), TODAY],
    )
    for (let i = 0; i < DAYS; i += 3) {
      const daysAgo = i
      await weigh(day(TODAY, -daysAgo), 80 + (daysAgo / (DAYS - 1)) * 1)
    }
    r = await balance()
    const expected = 2000 + 7700 / (DAYS - 1)
    check(
      r.gap === null && Math.abs(Number(r.tdee) - expected) < 15,
      'Снижение веса на килограмм поднимает расход на семь тысяч семьсот',
      `ожидалось ≈${Math.round(expected)}, получено ${r.tdee} (наклон ${r.slope} кг/день)`,
    )

    // ---- Пропущенный день не считается днём без еды.
    // Стираем половину дней и оставляем ту же еду в остальных: среднее
    // по записанным дням обязано не измениться
    const before = Number((await balance()).mean_kcal)
    await client.query(
      `delete from public.diary_entries
        where user_id = $1 and date between $2 and $3 and extract(day from date)::int % 2 = 0`,
      [me, day(TODAY, -(DAYS - 1)), TODAY],
    )
    const after = await balance()
    check(
      Number(after.mean_kcal) === before,
      'Пропущенный день не считается днём без еды',
      `среднее было ${before}, стало ${after.mean_kcal} (записанных дней ${after.logged_days})`,
    )

    // ---- Погрешность: на идеально прямом весе она близка к нулю,
    // на разбросанном - заметна
    await client.query('rollback')
    await client.query('begin')

    await client.query(
      `delete from public.diary_entries where user_id = $1 and date between $2 and $3`,
      [me, day(TODAY, -(DAYS - 1)), TODAY],
    )
    await client.query(
      `delete from public.weight_log where user_id = $1 and date between $2 and $3`,
      [me, day(TODAY, -(DAYS - 1)), TODAY],
    )
    for (let i = 0; i < DAYS; i++) await eat(day(TODAY, -i), 2000)
    for (let i = 0; i < DAYS; i += 3) await weigh(day(TODAY, -i), 80 + i * 0.02)
    const straight = Number((await balance()).tdee_error)

    await client.query(
      `delete from public.weight_log where user_id = $1 and date between $2 and $3`,
      [me, day(TODAY, -(DAYS - 1)), TODAY],
    )
    for (let i = 0; i < DAYS; i += 3) {
      await weigh(day(TODAY, -i), 80 + i * 0.02 + (i % 2 === 0 ? 0.8 : -0.8))
    }
    const noisy = Number((await balance()).tdee_error)
    check(
      straight < 30 && noisy > straight * 3,
      'Разброс взвешиваний виден в погрешности',
      `ровный вес: ±${straight} ккал, скачущий: ±${noisy} ккал`,
    )

    // ---- Сводка о себе.
    // Она спрашивает auth.uid(), а у прямого подключения его нет: подставляем
    // претензию так же, как это делает PostgREST
    await client.query('savepoint as_user')
    await client.query('set local role authenticated')
    await client.query(
      `select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)`,
      [me],
    )
    const { rows: sum } = await client.query<{ s: Record<string, unknown> }>(
      'select public.health_summary($1::date, 90) as s',
      [TODAY],
    )
    const s = sum[0]?.s ?? {}
    check(
      typeof s['diaryDays'] === 'number' && typeof s['weighIns'] === 'number',
      'Сводка о себе собирается',
      `дней в дневнике ${String(s['diaryDays'])}, взвешиваний ${String(s['weighIns'])}`,
    )

    // ---- Цикл x дневник: доступ и порог по числу дней
    let denied = false
    try {
      await client.query(
        'select * from public.cycle_diary_stats($1, $2::date, 6)',
        [members[1]?.user_id, TODAY],
      )
    } catch {
      denied = true
    }
    check(
      denied,
      'Чужой цикл в разрезе дневника закрыт',
      'без открытого доступа функция отказывает',
    )

    await client.query('rollback to savepoint as_user')

    // Выписка обязана быть про ВЫЗЫВАЮЩЕГО: чужого параметра у неё нет вовсе,
    // и подменить его нечем. Проверяем, что функция не принимает uuid
    const { rows: args } = await client.query<{ args: string }>(
      `select pg_get_function_identity_arguments(p.oid) as args
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'health_summary'`,
    )
    check(
      !(args[0]?.args ?? '').includes('uuid'),
      'Выписку нельзя запросить про другого',
      `аргументы: ${args[0]?.args}`,
    )
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nСчётчики верны.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
