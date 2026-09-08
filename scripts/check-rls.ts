/**
 * Проверка политик доступа глазами реального пользователя.
 *
 *   pnpm tsx scripts/check-rls.ts
 *
 * В отличие от scripts/sql.ts, который ходит в базу от имени postgres и потому
 * RLS не видит вовсе, здесь всё идёт через publishable-ключ и настоящую сессию -
 * то есть ровно тем путём, которым ходит браузер.
 *
 * Ключевой сценарий: посторонний аккаунт, которого нет в app_members, не должен
 * видеть ни строки. Одной проверки «пользователь авторизован» было бы мало -
 * любой новый аккаунт в проекте получил бы полный доступ.
 *
 * Временный аккаунт создаётся и удаляется внутри скрипта.
 *
 * Список таблиц берётся ИЗ БАЗЫ, а не из кода. Раньше он был вписан руками
 * и успел устареть на семь таблиц: задачи, отметки самочувствия, цикл и всё,
 * что появилось после. То есть проверка спокойно говорила «посторонний
 * ничего не видит», ни разу не заглянув в половину приложения. Перечисление
 * из pg_class такого повторить не даст: новая таблица попадает под проверку
 * в тот же день, когда появляется.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import type { Database } from '../src/types/db.ts'
import { ACCOUNTS } from '../src/lib/accounts.ts'
import { loadEnv, pgConfig, readVars } from './env.ts'

type Db = SupabaseClient<Database>

const OUTSIDER = { email: 'outsider@tandem.test', password: 'zx8Qv2Lm41pT' }

let failed = 0

function report(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

/**
 * Все таблицы схемы public - прямо из каталога.
 *
 * Ходим служебным подключением: посторонний по определению не должен уметь
 * перечислять таблицы, и просить об этом его же сессию было бы бессмысленно.
 */
async function listPublicTables(): Promise<string[]> {
  const client = new Client(pgConfig())
  await client.connect()
  try {
    const { rows } = await client.query<{ name: string }>(
      `select c.relname as name
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname`,
    )
    return rows.map((r) => r.name)
  } finally {
    await client.end()
  }
}

async function signIn(url: string, key: string, email: string, password: string): Promise<Db> {
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Вход ${email} не удался: ${error.message}`)
  return client
}

async function main(): Promise<void> {
  const { supabaseUrl, secretKey, publishableKey } = loadEnv()
  const vars = readVars()
  const admin = createClient<Database>(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // --- Свой человек -------------------------------------------------------
  const bikosh = ACCOUNTS.find((a) => a.id === 'bikosh')
  const aminosh = ACCOUNTS.find((a) => a.id === 'aminosh')
  if (!bikosh || !aminosh) throw new Error('Список аккаунтов повреждён')

  const pinB = vars['LOVE_PIN_BIKOSH'] ?? ''
  const pinA = vars['LOVE_PIN_AMINOSH'] ?? ''

  const asBikosh = await signIn(supabaseUrl, publishableKey, bikosh.email, pinB)
  report(true, 'Вход по PIN работает', `${bikosh.nickname} авторизован`)

  const asAminosh = await signIn(supabaseUrl, publishableKey, aminosh.email, pinA)
  report(true, 'Вход по PIN работает', `${aminosh.nickname} авторизован`)

  const bikoshId = (await asBikosh.auth.getUser()).data.user?.id ?? ''

  const profiles = await asBikosh.from('profiles').select('nickname')
  report(
    profiles.data?.length === 2,
    'Профили партнёра видны (нужны для подписи автора темы)',
    `видно профилей: ${profiles.data?.length ?? 0}`,
  )

  const food = await asBikosh
    .from('foods')
    .insert({ kind: 'product', name: 'ПРОВЕРКА RLS', kcal_100: 100, created_by: bikoshId })
    .select('id')
    .single()
  report(!food.error, 'Свой человек может завести продукт', food.error?.message ?? 'создан')

  const entry = await asBikosh.from('diary_entries').insert({
    id: crypto.randomUUID(),
    user_id: bikoshId,
    date: '2026-09-03',
    meal: 'lunch',
    grams: 150,
    name_snapshot: 'ПРОВЕРКА RLS',
    kcal_100: 100,
    protein_100: 10,
    fat_100: 5,
    carbs_100: 20,
  })
  report(!entry.error, 'Своя запись в дневник проходит', entry.error?.message ?? 'добавлена')

  const foreign = await asAminosh.from('diary_entries').insert({
    id: crypto.randomUUID(),
    user_id: bikoshId, // чужой user_id
    date: '2026-09-03',
    meal: 'lunch',
    grams: 100,
    name_snapshot: 'ПРОВЕРКА RLS чужая',
    kcal_100: 100,
    protein_100: 1,
    fat_100: 1,
    carbs_100: 1,
  })
  report(
    foreign.error !== null,
    'Писать в ЧУЖОЙ дневник нельзя',
    foreign.error?.message ?? 'запись ПРОШЛА - политика дырявая',
  )

  const seen = await asAminosh.from('diary_entries').select('id').eq('user_id', bikoshId)
  report(
    (seen.data?.length ?? 0) > 0,
    'Читать чужой дневник можно (режим сравнения)',
    `видно записей партнёра: ${seen.data?.length ?? 0}`,
  )

  // --- Посторонний --------------------------------------------------------
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: OUTSIDER.email,
    password: OUTSIDER.password,
    email_confirm: true,
  })
  if (createError) throw new Error(`Не удалось создать тестовый аккаунт: ${createError.message}`)
  const outsiderId = created.user.id

  try {
    const asOutsider = await signIn(
      supabaseUrl,
      publishableKey,
      OUTSIDER.email,
      OUTSIDER.password,
    )

    const tables = await listPublicTables()
    report(tables.length > 0, 'Список таблиц получен из базы', `таблиц: ${tables.length}`)

    let leaked = 0
    for (const table of tables) {
      const res = await asOutsider.from(table as never).select('*')
      // Отказ в правах - тоже успех, и даже более крепкий: до политик
      // дело просто не доходит
      const rows = res.data?.length ?? 0
      if (rows > 0) {
        leaked++
        report(false, `Посторонний ВИДИТ ${table}`, `строк: ${rows}`)
      }
    }
    report(
      leaked === 0,
      'Посторонний не видит ни одной таблицы',
      `проверено ${tables.length}, утечек ${leaked}`,
    )

    const write = await asOutsider
      .from('foods')
      .insert({ kind: 'product', name: 'ВЗЛОМ', kcal_100: 1 })
    report(
      write.error !== null,
      'Посторонний не может писать в foods',
      write.error?.message ?? 'запись ПРОШЛА - политика дырявая',
    )

    const rpc = await asOutsider.rpc('search_topics', { q: 'тест' })
    report(
      (rpc.data?.length ?? 0) === 0,
      'Посторонний не получает результатов из search_topics',
      `строк: ${rpc.data?.length ?? 0}`,
    )
  } finally {
    await admin.auth.admin.deleteUser(outsiderId)
    await admin.from('foods').delete().eq('name', 'ПРОВЕРКА RLS')
    await admin.from('diary_entries').delete().like('name_snapshot', 'ПРОВЕРКА RLS%')
    console.log('\n  прибрано: тестовый аккаунт удалён, тестовые данные снесены')
  }

  console.log(failed === 0 ? '\nПолитики держатся.' : `\nПровалено проверок: ${failed}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
