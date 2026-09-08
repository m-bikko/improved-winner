/**
 * Проверка закономерностей «Как ты» x цикл.
 *
 *   pnpm tsx scripts/check-cycle-patterns.ts
 *
 * Это самая опасная функция из всех, что тут есть: она сообщает человеку
 * факт о его теле. Ошибись она - и он поверит, потому что проверить нечем:
 * своих отметок за четыре месяца никто в голове не держит.
 *
 * Главная ловушка - длина фаз. Лютеиновая вдвое длиннее фолликулярной,
 * и наивный подсчёт «где состояние встречалось чаще» назовёт её всегда,
 * для любого состояния. Поэтому здесь есть контрольное состояние, которое
 * отмечено КАЖДЫЙ день: если оно попало в находки, статистика считает
 * количество вместо частоты и её надо чинить.
 *
 * Данные синтетические, всё в транзакции и откатывается.
 */
import { Client, type QueryResultRow } from 'pg'
import { pgConfig } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

type Pattern = {
  state: string
  phase: string
  hits: number
  days_in_phase: number
  observed_days: number
  rate: string
  other_rate: string
  ratio: string
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

    // Уведомление об отметке нам тут только мешает: сто пятьдесят вставок
    // подряд - это не сто пятьдесят событий
    await client.query('alter table public.checkins disable trigger checkin_notify')
    await client.query('delete from public.checkins')
    await client.query('delete from public.periods')

    const TODAY = '2026-06-30'
    const START = '2026-02-01'

    await client.query(
      `insert into public.cycle_settings (user_id, tracking_enabled, share_with_partner, luteal_days)
       values ($1, true, false, 14)
       on conflict (user_id) do update
         set tracking_enabled = true, share_with_partner = false, luteal_days = 14`,
      [a.user_id],
    )

    // Ровный цикл 28 дней, менструация 5 дней - чтобы фазы были предсказуемы
    await client.query(
      `insert into public.periods (user_id, started_on, ended_on)
       select $1, d::date, (d::date + 4)
         from generate_series($2::date, $3::date, interval '28 days') d`,
      [a.user_id, START, TODAY],
    )

    const phases = await q<{ phase: string; n: string }>(
      `select s.phase, count(*)::text as n
         from generate_series($2::date, $3::date, interval '1 day') d
         cross join lateral public.cycle_state($1, d::date) s
        where s.day between 1 and 45
        group by s.phase order by s.phase`,
      [a.user_id, START, TODAY],
    )
    const phaseMap = new Map(phases.map((p) => [p.phase, Number(p.n)]))
    check(
      (phaseMap.get('luteal') ?? 0) > (phaseMap.get('follicular') ?? 0),
      'Фазы разной длины - ловушка на месте',
      phases.map((p) => `${p.phase} ${p.n}`).join(', '),
    )

    /*
     * Отметки:
     *   calm     - каждый день. Контроль: находкой быть НЕ должен.
     *   headache - только на 24-27 день, то есть глубоко в лютеиновой.
     *   joy      - каждый третий день независимо от фазы.
     *   rare     - дважды, обе в лютеиновой: ниже порога в три попадания.
     */
    await client.query(
      `insert into public.checkins (user_id, date, states)
       select $1, d::date,
              array_remove(array[
                'calm',
                case when s.day between 24 and 27 then 'headache' end,
                case when (d::date - $2::date) % 3 = 0 then 'joy' end,
                case when s.day = 26 and (d::date - $2::date) < 60 then 'lonely' end
              ], null)
         from generate_series($2::date, $3::date, interval '1 day') d
         cross join lateral public.cycle_state($1, d::date) s
        where s.day between 1 and 45`,
      [a.user_id, START, TODAY],
    )

    // Функция сама проверяет доступ по auth.uid(), а у прямого подключения
    // его нет. Подменяем claim, роль при этом не трогаем: RLS тут ни при чём,
    // функция security definer
    const as = async (uid: string): Promise<void> => {
      await client.query(
        `select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)`,
        [uid],
      )
    }
    await as(a.user_id)

    const found = await q<Pattern>(
      'select * from public.checkin_cycle_patterns($1, $2, 12)',
      [a.user_id, TODAY],
    )
    const line = (p: Pattern): string =>
      `${p.state}/${p.phase}: ${p.hits} из ${p.days_in_phase} дней фазы, в ${p.ratio} раза чаще`

    console.log(
      found.length === 0 ? '         (находок нет)' : found.map((p) => '         ' + line(p)).join('\n'),
    )

    const headache = found.find((p) => p.state === 'headache')
    check(
      headache !== undefined && headache.phase === 'luteal',
      'Головная боль найдена и привязана к лютеиновой фазе',
      headache ? line(headache) : 'не найдена',
    )
    check(
      headache !== undefined && Number(headache.ratio) >= 5,
      'Перевес назван крупным, а не «чуть чаще»',
      headache ? `в ${headache.ratio} раза чаще, чем вне фазы` : '-',
    )

    check(
      !found.some((p) => p.state === 'calm'),
      'Состояние, отмеченное каждый день, находкой НЕ стало',
      'иначе считалось бы количество вместо частоты, и длинная фаза побеждала бы всегда',
    )
    check(
      !found.some((p) => p.state === 'joy'),
      'Равномерно разбросанное состояние находкой НЕ стало',
      'каждый третий день - это не закономерность цикла',
    )
    check(
      !found.some((p) => p.state === 'lonely'),
      'Два совпадения ниже порога',
      'красивая закономерность из двух точек - шум, а человек примет её за факт',
    )

    // --- приватность ------------------------------------------------------
    check(
      (await q('select 1 from public.checkin_cycle_patterns($1, $2, 12)', [a.user_id, TODAY]))
        .length > 0,
      'Владелец свои закономерности видит',
      'это его данные',
    )

    await as(b.user_id)
    await client.query('savepoint p')
    try {
      await q('select 1 from public.checkin_cycle_patterns($1, $2, 12)', [a.user_id, TODAY])
      await client.query('rollback to savepoint p')
      check(false, 'Партнёру без разрешения отказано', 'ВЫВОДЫ УТЕКЛИ')
    } catch (e) {
      await client.query('rollback to savepoint p')
      check(true, 'Партнёру без разрешения отказано', (e as Error).message.split('\n')[0] ?? '')
    }

    await client.query(
      'update public.cycle_settings set share_with_partner = true where user_id = $1',
      [a.user_id],
    )
    check(
      (await q('select 1 from public.checkin_cycle_patterns($1, $2, 12)', [a.user_id, TODAY]))
        .length > 0,
      'С разрешения партнёр видит',
      'доступ наследуется от самого цикла, а не заводится заново',
    )
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nЗакономерности верны.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
