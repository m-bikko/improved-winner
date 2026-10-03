/**
 * Проверка «Малыша».
 *
 * Рождение закрывает режим беременности само - но не чужую (рождение
 * раньше начала этой беременности). Событие - одной из трёх форм:
 * у подгузника нет конца и стороны, у кормления есть сторона, объём -
 * только у бутылочки. Идущее кормление или сон - одно на малыша.
 * Событие раньше рождения - опечатка. Ведут оба.
 *
 * Всё в транзакции и откатывается.
 */
import { ageOf, sinceLabel } from '../src/features/baby/logic.ts'
import { check, finish, inTransaction } from './harness.ts'

check(ageOf('2031-01-10', '2031-01-10').days === 0, 'В день рождения - 0 дней', 'а не «1»')
const age = ageOf('2031-01-10', '2031-03-15')
check(age.months === 2 && age.days === 5, 'Возраст - месяцы и дни', `${age.months} мес ${age.days} дн`)
const feb = ageOf('2031-01-31', '2031-02-28')
check(feb.months === 1 && feb.days === 0, 'Родился 31-го - месяц в последний день февраля', `${feb.months} мес ${feb.days} дн`)
const mar = ageOf('2031-01-31', '2031-03-30')
check(mar.months === 1 && mar.days === 30, 'И месяц не «перепрыгивает»: 30 марта - 1 мес 30 дн', `${mar.months} мес ${mar.days} дн`)
const mar31 = ageOf('2031-01-31', '2031-03-31')
check(mar31.months === 2 && mar31.days === 0, '31 марта - ровно два', `${mar31.months} мес ${mar31.days} дн`)
check(sinceLabel(135) === '2:15', 'Сколько прошло - часы и минуты', sinceLabel(135))

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q('delete from public.babies')
  await db.q('delete from public.pregnancy')
  await db.q(`insert into public.pregnancy (id, mother_id, lmp, started_by) values (true, $1, '2030-04-01', $1)`, [a])

  await db.as(a)
  // Старший ребёнок - не эта беременность
  await db.q(`insert into public.babies (name, born_on) values ('Старший', '2028-05-01')`)
  check(
    (await db.one('select coalesce(ended_on::text, \'\') from public.pregnancy')) === '',
    'Рождение раньше этой беременности её не закрывает',
    'добавили старшего',
  )
  const baby = await db.one(`insert into public.babies (name, sex, born_on, weight_g, height_cm) values ('Алихан', 'm', '2031-01-06', 3450, 52) returning id::text`)
  check((await db.one('select ended_on::text from public.pregnancy')) === '2031-01-06', 'Малыш родился - беременность закрыта сама', '2031-01-06')

  await db.mustFail(
    'У подгузника нет стороны',
    `insert into public.baby_events (baby_id, kind, started_at, diaper, side) values ($1, 'diaper', '2031-01-07 10:00+05', 'wet', 'left')`,
    [baby],
    'baby_events_shape',
  )
  await db.mustFail(
    'Объём - только у бутылочки',
    `insert into public.baby_events (baby_id, kind, started_at, side, amount_ml) values ($1, 'feed', '2031-01-07 10:00+05', 'left', 60)`,
    [baby],
    'baby_events_shape',
  )
  await db.mustFail(
    'Событие раньше рождения - опечатка',
    `insert into public.baby_events (baby_id, kind, started_at, diaper) values ($1, 'diaper', '2030-12-01 10:00+05', 'wet')`,
    [baby],
    'baby_events_guard',
  )
  await db.q(`insert into public.baby_events (baby_id, kind, started_at, side) values ($1, 'feed', '2031-01-07 10:00+05', 'left')`, [baby])
  await db.mustFail(
    'Идущее кормление - одно',
    `insert into public.baby_events (baby_id, kind, started_at, side) values ($1, 'feed', '2031-01-07 10:05+05', 'right')`,
    [baby],
    'baby_events_one_running',
  )
  await db.q(`insert into public.baby_events (baby_id, kind, started_at) values ($1, 'sleep', '2031-01-07 10:10+05')`, [baby])
  await db.q(
    `insert into public.baby_events (baby_id, kind, started_at, diaper) values ($1, 'diaper', '2031-01-07 10:20+05', 'wet'), ($1, 'diaper', '2031-01-07 10:40+05', 'dirty')`,
    [baby],
  )

  await db.as(b)
  const stopped = await db.q(
    `update public.baby_events set ended_at = '2031-01-07 10:25+05' where baby_id = $1 and kind = 'feed' and ended_at is null returning 1`,
    [baby],
  )
  check(stopped.length === 1, 'Таймер, начатый одним, заканчивает второй', 'ведут оба')
  await db.mustFail(
    'Конец не раньше начала',
    `update public.baby_events set ended_at = '2031-01-07 09:00+05' where baby_id = $1 and kind = 'sleep'`,
    [baby],
    'baby_events_order',
  )
  await db.mustFail(
    'Сон - не больше 12 часов одной записью',
    `update public.baby_events set ended_at = '2031-01-08 10:00+05' where baby_id = $1 and kind = 'sleep'`,
    [baby],
    'baby_events_order',
  )
  await db.q(`insert into public.baby_growth (baby_id, date, weight_g) values ($1, '2031-01-20', 3900)`, [baby])
  await db.mustFail('Замер - хотя бы одно число', `insert into public.baby_growth (baby_id, date) values ($1, '2031-01-21')`, [baby], 'baby_growth_something')
  await db.q(`insert into public.baby_checkups (baby_id, date, kind, title) values ($1, '2031-03-06', 'vaccine', 'По календарю поликлиники')`, [baby])
  check((await db.q('select 1 from public.baby_checkups where baby_id = $1', [baby])).length === 1, 'Прививки - записью, а не выдуманным календарём', '1')
})

finish('Малыш')
