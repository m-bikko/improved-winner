/**
 * Проверка голосовых записок.
 *
 *   pnpm tsx scripts/check-voice.ts
 *
 * Слушатель может поставить «прослушано» - и только это: колоночное право
 * не даёт ему переписать путь к файлу или длительность. Автор не отмечает
 * свою записку прослушанной. Файл кладут только в папку со своим id.
 * Второму приходит уведомление с длительностью. Плюс огибающая громкости.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { toPeaks } from '../src/features/voice/recorder.ts'
import { check, finish, inTransaction } from './harness.ts'

const peaks = toPeaks(Array.from({ length: 300 }, (_, i) => (i % 50) * 2))
check(peaks.length === 48 && Math.max(...peaks) <= 100 && Math.min(...peaks) >= 0, 'Огибающая - 48 столбиков 0..100', `${peaks.length} шт., макс ${Math.max(...peaks)}`)
check(toPeaks([30, 60]).length === 2, 'Короткая запись - столько столбиков, сколько замеров', '2')

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  await db.q(`update public.profiles set sex = 'male' where user_id = $1`, [a])

  await db.mustFail(
    'Огибающая за пределами 0..100 отвергается',
    `insert into public.voice_notes (id, author_id, path, duration_ms, peaks) values (gen_random_uuid(), $1, 'x', 1000, '{120}')`,
    [a],
    'voice_notes_peaks_check',
  )
  await db.mustFail(
    'Дольше трёх минут - не записка',
    `insert into public.voice_notes (id, author_id, path, duration_ms, peaks) values (gen_random_uuid(), $1, 'x', 200000, '{10}')`,
    [a],
    'voice_notes_duration_ms_check',
  )

  await db.as(a)
  const before = await db.queued()
  const id = await db.one(
    `insert into public.voice_notes (id, author_id, path, duration_ms, peaks) values (gen_random_uuid(), $1, $2, 42000, '{10,50,90}') returning id::text`,
    [a, `${a}/test.m4a`],
  )
  const p = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string; body: string })
  check(
    (await db.queued()) > before && p[0]?.userId === b && p[0]?.title === 'Аминош записал голосовое' && p[0]?.body === '0:42',
    'Второму - кто записал и сколько длится',
    `${p[0]?.title} / ${p[0]?.body}`,
  )
  const selfListen = await db.q(`update public.voice_notes set listened_at = now() where id = $1 returning 1`, [id])
  check(selfListen.length === 0, 'Свою записку прослушанной не отметить', 'отметка - для того, кому записка')
  await db.mustFail(
    'Положить файл в чужую папку нельзя',
    `insert into storage.objects (bucket_id, name, owner_id) values ('voice-notes', $1, $2)`,
    [`${b}/sneaky.m4a`, a],
    'row-level security',
  )

  await db.as(b)
  const listened = await db.q(`update public.voice_notes set listened_at = now() where id = $1 returning 1`, [id])
  check(listened.length === 1, 'Слушатель отмечает «прослушано»', 'автор увидит две галочки')
  await db.mustFail(
    'Но переписать путь к файлу слушатель не может',
    `update public.voice_notes set path = 'other' where id = $1`,
    [id],
    'permission denied',
  )
  const gone = await db.q(`delete from public.voice_notes where id = $1 returning 1`, [id])
  check(gone.length === 0, 'Чужую записку не удалить', 'удаляет автор')
})

finish('Голосовые')
