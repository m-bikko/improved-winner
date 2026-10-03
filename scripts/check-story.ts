/**
 * Проверка «Нашей истории».
 *
 * Лента собирается из записанного: даты пары (без дней рождения), встречи,
 * воспоминания с первым снимком, договорённости, пройденные (не брошенные)
 * челленджи, цель копилки - в день взноса, который до неё дотянул, сделанные
 * идеи на языке читателя, малыш и вехи. Будущее в историю не попадает,
 * неучастнику - ничего.
 *
 * Всё в транзакции и откатывается.
 */
import { ordinal } from '../src/features/story/logic.ts'
import { check, finish, inTransaction } from './harness.ts'

const en = [1, 2, 3, 4, 11, 12, 13, 21, 22, 112].map((n) => ordinal(n, 'en')).join(' ')
check(en === '1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 112th', 'Английские порядковые: st/nd/rd/th и 11-13', en)
const kk = [1, 6, 9, 10, 50, 100, 200, 250, 365, 500, 1000].map((n) => ordinal(n, 'kk')).join(' ')
check(
  kk === '1-ші 6-шы 9-шы 10-шы 50-ші 100-ші 200-ші 250-ші 365-ші 500-ші 1000-шы',
  'Казахские порядковые - по гармонии гласных последнего слова',
  kk,
)

type Row = { kind: string; day: string | null; at: string | null; title: string | null; n: string | null; photo: string | null }

await inTransaction(async (db) => {
  const { a, b } = db.members
  for (const t of ['occasions', 'meetings', 'memories', 'challenges', 'savings_goals', 'idea_done', 'babies', 'gratitudes', 'question_answers', 'shots']) {
    await db.q(`delete from public.${t}`)
  }
  await db.q(`update public.topics set pinned_at = null`)
  await db.q(`alter table public.topics disable trigger user`)
  await db.q(`delete from public.topics`)
  await db.q(`alter table public.topics enable trigger user`)
  await db.q('delete from public.pregnancy')

  const today = '2031-06-15'
  await db.q(
    `insert into public.occasions (title, date, kind, yearly, created_by) values
       ('Познакомились', '2024-11-05', 'anniversary', true, $1),
       ('ДР', '1995-03-01', 'birthday', true, $1),
       ('Свадьба', '2031-08-01', 'other', false, $1)`,
    [a],
  )
  await db.q(`insert into public.meetings (starts_on, ends_on, place, created_by) values ('2031-05-01', '2031-05-04', 'Алматы', $1), ('2031-07-01', '2031-07-02', null, $1)`, [a])
  const mem = crypto.randomUUID()
  await db.q(`insert into public.memories (id, author_id, happened_on, caption) values ($1, $2, '2031-05-02', 'Горы')`, [mem, a])
  await db.q(
    `insert into public.memory_photos (memory_id, path, thumb_path, width, height, placeholder, position)
     values ($1::uuid, $1::text || '/1.webp', $1::text || '/1-t.webp', 10, 10, 'data:image/webp;base64,AA', 0),
            ($1::uuid, $1::text || '/2.webp', $1::text || '/2-t.webp', 10, 10, 'data:image/webp;base64,AA', 1)`,
    [mem],
  )
  await db.q(
    `insert into public.topics (title, status, resolution, closed_at, closed_by, created_by)
     values ('Деньги', 'closed', 'Крупное - вместе', '2031-04-10 21:00+05', $1, $1), ('Открытая', 'open', null, null, null, $1)`,
    [a],
  )
  await db.q(
    `insert into public.challenges (title, icon, days, started_on, stopped_on, created_by) values
       ('Без сахара', 'candy', 30, '2031-04-01', null, $1),
       ('Брошенный', 'run', 30, '2031-04-01', '2031-04-05', $1),
       ('Идёт', 'run', 30, '2031-06-01', null, $1)`,
    [a],
  )
  const goal = await db.one(
    `insert into public.savings_goals (title, icon, target, currency, created_by) values ('Отпуск', 'plane', 1000, 'KZT', $1) returning id::text`,
    [a],
  )
  await db.q(
    `insert into public.savings_deposits (goal_id, user_id, amount, date) values ($1, $2, 600, '2031-02-01'), ($1, $2, 500, '2031-03-01'), ($1, $2, 100, '2031-03-05')`,
    [goal, a],
  )
  await db.q(`insert into public.date_ideas (key, category, title_ru, title_en, title_kk) values ('t-story', 'home', 'Испечь пирог', 'Bake a pie', 'Бәліш пісіру')`)
  await db.q(`insert into public.idea_votes (user_id, idea_key, liked) values ($1, 't-story', true), ($2, 't-story', true)`, [a, b])
  await db.q(`insert into public.idea_done (idea_key, done_on, done_by) values ('t-story', '2031-05-20', $1)`, [a])
  // Идея, записанная в воспоминания, - в ленте одним воспоминанием
  await db.q(`insert into public.date_ideas (key, category, title_ru, title_en, title_kk) values ('t-story2', 'city', 'Каток', 'Skating', 'Мұз айдыны')`)
  await db.q(`insert into public.idea_votes (user_id, idea_key, liked) values ($1, 't-story2', true), ($2, 't-story2', true)`, [a, b])
  await db.q(`insert into public.idea_done (idea_key, done_on, done_by, memory_id) values ('t-story2', '2031-05-21', $1, $2)`, [a, mem])
  await db.q(`insert into public.babies (name, born_on, created_by) values ('Алихан', '2031-06-01', $1)`, [a])
  await db.q(`insert into public.gratitudes (author_id, body) select $1, 'спасибо' from generate_series(1, 12)`, [a])

  await db.as(b)
  const rows = await db.q<Row>(`select kind, day::text, at::text, title, n::text, photo from public.story($1, 'en')`, [today])
  const kinds = (k: string): Row[] => rows.filter((r) => r.kind === k)
  check(kinds('date').length === 1 && kinds('date')[0]?.title === 'Познакомились', 'Даты пары - без дней рождения и будущего', kinds('date').map((r) => r.title).join())
  check(kinds('meeting').length === 1 && kinds('meeting')[0]?.n === '4', 'Встречи - прошедшие, с числом дней', kinds('meeting').map((r) => r.n).join())
  check(kinds('memory')[0]?.photo === `${mem}/1-t.webp` && kinds('memory')[0]?.n === '2', 'Воспоминание - с первым снимком и числом фото', `${kinds('memory')[0]?.photo}`)
  check(kinds('agreement').length === 1 && kinds('agreement')[0]?.at !== null, 'Договорённость - моментом, день считает клиент', kinds('agreement').map((r) => r.title).join())
  check(kinds('challenge').map((r) => r.title).join() === 'Без сахара' && kinds('challenge')[0]?.day === '2031-04-30', 'Челленджи - пройденные, в их последний день', kinds('challenge').map((r) => `${r.title} ${r.day}`).join())
  check(kinds('savings')[0]?.day === '2031-03-01', 'Цель копилки - в день взноса, который до неё дотянул', `${kinds('savings')[0]?.day}`)
  check(kinds('idea')[0]?.title === 'Bake a pie', 'Сделанная идея - на языке читателя', `${kinds('idea')[0]?.title}`)
  check(kinds('idea').length === 1, 'Идея с воспоминанием - не дублем', 'карточкой воспоминания')
  check(kinds('baby')[0]?.title === 'Алихан', 'Малыш родился', `${kinds('baby')[0]?.day}`)
  check(kinds('gratitude').map((r) => r.n).join() === '1,10', 'Вехи «спасибо» - первое и десятое', kinds('gratitude').map((r) => r.n).join())

  await db.asOwner()
  await db.q(`select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true)`)
  await db.q('set local role authenticated')
  check((await db.q(`select 1 from public.story($1)`, [today])).length === 0, 'Неучастнику - ничего', '0')
})

finish('Наша история')
