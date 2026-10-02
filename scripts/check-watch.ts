/**
 * Проверка «Смотрим вместе».
 *
 *   pnpm tsx scripts/check-watch.ts
 *
 * Оценка вслепую: оценка второго не видна, пока нет своей, - иначе вторая
 * всегда подтягивается к первой и «совпадение вкусов» ничего не значит.
 * Проверяется политикой под каждым из двоих. Дальше - что оценить можно
 * только просмотренное, что оценённый фильм не уходит обратно в «хотим»,
 * и что второму приходят нужные уведомления. Плюс выбор на вечер и
 * совпадение вкусов - чистой арифметикой.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { posterTones, tasteMatch, tonightPool, type WatchItem } from '../src/features/watch/logic.ts'
import { check, finish, inTransaction } from './harness.ts'

// --- арифметика --------------------------------------------------------------

const item = (id: string, extra: Partial<WatchItem>): WatchItem => ({
  id,
  title: id,
  kind: 'movie',
  year: null,
  note: null,
  status: 'want',
  watchedOn: null,
  addedBy: 'a',
  createdAt: '',
  wants: [],
  ratings: [],
  ratedBy: [],
  ...extra,
})

const list = [
  item('both', { wants: ['a', 'b'] }),
  item('mine', { wants: ['a'] }),
  item('seen', { status: 'watched', wants: ['a', 'b'] }),
]
check(
  tonightPool(list, 'a', 'b').map((i) => i.id).join() === 'both',
  'На вечер - из того, что хотят оба',
  'просмотренное и «хочет один» не предлагаются, пока есть общее',
)
check(
  tonightPool([item('mine', { wants: ['a'] })], 'a', 'b').length === 1,
  'Общего нет - из того, что хочет хоть кто-то',
  'пустой барабан хуже, чем выбор из «хочет один»',
)
const rated = [
  item('x', { ratings: [{ userId: 'a', stars: 5, comment: null }, { userId: 'b', stars: 5, comment: null }] }),
  item('y', { ratings: [{ userId: 'a', stars: 1, comment: null }, { userId: 'b', stars: 5, comment: null }] }),
  item('z', { ratings: [{ userId: 'a', stars: 3, comment: null }] }),
]
check(tasteMatch(rated, 'a', 'b') === 50, 'Совпадение вкусов - только по оценённому обоими', '100% и 0% - в среднем 50%')
check(tasteMatch([], 'a', 'b') === null, 'Нечего сравнивать - нет и цифры', 'null')
check(posterTones('Интерстеллар').join() === posterTones('Интерстеллар').join(), 'Постер одного фильма всегда одного цвета', posterTones('Интерстеллар').join(' + '))

// --- база --------------------------------------------------------------------

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  await db.q(`update public.profiles set sex = 'female' where user_id = $1`, [a])

  await db.mustFail(
    'Неизвестный вид отвергается',
    `insert into public.watch_items (title, kind, added_by) values ('x', 'podcast', $1)`,
    [a],
    'watch_items_kind_check',
  )
  await db.mustFail(
    '«Посмотрели» без даты отвергается',
    `insert into public.watch_items (title, status, added_by) values ('x', 'watched', $1)`,
    [a],
    'watch_items_watched_date',
  )

  await db.as(a)
  const before = await db.queued()
  const id = await db.one(
    `insert into public.watch_items (title, year, added_by) values ('Интерстеллар', 2014, $1) returning id::text`,
    [a],
  )
  const added = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string; body: string })
  check(
    (await db.queued()) > before && added[0]?.userId === b && added[0]?.title === 'Аминош добавила в «Смотрим вместе»' && added[0]?.body === 'Интерстеллар (2014)',
    'Второму - кто и что добавил',
    `${added[0]?.title} / ${added[0]?.body}`,
  )

  await db.mustFail(
    'Оценить непросмотренное нельзя',
    `insert into public.watch_ratings (item_id, user_id, stars) values ($1, $2, 4)`,
    [id, a],
    'watch_ratings_watched_only',
  )
  await db.mustFail(
    '«Хочу» за другого не поставить',
    `insert into public.watch_wants (item_id, user_id) values ($1, $2)`,
    [id, b],
    'row-level security',
  )

  await db.q(`update public.watch_items set status = 'watched', watched_on = '2031-01-01' where id = $1`, [id])
  await db.q(`insert into public.watch_ratings (item_id, user_id, stars) values ($1, $2, 4)`, [id, a])
  await db.mustFail(
    'Оценённый фильм не вернуть в «хотим»',
    `update public.watch_items set status = 'want', watched_on = null where id = $1`,
    [id],
    'watch_items_rated_stays_watched',
  )

  await db.as(b)
  check(
    (await db.q('select 1 from public.watch_ratings where item_id = $1', [id])).length === 0,
    'ДО своей оценки чужая не видна',
    'иначе вторая подтягивается к первой',
  )
  const progress = await db.q<{ user_id: string }>('select user_id from public.watch_rating_progress() where item_id = $1', [id])
  check(progress.length === 1 && progress[0]?.user_id === a, 'Но видно, что второй уже оценил', 'без самой оценки')

  const beforeReveal = await db.queued()
  await db.q(`insert into public.watch_ratings (item_id, user_id, stars) values ($1, $2, 5)`, [id, b])
  const revealed = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string })
  check(
    (await db.queued()) > beforeReveal && revealed[0]?.userId === a && revealed[0]?.title === 'Оценки открыты',
    'Вторая оценка открывает обе - первому уведомление',
    `${revealed[0]?.title}`,
  )
  check(
    (await db.q('select 1 from public.watch_ratings where item_id = $1', [id])).length === 2,
    'ПОСЛЕ своей оценки видна и чужая',
    'обе оценки',
  )
  const changed = await db.q(`update public.watch_ratings set stars = 1 where item_id = $1 and user_id = $2 returning 1`, [id, a])
  check(changed.length === 0, 'Чужую оценку не изменить', 'RLS молча не находит строку')
})

finish('Смотрим вместе')
