/**
 * Проверка «Готовимся к малышу».
 *
 *   pnpm tsx scripts/check-prep.ts
 *
 * Здесь важнее всего две вещи. Окно: экран говорит «сейчас благоприятные
 * дни», и сказать это не тогда хуже, чем промолчать, - поэтому окно берётся
 * из того же расчёта, что у раздела цикла, и при задержке его нет вовсе.
 * И напоминание о витаминах: только тем, кто ими пользуется, - иначе оно
 * приходило бы каждый день человеку, которому их не назначали.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { shiftDays } from '../src/lib/date.ts'
import { cycleDay, type Period } from '../src/features/cycle/cycle.ts'
import { PREP_ITEMS, itemsFor } from '../src/features/prep/items.ts'
import { nextWindow, vitaminDaysSince, vitaminStreak } from '../src/features/prep/logic.ts'
import { check, finish, inTransaction } from './harness.ts'

// --- списки и витамины -------------------------------------------------------

const her = itemsFor('female').map((i) => i.id)
const him = itemsFor('male').map((i) => i.id)
check(
  her.includes('folic_start') && !her.includes('urologist') && him.includes('urologist') && !him.includes('folic_start'),
  'У каждого свои пункты по полу из профиля',
  `у неё ${her.length}, у него ${him.length}`,
)
check(
  PREP_ITEMS.filter((i) => i.who === 'both').every((i) => her.includes(i.id) && him.includes(i.id)),
  'Общие пункты - у обоих',
  'анализы на инфекции, группа крови, курение, алкоголь',
)
check(itemsFor(null).length === PREP_ITEMS.length, 'Пол не указан - показаны все пункты', 'лучше лишний, чем пропущенный анализ')

const today = '2026-10-20'
const taken = [today, shiftDays(today, -1), shiftDays(today, -2), shiftDays(today, -4)]
check(vitaminStreak(taken, today) === 3, 'Серия витаминов - до первого пропуска', '3')
check(vitaminStreak(taken.slice(1), today) === 2, 'Сегодня ещё не отмечено - серия не обрывается', '2')
check(vitaminDaysSince(taken, shiftDays(today, -2)) === 3, 'Дни с витаминами считаются с начала подготовки', '3')

// --- окно --------------------------------------------------------------------

const periods: Period[] = ['2026-07-14', '2026-08-11', '2026-09-08', '2026-10-06'].map((s, i, all) => ({
  id: String(i),
  startedOn: s,
  endedOn: shiftDays(s, 4),
  note: null,
  periodDays: 5,
  cycleDays: i < all.length - 1 ? 28 : null,
  longConfirmed: false,
}))
const state = cycleDay(periods, '2026-10-19', 14, [])
const during = nextWindow(periods, '2026-10-19', 14, [])
check(
  during !== null && during.now && during.from === state?.fertileFrom && during.to === state?.fertileTo,
  'Внутри окна - «сейчас», и границы те же, что у раздела цикла',
  `${during?.from} - ${during?.to}`,
)

// Короткие циклы по 22 дня: календарное окно с запасом заезжает на
// менструацию - а сказать «сейчас благоприятные дни» на её третий день
// было бы неправдой
const short: Period[] = ['2026-08-24', '2026-09-15', '2026-10-07'].map((s, i, all) => ({
  id: `s${i}`,
  startedOn: s,
  endedOn: i < all.length - 1 ? shiftDays(s, 4) : null,
  note: null,
  periodDays: i < all.length - 1 ? 5 : null,
  cycleDays: i < all.length - 1 ? 22 : null,
  longConfirmed: false,
}))
const raw = cycleDay(short, '2026-10-09', 14, [])
const bleeding = nextWindow(short, '2026-10-09', 14, [])
check(
  raw !== null && raw.fertileFrom <= '2026-10-09' && bleeding !== null && !bleeding.now && bleeding.from > '2026-10-11',
  'Во время менструации «сейчас» не говорится, и окно начинается после неё',
  `календарь с ${raw?.fertileFrom}, здесь с ${bleeding?.from}`,
)
const after = nextWindow(periods, '2026-10-27', 14, [])
check(
  after !== null && !after.now && after.from > '2026-11-03',
  'Окно прошло - показывается окно следующего цикла',
  `${after?.from} - ${after?.to}`,
)
check(nextWindow(periods, '2026-11-20', 14, []) === null, 'При задержке окна нет', 'пока цикл не начался, любая дата - выдумка')

// --- база --------------------------------------------------------------------

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  // Живые отметки не должны влиять на проверку: в транзакции - с чистого листа
  await db.q('delete from public.prep_plan')
  await db.q('delete from public.prep_checks')
  await db.q('delete from public.prep_vitamins')

  await db.mustFail(
    'Пункт - либо заготовка, либо свой с названием, не оба',
    `insert into public.prep_checks (user_id, item_key, title, done_on) values ($1, 'dentist', 'и своё', '2031-01-01')`,
    [a],
    'prep_checks_one_of',
  )
  await db.mustFail(
    'Неотмеченная заготовка в базе не хранится',
    `insert into public.prep_checks (user_id, item_key) values ($1, 'dentist')`,
    [a],
    'prep_checks_preset_done',
  )
  await db.q(`insert into public.prep_checks (user_id, item_key, done_on) values ($1, 'dentist', '2031-01-01')`, [a])
  await db.mustFail(
    'Одну заготовку дважды не отметить',
    `insert into public.prep_checks (user_id, item_key, done_on) values ($1, 'dentist', '2031-01-02')`,
    [a],
    'prep_checks_preset',
  )
  await db.q(`insert into public.prep_plan (started_on, created_by) values ('2031-01-01', $1)`, [a])
  await db.mustFail(
    'План у пары один',
    `insert into public.prep_plan (id, started_on, created_by) values (false, '2031-01-01', $1)`,
    [a],
    'prep_plan_id_check',
  )

  await db.as(b)
  check((await db.q('select 1 from public.prep_checks where user_id = $1', [a])).length === 1, 'Второй видит, как идёт у первого', 'поддержать можно')
  await db.mustFail(
    'Отметиться за другого нельзя',
    `insert into public.prep_vitamins (user_id, date) values ($1, '2031-01-01')`,
    [a],
    'row-level security',
  )
  const unchecked = await db.q(`delete from public.prep_checks where user_id = $1 returning 1`, [a])
  check(unchecked.length === 0, 'Снять чужую галочку нельзя', 'RLS молча не находит строку')

  // --- лютеиновая фаза владелицы ----------------------------------------------
  // Окно её цикла на его телефоне считается с ЕЁ лютеиновой фазой: иначе
  // у двоих выходили разные «благоприятные дни»
  await db.asOwner()
  await db.q(
    `insert into public.cycle_settings (user_id, tracking_enabled, share_with_partner, luteal_days)
     values ($1, true, true, 16)
     on conflict (user_id) do update set tracking_enabled = true, share_with_partner = true, luteal_days = 16`,
    [a],
  )
  await db.as(b)
  check(Number(await db.one('select public.cycle_luteal_of($1)', [a])) === 16, 'Партнёр получает её лютеиновую фазу, когда цикл открыт', '16')
  await db.asOwner()
  await db.q('update public.cycle_settings set share_with_partner = false where user_id = $1', [a])
  await db.as(b)
  check((await db.one('select public.cycle_luteal_of($1)', [a])) === '', 'Цикл закрыт - не получает ничего', 'null')

  // --- напоминание в полдень ----------------------------------------------------
  await db.asOwner()
  const tz = await db.one(
    `select z from (select 'Etc/GMT' || case when o > 0 then '-' || o else '+' || (-o) end as z
                      from generate_series(-12, 14) o) zones
      where extract(hour from now() at time zone z) = 12 limit 1`,
  )
  check(tz !== '', 'Нашёлся пояс, где сейчас полдень', tz)
  if (tz !== '') {
    await db.q('update public.profiles set timezone = $1', [tz])
    const local = await db.one('select (now() at time zone $1)::date::text', [tz])
    await db.q('delete from public.prep_asks')
    await db.q('delete from public.prep_vitamins')
    // A пьёт витамины (вчера отметил, сегодня ещё нет), B - не пользуется
    await db.q(`insert into public.prep_vitamins (user_id, date) values ($1, ($2::date - 1))`, [a, local])
    const sent = Number(await db.one('select public.send_prep_reminders()'))
    const last = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string })
    check(
      sent === 1 && last[0]?.userId === a && last[0]?.title === 'Витамины',
      'В полдень напоминание только тому, кто пьёт витамины и сегодня не отметил',
      `отправлено ${sent}`,
    )
    check(Number(await db.one('select public.send_prep_reminders()')) === 0, 'Повторный запуск молчит', 'без дублей')

    await db.q('delete from public.prep_asks')
    await db.q('delete from public.prep_plan')
    check(Number(await db.one('select public.send_prep_reminders()')) === 0, 'Подготовка закончена - напоминаний нет', 'план удалён')
  }
})

finish('Подготовка')
