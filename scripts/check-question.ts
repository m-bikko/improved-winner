/**
 * Проверка вопроса дня.
 *
 *   pnpm tsx scripts/check-question.ts
 *
 * Главное свойство раздела - слепой ответ: ответ второго не виден, пока нет
 * своего, а после раскрытия свой уже не поправить. Проверяется политикой
 * под каждым из двоих, а не экраном - экран обходится консолью.
 *
 * Дальше - что оба отвечают на один вопрос, что уведомление говорит
 * правильное (род того, кто ответил, язык того, кто читает) и что вечернее
 * напоминание не дублируется. Плюс расписание и серия - чистой арифметикой.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { shiftDays } from '../src/lib/date.ts'
import { QUESTIONS } from '../src/features/question/bank.ts'
import { EPOCH, archiveDates, dayOf, jointStreak, scheduledQuestion } from '../src/features/question/logic.ts'
import { check, finish, inTransaction } from './harness.ts'

// --- расписание --------------------------------------------------------------

const n = QUESTIONS.length
check(scheduledQuestion(EPOCH).id === QUESTIONS[0]?.id, 'Первый день - первый вопрос', `${EPOCH}: ${scheduledQuestion(EPOCH).id}`)
check(
  scheduledQuestion(shiftDays(EPOCH, n)).id === QUESTIONS[0]?.id &&
    scheduledQuestion(shiftDays(EPOCH, -1)).id === QUESTIONS[n - 1]?.id,
  'Расписание идёт по кругу в обе стороны',
  `через ${n} дней снова первый, накануне начала - последний`,
)
let repeats = 0
for (let i = 0; i < n * 2; i++) {
  if (scheduledQuestion(shiftDays(EPOCH, i)).cat === scheduledQuestion(shiftDays(EPOCH, i + 1)).cat) repeats++
}
check(repeats === 0, 'Категория не повторяется два дня подряд', `повторов за два круга: ${repeats}`)
check(new Set(QUESTIONS.map((q) => q.id)).size === n, 'Вопросы не повторяются', `${n} вопросов`)

// --- день и серия ------------------------------------------------------------

const A = 'a'
const B = 'b'
const today = '2026-11-10'
const other = QUESTIONS.find((q) => q.id !== scheduledQuestion(today).id)?.id ?? ''
const day = dayOf(today, A, [], [{ date: today, userId: B, questionId: other }])
check(
  day.questionId === other && day.partnerAnswered && day.mine === null && day.theirs === null,
  'Второй отвечает на вопрос первого, а не на вопрос из расписания',
  `в расписании ${scheduledQuestion(today).id}, первый ответил на ${other} - у второго ${day.questionId}`,
)

const both = (d: string) => [
  { date: d, userId: A, questionId: 'x' },
  { date: d, userId: B, questionId: 'x' },
]
const progress = [...both(shiftDays(today, -1)), ...both(shiftDays(today, -2)), { date: today, userId: A, questionId: 'x' }]
check(jointStreak(progress, A, B, today) === 2, 'Сегодня ещё не ответили оба - серию это не обрывает', `серия ${jointStreak(progress, A, B, today)}`)
check(jointStreak([...progress, ...both(today)], A, B, today) === 3, 'Ответили оба сегодня - серия растёт', '3')
check(jointStreak(both(shiftDays(today, -2)), A, B, today) === 0, 'Пропущенный вчера день обрывает серию', '0')

const arch = archiveDates([{ date: shiftDays(today, -30), userId: A, questionId: 'x' }], today)
check(
  !arch.includes(today) && arch.includes(shiftDays(today, -1)) && arch.includes(shiftDays(today, -30)) && !arch.includes(shiftDays(today, -8)),
  'Архив: дни с ответами и неделя целиком, без сегодня',
  arch.slice(0, 3).join(', ') + ' …',
)

// --- база --------------------------------------------------------------------

await inTransaction(async (db) => {
  const { a, b } = db.members
  const D = '2031-01-15'
  const E = '2031-01-16'
  const q1 = QUESTIONS[0]?.id ?? 'q'
  const q2 = QUESTIONS[1]?.id ?? 'q'
  await db.q('delete from public.question_answers where date in ($1, $2)', [D, E])
  await db.q(`update public.profiles set language = 'ru'`)
  await db.q(`update public.profiles set sex = 'female' where user_id = $1`, [a])

  await db.mustFail(
    'Пустой ответ отвергается',
    `insert into public.question_answers (user_id, date, question_id, body) values ($1, $2, $3, '   ')`,
    [a, D, q1],
    'question_answers_body_check',
  )
  await db.mustFail(
    'Идентификатор вопроса - только из букв, цифр и подчёркиваний',
    `insert into public.question_answers (user_id, date, question_id, body) values ($1, $2, 'Drop table', 'x')`,
    [a, D],
    'question_answers_question_id_check',
  )

  await db.as(a)
  const before = await db.queued()
  await db.q(`insert into public.question_answers (user_id, date, question_id, body) values ($1, $2, $3, 'Ответ А')`, [a, D, q1])
  const pushes = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string; body: string })
  check(
    (await db.queued()) > before && pushes[0]?.userId === b && (pushes[0]?.title ?? '').includes('ответила на вопрос дня'),
    'Второму приходит «ответила» - род того, кто ответил',
    `${pushes[0]?.title} / ${pushes[0]?.body}`,
  )

  await db.as(b)
  check(
    (await db.q('select 1 from public.question_answers where date = $1', [D])).length === 0,
    'ДО своего ответа чужой не виден',
    'иначе это не слепой ответ',
  )
  const prog = await db.q<{ user_id: string; question_id: string }>('select user_id, question_id from public.question_progress($1)', [D])
  check(
    prog.length === 1 && prog[0]?.user_id === a && prog[0]?.question_id === q1,
    'Но видно, что второй ответил, и на какой вопрос - без текста',
    `прогресс: ${prog.map((p) => p.question_id).join(', ')}`,
  )
  await db.mustFail(
    'Ответить на другой вопрос в тот же день нельзя',
    `insert into public.question_answers (user_id, date, question_id, body) values ($1, $2, $3, 'Ответ Б')`,
    [b, D, q2],
    'question_answers_same_question',
  )
  await db.mustFail(
    'Ответить за другого нельзя',
    `insert into public.question_answers (user_id, date, question_id, body) values ($1, $2, $3, 'чужой')`,
    [a, E, q2],
    'row-level security',
  )

  // Язык второго - под владельцем базы: из-под B чужой профиль не правится
  await db.asOwner()
  await db.q(`update public.profiles set language = 'en' where user_id = $1`, [a])
  await db.as(b)
  const beforeReveal = await db.queued()
  await db.q(`insert into public.question_answers (user_id, date, question_id, body) values ($1, $2, $3, 'Ответ Б')`, [b, D, q1])
  const reveal = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string })
  check(
    (await db.queued()) > beforeReveal && reveal[0]?.userId === a && reveal[0]?.title === 'Both answers are open',
    'Второй ответ - «ответы открыты», на языке того, кто читает',
    `${reveal[0]?.title}`,
  )
  check(
    (await db.q('select 1 from public.question_answers where date = $1', [D])).length === 2,
    'ПОСЛЕ своего ответа виден и чужой',
    'оба ответа за день',
  )

  const edited = await db.q(`update public.question_answers set body = 'переписал' where user_id = $1 and date = $2 returning 1`, [b, D])
  const removed = await db.q(`delete from public.question_answers where user_id = $1 and date = $2 returning 1`, [b, D])
  check(
    edited.length === 0 && removed.length === 0,
    'После раскрытия свой ответ не поправить и не удалить',
    'переписать ответ, прочитав чужой, - ровно то, от чего защищает слепота',
  )

  await db.as(a)
  await db.q(`insert into public.question_answers (user_id, date, question_id, body) values ($1, $2, $3, 'черновик')`, [a, E, q2])
  const fixed = await db.q(`update public.question_answers set body = 'исправил' where user_id = $1 and date = $2 returning 1`, [a, E])
  check(fixed.length === 1, 'Пока второй не ответил, свой ответ править можно', 'опечатку исправить не грех')

  // --- вечернее напоминание ---------------------------------------------------
  await db.asOwner()
  const tz = await db.one(
    `select z from (select 'Etc/GMT' || case when o > 0 then '-' || o else '+' || (-o) end as z
                      from generate_series(-12, 14) o) zones
      where extract(hour from now() at time zone z) = 20 limit 1`,
  )
  check(tz !== '', 'Нашёлся пояс, где сейчас 20:00', tz)
  if (tz !== '') {
    await db.q('update public.profiles set timezone = $1, language = $2', [tz, 'ru'])
    const local = await db.one('select (now() at time zone $1)::date::text', [tz])
    await db.q('delete from public.question_answers where date = $1', [local])
    await db.q('delete from public.question_asks where date = $1', [local])
    await db.q(`insert into public.question_answers (user_id, date, question_id, body) values ($1, $2, $3, 'уже')`, [a, local, q1])

    const sent = Number(await db.one('select public.send_question_reminders()'))
    const last = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; body: string })
    check(
      sent === 1 && last[0]?.userId === b && (last[0]?.body ?? '').includes('уже ответила'),
      'В 20:00 напоминание только тому, кто не ответил, - и что второй уже ответил',
      `отправлено ${sent}: ${last[0]?.body}`,
    )
    check(
      Number(await db.one('select public.send_question_reminders()')) === 0,
      'Повторный запуск в тот же час молчит',
      'задание идёт каждый час - дубли недопустимы',
    )
  }
})

finish('Вопрос дня')
