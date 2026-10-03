/**
 * Проверка «Здоровья и аптечки».
 *
 * Карточку видят оба, правит владелец. Время приёма - «HH:MM» по
 * возрастанию без повторов. Приём отмечает только тот, чьё лекарство,
 * и только по расписанию и в сроки. Напоминание - в назначенное время
 * по поясу человека, если приём не отмечен, и один раз.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { check, finish, inTransaction } from './harness.ts'

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru', timezone = 'Asia/Almaty'`)
  await db.q('delete from public.medications')
  await db.q('delete from public.health_cards')

  await db.as(a)
  await db.q(`insert into public.health_cards (user_id, blood_type, allergies) values ($1, 'A+', 'пенициллин')`, [a])
  await db.mustFail('Группа крови - из списка', `update public.health_cards set blood_type = 'C+' where user_id = $1`, [a], 'health_cards_blood_type_check')
  await db.mustFail('Время - HH:MM', `insert into public.medications (name, times, starts_on) values ('Т', '{8:00}', '2031-01-01')`, [], 'medications_times_check')
  await db.mustFail(
    'Время - по возрастанию и без повторов',
    `insert into public.medications (name, times, starts_on) values ('Т', '{20:00,08:00}', '2031-01-01')`,
    [],
    'medications_times_check',
  )
  await db.mustFail(
    'Срок не кончается раньше начала',
    `insert into public.medications (name, times, starts_on, ends_on) values ('Т', '{08:00}', '2031-01-10', '2031-01-01')`,
    [],
    'medications_period',
  )
  const med = await db.one(
    `insert into public.medications (name, dose, times, starts_on, ends_on) values ('Фолиевая', '1 таблетка', '{08:30,20:00}', '2031-01-01', '2031-01-31') returning id::text`,
  )
  await db.mustFail('Приём не по расписанию', `insert into public.med_doses (medication_id, day, slot) values ($1, '2031-01-05', '09:00')`, [med], 'med_doses_guard')
  await db.mustFail('Приём вне срока', `insert into public.med_doses (medication_id, day, slot) values ($1, '2031-02-05', '08:30')`, [med], 'med_doses_guard')
  await db.q(`insert into public.med_doses (medication_id, day, slot) values ($1, '2031-01-05', '08:30')`, [med])

  await db.as(b)
  check((await db.q(`select allergies from public.health_cards where user_id = $1`, [a])).length === 1, 'Карточку второго видно', 'в этом весь смысл')
  check((await db.q(`update public.health_cards set allergies = 'нет' where user_id = $1 returning 1`, [a])).length === 0, 'Но правит её только владелец', '0 строк')
  check((await db.q(`select 1 from public.med_doses where medication_id = $1`, [med])).length === 1, 'Принято ли - видно второму', '1')
  await db.mustFail(
    'Галочку за другого не поставить',
    `insert into public.med_doses (medication_id, day, slot) values ($1, '2031-01-05', '20:00')`,
    [med],
    'row-level security',
  )
  await db.q(`insert into public.doctors (name, specialty, phone, person_id) values ('Иванова А.', 'гинеколог', '+7 701 000-00-00', $1)`, [a])
  await db.mustFail('Телефон - цифрами', `insert into public.doctors (name, phone) values ('Х', 'звонить вечером')`, [], 'doctors_phone_check')

  // Напоминания
  await db.asOwner()
  const fire = async (at: string): Promise<number> => Number(await db.one('select public.send_med_reminders($1::timestamptz)', [at]))
  check((await fire('2031-01-06 08:20:00+05')) === 0, 'До времени - тихо', '08:20')
  const n1 = await fire('2031-01-06 08:33:00+05')
  const p = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string; body: string; url: string })
  check(
    n1 === 1 && p[0]?.userId === a && p[0]?.title === 'Пора: Фолиевая' && p[0]?.url === '/health',
    'В назначенное время - напоминание владельцу',
    `${p[0]?.title} / ${p[0]?.body}`,
  )
  check((await fire('2031-01-06 08:38:00+05')) === 0, 'Один раз на приём', '0')
  check((await fire('2031-01-05 08:33:00+05')) === 0, 'Принято - не напоминаем', 'отметка уже стоит')
  check((await fire('2031-02-06 08:33:00+05')) === 0, 'Курс закончился - не напоминаем', 'после ends_on')
  check((await fire('2031-01-06 08:50:00+05')) === 0, 'Пропустили окно - не догоняем', 'старое напоминание бесполезно')
})

finish('Здоровье и аптечка')
