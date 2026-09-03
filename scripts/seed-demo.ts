/**
 * Демо-данные для съёмки промо-ролика.
 *
 *   TANDEM_ENV_FILE=.env.demo pnpm tsx scripts/seed-demo.ts [--stage breakfast|full]
 *
 * Работает ТОЛЬКО против локального стека Supabase. Проверка на localhost —
 * не формальность: живой проект в этот момент используется, и промах здесь
 * означал бы затёртые чужие темы и переписанный дневник. Поэтому скрипт
 * отказывается запускаться, если хост не локальный, ещё до первого запроса.
 *
 * Ники и вес — демонстрационные (Алекс, Ким, 74 кг). Настоящие персональные
 * данные в кадр попадать не должны, и брать их отсюда невозможно: этой базы
 * до запуска скрипта просто нет.
 *
 * Две стадии нужны для одного кадра из брифа: кольцо нормы заполняется
 * с 19% до 89%. Оба значения — настоящие суммы настоящих записей, а не
 * подрисованные числа:
 *   breakfast — только завтрак, 503.60 из 2674 ккал = 19%
 *   full      — весь день, 2368.31 из 2674 ккал = 89%
 */
import { Client } from 'pg'
import { loadEnv } from './env.ts'

type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
type Entry = { meal: Meal; food: string; grams: number }

/** Завтрак: 292.80 + 104.00 + 106.80 = 503.60 ккал */
const BREAKFAST: Entry[] = [
  { meal: 'breakfast', food: 'Овсяные хлопья', grams: 80 },
  { meal: 'breakfast', food: 'Молоко 2.5%', grams: 200 },
  { meal: 'breakfast', food: 'Банан', grams: 120 },
]

/**
 * Остальной день — 1864.71 ккал, итого 2368.31 из 2674 = 89%.
 *
 * Граммовки подобраны не «на глаз»: первая версия дня давала 202 г белка
 * при норме 133, и бар Б рисовался красным как перебор. В кадре это читается
 * как ошибка приложения, хотя приложение право. Теперь все три макроса под
 * нормой — Б 99%, Ж 80%, У 88%, — и каждый бар в своём цвете, как в брифе.
 */
const REST_OF_DAY: Entry[] = [
  { meal: 'lunch', food: 'Куриная грудка', grams: 110 },
  { meal: 'lunch', food: 'Рис белый сухой', grams: 110 },
  { meal: 'lunch', food: 'Помидор', grams: 150 },
  { meal: 'lunch', food: 'Масло оливковое', grams: 17 },
  { meal: 'lunch', food: 'Хлеб цельнозерновой', grams: 60 },

  { meal: 'dinner', food: 'Индейка филе', grams: 130 },
  { meal: 'dinner', food: 'Гречка сухая', grams: 75 },
  { meal: 'dinner', food: 'Огурец', grams: 150 },
  { meal: 'dinner', food: 'Хлеб цельнозерновой', grams: 80 },

  { meal: 'snack', food: 'Творог 5%', grams: 150 },
  { meal: 'snack', food: 'Банан', grams: 100 },
  { meal: 'snack', food: 'Печенье овсяное', grams: 40 },
]

async function main(): Promise<void> {
  const stageArg = process.argv.indexOf('--stage')
  const stage = stageArg === -1 ? 'full' : process.argv[stageArg + 1]
  if (stage !== 'breakfast' && stage !== 'full') {
    throw new Error('--stage принимает breakfast или full')
  }

  const { databaseUrl } = loadEnv()
  const url = new URL(databaseUrl)
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(
      `Отказ: ${url.hostname} — не локальный хост. Демо-данные пишутся только ` +
        'в локальный стек Supabase. Проверь TANDEM_ENV_FILE.',
    )
  }

  const db = new Client({ connectionString: databaseUrl })
  await db.connect()

  try {
    await db.query('begin')

    const users = await db.query<{ id: string; email: string }>(
      `select id, email from auth.users order by email`,
    )
    const idByEmail = new Map(users.rows.map((r) => [r.email, r.id]))
    const alex = idByEmail.get('bikosh@lovepromises.app')
    const kim = idByEmail.get('aminosh@lovepromises.app')
    if (!alex || !kim) {
      throw new Error(
        'В локальной базе нет аккаунтов. Сначала: TANDEM_ENV_FILE=.env.demo pnpm bootstrap',
      )
    }

    // Профили. Вес и рост дают ровно 2674 ккал нормы — то число, от которого
    // считаются 19% и 89% из брифа. Менять их значит ломать кадр.
    await db.query(
      `update public.profiles set
         nickname = $2, sex = $3, birth_year = $4, height_cm = $5, weight_kg = $6,
         activity_level = 'moderate', goal_direction = $7, goals_mode = 'auto'
       where user_id = $1`,
      [alex, 'Алекс', 'male', 1997, 180, 74, 'maintain'],
    )
    await db.query(
      `update public.profiles set
         nickname = $2, sex = $3, birth_year = $4, height_cm = $5, weight_kg = $6,
         activity_level = 'moderate', goal_direction = $7, goals_mode = 'auto'
       where user_id = $1`,
      [kim, 'Ким', 'female', 1999, 166, 57, 'lose'],
    )

    // Всё демо переписывается с нуля при каждом запуске: стадии должны быть
    // воспроизводимы, а не наслаиваться друг на друга
    await db.query('delete from public.diary_entries')
    await db.query('delete from public.topic_comments')
    await db.query('delete from public.topics')
    await db.query('delete from public.tasks')
    await db.query(`delete from public.dish_items`)
    await db.query(`delete from public.foods where kind = 'dish'`)

    await seedDiary(db, alex, stage === 'full' ? [...BREAKFAST, ...REST_OF_DAY] : BREAKFAST)
    await seedPartnerDiary(db, kim)
    await seedDish(db, alex)
    await seedTopics(db, alex, kim)
    await seedTasks(db, alex, kim)

    const total = await db.query<{ kcal: string }>(
      `select coalesce(sum(kcal), 0)::text as kcal from public.diary_entries
        where user_id = $1 and date = (now() at time zone 'Asia/Almaty')::date`,
      [alex],
    )
    await db.query('commit')

    const kcal = Number(total.rows[0]?.kcal ?? 0)
    const percent = Math.round((kcal / 2674) * 100)
    console.log(`\nСтадия «${stage}»: ${kcal.toFixed(2)} из 2674 ккал — ${percent}% нормы`)
    if (stage === 'breakfast' && percent !== 19) throw new Error('Ожидалось 19%')
    if (stage === 'full' && percent !== 89) throw new Error('Ожидалось 89%')
    console.log('Совпадает с брифом.')
  } catch (e) {
    await db.query('rollback')
    throw e
  } finally {
    await db.end()
  }
}

/**
 * Записи дневника со снимком КБЖУ — так же, как их пишет приложение:
 * снимок на 100 г, абсолютные значения считает база.
 */
async function seedDiary(
  db: Client,
  userId: string,
  entries: Entry[],
  who = 'Алекса',
): Promise<void> {
  const order = new Map<Meal, number>()
  for (const entry of entries) {
    const position = order.get(entry.meal) ?? 0
    order.set(entry.meal, position + 1)

    const { rowCount } = await db.query(
      `insert into public.diary_entries
         (id, user_id, date, meal, food_id, grams, name_snapshot, brand_snapshot,
          kcal_100, protein_100, fat_100, carbs_100, sort_order)
       select gen_random_uuid(), $1, (now() at time zone 'Asia/Almaty')::date, $2,
              f.id, $3, f.name, f.brand,
              f.kcal_100, f.protein_100, f.fat_100, f.carbs_100, $5
         from public.foods f
        where f.name = $4 and f.kind = 'product'
        limit 1`,
      [userId, entry.meal, entry.grams, entry.food, position],
    )
    if (rowCount === 0) throw new Error(`Нет продукта «${entry.food}» в базе`)
  }
  console.log(`  дневник ${who}: ${entries.length} записей`)
}

/** Партнёру — свой день: режим сравнения не должен показывать пустой столбец. */
async function seedPartnerDiary(db: Client, userId: string): Promise<void> {
  const entries: Entry[] = [
    { meal: 'breakfast', food: 'Йогурт греческий 2%', grams: 200 },
    { meal: 'breakfast', food: 'Хлебцы', grams: 20 },
    { meal: 'lunch', food: 'Индейка филе', grams: 150 },
    { meal: 'lunch', food: 'Гречка сухая', grams: 60 },
    { meal: 'dinner', food: 'Творог 5%', grams: 180 },
    { meal: 'dinner', food: 'Огурец', grams: 120 },
  ]
  await seedDiary(db, userId, entries, 'Ким')
}

/**
 * Блюдо для кадра с конструктором: два продукта с граммовками и готовый вес.
 * 500 г грудки + 200 г риса при выходе 1000 г = 125.3 ккал на 100 г.
 */
async function seedDish(db: Client, userId: string): Promise<void> {
  const dish = await db.query<{ id: string }>(
    `insert into public.foods (kind, name, yield_grams, created_by)
     values ('dish', 'Курица с рисом', 1000, $1)
     returning id`,
    [userId],
  )
  const dishId = dish.rows[0]?.id
  if (!dishId) throw new Error('Блюдо не создалось')

  for (const [name, grams] of [
    ['Куриная грудка', 500],
    ['Рис белый сухой', 200],
  ] as const) {
    const { rowCount } = await db.query(
      `insert into public.dish_items (dish_id, food_id, grams)
       select $1, f.id, $2 from public.foods f
        where f.name = $3 and f.kind = 'product' limit 1`,
      [dishId, grams, name],
    )
    if (rowCount === 0) throw new Error(`Нет продукта «${name}» для блюда`)
  }

  await db.query(
    `insert into public.food_servings (food_id, label, grams) values ($1, '1 порция', 350)`,
    [dishId],
  )
  console.log('  блюдо: Курица с рисом (2 ингредиента, выход 1000 г)')
}

/**
 * Темы. Главная — открытая с двумя ответами: в ролике её закрывают руками,
 * чтобы блок «Как решили» выехал на глазах, а не появился из сида.
 */
async function seedTopics(db: Client, alex: string, kim: string): Promise<void> {
  const main = await db.query<{ id: string }>(
    `insert into public.topics (title, body, status, created_by, created_at)
     values ($1, $2, 'open', $3, now() - interval '2 days')
     returning id`,
    [
      'Во сколько выходим в зал по будням',
      'Каждый раз договариваемся заново и каждый раз опаздываем.',
      alex,
    ],
  )
  const mainId = main.rows[0]?.id
  if (!mainId) throw new Error('Тема не создалась')

  for (const [author, body, minutes] of [
    [kim, 'Мне удобно после семи — раньше не успеваю с работы.', 90],
    [alex, 'Тогда 19:30. Понедельник, среда, пятница — фиксируем.', 40],
  ] as const) {
    await db.query(
      `insert into public.topic_comments (topic_id, author_id, body, created_at)
       values ($1, $2, $3, now() - make_interval(mins => $4))`,
      [mainId, author, body, minutes],
    )
  }

  // Ещё открытые темы: список из двух карточек оставлял полэкрана пустым
  // и читался как «контента нет», хотя раздел работает
  const others: [string, string, string, string][] = [
    ['Кто закупает продукты на неделю', 'Хочется без «а я думал, ты купишь».', kim, '5 hours'],
    ['Куда едем на длинные выходные', 'Два варианта, и оба нравятся.', alex, '1 day'],
    ['Пересобрать бюджет на месяц', 'Подписки расползлись.', kim, '3 days'],
    ['Забрать вещи со склада', 'Там ещё коробки с зимнего переезда.', alex, '4 days'],
  ]
  for (const [title, body, author, ago] of others) {
    await db.query(
      `insert into public.topics (title, body, status, created_by, created_at)
       values ($1, $2, 'open', $3, now() - $4::interval)`,
      [title, body, author, ago],
    )
  }

  await db.query(
    `insert into public.topics
       (title, body, status, resolution, created_by, created_at, closed_at, closed_by)
     values ($1, $2, 'closed', $3, $4, now() - interval '9 days', now() - interval '7 days', $5)`,
    [
      'Как делим расходы на еду',
      'Считать всё пополам или каждый своё?',
      'Общий котёл на продукты, остальное каждый сам. Скидываемся первого числа.',
      alex,
      kim,
    ],
  )
  console.log('  темы: 5 открытых (одна с двумя ответами) + 1 закрытая')
}

/**
 * Задачи. Разбросаны по месяцу, чтобы в календаре были точки, и одна —
 * с тремя напоминаниями: её карточка идёт крупным планом.
 */
async function seedTasks(db: Client, alex: string, kim: string): Promise<void> {
  type Row = {
    title: string
    notes?: string
    dueSql: string | null
    reminders: number[]
    recurrence: string | null
    by: string
    done?: boolean
  }

  /**
   * Метка «столько-то дней от сегодня, во столько-то по Алматы».
   *
   * Скобки здесь обязательны, и это не вкусовщина: без внешних AT TIME ZONE
   * прилипает к самому `time`, превращая его в timetz, а не к готовой метке.
   * Первая версия так и делала — срок 19:30 сохранялся как 19:30 UTC, то есть
   * уезжал на предыдущий день, и карточка в кадре показывала «Срок вышел».
   */
  const local = (days: number, time: string) =>
    `(((now() at time zone 'Asia/Almaty')::date + ${days}) + time '${time}')` +
    ` at time zone 'Asia/Almaty'`

  // Ближайший пн/ср/пт от сегодня — иначе повторяющаяся тренировка ставилась бы
  // на день, которого нет в её же правиле, и календарь спорил бы с подписью
  const GYM_WEEKDAYS = [1, 3, 5]
  // Алматы — UTC+5 круглый год, перехода на летнее время в Казахстане нет,
  // поэтому смещение можно взять константой и не зависеть от пояса машины
  const almatyNow = new Date(Date.now() + 5 * 3600_000)
  const todayIso = ((almatyNow.getUTCDay() + 6) % 7) + 1
  const gymOffset = [0, 1, 2, 3, 4, 5, 6].find((d) =>
    GYM_WEEKDAYS.includes(((todayIso - 1 + d) % 7) + 1),
  )
  if (gymOffset === undefined) throw new Error('не нашёлся день тренировки')

  const rows: Row[] = [
    {
      title: 'Записаться к врачу',
      notes: 'Терапевт, до конца недели',
      dueSql: local(1, '10:00'),
      reminders: [1440, 60, 0],
      recurrence: null,
      by: alex,
    },
    {
      title: 'Собрать сумку в зал',
      dueSql: local(0, '21:30'),
      reminders: [60],
      recurrence: null,
      by: kim,
    },
    {
      title: 'Тренировка: спина',
      dueSql: local(gymOffset, '19:30'),
      reminders: [60],
      recurrence: JSON.stringify({ freq: 'weekly', interval: 1, weekdays: GYM_WEEKDAYS }),
      by: alex,
    },
    {
      title: 'Оплатить интернет',
      dueSql: local(3, '12:00'),
      reminders: [1440],
      recurrence: null,
      by: kim,
    },
    {
      title: 'Забрать посылку',
      dueSql: local(5, '18:00'),
      reminders: [0],
      recurrence: null,
      by: kim,
    },
    {
      title: 'Созвон с родителями',
      dueSql: local(8, '20:00'),
      reminders: [60],
      recurrence: JSON.stringify({ freq: 'monthly', interval: 1 }),
      by: alex,
    },
    {
      title: 'Купить лампочку в коридор',
      dueSql: null,
      reminders: [],
      recurrence: null,
      by: kim,
    },
    {
      title: 'Продлить страховку',
      dueSql: local(-3, '11:00'),
      reminders: [0],
      recurrence: null,
      by: alex,
      done: true,
    },
  ]

  for (const row of rows) {
    await db.query(
      `insert into public.tasks
         (title, notes, due_at, reminders, recurrence, created_by, done_at, done_by)
       values ($1, $2, ${row.dueSql ?? 'null'}, $3, $4, $5,
               ${row.done ? `${local(-3, '15:00')}` : 'null'},
               ${row.done ? '$5' : 'null'})`,
      [row.title, row.notes ?? null, row.reminders, row.recurrence, row.by],
    )
  }
  console.log(
    `  задачи: ${rows.length}, одна с тремя напоминаниями, ` +
      `тренировка через ${gymOffset} дн.`,
  )
}

main().catch((e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
