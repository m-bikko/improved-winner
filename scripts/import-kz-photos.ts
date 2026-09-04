/**
 * Загружает фотографии для продуктов из scripts/kz-foods.json.
 *
 *   pnpm tsx scripts/import-kz-photos.ts [--dry]
 *
 * Отдельно от миграции, потому что миграция - это SQL, а фото надо скачать,
 * ужать и положить в storage. Продукты при этом работают и без фото: они
 * приехали миграцией, а этот скрипт лишь дополняет их.
 *
 * Сжатие теми же параметрами, что и в приложении (src/lib/image.ts): длинная
 * сторона до 512, вес до 110 КБ, webp. Иначе фото из этого скрипта весили бы
 * иначе, чем снятые телефоном, и «память ограничена» перестало бы соблюдаться
 * ровно там, где я сам её и трачу.
 *
 * Повторный запуск безопасен: у кого уже есть image_path, того пропускаем.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import sharp from 'sharp'
import { loadEnv, pgConfig, readVars } from './env.ts'

const MAX_SIDE = 512
const MAX_BYTES = 110 * 1024
const QUALITY_STEPS = [72, 60, 50, 42]

type Item = { name: string; brand: string; image: string | null }

/** Ужимаем до тех же границ, что и клиент. */
async function prepare(input: Buffer): Promise<Buffer | null> {
  const base = sharp(input).rotate().resize({
    width: MAX_SIDE,
    height: MAX_SIDE,
    fit: 'inside',
    withoutEnlargement: true,
  })
  for (const quality of QUALITY_STEPS) {
    const out = await base.clone().webp({ quality }).toBuffer()
    if (out.byteLength <= MAX_BYTES) return out
  }
  return null
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry')
  const { supabaseUrl } = loadEnv()

  // service_role, а не sb_secret_: Storage разбирает ключ как JWT, и ключ
  // нового формата он отвергает с «Invalid Compact JWS». Для базы годится
  // любой из двух, для storage - только этот.
  const serviceRole = readVars()['SUPABASE_SERVICE_ROLE_KEY']
  if (!serviceRole) throw new Error('Не задан SUPABASE_SERVICE_ROLE_KEY')
  const storage = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  }).storage.from('food-photos')
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const items = JSON.parse(
    await readFile(join(root, 'scripts/kz-foods.json'), 'utf8'),
  ) as Item[]

  const db = new Client(pgConfig())
  await db.connect()

  let done = 0
  let skipped = 0
  let failed = 0
  let bytes = 0

  try {
    for (const item of items) {
      if (!item.image) {
        skipped++
        continue
      }
      const { rows } = await db.query<{ id: string; image_path: string | null }>(
        'select id, image_path from public.foods where name = $1 and brand = $2 limit 1',
        [item.name, item.brand],
      )
      const food = rows[0]
      if (!food) {
        console.log(`  нет в базе: ${item.brand} ${item.name}`)
        failed++
        continue
      }
      if (food.image_path) {
        skipped++
        continue
      }

      let raw: Buffer
      try {
        const res = await fetch(item.image, {
          headers: { 'User-Agent': 'TandemApp/1.0 (private nutrition app)' },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        raw = Buffer.from(await res.arrayBuffer())
      } catch (e) {
        console.log(`  не скачалось: ${item.brand} ${item.name} - ${String(e)}`)
        failed++
        continue
      }

      const webp = await prepare(raw)
      if (!webp) {
        console.log(`  не ужалось до ${MAX_BYTES / 1024} КБ: ${item.brand} ${item.name}`)
        failed++
        continue
      }

      const path = `${food.id}/${randomUUID()}.webp`
      if (dry) {
        console.log(`  [сухой прогон] ${item.brand} ${item.name} → ${Math.round(webp.byteLength / 1024)} КБ`)
        done++
        bytes += webp.byteLength
        continue
      }

      const { error: upError } = await storage.upload(path, new Uint8Array(webp), {
        contentType: 'image/webp',
        cacheControl: '31536000',
      })
      if (upError) {
        console.log(`  не загрузилось: ${item.brand} ${item.name} - ${upError.message}`)
        failed++
        continue
      }

      await db.query('update public.foods set image_path = $1 where id = $2', [path, food.id])
      done++
      bytes += webp.byteLength
      console.log(`  ${item.brand} ${item.name} → ${Math.round(webp.byteLength / 1024)} КБ`)
    }
  } finally {
    await db.end()
  }

  console.log(
    `\nЗагружено ${done}, пропущено ${skipped}, не вышло ${failed}. ` +
      `Всего ${Math.round(bytes / 1024)} КБ.`,
  )
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
