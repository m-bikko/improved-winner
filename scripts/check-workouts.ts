/**
 * Проверка тренировок.
 *
 *   pnpm tsx scripts/check-workouts.ts
 *
 * Две вещи, которые тут ломаются молча.
 *
 * Словарь видов продублирован в CHECK у таблицы и в интерфейсе. Разойдись
 * они - и человек нажмёт кнопку, а база откажет; ошибку Postgres покажет
 * форма, и виноватым будет выглядеть он. Ровно та же ловушка, что
 * у состояний в «Как ты».
 *
 * Расход хранится снимком. Если однажды его начнут считать на лету,
 * изменение веса перепишет все прошлые тренировки - и заметить это будет
 * нечем, потому что числа останутся правдоподобными.
 *
 * Всё в транзакции и откатывается.
 */
import { readFileSync } from 'node:fs'
import { Client, type QueryResultRow } from 'pg'
import { pgConfig } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()

  const q = async <T extends QueryResultRow>(sql: string, p: unknown[] = []): Promise<T[]> =>
    (await client.query<T>(sql, p)).rows
  const one = async (sql: string, p: unknown[] = []): Promise<string> =>
    (await q<{ v: string }>(sql, p))[0]?.v ?? ''

  const mustFail = async (name: string, sql: string, p: unknown[] = []): Promise<void> => {
    await client.query('savepoint s')
    try {
      await client.query(sql, p)
      await client.query('rollback to savepoint s')
      check(false, name, 'прошло, хотя должно было упасть')
    } catch (e) {
      await client.query('rollback to savepoint s')
      check(true, name, (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? '')
    }
  }

  try {
    await client.query('begin')

    const members = await q<{ user_id: string }>(
      'select user_id from public.app_members order by user_id',
    )
    const [a, b] = members
    if (!a || !b) throw new Error('Нужны два участника')

    // --- словарь ----------------------------------------------------------
    const src = readFileSync('src/features/diary/workouts.ts', 'utf8')
    const uiIds = [...src.matchAll(/\bid: '([a-z]+)'/g)].map((m) => m[1])
    const def = await one(
      `select pg_get_constraintdef(oid) as v from pg_constraint
        where conname = 'workouts_kind_check'`,
    )
    const dbIds = [...def.matchAll(/'([a-z]+)'::text/g)].map((m) => m[1])
    const onlyUi = uiIds.filter((i) => !dbIds.includes(i))
    const onlyDb = dbIds.filter((i) => !uiIds.includes(i))
    check(
      onlyUi.length === 0 && onlyDb.length === 0 && uiIds.length > 0,
      'Словарь видов в базе и в интерфейсе совпадает',
      `в форме ${uiIds.length}, в базе ${dbIds.length}` +
        (onlyUi.length ? `, только в форме: ${onlyUi.join(', ')}` : '') +
        (onlyDb.length ? `, только в базе: ${onlyDb.join(', ')}` : ''),
    )

    // У каждого вида должен быть коэффициент, иначе оценка молча даст null
    const mets = [...src.matchAll(/met: ([\d.]+)/g)].map((m) => Number(m[1]))
    check(
      mets.length === uiIds.length && mets.every((m) => m >= 1 && m <= 20),
      'У каждого вида есть правдоподобный МЕТ',
      `видов ${uiIds.length}, коэффициентов ${mets.length}, диапазон ${Math.min(...mets)}-${Math.max(...mets)}`,
    )

    // --- ограничения ------------------------------------------------------
    const ins = `insert into public.workouts (user_id, date, kind, minutes, kcal)
                 values ($1, $2, $3, $4, $5)`

    await mustFail('Неизвестный вид отвергается', ins, [a.user_id, '2026-05-10', 'квиддич', 60, 300])
    await mustFail('Ноль минут отвергается', ins, [a.user_id, '2026-05-10', 'gym', 0, 300])
    await mustFail('Одиннадцать часов отвергаются', ins, [a.user_id, '2026-05-10', 'gym', 700, 300])
    await mustFail('Отрицательный расход отвергается', ins, [a.user_id, '2026-05-10', 'gym', 60, -1])
    await mustFail('Расход в 6000 ккал отвергается', ins, [a.user_id, '2026-05-10', 'gym', 60, 6000])

    // Нулевой расход разрешён: иногда важен сам факт
    await client.query('savepoint ok')
    await client.query(ins, [a.user_id, '2026-05-10', 'stretch', 15, 0])
    check(true, 'Нулевой расход принимается', 'важен сам факт занятия')
    await client.query('rollback to savepoint ok')

    // --- снимок -----------------------------------------------------------
    await client.query(ins, [a.user_id, '2026-05-10', 'gym', 60, 350])
    const before = await one(
      `select kcal::text as v from public.workouts where user_id = $1 and date = '2026-05-10'`,
      [a.user_id],
    )
    await client.query('update public.profiles set weight_kg = weight_kg + 20 where user_id = $1', [
      a.user_id,
    ])
    const after = await one(
      `select kcal::text as v from public.workouts where user_id = $1 and date = '2026-05-10'`,
      [a.user_id],
    )
    check(
      before === after && before === '350.0',
      'Смена веса не переписывает прошлые тренировки',
      `было ${before}, стало ${after} - расход хранится снимком`,
    )

    // --- права ------------------------------------------------------------
    await client.query('set local role authenticated')
    const as = async (uid: string): Promise<void> => {
      await client.query(
        `select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)`,
        [uid],
      )
    }

    await as(b.user_id)
    check(
      (await q(`select 1 from public.workouts where user_id = $1`, [a.user_id])).length === 1,
      'Партнёр видит чужие тренировки',
      'как и дневник питания: читают оба',
    )
    const touched = await q(
      `update public.workouts set minutes = 5 where user_id = $1 returning id`,
      [a.user_id],
    )
    check(touched.length === 0, 'Партнёр НЕ правит чужие тренировки', 'пишет каждый своё')
    const wiped = await q(`delete from public.workouts where user_id = $1 returning id`, [
      a.user_id,
    ])
    check(wiped.length === 0, 'Партнёр НЕ удаляет чужие тренировки', 'то же правило')

    await as(a.user_id)
    const own = await q(`delete from public.workouts where user_id = $1 returning id`, [a.user_id])
    check(own.length === 1, 'Свою тренировку удалить можно', 'запись остаётся своей')
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nТренировки верны.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
