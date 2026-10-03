/**
 * Проверка идей для свиданий.
 *
 * Как у имён: чужие голоса не видны вовсе, известно только совпадение,
 * и о нём второму приходит уведомление с названием идеи на ЕГО языке.
 * Отметить сделанной можно только общую идею. Банк - 160 идей на трёх
 * языках, по 40 в каждой категории; своя идея - одной строкой.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { check, finish, inTransaction } from './harness.ts'

type Push = { userId: string; title: string; body: string; url: string }

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  await db.q(`update public.profiles set language = 'en' where user_id = $1`, [a])
  await db.q('delete from public.idea_votes')
  await db.q('delete from public.idea_done')

  const bank = await db.q<{ category: string; n: number }>(
    `select category, count(*)::int as n from public.date_ideas where created_by is null group by category order by category`,
  )
  check(
    bank.length === 4 && bank.every((c) => c.n === 40),
    'Банк - по 40 идей в четырёх категориях',
    bank.map((c) => `${c.category} ${c.n}`).join(', '),
  )
  const untranslated = Number(
    await db.one(
      `select count(*) from public.date_ideas where created_by is null
        and (btrim(title_ru) = '' or btrim(title_en) = '' or btrim(title_kk) = '' or hint_ru is null or hint_en is null or hint_kk is null)`,
    ),
  )
  check(untranslated === 0, 'У каждой идеи банка - все три языка и подсказка', `${untranslated}`)

  await db.mustFail(
    'Идея банка без перевода не заводится',
    `insert into public.date_ideas (key, category, title_ru) values ('x-test', 'home', 'Тест')`,
    [],
    'date_ideas_custom',
  )
  await db.q(
    `insert into public.date_ideas (key, category, title_ru, title_en, title_kk, rank)
     values ('t-one', 'home', 'Испечь пирог', 'Bake a pie', 'Бәліш пісіру', 100000), ('t-two', 'city', 'Сходить в музей', 'Visit a museum', 'Мұражайға бару', 100001)`,
  )

  await db.as(a)
  await db.mustFail(
    'Идею в банк участник не добавит',
    `insert into public.date_ideas (key, category, title_ru, title_en, title_kk) values ('fake', 'home', 'a', 'b', 'c')`,
    [],
    'row-level security',
  )
  await db.q(`insert into public.date_ideas (key, category, title, created_by) values ('c-own', 'trip', 'На Чарын', $1)`, [a])
  await db.mustFail(
    'Своя идея без дублей по написанию',
    `insert into public.date_ideas (key, category, title, created_by) values ('c-own2', 'trip', '  на чарын ', $1)`,
    [a],
    'date_ideas_custom_unique',
  )
  await db.q(
    `insert into public.idea_votes (user_id, idea_key, liked) values ($1, 't-one', true), ($1, 't-two', false), ($1, 'c-own', true)`,
    [a],
  )
  await db.mustFail(
    'Не общую идею сделанной не отметить',
    `insert into public.idea_done (idea_key, done_on) values ('t-one', '2031-01-01')`,
    [],
    'row-level security',
  )

  await db.as(b)
  check((await db.q('select 1 from public.idea_votes where user_id = $1', [a])).length === 0, 'Голоса второго не видны вовсе', 'ни «хочу», ни «нет»')
  check((await db.q('select 1 from public.idea_matches()')).length === 0, 'Пока не совпало - пусто', '0')
  await db.q(`insert into public.idea_votes (user_id, idea_key, liked) values ($1, 't-one', true)`, [b])
  const p = (await db.lastPushes(1)).map((x) => JSON.parse(x) as Push)
  check(
    p[0]?.userId === a && p[0]?.title === 'A date idea you both want' && p[0]?.body.includes('Bake a pie') === true && p[0]?.url === '/ideas',
    'Совпало - второму с названием на его языке',
    `${p[0]?.body}`,
  )
  // Своя идея - одной строкой, на любом языке получателя
  await db.q(`insert into public.idea_votes (user_id, idea_key, liked) values ($1, 'c-own', true)`, [b])
  await db.as(a)
  const p2 = (await db.lastPushes(1)).map((x) => JSON.parse(x) as Push)
  check(p2[0]?.body.includes('На Чарын') === true, 'Своя идея в уведомлении - как написали', `${p2[0]?.body}`)
  const m = await db.q<{ idea_key: string }>('select idea_key from public.idea_matches() order by idea_key')
  check(m.map((x) => x.idea_key).join() === 'c-own,t-one', 'Совпадения - только взаимные «хочу»', m.map((x) => x.idea_key).join())

  // Отказ не всплывает: «нет» первого и «хочу» второго - не совпадение
  await db.as(b)
  await db.q(`insert into public.idea_votes (user_id, idea_key, liked) values ($1, 't-two', true)`, [b])
  check((await db.q(`select 1 from public.idea_matches() where idea_key = 't-two'`)).length === 0, '«Нет» второго не раскрывается', 'просто не совпало')

  await db.q(`insert into public.idea_done (idea_key, done_on) values ('t-one', '2031-01-02')`)
  check((await db.q(`select 1 from public.idea_done where idea_key = 't-one'`)).length === 1, 'Общую идею - сделали', 'одна отметка на двоих')

  // В план встречи - пунктом из идей
  await db.asOwner()
  const meeting = await db.one(
    `insert into public.meetings (starts_on, ends_on, created_by) values ('2031-02-01', '2031-02-03', $1) returning id::text`,
    [a],
  )
  await db.as(a)
  const added = await db.q(
    `insert into public.meeting_items (meeting_id, title, source, created_by) values ($1, 'Испечь пирог', 'idea', $2) returning 1`,
    [meeting, a],
  )
  check(added.length === 1, 'Идея становится пунктом плана встречи', 'source = idea')
})

finish('Идеи для свиданий')
