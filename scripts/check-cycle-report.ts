/**
 * Проверка выписки для врача.
 *
 *   pnpm tsx scripts/check-cycle-report.ts
 *
 * Выписку несут на приём, и по ней принимают решения. Поэтому здесь важнее
 * обычного одно: она НЕ должна ничего сглаживать.
 *
 * `cycleStats`, которая кормит прогноз, берёт окно последних циклов
 * и отбрасывает неправдоподобные значения - иначе однодневная отметка
 * становилась бы законом. Для выписки это ровно та беда: выбивающийся цикл
 * и есть повод для разговора, а отфильтруй мы его, врач увидел бы ровную
 * картину там, где её нет.
 *
 * Ни базы, ни сети: чистая арифметика над списком.
 */
import { buildReport, reportToText } from '../src/features/cycle/report.ts'
import type { Period } from '../src/features/cycle/cycle.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

/*
 * Длины приходят готовыми из вью `periods_v` - выписка их не считает,
 * а только собирает. Поэтому в проверке они задаются явно: здесь
 * проверяется сборка, а не арифметика длин.
 */
const p = (
  startedOn: string,
  endedOn: string | null,
  periodDays: number | null,
  cycleDays: number | null,
): Period => ({ id: startedOn, startedOn, endedOn, note: null, periodDays, cycleDays })

const TODAY = '2026-09-11'

// Ровная история: 1 марта, 29 марта, 26 апреля - по 28 дней, менструация 5
const even = [
  p('2026-03-01', '2026-03-05', 5, 28),
  p('2026-03-29', '2026-04-02', 5, 28),
  p('2026-04-26', '2026-04-30', 5, null),
]

let r = buildReport(even, TODAY)!
check(r !== null && r.cycles.length === 3, 'Все менструации попали в выписку', `${r.cycles.length}`)
check(
  r.cycles[0]?.cycleDays === 28 && r.cycles[1]?.cycleDays === 28,
  'Длина цикла считается до следующего начала',
  `${r.cycles[0]?.cycleDays}, ${r.cycles[1]?.cycleDays}`,
)
check(r.cycles[2]?.cycleDays === null, 'У последней цикл ещё идёт', 'следующего начала нет')
check(
  r.cycles[0]?.periodDays === 5,
  'Длительность берётся из записи, а не считается заново',
  `${r.cycles[0]?.periodDays} дн. - так отдаёт вью periods_v`,
)
check(r.cycleAvg === 28 && r.periodAvg === 5, 'Средние верны', `цикл ${r.cycleAvg}, менструация ${r.periodAvg}`)
check(
  r.observedDays === 195,
  'Период наблюдения - от первой записи до сегодня',
  `${r.from} — ${r.to}, ${r.observedDays} дн.`,
)

// Выбивающийся цикл: 14 дней. Прогноз такое отбрасывает, выписка - нет
const odd = [
  p('2026-03-01', '2026-03-05', 5, 14),
  p('2026-03-15', '2026-03-16', 2, 28),
  p('2026-04-12', '2026-04-16', 5, null),
]
r = buildReport(odd, TODAY)!
check(
  r.cycleMin === 14 && r.cycleMax === 28,
  'Короткий цикл НЕ отброшен',
  `мин ${r.cycleMin}, макс ${r.cycleMax} - именно он и есть повод для разговора`,
)
check(
  r.periodMin === 2,
  'Двухдневная менструация тоже осталась',
  `мин ${r.periodMin} дн.`,
)

// Незавершённая менструация не должна портить средние
r = buildReport([p('2026-08-01', null, null, 28), p('2026-08-29', '2026-09-02', 5, null)], TODAY)!
check(
  r.periodAvg === 5 && r.cycles[0]?.periodDays === null,
  'Неотмеченный конец не считается нулём',
  `среднее ${r.periodAvg} по одной завершённой`,
)

// Запись с датой в будущем в выписку не идёт
r = buildReport([p('2026-03-01', '2026-03-05', 5, 306), p('2027-01-01', null, null, null)], TODAY)!
check(
  r.cycles.length === 1 && r.cycles[0]?.cycleDays === null,
  'Запись из будущего выброшена вместе с длиной до неё',
  'иначе выписка показала бы цикл в 306 дней, которого не было',
)

check(buildReport([], TODAY) === null, 'Без записей выписки нет', 'собирать не из чего')

// Текст
const text = reportToText(buildReport(odd, TODAY)!, ['Средний цикл - 20 дней'], 'Тандем')
check(text.includes('01.03.2026'), 'Даты в тексте по-русски', text.split('\n')[1] ?? '')
check(
  text.includes('Средний цикл - 20 дней'),
  'Предупреждения приложения перенесены в текст',
  'врачу полезно знать, на что приложение уже обращало внимание',
)
check(
  text.includes('не медицинский документ'),
  'Происхождение записей названо прямо',
  'это дневник пациента, а не результат измерения',
)
check(
  text.split('\n').filter((l) => l.startsWith('  ')).length >= odd.length,
  'История выведена построчно',
  'по строке на менструацию',
)

console.log(failed === 0 ? '\nВыписка верна.' : `\nПровалено: ${failed}`)
if (failed > 0) process.exit(1)
