// Наполнение ЛОКАЛЬНОГО стека для проверки заполненных экранов. Длинные строки намеренно.
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
import { createRequire } from 'node:module'
const { Client } = createRequire(ROOT)('pg')
import { pgConfig } from '../env.ts'
const cfg = pgConfig()
const where = cfg.connectionString ?? cfg.host ?? ''
if (!/localhost|127\.0\.0\.1/.test(where)) throw new Error('только локальный стек')
const db = new Client(pgConfig())
await db.connect()
const today = process.argv[2]
const day = (n) => `(date '${today}' + ${n})`
const { rows } = await db.query(`select p.user_id, p.nickname from public.profiles p join public.app_members m using (user_id) order by p.nickname`)
const a = rows.find((r) => r.nickname === 'Алекс').user_id
const b = rows.find((r) => r.nickname === 'Ким').user_id
const LONG = 'Поездка на Чарын на длинные выходные с палаткой, велосипедами и ночёвкой у каньона'
const stmts = [
  `delete from public.wishlists; delete from public.occasions; delete from public.savings_goals; delete from public.challenges; delete from public.watch_items; delete from public.memories; delete from public.meetings; delete from public.places; delete from public.gratitudes; delete from public.letters; delete from public.doctors; delete from public.medications; delete from public.workouts; delete from public.weight_log; delete from public.checkins`,
  `insert into public.wishlists (title, details) values ('${LONG}', 'Қазақша мәтін: әңгіме, ғылым, қала, өнер, ұлт, үй, һ, і'), ('Наушники', null), ('Кофемолка', 'Ручная, с регулировкой помола')`,
  `insert into public.occasions (title, date) values ('Годовщина знакомства', ${day(9)}), ('Свадьба друзей на озере', ${day(40)}), ('Первая встреча', ${day(-300)})`,
  `insert into public.savings_goals (id, title, icon, target, currency) values ('00000000-0000-4000-8000-0000000000a1', '${LONG.slice(0, 40)}', 'plane', 800000, 'KZT'), ('00000000-0000-4000-8000-0000000000a2', 'Подушка', 'piggy_bank', 500000, 'KZT')`,
  `insert into public.savings_deposits (goal_id, amount, date) values ('00000000-0000-4000-8000-0000000000a1', 150000, ${day(-20)}), ('00000000-0000-4000-8000-0000000000a1', 90000, ${day(-3)}), ('00000000-0000-4000-8000-0000000000a2', 40000, ${day(-1)})`,
  `insert into public.challenges (title, icon, days, started_on) values ('Десять тысяч шагов каждый день, даже в дождь', 'footprints', 14, ${day(-4)}), ('Без сладкого', 'candy_off', 7, ${day(-1)})`,
  `insert into public.watch_items (title, status) values ('Вечное сияние чистого разума', 'want'), ('Очень длинное название сериала, который мы обязательно посмотрим когда-нибудь вместе', 'want'), ('Дюна', 'watching')`,
  `insert into public.memories (id, happened_on, caption, place) values (gen_random_uuid(), ${day(-5)}, 'Первый снег в горах, замёрзли, но было здорово', 'Шымбулак'), (gen_random_uuid(), ${day(-40)}, 'Кофе у реки', null)`,
  `insert into public.meetings (id, starts_on, ends_on, place, note) values ('00000000-0000-4000-8000-0000000000b1', ${day(12)}, ${day(15)}, 'Алматы', 'Встречаю в аэропорту')`,
  `insert into public.meeting_items (meeting_id, title) values ('00000000-0000-4000-8000-0000000000b1', 'Поехать на Кок-Тобе'), ('00000000-0000-4000-8000-0000000000b1', 'Сходить в новую кофейню')`,
  `insert into public.places (name, kind, note, address, lat, lng) values ('Кок-Тобе', 'nature', 'На закате', 'Медеуский район, Алматы', 43.2331, 76.9755), ('Кофейня у дома с очень длинным названием, которое не поместится в строку', 'food', null, 'проспект Абая, 10, Алматы', 43.2418, 76.9468), ('Музей Кастеева', 'culture', null, 'Алматы', 43.2358, 76.9198), ('Хан Шатыр', 'fun', null, 'Астана', 51.1325, 71.4036), ('Чарынский каньон', 'trip', 'Весной', 'Алматинская область', 43.3537, 79.0806)`,
  `update public.places set visited_on = ${day(-10)} where name = 'Музей Кастеева'`,
  `insert into public.gratitudes (body) values ('За то, что встретил с работы и приготовил ужин, когда я совсем не успевала ничего сделать')`,
  `insert into public.letters (deliver_on, body) values (${day(30)}, 'Письмо в будущее')`,
  `insert into public.doctors (name, phone) values ('Терапевт Айгерим', '+7 700 000 00 00')`,
  `insert into public.medications (name, starts_on) values ('Витамин D', ${day(-10)})`,
  `insert into public.workouts (date, kind, minutes, kcal) values (${day(0)}, 'run', 40, 380), (${day(-2)}, 'walk', 60, 220)`,
  ...Array.from({ length: 30 }, (_, i) => `insert into public.weight_log (date, weight_kg, body_fat_pct) values (${day(-i * 3)}, ${(74 + i * 0.12 + Math.sin(i) * 0.3).toFixed(1)}, ${i % 5 === 0 ? (24 + i * 0.05).toFixed(1) : 'null'})`),
  `insert into public.checkins (date, states, note) values (${day(0)}, '{joy,calm,inlove,grateful,inspired}', 'Хороший день')`,
  [b, `insert into public.checkins (date, states) values (${day(0)}, '{joy}')`],
  [b, `insert into public.gratitudes (body) values ('Спасибо за вчерашний вечер')`],
]
const as = async (uid) => {
  await db.query(`select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, false)`, [uid])
  await db.query('set role authenticated')
}
let good = 0
for (const raw of stmts) {
  const [uid, sql] = Array.isArray(raw) ? raw : [a, raw]
  await as(uid)
  try { await db.query(sql); good++ } catch (e) { console.log('ERR', e.message.slice(0, 120), '<-', sql.slice(0, 70)) }
  await db.query('reset role')
}
console.log('ok', good, 'of', stmts.length)
await db.end()
