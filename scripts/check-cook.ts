/**
 * Проверка доступа повара - третьего аккаунта, который не участник пары.
 *
 * Повар видит дневник и норму дня ВЛАДЕЛЬЦА и справочник продуктов; добавляет
 * продукты и фото к ним, правит и удаляет только своё. Всё остальное - ноль:
 * каждая таблица и вью public перебирается под поваром, и непустыми могут
 * быть только разрешённые. Функции SECURITY DEFINER, доступные роли
 * authenticated, обязаны проверять участника или повара - иначе третий
 * аккаунт узнал бы через них то, что закрыто политиками.
 *
 * Ссылку выпускает и отзывает только владелец; отзыв закрывает всё сразу.
 *
 * Всё в транзакции и откатывается - в том числе смена пароля повара.
 */
import { COOK_EMAIL } from '../src/lib/accounts.ts'
import { check, finish, inTransaction } from './harness.ts'

// Разрешено повару - и почему исключения из «проверяет участника»
const ALLOWED_TABLES = new Set(['foods', 'foods_v', 'food_servings', 'dish_items', 'diary_entries', 'daily_goals', 'cooks'])
const NO_MEMBER_CHECK: Record<string, string> = {
  is_member: 'сама проверка',
  is_cook: 'сама проверка',
  cook_owner: 'читает только строку самого спрашивающего',
  checkin_restorable: 'считает только по своим отметкам спрашивающего',
}

await inTransaction(async (db) => {
  const { a, b } = db.members
  const cook = await db.one(`select id::text from auth.users where email = $1`, [COOK_EMAIL])
  check(cook !== '', 'Аккаунт повара заведён', COOK_EMAIL)
  if (cook === '') return
  const owner = await db.one('select owner_id::text from public.cooks where user_id = $1', [cook])
  const other = owner === a ? b : a
  check(Number(await db.one('select count(*) from public.app_members where user_id = $1', [cook])) === 0, 'Повар - не участник пары', 'app_members')

  // Данные, по которым видно, что именно закрыто: записи обоих и чужой продукт
  const foodOfPair = await db.one(
    `insert into public.foods (kind, name, kcal_100, protein_100, fat_100, carbs_100, created_by)
     values ('product', 'ТЕСТ продукт пары', 100, 1, 1, 1, $1) returning id::text`,
    [owner],
  )
  for (const who of [owner, other]) {
    await db.q(
      `insert into public.diary_entries (id, user_id, date, meal, name_snapshot, grams, kcal_100, protein_100, fat_100, carbs_100)
       values (gen_random_uuid(), $1, '2031-04-01', 'lunch', 'ТЕСТ', 100, 100, 1, 1, 1)`,
      [who],
    )
    await db.q(
      `insert into public.daily_goals (user_id, date, kcal, protein, fat, carbs, goal_direction)
       values ($1, '2031-04-01', 2000, 150, 70, 200, 'lose') on conflict do nothing`,
      [who],
    )
  }

  // --- Ссылка: только владелец -------------------------------------------
  await db.as(other)
  await db.mustFail('Ссылку повара не выпустит второй', 'select public.cook_link_issue()', [], 'повар не заведён')
  check((await db.q('select 1 from public.cook_status()')).length === 0, 'Второй не видит состояния повара', '0 строк')
  await db.as(owner)
  const secret = await db.one('select public.cook_link_issue()')
  check(/^[A-Za-z0-9_-]{32}$/.test(secret), 'Владелец выпускает ссылку: 32 символа, безопасных для адреса', `${secret.length} символов`)
  check((await db.q('select 1 from public.cook_status() where issued_at is not null')).length === 1, 'Владелец видит, что ссылка выпущена', 'cook_status')
  await db.asOwner()
  const stored = await db.one('select encrypted_password from auth.users where id = $1', [cook])
  check(stored.startsWith('$2') && !stored.includes(secret), 'В базе только хеш секрета', 'bcrypt')

  // --- Под поваром ---------------------------------------------------------
  await db.as(cook)
  await db.mustFail('Повар не выпустит ссылку себе сам', 'select public.cook_link_issue()', [], 'только для участников')

  const relations = await db.q<{ name: string }>(
    `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'm') order by 1`,
  )
  const leaked: string[] = []
  let denied = 0
  for (const r of relations) {
    // Таблица, на которую у authenticated нет даже права чтения, - закрыта ещё строже
    await db.q('savepoint relation')
    try {
      const n = Number(await db.one(`select count(*) from public.${r.name}`))
      if (n > 0 && !ALLOWED_TABLES.has(r.name)) leaked.push(`${r.name}=${n}`)
      await db.q('release savepoint relation')
    } catch {
      await db.q('rollback to savepoint relation')
      denied++
    }
  }
  check(
    leaked.length === 0,
    'Каждая таблица и вью, кроме разрешённых, - пустые',
    leaked.join(', ') || `проверено ${relations.length}, из них без права чтения ${denied}`,
  )

  const diaryOwners = await db.q<{ user_id: string }>('select distinct user_id::text from public.diary_entries')
  check(diaryOwners.length === 1 && diaryOwners[0]?.user_id === owner, 'Дневник - только владельца', `${diaryOwners.length} человек`)
  const goalOwners = await db.q<{ user_id: string }>('select distinct user_id::text from public.daily_goals')
  check(goalOwners.every((g) => g.user_id === owner), 'Норма дня - только владельца', `${goalOwners.length}`)
  check(Number(await db.one('select count(*) from public.foods_v')) > 0, 'Справочник продуктов виден', 'foods_v')
  const ctx = await db.q<{ owner_id: string; owner_name: string }>('select owner_id::text, owner_name from public.cook_context()')
  check(ctx[0]?.owner_id === owner && (ctx[0]?.owner_name ?? '') !== '', 'Повар знает только, чей это дневник', `${ctx[0]?.owner_name}`)
  check(
    Number(await db.one(`select count(*) from storage.objects where bucket_id <> 'food-photos'`)) === 0,
    'Из хранилища - только фото продуктов',
    'кадры, голос, воспоминания закрыты',
  )

  // Запись
  const own = await db.one(
    `insert into public.foods (kind, name, kcal_100, protein_100, fat_100, carbs_100) values ('product', 'ТЕСТ продукт повара', 200, 2, 2, 2) returning created_by::text`,
  )
  check(own === cook, 'Новый продукт - свой у повара', 'created_by ставит база')
  const ownId = await db.one(`select id::text from public.foods where name = 'ТЕСТ продукт повара'`)
  check((await db.q(`update public.foods set kcal_100 = 210 where id = $1 returning 1`, [ownId])).length === 1, 'Свой продукт повар правит', '1')
  check((await db.q(`update public.foods set kcal_100 = 1 where id = $1 returning 1`, [foodOfPair])).length === 0, 'Продукт пары повар не изменит', '0 строк')
  check((await db.q(`delete from public.foods where id = $1 returning 1`, [foodOfPair])).length === 0, 'И не удалит', '0 строк')
  await db.q(`insert into public.food_servings (food_id, label, grams) values ($1, 'порция', 250)`, [ownId])
  await db.mustFail('Меры к чужому продукту не добавит', `insert into public.food_servings (food_id, label, grams) values ($1, 'x', 10)`, [foodOfPair], 'row-level security')
  await db.q(`insert into storage.objects (bucket_id, name, owner_id) values ('food-photos', $1 || '/a.webp', $2)`, [ownId, cook])
  await db.mustFail(
    'Фото в папку чужого продукта не положит',
    `insert into storage.objects (bucket_id, name, owner_id) values ('food-photos', $1 || '/b.webp', $2)`,
    [foodOfPair, cook],
    'row-level security',
  )
  // Дневник: запись в дневник владельца - да, правка и удаление - только своих
  const entry = (who: string) =>
    `insert into public.diary_entries (id, user_id, date, meal, name_snapshot, grams, kcal_100, protein_100, fat_100, carbs_100)
     values (gen_random_uuid(), '${who}', '2031-04-01', 'dinner', 'ТЕСТ от повара', 150, 130, 2.7, 0.3, 28) returning id::text, created_by::text`
  const added = await db.q<{ id: string; created_by: string }>(entry(owner))
  check(added[0]?.created_by === cook, 'Повар записывает съеденное в дневник владельца', 'created_by ставит база')
  const cookEntry = added[0]?.id ?? ''
  await db.mustFail('В дневник второго - нет', entry(other), [], 'row-level security')
  await db.mustFail(
    'Запись «от имени» владельца не подделать',
    `insert into public.diary_entries (id, user_id, date, meal, name_snapshot, grams, kcal_100, protein_100, fat_100, carbs_100, created_by)
     values (gen_random_uuid(), $1, '2031-04-01', 'lunch', 'x', 1, 1, 1, 1, 1, $1)`,
    [owner],
    'row-level security',
  )
  check((await db.q(`update public.diary_entries set grams = 200 where id = $1 returning 1`, [cookEntry])).length === 1, 'Свою запись повар правит', '1')
  const ownerEntry = await db.one(`select id::text from public.diary_entries where user_id = $1 and created_by is distinct from $2 limit 1`, [owner, cook])
  check((await db.q(`update public.diary_entries set grams = 1 where id = $1 returning 1`, [ownerEntry])).length === 0, 'Запись владельца повар не изменит', '0 строк')
  check((await db.q(`delete from public.diary_entries where id = $1 returning 1`, [ownerEntry])).length === 0, 'И не удалит', '0 строк')
  await db.as(owner)
  check((await db.q(`update public.diary_entries set grams = 180 where id = $1 returning 1`, [cookEntry])).length === 1, 'Владелец правит запись повара - это его дневник', '1')
  await db.as(cook)
  check((await db.q(`delete from public.diary_entries where id = $1 returning 1`, [cookEntry])).length === 1, 'Свою запись повар удаляет', '1')
  await db.mustFail('Тем не заводит', `insert into public.topics (title) values ('x')`, [], 'row-level security')

  // Функции: под поваром ничего чужого
  const probes: [string, string, unknown[]][] = [
    ['cycle_shared_with_me', 'select public.cycle_shared_with_me($1::uuid)::text', [other]],
    ['attention_count', 'select public.attention_count($1::uuid)::text', [owner]],
    ['week_summary', `select coalesce(public.week_summary('2031-03-31')::text, '')`, []],
    ['question_answered_by_partner', `select public.question_answered_by_partner('2031-04-01')::text`, []],
  ]
  for (const [name, sql, p] of probes) {
    const v = await db.one(sql, p)
    check(v === 'false' || v === '0' || v === '', `${name} - пусто для повара`, v || 'пусто')
  }
  check((await db.q(`select 1 from public.story('2031-04-01')`)).length === 0, 'История пары - пусто для повара', '0 строк')
  for (const fn of ['cycle_state', 'cycle_delay', 'pregnancy_active', 'checkin_streak', 'send_question_reminders']) {
    const args = fn === 'send_question_reminders' ? '' : fn === 'pregnancy_active' ? `'${other}'::uuid` : `'${other}'::uuid, '2031-04-01'::date`
    await db.mustFail(`${fn} повару не вызвать`, `select public.${fn}(${args})`, [], 'permission denied')
  }

  // --- Инвариант: функции с правами владельца проверяют, кто спрашивает ---
  await db.asOwner()
  const unchecked = await db.q<{ name: string }>(
    `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
        and has_function_privilege('authenticated', p.oid, 'execute')
        and pg_get_functiondef(p.oid) !~ 'is_member\\(\\)|is_cook\\(\\)'`,
  )
  const bad = unchecked.map((u) => u.name).filter((n) => !(n in NO_MEMBER_CHECK))
  check(bad.length === 0, 'Каждая SECURITY DEFINER для authenticated проверяет участника или повара', bad.join(', ') || 'исключения - с причиной')

  // --- Новая ссылка: токен, выданный до неё, ничего не открывает ------------
  await db.asOwner()
  const issued = Number(await db.one('select floor(extract(epoch from link_issued_at))::bigint::text from public.cooks where user_id = $1', [cook]))
  const asCookWithIat = async (iat: number): Promise<void> => {
    await db.asOwner()
    await db.q(
      `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated', 'iat', $2::bigint)::text, true)`,
      [cook, iat],
    )
    await db.q('set local role authenticated')
  }
  await asCookWithIat(issued - 60)
  check(Number(await db.one('select count(*) from public.foods')) === 0, 'Токен от старой ссылки - сразу пусто', 'не ждём часа до конца токена')
  await asCookWithIat(issued)
  check(Number(await db.one('select count(*) from public.foods')) > 0, 'Вход по новой ссылке в ту же секунду - работает', 'сравнение по целым секундам')

  // --- Отзыв закрывает сразу ----------------------------------------------
  await db.as(owner)
  await db.q('select public.cook_link_revoke()')
  await db.as(cook)
  check(Number(await db.one('select count(*) from public.foods')) === 0, 'Отозвали - повар не видит даже продуктов', 'без ожидания конца токена')
  check(Number(await db.one('select count(*) from public.diary_entries')) === 0, 'И дневника', '0')
})

finish('Доступ повара')
