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

/** Файлы, где кириллица уместна: сами словари и то, что не видит человек. */
const ALLOWED = [
  'src/lib/i18n/',
  // Библиотеки прозы: переводятся отдельно и не машинно
  'src/features/cycle/tips.ts',
]

const LITERAL = /(['"`])((?:(?!\1)[^\\]|\\.)*?[А-Яа-яЁё](?:(?!\1)[^\\]|\\.)*?)\1/g

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
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlock = true
      continue
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
    for (const m of line.matchAll(LITERAL)) out.push(m[2] ?? '')
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
