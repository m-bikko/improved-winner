/**
 * Проверка копилки.
 *
 *   pnpm tsx scripts/check-savings.ts
 *
 * Инвариант один и главный: в копилке не бывает меньше нуля - ни изъятием
 * больше отложенного, ни удалением старого вклада задним числом. Его держит
 * база. Дальше - чужие деньги не правятся, уведомление говорит сумму
 * по-человечески («20 000 ₸»), а пересечение цели - отдельным событием.
 * Плюс арифметика темпа и прогноза.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { setActiveLang } from '../src/lib/i18n/lang.ts'
import { forecastDate, formatMoney, onTrack, perMonthNeeded, progressOf, savedOf, shareOf, type Goal } from '../src/features/savings/logic.ts'
import { check, finish, inTransaction } from './harness.ts'

// --- арифметика --------------------------------------------------------------

const goal = (deposits: [string, number, string][], extra: Partial<Goal> = {}): Goal => ({
  id: 'g',
  title: 'Отпуск',
  icon: 'trip',
  target: 300_000,
  currency: 'KZT',
  deadline: null,
  createdBy: 'a',
  createdAt: '',
  archivedAt: null,
  deposits: deposits.map(([userId, amount, date], i) => ({ id: String(i), goalId: 'g', userId, amount, date, note: null, createdAt: '' })),
  ...extra,
})

const g = goal([
  ['a', 50_000, '2026-09-01'],
  ['b', 30_000, '2026-09-15'],
  ['a', -10_000, '2026-09-20'],
])
check(savedOf(g) === 70_000 && shareOf(g, 'a') === 40_000 && shareOf(g, 'b') === 30_000, 'Сумма и вклад каждого - с изъятиями', '50 000 + 30 000 - 10 000')
check(Math.abs(progressOf(g) - 70_000 / 300_000) < 1e-9 && progressOf(goal([['a', 400_000, '2026-09-01']])) === 1, 'Доля не больше единицы', 'перевыполнение - полная банка')

const need = perMonthNeeded({ ...g, deadline: '2027-03-01' }, '2026-10-01')
check(need !== null && need > 40_000 && need < 50_000, 'К сроку через 5 месяцев - примерно по 46 000 в месяц', `${need}`)
check(perMonthNeeded({ ...g, deadline: '2026-09-01' }, '2026-10-01') === null, 'Срок прошёл - «по N в месяц» не показывается', 'null')

check(forecastDate(goal([['a', 10_000, '2026-09-28']]), '2026-10-01') === null, 'По трём дням истории прогноза нет', 'нужно хотя бы две недели')
const steady = goal([
  ['a', 50_000, '2026-08-01'],
  ['b', 50_000, '2026-09-01'],
])
const f = forecastDate(steady, '2026-10-01')
check(f !== null && f > '2026-12-01' && f < '2027-02-01', 'Темп 100 000 за два месяца - цель примерно к январю', `${f}`)
check(onTrack({ ...steady, deadline: '2026-11-01' }, '2026-10-01') === false, 'Не успеваем к сроку - так и сказано', 'onTrack = false')

setActiveLang('ru')
const ru = formatMoney(20_000, 'KZT')
setActiveLang('en')
const en = formatMoney(20_000, 'KZT')
check(ru.includes('₸') && /20\s000/.test(ru) && en.includes('₸') && en.includes('20,000'), 'Сумма по правилам языка и со знаком тенге', `ru «${ru}», en «${en}»`)
setActiveLang('ru')

// --- база --------------------------------------------------------------------

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  await db.q(`update public.profiles set sex = 'female' where user_id = $1`, [a])

  check(
    (await db.one(`select public.money_fmt(1234567.5, 'KZT')`)) === '1 234 567,50 ₸' &&
      (await db.one(`select public.money_fmt(20000, 'USD')`)) === '20 000 $',
    'В уведомлениях сумма с разрядами и знаком валюты',
    await db.one(`select public.money_fmt(1234567.5, 'KZT')`),
  )

  await db.mustFail(
    'Цель без суммы отвергается',
    `insert into public.savings_goals (title, icon, target, currency, created_by) values ('x', 'trip', 0, 'KZT', $1)`,
    [a],
    'savings_goals_target_check',
  )
  await db.mustFail(
    'Неизвестная валюта отвергается',
    `insert into public.savings_goals (title, icon, target, currency, created_by) values ('x', 'trip', 100, 'BTC', $1)`,
    [a],
    'savings_goals_currency_check',
  )

  await db.as(a)
  const id = await db.one(
    `insert into public.savings_goals (title, icon, target, currency, created_by) values ('Отпуск', 'trip', 100000, 'KZT', $1) returning id::text`,
    [a],
  )
  await db.mustFail(
    'Нулевой вклад отвергается',
    `insert into public.savings_deposits (goal_id, user_id, amount, date) values ($1, $2, 0, '2031-01-01')`,
    [id, a],
    'savings_deposits_amount_check',
  )

  const before = await db.queued()
  const first = await db.one(
    `insert into public.savings_deposits (goal_id, user_id, amount, date) values ($1, $2, 20000, '2031-01-01') returning id::text`,
    [id, a],
  )
  const p1 = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string; body: string })
  check(
    (await db.queued()) > before && p1[0]?.userId === b && p1[0]?.title === 'Аминош отложила 20 000 ₸' && (p1[0]?.body ?? '').includes('20%'),
    'Второму: кто, сколько и процент цели',
    `${p1[0]?.title} / ${p1[0]?.body}`,
  )

  await db.mustFail(
    'Взять больше, чем отложено, нельзя',
    `insert into public.savings_deposits (goal_id, user_id, amount, date) values ($1, $2, -30000, '2031-01-02')`,
    [id, a],
    'savings_not_negative',
  )

  await db.as(b)
  await db.q(`insert into public.savings_deposits (goal_id, user_id, amount, date) values ($1, $2, -5000, '2031-01-02')`, [id, b])
  check(true, 'Изъятие в пределах отложенного проходит', '20 000 - 5 000')
  const touched = await db.q(`update public.savings_deposits set amount = 1 where id = $1 returning 1`, [first])
  const gone = await db.q(`delete from public.savings_deposits where id = $1 returning 1`, [first])
  check(touched.length === 0 && gone.length === 0, 'Чужой вклад не правится и не удаляется', 'RLS молча не находит строку')

  await db.as(a)
  await db.mustFail(
    'Удалить старый вклад, если без него копилка уйдёт в минус, нельзя',
    `delete from public.savings_deposits where id = $1`,
    [first],
    'savings_not_negative',
  )

  await db.q(`insert into public.savings_deposits (goal_id, user_id, amount, date) values ($1, $2, 90000, '2031-01-03')`, [id, a])
  const p2 = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string; body: string })
  check(
    p2[0]?.title === 'Цель достигнута' && (p2[0]?.body ?? '').includes('105 000 ₸'),
    'Вклад, которым набрана цель, - отдельное событие',
    `${p2[0]?.title} / ${p2[0]?.body}`,
  )
})

finish('Копилка')
