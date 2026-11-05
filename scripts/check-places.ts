/**
 * Проверка мест.
 *
 * Логика геокодера - на настоящих формах ответа Nominatim: его ответ чужой,
 * и разбор обязан пережить и пустое название, и мусор. База - инварианты
 * точки, «одна точка - одно место», общий список для двоих и закрытый для
 * всех остальных, уведомление второму на его языке.
 *
 * Сеть к Nominatim здесь не трогается: проверка не должна нагружать
 * бесплатный сервер и падать из-за него. Всё в транзакции и откатывается.
 */
import { check, finish, inTransaction } from './harness.ts'
import {
  PLACE_KINDS,
  guessName,
  kindFromOsm,
  osmRouteUrl,
  osmViewUrl,
  readHit,
  readHits,
  samePoint,
  type GeoHit,
} from '../src/features/places/logic.ts'

type Push = { userId: string; title: string; body: string; url: string }

// --- Разбор ответа геокодера ------------------------------------------------
const search = readHit({
  lat: '43.2331024',
  lon: '76.9755299',
  category: 'place',
  type: 'locality',
  name: 'Кок-Тобе',
  display_name: 'Кок-Тобе, Медеуский район, Алматы, 050051, Казахстан',
})
check(
  search?.name === 'Кок-Тобе' && search.address === 'Медеуский район, Алматы, 050051, Казахстан' && search.lat === 43.2331024,
  'Поиск: название отдельно, в адресе оно не повторяется',
  `${search?.name} | ${search?.address}`,
)
const reverse = readHit({
  lat: '43.2390001',
  lon: '76.8900852',
  name: '',
  category: 'place',
  type: 'house',
  display_name: '112, улица Розыбакиева, Тастак, Алматы',
})
check(
  reverse?.name === '' && reverse.address === '112, улица Розыбакиева, Тастак, Алматы',
  'Точка без названия: название пустое, адрес целиком',
  `${JSON.stringify(reverse?.name)} | ${reverse?.address}`,
)
const longName = readHit({ lat: '1', lon: '2', name: 'я'.repeat(300), display_name: 'а'.repeat(900) })
check(
  longName?.name.length === 120 && (longName.address?.length ?? 0) <= 300,
  'Длинный ответ обрезается под границы базы',
  `${longName?.name.length} и ${longName?.address?.length}`,
)
const junk: unknown[] = [null, 'x', 7, [], {}, { lat: '1' }, { lat: 'abc', lon: '2' }, { lat: '91', lon: '2' }, { lat: '1', lon: '181' }, { lat: '', lon: '' }, { error: 'Unable to geocode' }]
check(junk.every((j) => readHit(j) === null), 'Мусор вместо ответа - не точка', `${junk.length} вариантов`)
check(
  readHits({ error: 'x' }).length === 0 && readHits([{}, { lat: '1', lon: '2', name: 'Да' }]).length === 1,
  'Список: не массив - пусто, негодное отброшено',
  'readHits',
)

const hit = (name: string, address: string | null): GeoHit => ({ lat: 1, lng: 2, name, address, kind: 'other' })
check(guessName(hit('Кафе', 'Алматы')) === 'Кафе', 'Своё название не подменяется', 'guessName')
check(guessName(hit('', 'улица Абая, Алматы')) === 'улица Абая', 'Без названия - первая часть адреса', 'guessName')
check(guessName(hit('', '112, улица Абая, Алматы')) === 'улица Абая, 112', 'Номер дома - вместе с улицей', 'guessName')

const kinds: [string | null, string | null, string][] = [
  ['amenity', 'restaurant', 'food'],
  ['amenity', 'cafe', 'food'],
  ['leisure', 'park', 'nature'],
  ['natural', 'peak', 'nature'],
  ['tourism', 'museum', 'culture'],
  ['historic', 'castle', 'culture'],
  ['amenity', 'cinema', 'fun'],
  ['place', 'city', 'trip'],
  ['boundary', 'administrative', 'trip'],
  ['place', 'house', 'other'],
  ['highway', 'residential', 'other'],
  [null, null, 'other'],
]
const wrong = kinds.filter(([c, t, want]) => kindFromOsm(c, t) !== want)
check(wrong.length === 0, 'Вид по тегам OSM', wrong.map((w) => w.join('/')).join(', ') || `${kinds.length} случаев`)

check(
  samePoint({ lat: 43.2331, lng: 76.9755 }, { lat: 43.2331, lng: 76.9755 }) && !samePoint({ lat: 43.2331, lng: 76.9755 }, { lat: 43.2332, lng: 76.9755 }),
  'Одна точка - до пятого знака',
  'samePoint',
)
check(
  osmViewUrl({ lat: 43.5, lng: 76.5 }).includes('mlat=43.5&mlon=76.5') && osmRouteUrl({ lat: 43.5, lng: 76.5 }).endsWith('to=43.5%2C76.5'),
  'Ссылки на карту несут координаты',
  'osmViewUrl, osmRouteUrl',
)

// --- База -------------------------------------------------------------------
await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  await db.q(`update public.profiles set language = 'en' where user_id = $1`, [b])
  await db.q('delete from public.places')

  const constraint = await db.one(
    `select pg_get_constraintdef(oid) from pg_constraint where conname = 'places_kind' and conrelid = 'public.places'::regclass`,
  )
  const unknown = PLACE_KINDS.filter((k) => !constraint.includes(`'${k}'`))
  const extra = [...constraint.matchAll(/'([a-z]+)'::text/g)].map((m) => m[1]).filter((k) => !(PLACE_KINDS as readonly (string | undefined)[]).includes(k))
  check(unknown.length === 0 && extra.length === 0, 'Виды в форме и в базе - один список', constraint)

  const texts = Number(await db.one(`select count(*) from public.texts where key = 'n.places.added' and lang in ('ru', 'kk', 'en')`))
  check(texts === 3, 'Текст уведомления на трёх языках', `${texts}`)

  await db.as(a)
  const before = await db.queued()
  await db.q(`insert into public.places (name, kind, lat, lng, address) values ('ТЕСТ парк', 'nature', 43.2, 76.9, 'Алматы')`)
  const place = await db.one(`select id from public.places where name = 'ТЕСТ парк'`)
  check(
    (await db.one(`select created_by from public.places where id = $1`, [place])) === a,
    'Автора ставит база',
    'created_by',
  )

  const bad: [string, string, string][] = [
    ['Пустое название', `('   ', 1, 1)`, 'places_name'],
    ['Слишком длинное название', `(repeat('я', 121), 1, 1)`, 'places_name'],
    ['Широта за 90', `('Т', 91, 1)`, 'places_lat'],
    ['Долгота за 180', `('Т', 1, 181)`, 'places_lng'],
    ['Широта NaN', `('Т', 'NaN', 1)`, 'places_lat'],
    ['Без широты', `('Т', null, 1)`, 'lat'],
    ['Без долготы', `('Т', 1, null)`, 'lng'],
  ]
  for (const [name, values, expect] of bad) {
    await db.mustFail(name, `insert into public.places (name, lat, lng) values ${values}`, [], expect)
  }
  await db.mustFail('Неизвестный вид', `insert into public.places (name, kind, lat, lng) values ('Т', 'bar', 1, 1)`, [], 'places_kind')
  await db.mustFail('Пустая заметка', `insert into public.places (name, note, lat, lng) values ('Т', '  ', 1, 1)`, [], 'places_note')
  await db.mustFail('Заметка длиннее 500', `insert into public.places (name, note, lat, lng) values ('Т', repeat('я', 501), 1, 1)`, [], 'places_note')
  await db.mustFail('Пустой адрес', `insert into public.places (name, address, lat, lng) values ('Т', ' ', 1, 1)`, [], 'places_address')

  await db.mustFail('Та же точка второй раз', `insert into public.places (name, lat, lng) values ('Другое имя', 43.2, 76.9)`, [], 'places_same_point')
  await db.mustFail('Точка отличается меньше чем на метр', `insert into public.places (name, lat, lng) values ('Рядом', 43.200001, 76.900001)`, [], 'places_same_point')
  await db.q(`insert into public.places (name, lat, lng) values ('ТЕСТ сосед', 43.2001, 76.9)`)
  check(true, 'Соседняя точка - другое место', 'разница 0.0001°, около десяти метров')

  await db.mustFail('За другого не добавить', `insert into public.places (name, lat, lng, created_by) values ('Т', 2, 2, $1)`, [b], 'row-level security')

  // --- Общий список: второй видит и правит ----------------------------------
  await db.as(b)
  check(
    Number(await db.one('select count(*) from public.places')) === 2,
    'Второй видит оба места',
    'список общий',
  )
  await db.q(`update public.places set note = 'Правка второго' where id = $1`, [place])
  check(
    (await db.one('select note from public.places where id = $1', [place])) === 'Правка второго',
    'Второй правит чужое место',
    'как темы и встречи, не как вишлист',
  )
  await db.mustFail('Автора не переписать', 'update public.places set created_by = $1 where id = $2', [b, place], 'permission denied')
  await db.mustFail('Дату добавления не переписать', `update public.places set created_at = now() where id = $1`, [place], 'permission denied')

  // --- Побывали и воспоминание ----------------------------------------------
  await db.mustFail(
    'Воспоминание без отметки «были» не привязать',
    `update public.places set memory_id = gen_random_uuid() where id = $1`,
    [place],
    'places_memory_needs_visit',
  )
  const memory = await db.one(`insert into public.memories (id, happened_on, caption) values (gen_random_uuid(), '2031-05-01', 'ТЕСТ парк') returning id`)
  await db.q(`update public.places set visited_on = '2031-05-01', memory_id = $1 where id = $2`, [memory, place])
  await db.mustFail('Снять отметку и оставить воспоминание нельзя', 'update public.places set visited_on = null where id = $1', [place], 'places_memory_needs_visit')
  await db.q('delete from public.memories where id = $1', [memory])
  const after = await db.q<{ visited_on: string | null; memory_id: string | null }>(
    `select visited_on::text, memory_id::text from public.places where id = $1`,
    [place],
  )
  check(
    after[0]?.visited_on === '2031-05-01' && after[0]?.memory_id === null,
    'Удалили воспоминание - место осталось отмеченным',
    'on delete set null',
  )

  // --- Посторонние ----------------------------------------------------------
  await db.as('00000000-0000-4000-8000-000000000001')
  check(Number(await db.one('select count(*) from public.places')) === 0, 'Не участнику - пусто', 'is_member')
  await db.mustFail(
    'Не участник не добавит',
    `insert into public.places (name, lat, lng, created_by) values ('Т', 3, 3, '00000000-0000-4000-8000-000000000001')`,
    [],
    'row-level security',
  )
  await db.asOwner()
  const cook = await db.q<{ user_id: string }>('select user_id::text from public.cooks limit 1')
  if (cook[0]) {
    await db.as(cook[0].user_id)
    check(Number(await db.one('select count(*) from public.places')) === 0, 'Повару места не видны', 'только дневник и продукты')
  }
  await db.asOwner()
  await db.q('set local role anon')
  await db.mustFail('Без входа - закрыто', 'select * from public.places', [], 'permission denied')
  await db.asOwner()

  // --- Уведомление ----------------------------------------------------------
  const pushes = (await db.lastPushes(20)).map((raw) => JSON.parse(raw) as Push).filter((p) => p.url === '/places')
  check(
    (await db.queued()) > before && pushes.every((p) => p.userId === b),
    'Уведомление уходит второму, а не автору',
    `в очереди ${pushes.length}`,
  )
  const park = pushes.find((p) => p.body === 'ТЕСТ парк')
  const nick = await db.one('select nickname from public.profiles where user_id = $1', [a])
  check(
    park?.title === `${nick}: a new place`,
    'Заголовок на языке получателя, название места как есть',
    park ? 'английский у получателя' : 'push не найден',
  )

  const withUpdate = await db.queued()
  await db.as(a)
  await db.q(`update public.places set name = 'ТЕСТ парк 2' where id = $1`, [place])
  check((await db.queued()) === withUpdate, 'Правка не шлёт уведомлений', 'только новое место')

  await db.asOwner()
  await db.q(`insert into public.notification_settings (user_id, kind, telegram, push) values ($1, 'places', false, false)`, [b])
  const muted = await db.queued()
  await db.as(a)
  await db.q(`insert into public.places (name, lat, lng) values ('ТЕСТ тихо', 10, 10)`)
  check((await db.queued()) === muted, 'Выключенное уведомление молчит', 'вид places в настройках')

  await db.q(`delete from public.places where id = $1`, [place])
  check(
    Number(await db.one('select count(*) from public.places where id = $1', [place])) === 0,
    'Удаляет любой из двоих',
    'добавил второй и не только',
  )
})

finish('Раздел мест')
