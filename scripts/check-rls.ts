/**
 * Проверка политик доступа глазами реального пользователя.
 *
 *   pnpm tsx scripts/check-rls.ts
 *
 * В отличие от scripts/sql.ts, который ходит в базу от имени postgres и потому
 * RLS не видит вовсе, здесь всё идёт через publishable-ключ и настоящую сессию —
 * то есть ровно тем путём, которым ходит браузер.
 *
 * Ключевой сценарий: посторонний аккаунт, которого нет в app_members, не должен
 * видеть ни строки. Одной проверки «пользователь авторизован» было бы мало —
 * любой новый аккаунт в проекте получил бы полный доступ.
 *
 * Временный аккаунт создаётся и удаляется внутри скрипта.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/db.ts'
import { ACCOUNTS } from '../src/lib/accounts.ts'
import { loadEnv, readVars } from './env.ts'

type Db = SupabaseClient<Database>

const OUTSIDER = { email: 'outsider@lovepromises.test', password: 'zx8Qv2Lm41pT' }

let failed = 0

function report(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
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
    foreign.error?.message ?? 'запись ПРОШЛА — политика дырявая',
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

    for (const table of [
      'foods',
      'food_servings',
      'dish_items',
      'diary_entries',
      'daily_goals',
      'weight_log',
      'profiles',
      'topics',
      'topic_comments',
      'app_members',
    ] as const) {
      const res = await asOutsider.from(table).select('*')
      const rows = res.data?.length ?? 0
      report(rows === 0, `Посторонний не видит ${table}`, `строк: ${rows}`)
    }

    const write = await asOutsider
      .from('foods')
      .insert({ kind: 'product', name: 'ВЗЛОМ', kcal_100: 1 })
    report(
      write.error !== null,
      'Посторонний не может писать в foods',
      write.error?.message ?? 'запись ПРОШЛА — политика дырявая',
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
