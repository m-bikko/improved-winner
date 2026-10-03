/**
 * Проверка паузы в ссоре.
 *
 * Пауза одна, до суток. Укоротить может только тот, кто просил, продлить -
 * никто, второй не отменит чужую паузу. Строки пишутся после паузы и до
 * закрытия, второго не видно, пока не написал свои, и после его строк свои
 * не поправить. Закрыть можно только закончившуюся. Уведомления: второму -
 * «нужна пауза до HH:MM», обоим - «закончилась» (сразу при раннем конце
 * и раз в минуту при обычном), строки - «твой ход» / «открыты», мир -
 * второму.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { check, finish, inTransaction } from './harness.ts'

type Push = { userId: string; title: string; body: string; url: string }

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru', timezone = 'Asia/Almaty'`)
  await db.q(`update public.profiles set sex = 'male' where user_id = $1`, [b])
  await db.q('delete from public.pauses')
  const pushes = async (n: number): Promise<Push[]> => (await db.lastPushes(n)).map((x) => JSON.parse(x) as Push)

  await db.as(a)
  await db.mustFail('Пауза не дольше суток', `insert into public.pauses (ends_at) values (now() + interval '25 hours')`, [], 'pauses_length')
  await db.mustFail('И не короче минуты', `insert into public.pauses (ends_at) values (now() + interval '10 seconds')`, [], 'pauses_guard')
  const id = await db.one(
    `insert into public.pauses (started_at, ends_at) values (now() - interval '5 hours', now() + interval '1 hour') returning id::text`,
  )
  const started = await db.one(`select (abs(extract(epoch from started_at - now())) < 5)::text from public.pauses where id = $1`, [id])
  check(started === 'true', 'Начало паузы - сейчас, а не когда скажет клиент', 'задним числом не растянуть')
  const clock = await db.one(`select to_char((now() + interval '1 hour') at time zone 'Asia/Almaty', 'HH24:MI')`)
  const p1 = await pushes(1)
  check(
    p1[0]?.userId === b && p1[0]?.title === `Аминош: нужна пауза до ${clock}` && p1[0]?.url === '/pause',
    'Второму - «нужна пауза до» по его часам',
    `${p1[0]?.title}`,
  )
  await db.mustFail('Вторая пауза, пока первая открыта', `insert into public.pauses (ends_at) values (now() + interval '1 hour')`, [], 'pauses_one_open')
  await db.mustFail('Продлить нельзя', `update public.pauses set ends_at = ends_at + interval '1 hour' where id = $1`, [id], 'pauses_guard')
  await db.mustFail(
    'Строки - после паузы, не во время',
    `insert into public.pause_notes (pause_id, feel, need) values ($1, 'обидно', 'тишины')`,
    [id],
    'row-level security',
  )
  await db.mustFail('Идущую паузу не закрыть', `update public.pauses set closed_at = now(), outcome = 'peace' where id = $1`, [id], 'pauses_guard')

  await db.as(b)
  await db.mustFail('Второй не закончит чужую паузу', `update public.pauses set ends_at = now() where id = $1`, [id], 'pauses_guard')

  // Попросивший заканчивает раньше - «закончилась» сразу обоим
  await db.as(a)
  const before = await db.queued()
  // Часы телефона отстают на минуту - «сейчас» с телефона раньше начала
  await db.q(`update public.pauses set ends_at = now() - interval '1 minute' where id = $1`, [id])
  check(
    (await db.one(`select (ends_at >= started_at)::text from public.pauses where id = $1`, [id])) === 'true',
    'Отстающие часы телефона не ломают «закончить раньше»',
    'конец - по часам базы',
  )
  const over = await pushes(2)
  check(
    (await db.queued()) > before && over.every((p) => p.title === 'Пауза закончилась') && new Set(over.map((p) => p.userId)).size === 2,
    'Закончили раньше - «пауза закончилась» сразу обоим',
    `${over[0]?.body}`,
  )
  await db.asOwner()
  check(Number(await db.one('select public.send_pause_ends()')) === 0, 'Прогон не повторяет уже отправленное', '0')

  // Строки вслепую
  await db.as(a)
  await db.q(`insert into public.pause_notes (pause_id, feel, when_text, need) values ($1, 'обидно', 'когда перебивают', 'договорить')`, [id])
  const p2 = await pushes(1)
  check(p2[0]?.userId === b && p2[0]?.title.startsWith('Аминош') === true, 'Второму - «три строки готовы»', `${p2[0]?.title}`)
  const fixed = await db.q(`update public.pause_notes set need = 'договорить спокойно' where pause_id = $1 and user_id = $2 returning 1`, [id, a])
  check(fixed.length === 1, 'Пока второй не написал - свои можно поправить', '1')

  await db.as(b)
  check((await db.q('select 1 from public.pause_notes where pause_id = $1', [id])).length === 0, 'ДО своих строк чужие не видны', 'вслепую')
  check((await db.q('select user_id from public.pause_progress() where pause_id = $1', [id])).length === 1, 'Кто написал - видно', 'без самих строк')
  await db.q(`insert into public.pause_notes (pause_id, feel, need) values ($1, 'устал', 'обнять')`, [id])
  const p3 = await pushes(1)
  check(p3[0]?.userId === a && p3[0]?.title === 'Строки открыты', 'Второй написал - «открыты»', `${p3[0]?.title}`)
  check((await db.q('select 1 from public.pause_notes where pause_id = $1', [id])).length === 2, 'ПОСЛЕ своих видны обе', '2')

  await db.as(a)
  const late = await db.q(`update public.pause_notes set feel = 'другое' where pause_id = $1 and user_id = $2 returning 1`, [id, a])
  check(late.length === 0, 'После строк второго свои не поправить', 'как у вопроса дня')

  // Мир - второму
  await db.as(b)
  await db.q(`update public.pauses set closed_at = now(), outcome = 'peace' where id = $1`, [id])
  const p4 = await pushes(1)
  check(p4[0]?.userId === a && p4[0]?.title === 'Бикош отметил: мир', 'Мир - второму', `${p4[0]?.title}`)
  await db.mustFail('Закрытую не открыть', `update public.pauses set closed_at = null, outcome = null where id = $1`, [id], 'pauses_guard')
  const closedEdit = await db.q(`update public.pause_notes set need = 'x' where pause_id = $1 returning 1`, [id])
  check(closedEdit.length === 0, 'В закрытой паузе строки не правятся', 'RLS отсеивает молча')

  // Обычный конец - прогон раз в минуту
  await db.asOwner()
  const id2 = await db.one(`insert into public.pauses (started_by, ends_at) values ($1, now() + interval '2 minutes') returning id::text`, [b])
  await db.q(`alter table public.pauses disable trigger pauses_guard`)
  await db.q(`update public.pauses set ends_at = now() - interval '1 second', started_at = now() - interval '1 hour' where id = $1`, [id2])
  await db.q(`alter table public.pauses enable trigger pauses_guard`)
  check(Number(await db.one('select public.send_pause_ends()')) === 1, 'Срок вышел - прогон рассылает «закончилась»', '1')
  check(Number(await db.one('select public.send_pause_ends()')) === 0, 'И только один раз', '0')
})

finish('Пауза')
