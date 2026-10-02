/**
 * Проверка ленты воспоминаний.
 *
 *   pnpm tsx scripts/check-memories.ts
 *
 * Три слоя:
 *   - дата съёмки из EXIF: разбор на JPEG, собранных здесь же байт за байтом,
 *     в обоих порядках байт, с запасным тегом и с битым файлом - битый
 *     обязан давать null, а не исключение;
 *   - лента: «в этот день», группировка, мозаика;
 *   - база и хранилище: правит автор, фото кладутся только в папку своего
 *     воспоминания, не больше двенадцати, второму приходит уведомление.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { exifDateFrom } from '../src/lib/exif.ts'
import { byMonth, mosaicOf, onThisDay, singleAspect } from '../src/features/memories/logic.ts'
import type { Memory } from '../src/features/memories/api.ts'
import { check, finish, inTransaction } from './harness.ts'

// --- EXIF --------------------------------------------------------------------

/** JPEG с APP1/EXIF: DateTimeOriginal в Exif IFD и/или DateTime в IFD0. */
function jpeg({ little, original, plain }: { little: boolean; original?: string; plain?: string }): DataView {
  const bytes: number[] = []
  const u16 = (v: number) => (little ? bytes.push(v & 0xff, v >> 8) : bytes.push(v >> 8, v & 0xff))
  const u32 = (v: number) =>
    little
      ? bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24)
      : bytes.push(v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff)
  const ascii = (s: string) => {
    for (const ch of s) bytes.push(ch.charCodeAt(0))
    bytes.push(0)
  }

  // TIFF: заголовок 8 байт, IFD0 сразу за ним
  bytes.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]))
  u16(42)
  u32(8)
  const ifd0Entries = (plain ? 1 : 0) + (original ? 1 : 0)
  const ifd0Size = 2 + ifd0Entries * 12 + 4
  const exifIfdAt = 8 + ifd0Size
  const exifIfdSize = original ? 2 + 12 + 4 : 0
  let strings = exifIfdAt + exifIfdSize
  const plainAt = strings
  if (plain) strings += 20
  const originalAt = strings

  u16(ifd0Entries)
  if (plain) {
    u16(0x0132), u16(2), u32(20), u32(plainAt)
  }
  if (original) {
    u16(0x8769), u16(4), u32(1), u32(exifIfdAt)
  }
  u32(0)
  if (original) {
    u16(1)
    u16(0x9003), u16(2), u32(20), u32(originalAt)
    u32(0)
  }
  if (plain) ascii(plain)
  if (original) ascii(original)

  const tiff = bytes.splice(0)
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const length = app1.length + 2
  const file = [0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...app1, 0xff, 0xda, 0, 2]
  return new DataView(new Uint8Array(file).buffer)
}

check(exifDateFrom(jpeg({ little: true, original: '2026:09:30 07:29:00' })) === '2026-09-30', 'Дата съёмки - порядок байт Intel', 'DateTimeOriginal')
check(exifDateFrom(jpeg({ little: false, original: '2025:12:31 23:59:59' })) === '2025-12-31', 'Дата съёмки - порядок байт Motorola', 'DateTimeOriginal')
check(
  exifDateFrom(jpeg({ little: true, original: '2026:01:02 10:00:00', plain: '2026:05:05 10:00:00' })) === '2026-01-02',
  'Момент съёмки важнее даты правки',
  'DateTime переписывает любой редактор',
)
check(exifDateFrom(jpeg({ little: true, plain: '2024:02:29 12:00:00' })) === '2024-02-29', 'Без DateTimeOriginal - запасной DateTime', 'IFD0')
check(exifDateFrom(jpeg({ little: true, original: '0000:00:00 00:00:00' })) === null, 'Пустые нули камеры - не дата', 'null')
const broken = jpeg({ little: true, original: '2026:09:30 07:29:00' })
check(exifDateFrom(new DataView(broken.buffer.slice(0, 30))) === null, 'Обрезанный файл - null, а не исключение', '30 байт')
check(exifDateFrom(new DataView(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)) === null, 'Не JPEG - null', 'PNG')

// --- лента -------------------------------------------------------------------

const memory = (id: string, happenedOn: string): Memory => ({
  id,
  authorId: 'a',
  happenedOn,
  caption: null,
  place: null,
  createdAt: '',
  photos: [],
  hearts: [],
})
const feed = [memory('m3', '2026-10-02'), memory('m2', '2025-10-02'), memory('m1', '2024-10-02'), memory('m0', '2025-10-03')]
const day = onThisDay(feed, '2026-10-02')
check(
  day.map((d) => `${d.memory.id}:${d.yearsAgo}`).join() === 'm2:1,m1:2',
  '«В этот день» - то же число в прошлые годы, ближние первыми',
  day.map((d) => `${d.yearsAgo} г.`).join(', '),
)
check(onThisDay([memory('leap', '2024-02-29')], '2025-03-01').length === 0, '29 февраля не всплывает первого марта', 'честнее промолчать')
check(byMonth(feed).map((g) => g.month).join() === '2026-10,2025-10,2024-10,2025-10', 'Группы месяцев идут в порядке ленты', 'соседние записи одного месяца - в одной группе')
check(
  mosaicOf(1) === 'one' && mosaicOf(2) === 'two' && mosaicOf(3) === 'three' && mosaicOf(9) === 'grid',
  'Мозаика по числу фото',
  '1, 2, 3, сетка',
)
check(singleAspect(1000, 5000) === 0.8 && singleAspect(5000, 1000) === 16 / 9, 'Одиночный снимок - в рамках 4:5 - 16:9', 'панорама не занимает три экрана')

// --- база --------------------------------------------------------------------

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  await db.q(`update public.profiles set sex = 'female' where user_id = $1`, [a])

  const bucket = await db.q<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
    `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'memory-photos'`,
  )
  check(
    bucket[0]?.public === false && Number(bucket[0]?.file_size_limit) === 614400 && (bucket[0]?.allowed_mime_types ?? []).join() === 'image/webp,image/jpeg',
    'Бакет приватный, с потолком 600 КБ и только WebP/JPEG',
    JSON.stringify(bucket[0]),
  )

  await db.as(a)
  const before = await db.queued()
  const id = await db.one(
    `insert into public.memories (id, author_id, happened_on, caption) values (gen_random_uuid(), $1, '2031-01-01', 'Море') returning id::text`,
    [a],
  )
  const pushed = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string; body: string })
  check(
    (await db.queued()) > before && pushed[0]?.userId === b && pushed[0]?.title === 'Аминош добавила воспоминание' && pushed[0]?.body === 'Море',
    'Второму - кто добавил и подпись',
    `${pushed[0]?.title} / ${pushed[0]?.body}`,
  )

  await db.mustFail(
    'Заглушка - только data URL картинки',
    `insert into public.memory_photos (memory_id, path, thumb_path, width, height, placeholder) values ($1, 'p', 't', 10, 10, 'https://evil')`,
    [id],
    'memory_photos_placeholder_check',
  )
  const photo = (i: number) =>
    db.q(
      `insert into public.memory_photos (memory_id, path, thumb_path, width, height, placeholder, position)
       values ($1, $2, $3, 1600, 1200, 'data:image/webp;base64,AA', $4)`,
      [id, `${id}/${i}.webp`, `${id}/${i}-t.webp`, i % 12],
    )
  for (let i = 0; i < 12; i++) await photo(i)
  await db.mustFail(
    'Тринадцатое фото в одно воспоминание не ложится',
    `insert into public.memory_photos (memory_id, path, thumb_path, width, height, placeholder) values ($1, 'p13', 't13', 10, 10, 'data:image/webp;base64,AA')`,
    [id],
    'memory_photos_limit',
  )

  // Второе воспоминание - без фото: в первом уже двенадцать, и лимит
  // (триггер BEFORE) сработал бы раньше политики, проверка была бы не о том
  const empty = await db.one(
    `insert into public.memories (id, author_id, happened_on, caption) values (gen_random_uuid(), $1, '2031-01-02', 'Пусто') returning id::text`,
    [a],
  )

  await db.as(b)
  check((await db.q('select 1 from public.memory_photos where memory_id = $1', [id])).length === 12, 'Второй видит воспоминание и все фото', 'альбом общий')
  const edited = await db.q(`update public.memories set caption = 'чужое' where id = $1 returning 1`, [id])
  const deleted = await db.q(`delete from public.memories where id = $1 returning 1`, [id])
  check(edited.length === 0 && deleted.length === 0, 'Чужое воспоминание не правится и не удаляется', 'правит автор')
  await db.mustFail(
    'Положить фото в чужое воспоминание нельзя',
    `insert into public.memory_photos (memory_id, path, thumb_path, width, height, placeholder) values ($1, 'x', 'y', 10, 10, 'data:image/webp;base64,AA')`,
    [empty],
    'row-level security',
  )
  await db.mustFail(
    'Загрузить файл в папку чужого воспоминания нельзя',
    `insert into storage.objects (bucket_id, name, owner_id) values ('memory-photos', $1, $2)`,
    [`${empty}/sneaky.webp`, b],
    'row-level security',
  )
  await db.as(a)
  const own = await db.q(
    `insert into storage.objects (bucket_id, name, owner_id) values ('memory-photos', $1, $2) returning 1`,
    [`${empty}/ok.webp`, a],
  )
  check(own.length === 1, 'В папку своего воспоминания класть можно', 'иначе загрузка из приложения не прошла бы')
  // Удаление напрямую из storage.objects Supabase запрещает своим триггером
  // (только через Storage API), поэтому здесь сверяется сама политика
  await db.asOwner()
  const remove = await db.one(
    `select qual from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'memory_photos_remove'`,
  )
  check(remove.includes('owner_id') && remove.includes('auth.uid()'), 'Удалить файл может только тот, кто загрузил', remove.replace(/\s+/g, ' ').slice(0, 90))
  await db.as(b)

  await db.q(`insert into public.memory_hearts (memory_id, user_id) values ($1, $2)`, [id, b])
  check(true, 'Сердце на чужом воспоминании ставится', 'для этого оно и есть')
  await db.mustFail(
    'Сердце за другого - нельзя',
    `insert into public.memory_hearts (memory_id, user_id) values ($1, $2)`,
    [id, a],
    'row-level security',
  )
})

finish('Лента воспоминаний')
