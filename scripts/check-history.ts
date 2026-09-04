/**
 * Проверка того, ради чего в дневнике вообще заведён снимок КБЖУ:
 * правка продукта в справочнике не должна переписывать прошлые записи,
 * а правка граммовки задним числом должна пересчитываться честно.
 *
 *   pnpm tsx scripts/check-history.ts
 *
 * Всё происходит внутри транзакции и откатывается.
 */
import { Client } from 'pg'
import { pgConfig } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()

  try {
    await client.query('begin')

    const { rows: users } = await client.query<{ id: string }>(
      'select user_id as id from app_members limit 1',
    )
    const userId = users[0]?.id
    if (!userId) throw new Error('В app_members нет ни одного пользователя')

    // Несколько команд одним query с параметрами Postgres не принимает,
    // поэтому по одной
    await client.query(
      'create temp table t as select gen_random_uuid() as food, gen_random_uuid() as entry',
    )
    await client.query(`
      insert into foods (id, kind, name, kcal_100, protein_100, fat_100, carbs_100)
      select food, 'product', 'ТЕСТ История', 100, 10, 5, 20 from t
    `)
    await client.query(
      `insert into diary_entries
         (id, user_id, date, meal, food_id, grams,
          name_snapshot, kcal_100, protein_100, fat_100, carbs_100)
       select entry, $1, current_date, 'lunch', food, 200,
              'ТЕСТ История', 100, 10, 5, 20
       from t`,
      [userId],
    )

    const before = await client.query<{ kcal: string }>(
      'select kcal::text from diary_entries where id = (select entry from t)',
    )
    check(
      before.rows[0]?.kcal === '200.00',
      'Запись считается из снимка на 100 г',
      `200 г × 100 ккал/100 г = ${before.rows[0]?.kcal}`,
    )

    // Продукт подорожал вдвое - история двигаться не должна
    await client.query(
      'update foods set kcal_100 = 200, protein_100 = 20 where id = (select food from t)',
    )
    const after = await client.query<{ kcal: string; kcal_100: string }>(
      'select kcal::text, kcal_100::text from diary_entries where id = (select entry from t)',
    )
    check(
      after.rows[0]?.kcal === '200.00' && after.rows[0]?.kcal_100 === '100.00',
      'Правка продукта НЕ переписывает прошлую запись',
      `после правки продукта на 200 ккал запись всё ещё ${after.rows[0]?.kcal} ккал`,
    )

    // А вот правка граммовки обязана пересчитаться - и по старому снимку
    await client.query('update diary_entries set grams = 300 where id = (select entry from t)')
    const regrammed = await client.query<{ kcal: string; protein: string }>(
      'select kcal::text, protein::text from diary_entries where id = (select entry from t)',
    )
    check(
      regrammed.rows[0]?.kcal === '300.00' && regrammed.rows[0]?.protein === '30.00',
      'Правка граммовки пересчитывается по снимку, а не по живому продукту',
      `300 г → ${regrammed.rows[0]?.kcal} ккал, Б ${regrammed.rows[0]?.protein} (по живому вышло бы 600 и 60)`,
    )

    // Архивация продукта не должна рвать историю
    await client.query(
      'update foods set archived_at = now() where id = (select food from t)',
    )
    const archived = await client.query<{ kcal: string; food_id: string | null }>(
      'select kcal::text, food_id from diary_entries where id = (select entry from t)',
    )
    check(
      archived.rows[0]?.kcal === '300.00' && archived.rows[0]?.food_id !== null,
      'Архивация продукта не рвёт запись дневника',
      `запись на месте: ${archived.rows[0]?.kcal} ккал, ссылка на продукт сохранена`,
    )
  } finally {
    await client.query('rollback')
    await client.end()
  }

  console.log(failed === 0 ? '\nИстория защищена.' : `\nПровалено: ${failed}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
