/**
 * Проверка «Кадра дня».
 *
 * Сигнал приходит в случайный момент окна 10-21 по местному времени обоих
 * и заранее не виден. Кадр второго - только после своего или когда сутки
 * после сигнала прошли; то же правило у файлов в хранилище, иначе папку
 * второго можно было бы просто перечислить. Снимать - после сигнала и
 * не позже суток. Второму - «твой ход» или «оба открыты».
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { check, finish, inTransaction } from './harness.ts'

type Push = { userId: string; title: string; body: string; url: string }

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru', timezone = 'Asia/Almaty'`)
  await db.q(`update public.profiles set sex = 'female' where user_id = $1`, [a])
  const pushes = async (n: number): Promise<Push[]> => (await db.lastPushes(n)).map((x) => JSON.parse(x) as Push)

  // --- расписание --------------------------------------------------------
  const at = '2031-06-01 00:03:00+05'
  await db.q(`select public.shot_tick($1::timestamptz)`, [at])
  const planned = await db.q<{ h: number; after: boolean; sent: boolean }>(
    `select extract(hour from fire_at at time zone 'Asia/Almaty')::int as h, fire_at > $1::timestamptz as after,
            sent_at is not null as sent
       from public.shot_prompts where day = '2031-06-01'`,
    [at],
  )
  const p0 = planned[0]
  check(p0 !== undefined && p0.h >= 10 && p0.h <= 20 && p0.after && !p0.sent, 'В полночь выбран момент в окне 10-21', `час ${p0?.h}`)

  // Разные пояса - пересечение окон: сигнал не придёт одному ночью
  await db.q(`update public.profiles set timezone = 'Europe/Moscow' where user_id = $1`, [b])
  await db.q(`select public.shot_tick('2031-06-02 00:03:00+05'::timestamptz)`)
  const both = await db.q<{ ha: number; hb: number }>(
    `select extract(hour from fire_at at time zone 'Asia/Almaty')::int as ha,
            extract(hour from fire_at at time zone 'Europe/Moscow')::int as hb
       from public.shot_prompts where day = '2031-06-02'`,
  )
  const w = both[0]
  check(w !== undefined && w.ha >= 10 && w.ha <= 20 && w.hb >= 10 && w.hb <= 20, 'Пояса разные - окно общее для обоих', `${w?.ha}:00 и ${w?.hb}:00`)
  await db.q(`update public.profiles set timezone = 'Asia/Almaty'`)

  // Поздно для сегодняшнего окна - сигнала не будет, а не ночью
  await db.q(`select public.shot_tick('2031-06-03 22:00:00+05'::timestamptz)`)
  check(
    (await db.q(`select 1 from public.shot_prompts where day = '2031-06-03'`)).length === 0,
    'Окно дня прошло - сигнал не придумывается на ночь',
    'первый день после выкладки',
  )

  // Отправка: пора - обоим; проспали больше двух часов - молча
  await db.q(`insert into public.shot_prompts (day, fire_at) values ('2031-06-10', now() - interval '1 minute'), ('2031-06-11', now() - interval '3 hours')`)
  await db.as(a)
  check((await db.q(`select 1 from public.shot_prompts where day in ('2031-06-10', '2031-06-11')`)).length === 0, 'Время сигнала заранее не видно', 'строка закрыта до отправки')
  await db.asOwner()
  const sent = Number(await db.one(`select public.shot_tick(now())`))
  const p1 = await pushes(2)
  check(
    sent === 2 && p1.every((p) => p.title === 'Кадр дня' && p.url === '/shots') && new Set(p1.map((p) => p.userId)).size === 2,
    'Пора - сигнал обоим',
    `${sent}: ${p1[0]?.body}`,
  )
  check(
    (await db.q(`select 1 from public.shot_prompts where day = '2031-06-11' and sent_at is not null`)).length === 1,
    'Проспанный сигнал открывает день молча',
    'без push ночью',
  )

  // --- кадры ---------------------------------------------------------------
  const D = '2031-06-10'
  const shot = (id: string, user: string, day = D): [string, unknown[]] => [
    `insert into public.shots (id, day, user_id, path, thumb_path, width, height, placeholder)
     values ($1::uuid, $2::date, $3::uuid, $3::text || '/' || $1::text || '.webp', $3::text || '/' || $1::text || '-t.webp',
             1600, 1200, 'data:image/webp;base64,AA')`,
    [id, day, user],
  ]
  const ida = crypto.randomUUID()
  const idb = crypto.randomUUID()

  await db.q(`insert into public.shot_prompts (day, fire_at) values ('2031-07-01', now() + interval '1 hour')`)
  await db.as(a)
  await db.mustFail('До сигнала снимать нельзя', ...shot(crypto.randomUUID(), a, '2031-07-01'), 'row-level security')
  await db.q(...shot(ida, a))
  const p2 = await pushes(1)
  check(p2[0]?.userId === b && p2[0]?.title === 'Аминош сняла кадр дня' && p2[0]?.body === 'Сними свой - и откроются оба.', 'Второму - «твой ход»', `${p2[0]?.title}`)
  await db.mustFail('Один кадр в день', ...shot(crypto.randomUUID(), a), 'shots_one_per_day')

  // Хранилище: объект второго под RLS - как настоящий файл. Считаются только
  // тестовые файлы: в бакете могут лежать настоящие кадры пары
  await db.asOwner()
  await db.q(
    `insert into storage.objects (bucket_id, name, owner_id)
     values ('shots', $1::text || '/' || $2::text || '.webp', $1::text), ('shots', $1::text || '/' || $2::text || '-t.webp', $1::text)`,
    [a, ida],
  )
  await db.as(b)
  check((await db.q('select 1 from public.shots where day = $1', [D])).length === 0, 'ДО своего кадра чужой не виден', 'строка')
  check(
    (await db.q(`select 1 from storage.objects where bucket_id = 'shots' and name like $1`, [`${a}/${ida}%`])).length === 0,
    'И файл второго не виден - папку не перечислить',
    'storage.objects',
  )
  await db.mustFail('В чужую папку не положить', `insert into storage.objects (bucket_id, name, owner_id) values ('shots', $1, $2)`, [`${a}/x.webp`, b], 'row-level security')
  const progress = await db.q<{ user_id: string }>('select user_id from public.shot_progress() where day = $1', [D])
  check(progress.length === 1 && progress[0]?.user_id === a, 'Кто уже снял - видно, сам кадр - нет', 'shot_progress')

  await db.q(...shot(idb, b))
  const p3 = await pushes(1)
  check(p3[0]?.userId === a && p3[0]?.title.includes('тоже') === true, 'Второй кадр - «оба открыты»', `${p3[0]?.title}`)
  check((await db.q('select 1 from public.shots where day = $1', [D])).length === 2, 'ПОСЛЕ своего видны оба', '2')
  check(
    (await db.q(`select 1 from storage.objects where bucket_id = 'shots' and name like $1`, [`${a}/${ida}%`])).length === 2,
    'И файлы второго открылись',
    'полный и превью',
  )

  // Прошли сутки - снимать поздно, и чужой кадр открыт и без своего
  await db.asOwner()
  await db.q(`insert into public.shot_prompts (day, fire_at, sent_at) values ('2031-06-12', now() - interval '25 hours', now() - interval '25 hours')`)
  const idc = crypto.randomUUID()
  await db.q(...shot(idc, a, '2031-06-12'))
  await db.as(b)
  await db.mustFail('Через сутки после сигнала снимать поздно', ...shot(crypto.randomUUID(), b, '2031-06-12'), 'row-level security')
  check((await db.q(`select 1 from public.shots where day = '2031-06-12'`)).length === 1, 'Сутки прошли - чужой кадр открыт', 'слепота больше ни к чему')

  await db.as(a)
  check((await db.q('delete from public.shots where id = $1 returning 1', [idb])).length === 0, 'Чужой кадр не удалить', 'только свой')
  check((await db.q('delete from public.shots where id = $1 returning 1', [ida])).length === 1, 'Свой - удалить можно всегда', 'это фотография человека')
})

finish('Кадр дня')
