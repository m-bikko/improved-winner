/**
 * Решения `pnpm couple`, которые нельзя проверить на живой базе: она одна, и пара в ней настоящая.
 *
 *   pnpm tsx scripts/check-couple.ts
 *
 * Самое опасное здесь - .env, скопированный у другой пары: запуск переписал бы им
 * имена и PIN-ы. Отличить это от повторного запуска можно только по именам,
 * и именно это проверяется первым.
 */
import { makeAccounts } from '../src/lib/accounts.ts'
import { isLanguage, judgeDatabase, readPin, type Member, type Verdict } from './accounts-admin.ts'

let failed = 0

function check(ok: boolean, name: string, detail = ''): void {
  if (!ok) failed++
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`)
}

const accounts = makeAccounts('Аня', 'Дима')
const [a, b] = accounts.map((x) => x.email)
const member = (email: string | null, nickname: string | null): Member => ({ email, nickname })
const kind = (members: Member[], rename = false): Verdict['kind'] => judgeDatabase(members, accounts, rename).kind

check(kind([]) === 'fresh', 'Пустая база - новая пара')
check(kind([member(a!, 'Аня'), member(b!, 'Дима')]) === 'same', 'Те же имена - повторный запуск')
check(kind([member(a!, 'Аня')]) === 'same', 'Один из двоих уже есть с тем же именем - можно дозаводить')
check(kind([member(a!, null), member(b!, 'Дима')]) === 'same', 'Профиль не создан прошлым запуском - не повод останавливаться')

const other = judgeDatabase([member(a!, 'Бикош'), member(b!, 'Аминош')], accounts, false)
check(other.kind === 'other-couple', 'Другие имена - остановка: это база другой пары', other.kind)
check(
  other.kind === 'other-couple' && other.names.join(',') === 'Бикош,Аминош',
  'В сообщении - кто уже живёт в базе',
  JSON.stringify(other),
)
check(kind([member(a!, 'Бикош'), member(b!, 'Аминош')], true) === 'rename', 'С --rename имена меняются')
check(kind([member(a!, 'Аня'), member('stranger@example.com', 'Кто-то')]) === 'foreign', 'Чужой адрес - остановка')
check(kind([member('stranger@example.com', 'Кто-то')], true) === 'foreign', 'Чужой адрес не пропускает и --rename')
check(kind([member(null, 'Аня')]) === 'foreign', 'Участник без аккаунта - тоже чужое')

const good = readPin({ LOVE_PIN_BIKOSH: '583921' }, 'bikosh')
check('pin' in good && good.pin === '583921', 'PIN из шести цифр принимается')
for (const bad of ['12345', '1234567', 'abcdef', '']) {
  const read = readPin({ LOVE_PIN_BIKOSH: bad }, 'bikosh')
  check('error' in read, `PIN «${bad}» отклоняется`)
  check(!('error' in read) || bad === '' || !read.error.includes(bad), `PIN «${bad}» не попадает в текст ошибки`)
}
check('error' in readPin({}, 'aminosh'), 'Нет переменной - ошибка, а не пустой PIN')

const named = makeAccounts('  Аня ', '')
check(named[0]?.nickname === 'Аня', 'Пробелы вокруг имени срезаются', named[0]?.nickname)
check(named[1]?.nickname === 'Аминош', 'Пустое имя - значение по умолчанию', named[1]?.nickname)
check(
  named[0]?.email === 'bikosh@lovepromises.app' && named[1]?.email === 'aminosh@lovepromises.app',
  'Адреса от имён не зависят: это опознаватели живых аккаунтов',
)

check(['ru', 'kk', 'en'].every(isLanguage) && !isLanguage('de') && !isLanguage('RU'), 'Языки - только ru, kk, en')

if (failed > 0) {
  console.error(`\n${failed} кейсов упало`)
  process.exit(1)
}
console.log('\nРешения установки для новой пары верны.')
