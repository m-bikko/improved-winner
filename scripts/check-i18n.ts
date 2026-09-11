/**
 * Проверка полноты перевода.
 *
 *   pnpm tsx scripts/check-i18n.ts
 *
 * «Ничего не упустить» - обещание, которое нельзя сдержать вручную:
 * строк интерфейса больше тысячи, и забытая всплывёт не на сборке,
 * а на чужом экране посреди английского текста.
 *
 * Поэтому здесь два разных контроля:
 *
 * Ключи. Что казахский и английский словари полны, следит ТИПИЗАЦИЯ -
 * `Dict` построен по русскому, и пропуск ключа роняет сборку. Тут только
 * пересчёт, чтобы число было видно.
 *
 * Строки. Кириллица в коде вне словарей означает текст, который переводу
 * не подвергся. Комментарии не в счёт - они для того, кто читает код,
 * а не для того, кто пользуется приложением.
 */
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { ru } from '../src/lib/i18n/ru.ts'
import { kk } from '../src/lib/i18n/kk.ts'
import { en } from '../src/lib/i18n/en.ts'

let failed = 0
function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

/**
 * Файлы, где кириллица уместна.
 *
 * Список короткий намеренно: каждая строка тут - обещание, что человек
 * этот текст либо не увидит, либо увидит и по-русски тоже.
 *
 * За пределами списка действует ещё одно правило, которое проверкой
 * не выражается: сообщения `throw new Error` о нарушенном инварианте
 * пишутся по-английски. Их читает тот, кто смотрит в стек вызовов,
 * а не тот, кто пользуется приложением, и переводить их незачем.
 */
const ALLOWED = [
  'src/lib/i18n/',
  // Библиотеки прозы: переводятся отдельно и не машинно
  'src/features/cycle/tips.ts',
  // Имена владельцев - данные, а не интерфейс
  'src/lib/accounts.ts',
  // Название по умолчанию: его задаёт сборка, и оно одно на все языки
  'src/lib/appName.ts',
  // ё→е в нормализации поиска - выражение алгоритма, а не текст
  'src/lib/search.ts',
]

const LITERAL = /(['"`])((?:(?!\1)[^\\]|\\.)*?[А-Яа-яЁё](?:(?!\1)[^\\]|\\.)*?)\1/g
const ANY_LITERAL = /(['"`])(?:(?!\1)[^\\]|\\.)*?\1/g
const CYRILLIC = /[А-Яа-яЁё][^<>{}()]*/g

/**
 * Текст прямо в разметке: `<button>Изменить</button>`.
 *
 * Кавычек вокруг него нет, и первая версия проверки его не видела - а это
 * ровно половина интерфейса. Сначала выбрасываем строковые литералы (их
 * считает LITERAL) и хвост строчного комментария, а кириллица в остатке
 * и есть незамеченный текст.
 */
function inMarkup(line: string): string[] {
  const code = (line.replace(ANY_LITERAL, '').split('//')[0] ?? '').trim()
  return [...code.matchAll(CYRILLIC)].map((m) => m[0].trim()).filter((s) => s.length > 0)
}

/** Строковые литералы с кириллицей вне комментариев. */
function untranslated(source: string): string[] {
  const out: string[] = []
  let inBlock = false
  for (const line of source.split('\n')) {
    const trimmed = line.trim()
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false
      continue
    }
    // `{/* ... */}` - комментарий в разметке, такой же невидимый
    if (trimmed.startsWith('/*') || trimmed.startsWith('{/*')) {
      if (!trimmed.includes('*/')) inBlock = true
      continue
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
    for (const m of line.matchAll(LITERAL)) out.push(m[2] ?? '')
    out.push(...inMarkup(line))
  }
  return out
}

const files = globSync('src/**/*.{ts,tsx}').filter(
  (f) => !ALLOWED.some((a) => f.replace(/\\/g, '/').includes(a)),
)

const left = new Map<string, number>()
let total = 0
for (const file of files) {
  const found = untranslated(readFileSync(file, 'utf8'))
  if (found.length > 0) {
    left.set(file, found.length)
    total += found.length
  }
}

const keys = Object.keys(ru).length
check(
  Object.keys(kk).length === keys && Object.keys(en).length === keys,
  'Словари полны',
  `ключей ${keys}, казахский ${Object.keys(kk).length}, английский ${Object.keys(en).length}`,
)

const sorted = [...left.entries()].sort((a, b) => b[1] - a[1])
check(
  total === 0,
  'В коде не осталось непереведённых строк',
  total === 0
    ? `проверено файлов: ${files.length}`
    : `осталось ${total} в ${left.size} файлах:\n` +
      sorted
        .slice(0, 25)
        .map(([f, n]) => `           ${String(n).padStart(3)}  ${f}`)
        .join('\n'),
)

console.log(failed === 0 ? '\nПеревод полон.' : `\nПровалено: ${failed}`)
if (failed > 0) process.exit(1)
