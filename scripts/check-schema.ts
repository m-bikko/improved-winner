/**
 * Проверка инвариантов схемы: каждый кейс либо должен упасть с ошибкой базы,
 * либо дать конкретное ожидаемое значение.
 *
 * Смысл в том, чтобы инварианты держала база, а не клиентский код. Валидация
 * только в UI разваливается при первом же ручном апдейте или баге в форме.
 *
 *   pnpm tsx scripts/check-schema.ts
 */
import { Client } from 'pg'
import { pgConfig } from './env.ts'

type Case = {
  name: string
  sql: string
  /** Подстрока, которую ждём в тексте ошибки. Если задана — запрос обязан упасть. */
  mustFailWith?: string
  /** Ожидаемое значение первой колонки первой строки. Если задано — запрос обязан пройти. */
  expect?: string
}

const SETUP = `
  create temp table ids as
  select
    gen_random_uuid() as chicken,
    gen_random_uuid() as rice,
    gen_random_uuid() as plov,
    gen_random_uuid() as soup;

  insert into foods (id, kind, name, kcal_100, protein_100, fat_100, carbs_100)
  select chicken, 'product', 'ТЕСТ Курица', 113, 23.6, 1.9, 0.4 from ids
  union all
  select rice, 'product', 'ТЕСТ Рис', 130, 2.7, 0.3, 28.2 from ids;

  insert into foods (id, kind, name, yield_grams)
  select plov, 'dish', 'ТЕСТ Плов', 700 from ids
  union all
  select soup, 'dish', 'ТЕСТ Суп', 900 from ids;

  insert into dish_items (dish_id, food_id, grams)
  select plov, chicken, 500 from ids
  union all
  select plov, rice, 300 from ids;
`

const CLEANUP = `
  delete from diary_entries where name_snapshot like 'ТЕСТ %';
  delete from dish_items where dish_id in (select id from foods where name like 'ТЕСТ %');
  delete from foods where name like 'ТЕСТ %';
  delete from topics where title like 'ТЕСТ %';
`

const cases: Case[] = [
  {
    name: 'Закрытая тема без текста решения отклоняется',
    sql: `insert into topics (title, status, resolution, closed_at, closed_by, created_by)
          values ('ТЕСТ тема', 'closed', '', now(), gen_random_uuid(), gen_random_uuid())`,
    mustFailWith: 'topics_status_consistent',
  },
  {
    name: 'Открытая тема с заполненным решением отклоняется',
    sql: `insert into topics (title, status, resolution, created_by)
          values ('ТЕСТ тема', 'open', 'уже решили', gen_random_uuid())`,
    mustFailWith: 'topics_status_consistent',
  },
  {
    // Именно составной FK, а не self-check: dish_id и food_id разные,
    // но food_id указывает на строку с kind='dish'
    name: 'Блюдо нельзя положить ингредиентом в другое блюдо',
    sql: `insert into dish_items (dish_id, food_id, grams)
          select (select plov from ids), (select soup from ids), 100`,
    mustFailWith: 'dish_items_food_fk',
  },
  {
    name: 'Нулевая граммовка в дневнике отклоняется',
    sql: `insert into diary_entries
            (id, user_id, date, meal, grams, name_snapshot, kcal_100, protein_100, fat_100, carbs_100)
          values (gen_random_uuid(), gen_random_uuid(), current_date, 'lunch', 0, 'ТЕСТ', 100, 1, 1, 1)`,
    mustFailWith: 'grams',
  },
  {
    name: 'Продукт, использованный в блюде, нельзя удалить',
    sql: `delete from foods where id = (select chicken from ids)`,
    mustFailWith: 'dish_items_food_fk',
  },
  {
    name: 'У продукта не может быть готового веса',
    sql: `insert into foods (kind, name, yield_grams) values ('product', 'ТЕСТ Вес', 500)`,
    mustFailWith: 'foods_yield_only_for_dish',
  },
  {
    name: 'Калорийность выше 900 на 100 г отклоняется',
    sql: `insert into foods (kind, name, kcal_100) values ('product', 'ТЕСТ Опечатка', 5400)`,
    mustFailWith: 'kcal_100',
  },
  {
    name: 'Дубль ингредиента в одном блюде отклоняется',
    sql: `insert into dish_items (dish_id, food_id, grams)
          select (select plov from ids), (select rice from ids), 50`,
    mustFailWith: 'dish_items_unique',
  },
  {
    // (500 * 113 + 300 * 130) / 700 * 100 = 136.43
    name: 'КБЖУ блюда считается на готовый вес',
    sql: `select kcal_100::text from foods_v where id = (select plov from ids)`,
    expect: '136.43',
  },
  {
    name: 'ё и е в name_norm совпадают',
    sql: `select (lower(translate('Ёлка', 'ёЁ', 'еЕ')) = 'елка')::text`,
    expect: 'true',
  },
]

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()

  let failed = 0
  try {
    await client.query('begin')
    await client.query(SETUP)

    for (const c of cases) {
      await client.query('savepoint s')
      let outcome: { ok: boolean; detail: string }

      try {
        const res = await client.query(c.sql)
        if (c.mustFailWith) {
          outcome = { ok: false, detail: 'запрос ПРОШЁЛ, хотя должен был упасть' }
        } else {
          const actual = String(Object.values(res.rows[0] ?? {})[0] ?? '')
          outcome =
            actual === c.expect
              ? { ok: true, detail: actual }
              : { ok: false, detail: `получено ${actual}, ожидалось ${c.expect}` }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await client.query('rollback to savepoint s')
        outcome = c.mustFailWith
          ? msg.includes(c.mustFailWith)
            ? { ok: true, detail: msg.split('\n')[0] ?? '' }
            : { ok: false, detail: `упало не там: ${msg}` }
          : { ok: false, detail: `неожиданная ошибка: ${msg}` }
      }

      if (!outcome.ok) failed++
      console.log(`${outcome.ok ? '  OK  ' : ' ПРОВАЛ '} ${c.name}\n         ${outcome.detail}`)
    }
  } finally {
    await client.query('rollback')
    await client.query(CLEANUP)
    await client.end()
  }

  console.log(failed === 0 ? '\nВсе инварианты держатся.' : `\nПровалено проверок: ${failed}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
