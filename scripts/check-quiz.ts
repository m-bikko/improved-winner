/**
 * Проверка «Это или то».
 *
 *   pnpm tsx scripts/check-quiz.ts
 *
 * Ответы второго не видны, пока свой раунд не пройден, - иначе угадывать
 * нечего; ответы окончательные (ни правки, ни удаления); пара - только
 * из своего раунда. Итог в уведомлении считается в базе - сверяется здесь
 * с подсчётом на клиенте. Плюс раздача пар: свежие, без повторов.
 *
 * Всё в транзакции и откатывается; уведомления только встают в очередь.
 */
import { TOT_PAIRS } from '../src/features/quiz/pairs.ts'
import { ROUND_SIZE, pickPairs, scoreOf, type Round } from '../src/features/quiz/logic.ts'
import { check, finish, inTransaction } from './harness.ts'

let seed = 1
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const first = pickPairs(new Set(), rnd)
check(first.length === ROUND_SIZE && new Set(first).size === ROUND_SIZE, 'Раунд - десять разных пар', first.slice(0, 3).join(', ') + ' …')
const used = new Set(TOT_PAIRS.slice(0, TOT_PAIRS.length - 15).map((p) => p.id))
check(pickPairs(used, rnd).every((p) => !used.has(p)), 'Сначала пары, которых ещё не было', 'из оставшихся пятнадцати')
check(pickPairs(new Set(TOT_PAIRS.map((p) => p.id)), rnd).length === ROUND_SIZE, 'Банк пройден - пары идут по кругу', 'игра не заканчивается')

const round: Round = {
  id: 'r', pairs: ['p1', 'p2'], createdBy: 'a', createdAt: '',
  answered: { a: 2, b: 2 },
  answers: [
    { roundId: 'r', userId: 'a', pairId: 'p1', pick: 0, guess: 1 },
    { roundId: 'r', userId: 'a', pairId: 'p2', pick: 1, guess: 1 },
    { roundId: 'r', userId: 'b', pairId: 'p1', pick: 1, guess: 0 },
    { roundId: 'r', userId: 'b', pairId: 'p2', pick: 1, guess: 0 },
  ],
}
const s = scoreOf(round, 'a', 'b')
check(s?.myGuesses === 2 && s.theirGuesses === 1 && s.same === 1, 'Счёт: чьи догадки сбылись и где совпали вкусы', JSON.stringify(s))

await inTransaction(async (db) => {
  const { a, b } = db.members
  await db.q(`update public.profiles set language = 'ru'`)
  const pairs = TOT_PAIRS.slice(0, 5).map((p) => p.id)
  await db.as(a)
  const id = await db.one(`insert into public.tot_rounds (pairs, created_by) values ($1, $2) returning id::text`, [pairs, a])

  await db.mustFail(
    'Пара не из раунда отвергается',
    `insert into public.tot_answers (round_id, user_id, pair_id, pick, guess) values ($1, $2, 'not_in_round', 0, 0)`,
    [id, a],
    'tot_answers_pair_in_round',
  )
  // A: выбирает 0 везде, угадывает, что B выберет 1
  for (const p of pairs) {
    await db.q(`insert into public.tot_answers (round_id, user_id, pair_id, pick, guess) values ($1, $2, $3, 0, 1)`, [id, a, p])
  }
  const done = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string; body: string })
  check(done[0]?.userId === b && (done[0]?.body ?? '').includes('Твой ход'), 'Прошёл раунд - второму «твой ход»', `${done[0]?.title} / ${done[0]?.body}`)
  const edited = await db.q(`update public.tot_answers set pick = 1 where round_id = $1 returning 1`, [id])
  check(edited.length === 0, 'Ответ не переиграть', 'ни правки, ни удаления')

  await db.as(b)
  check((await db.q('select 1 from public.tot_answers where round_id = $1 and user_id = $2', [id, a])).length === 0, 'ДО своего раунда ответы второго не видны', 'угадывать было бы нечего')
  const prog = await db.q<{ answered: number }>('select answered from public.tot_progress() where round_id = $1 and user_id = $2', [id, a])
  check(prog[0]?.answered === 5, 'Но видно, сколько пар прошёл второй', '5 из 5')
  // B: выбирает 1 в первых двух парах, 0 в остальных; угадывает 0 везде
  for (const [i, p] of pairs.entries()) {
    await db.q(`insert into public.tot_answers (round_id, user_id, pair_id, pick, guess) values ($1, $2, $3, $4, 0)`, [id, b, p, i < 2 ? 1 : 0])
  }
  const res = (await db.lastPushes(1)).map((x) => JSON.parse(x) as { userId: string; title: string; body: string })
  // A угадывал «1» - сбылось в двух парах; B угадывал «0» - A выбрал 0 везде, сбылось в пяти
  check(
    res[0]?.userId === a && res[0]?.title === 'Результаты «Это или то»' && res[0]?.body === 'Твои догадки: 2 из 5. Тебя угадали: 5 из 5.',
    'Итог второму - и счёт в базе совпадает с ручным',
    `${res[0]?.body}`,
  )
  check((await db.q('select 1 from public.tot_answers where round_id = $1', [id])).length === 10, 'ПОСЛЕ своего раунда видны все ответы', '10')
})

finish('«Это или то»')
