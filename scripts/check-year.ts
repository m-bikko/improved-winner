/**
 * Проверка «Года в цифрах».
 *
 *   pnpm tsx scripts/check-year.ts
 *
 * Сводка опасна тем, что выглядит правдоподобно при любой ошибке: никто
 * не помнит, сколько дней подряд отмечался в марте, и проверить число
 * глазами нельзя. Поэтому данные синтетические и все ответы известны заранее.
 *
 * Отдельно проверяем, что серия считается тем же способом, что и огонёк:
 * восстановленный день закрывает разрыв. Разойдись эти два определения -
 * и годовой итог противоречил бы числу, которое человек видел весь год.
 *
 * Всё в транзакции и откатывается.
 */
import { Client, type QueryResultRow } from 'pg'
import { pgConfig } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

type Person = {
  userId: string
  nickname: string
  checkinDays: number
  bestStreak: number
  topStates: { id: string; n: number }[]
  diaryDays: number
  avgKcal: number | null
  topFoods: { name: string; n: number }[]
  workouts: number
  workoutMinutes: number
  workoutKcal: number
}
type Summary = {
  year: number
  people: Person[]
  together: Record<string, number>
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()

  const q = async <T extends QueryResultRow>(sql: string, p: unknown[] = []): Promise<T[]> =>
    (await client.query<T>(sql, p)).rows

  try {
    await client.query('begin')

    const members = await q<{ user_id: string }>(
      'select user_id from public.app_members order by user_id',
    )
    const [a, b] = members
    if (!a || !b) throw new Error('Нужны два участника')

    await client.query('alter table public.checkins disable trigger checkin_notify')
    for (const t of ['checkins', 'checkin_restores', 'workouts', 'diary_entries']) {
      await client.query(`delete from public.${t}`)
    }

    /*
     * Мир 2026 года у первого участника:
     *   10-14 января - пять дней подряд
     *   16 января    - пропуск 15-го ВОССТАНОВЛЕН, значит 10-18 это девятка
     *   17-18 января
     *   1 марта      - одиночная отметка
     * Итого закрытых дней: 5 + 1 + 2 + 1 + 1 (восстановление) = 10
     * Лучшая серия: 9
     */
    const days = ['10', '11', '12', '13', '14', '16', '17', '18']
    for (const d of days) {
      await client.query(
        `insert into public.checkins (user_id, date, states) values ($1, $2, array['joy','sore'])`,
        [a.user_id, `2026-01-${d}`],
      )
    }
    await client.query(
      `insert into public.checkins (user_id, date, states) values ($1, '2026-03-01', array['joy'])`,
      [a.user_id],
    )
    await client.query(
      `insert into public.checkin_restores (user_id, date, slot) values ($1, '2026-01-15', 1)`,
      [a.user_id],
    )
    // Соседний год не должен подмешиваться
    await client.query(
      `insert into public.checkins (user_id, date, states) values ($1, '2025-12-31', array['sad'])`,
      [a.user_id],
    )

    const read = async (year: number): Promise<Summary> =>
      (await q<{ v: Summary }>('select public.year_in_numbers($1) as v', [year]))[0]!.v

    let s = await read(2026)
    const me = s.people.find((p) => p.userId === a.user_id)!

    check(me.checkinDays === 10, 'Закрытые дни посчитаны', `${me.checkinDays}, ожидалось 10`)
    check(
      me.bestStreak === 9,
      'Восстановленный день склеивает серию',
      `лучшая серия ${me.bestStreak}, ожидалось 9 - то же определение, что у огонька`,
    )
    check(
      me.topStates[0]?.id === 'joy' && me.topStates[0]?.n === 9,
      'Частые состояния отсортированы',
      me.topStates.map((x) => `${x.id} ${x.n}`).join(', '),
    )
    check(me.topStates.length <= 3, 'Не больше трёх состояний', `${me.topStates.length}`)

    const other = s.people.find((p) => p.userId === b.user_id)!
    check(
      other.checkinDays === 0 && other.bestStreak === 0,
      'Второй участник считается отдельно',
      'чужие отметки в мою сводку не попадают',
    )

    s = await read(2025)
    const past = s.people.find((p) => p.userId === a.user_id)!
    check(
      past.checkinDays === 1,
      'Год действительно фильтрует',
      `в 2025-м ${past.checkinDays} день, а не все подряд`,
    )

    // --- дневник и тренировки --------------------------------------------
    await client.query(
      // id генерирует клиент - у колонки нет умолчания, и это не упущение:
      // на нём держится идемпотентность офлайн-очереди
      `insert into public.diary_entries
         (id, user_id, date, meal, grams, name_snapshot, kcal_100, protein_100, fat_100, carbs_100)
       select gen_random_uuid(), $1, d::date, 'lunch', 200, x.name, 100, 10, 5, 10
         from generate_series('2026-02-01'::date, '2026-02-04'::date, interval '1 day') d
         cross join (values ('Рис'), ('Рис'), ('Курица')) x(name)`,
      [a.user_id],
    )
    await client.query(
      `insert into public.workouts (user_id, date, kind, minutes, kcal) values
         ($1, '2026-02-01', 'gym', 60, 300),
         ($1, '2026-02-03', 'run', 30, 250)`,
      [a.user_id],
    )

    s = await read(2026)
    const p = s.people.find((x) => x.userId === a.user_id)!
    check(
      p.diaryDays === 4,
      'Дни дневника считаются по датам, а не по записям',
      `${p.diaryDays} дней при 12 записях`,
    )
    check(
      p.avgKcal === 600,
      'Средние калории делятся на дни, а не на записи',
      `${p.avgKcal}, ожидалось 600 (три порции по 200 ккал в день)`,
    )
    check(
      p.topFoods[0]?.name === 'Рис' && p.topFoods[0]?.n === 8,
      'Частые продукты отсортированы',
      p.topFoods.map((f) => `${f.name} ${f.n}`).join(', '),
    )
    check(
      p.workouts === 2 && p.workoutMinutes === 90 && p.workoutKcal === 550,
      'Тренировки просуммированы',
      `${p.workouts} шт, ${p.workoutMinutes} мин, ${p.workoutKcal} ккал`,
    )
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nГод в цифрах верен.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
