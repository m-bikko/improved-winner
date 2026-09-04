/**
 * Проверка доступа к разделу цикла живыми сессиями.
 *
 *   pnpm tsx scripts/check-cycle-rls.ts
 *
 * Это единственная проверка, которая заходит в приложение НАСТОЯЩИМИ
 * аккаунтами, а не служебным ключом. Служебный ключ обходит RLS, и все
 * прежние проверки цикла - про ограничения схемы и про арифметику - про
 * доступ не говорили ничего.
 *
 * А сказать надо, потому что цена ошибки здесь другая. В остальном
 * приложении «оба видят всё» и утечка невозможна по определению. Здесь
 * владелец решает сам, и если политика окажется дырявой, приложение покажет
 * партнёру медицинские данные человека, который этого не разрешал. Такую
 * ошибку нельзя заметить по интерфейсу: он честно спрячет то, что база
 * всё равно отдала.
 *
 * Проверка НИЧЕГО не пишет в живые данные и не меняет чужих настроек:
 * она читает то, что есть, и сверяет с флагом share_with_partner.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/db.ts'
import { ACCOUNTS } from '../src/lib/accounts.ts'
import { loadEnv, readVars } from './env.ts'

type Db = SupabaseClient<Database>

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

async function signIn(url: string, key: string, email: string, password: string): Promise<Db> {
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Не вошёл как ${email}: ${error.message}`)
  return client
}

async function main(): Promise<void> {
  const { supabaseUrl: url, publishableKey: key } = loadEnv()
  const vars = readVars()

  const pins: Record<string, string> = {
    bikosh: vars['LOVE_PIN_BIKOSH'] ?? '',
    aminosh: vars['LOVE_PIN_AMINOSH'] ?? '',
  }

  for (const owner of ACCOUNTS) {
    const other = ACCOUNTS.find((a) => a.id !== owner.id)
    if (!other) continue

    const ownerPin = pins[owner.id]
    const otherPin = pins[other.id]
    if (!ownerPin || !otherPin) throw new Error(`Нет PIN для ${owner.id}/${other.id}`)

    const asOwner = await signIn(url, key, owner.email, ownerPin)
    const asOther = await signIn(url, key, other.email, otherPin)

    const { data: me } = await asOwner.auth.getUser()
    const ownerId = me.user?.id
    if (!ownerId) throw new Error('Нет id владельца')

    // Что видит сам владелец
    const mine = await asOwner.from('periods').select('id').eq('user_id', ownerId)
    const mineCount = mine.data?.length ?? 0

    // Открыт ли доступ
    const settings = await asOwner.from('cycle_settings').select('*').maybeSingle()
    const shared =
      (settings.data?.tracking_enabled ?? false) && (settings.data?.share_with_partner ?? false)

    // Что видит партнёр
    const seen = await asOther.from('periods').select('id').eq('user_id', ownerId)
    const seenCount = seen.data?.length ?? 0

    const seenDays = await asOther.from('cycle_days').select('date').eq('user_id', ownerId)
    const seenDaysCount = seenDays.data?.length ?? 0

    if (shared) {
      check(
        seenCount === mineCount,
        `${owner.nickname} открыл(а) доступ - ${other.nickname} видит записи`,
        `у владельца ${mineCount}, партнёр видит ${seenCount}`,
      )
    } else {
      check(
        seenCount === 0 && seenDaysCount === 0,
        `${owner.nickname} доступ НЕ открывал(а) - ${other.nickname} не видит ничего`,
        `у владельца ${mineCount} записей, партнёр видит ${seenCount} записей и ${seenDaysCount} отметок`,
      )
    }

    // Настройки чужими быть не должны в любом случае: даже при открытом
    // доступе партнёру незачем знать длину лютеиновой фазы, а главное -
    // по строке настроек он мог бы понять, что раздел включён, даже когда
    // ему не показывают ничего.
    const foreignSettings = await asOther.from('cycle_settings').select('*').eq('user_id', ownerId)
    check(
      (foreignSettings.data?.length ?? 0) === 0,
      `Настройки ${owner.nickname} партнёру не видны`,
      `строк вернулось: ${foreignSettings.data?.length ?? 0}`,
    )

    // Писать в чужой цикл нельзя никогда, даже при открытом доступе:
    // «показывать» и «править» - разные вещи.
    const write = await asOther.from('periods').insert({
      user_id: ownerId,
      started_on: '2020-01-01',
    })
    check(
      write.error !== null,
      `${other.nickname} не может писать в цикл ${owner.nickname}`,
      write.error ? write.error.message.split('\n')[0] ?? '' : 'ВСТАВКА ПРОШЛА',
    )

    await asOwner.auth.signOut()
    await asOther.auth.signOut()
  }

  console.log(failed === 0 ? '\nДоступ к циклу держится.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
