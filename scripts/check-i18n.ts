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
 *
 * Составные ключи. `dynamicKey('symptom', id)` собирает имя ключа из куска
 * и идентификатора, и проверить такое типизацией нельзя - там приведение
 * типа, единственное разрешённое в проекте. Промах не падает и не пустеет:
 * на экране появляется строка «symptom.breast-tenderness».
 *
 * Именно так четыре симптома и прожили неделю на экране: при переносе
 * в словарь я переименовал их ключи, а идентификаторы в коде остались
 * прежними. Поэтому здесь перечислены ВСЕ источники идентификаторов,
 * и каждый сверяется со словарём.
 *
 * Подсказки цикла. У них нет текста в коде вовсе - только идентификатор,
 * а заголовок и тело берутся из словаря по нему. Промах тут не падает
 * и не пустеет: на экране появится строка «tip.cramps.body». Поэтому
 * соответствие проверяется отдельно.
 *
 * Оболочка. Проверка долго смотрела только внутрь src/, и за её пределами
 * нашлось три места с русским текстом на виду: запасной заголовок push
 * в public/push-sw.js, описание в манифесте и `<html lang>`. Ни одно из них
 * не импортируется из src/ - и ни одно поэтому не проверялось.
 *
 * Локали. Отдельный вопрос, потому что кириллицы в 'ru-RU' нет и первым
 * контролем такое не ловится. Прибитая локаль в toLocaleDateString даёт
 * самый неприятный вид ошибки: интерфейс переключился, а дата рядом с ним
 * осталась на прежнем языке. Ровно это и нашлось на экране «Сегодня»,
 * когда всё остальное было уже переведено.
 */
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { ru } from '../src/lib/i18n/ru.ts'
import { kk } from '../src/lib/i18n/kk.ts'
import { en } from '../src/lib/i18n/en.ts'
import { LANGS, setActiveLang } from '../src/lib/i18n/lang.ts'
import { tr } from '../src/lib/i18n/index.tsx'
import { TIP_CATEGORIES, tipsLibrary, tipsToday } from '../src/features/cycle/tips.ts'
import { FLOW, MOODS, SYMPTOMS } from '../src/features/cycle/dayLog.ts'
import { PHASES } from '../src/features/cycle/cycle.ts'
import { BUBBLE_MOODS, PHRASES } from '../src/features/cycle/bubbleMood.ts'
import { STATES, STATE_GROUPS } from '../src/features/checkin/states.ts'
import { MEALS } from '../src/features/diary/types.ts'
import { WORKOUT_KINDS } from '../src/features/diary/workouts.ts'
import { CATEGORIES } from '../src/features/wishlist/categories.ts'
import { OCCASION_KINDS } from '../src/features/dates/kinds.ts'
import { ACTIVITY_LEVELS, GOAL_DIRECTIONS } from '../src/lib/nutrition.ts'
import { NOTIFICATION_KINDS } from '../src/features/profile/notifications.ts'
import { BANDS, BODY_GAPS } from '../src/lib/body.ts'
import { QUESTIONS, QUESTION_CATEGORIES } from '../src/features/question/bank.ts'
import { CHALLENGE_ICONS, PRESETS as CHALLENGE_PRESETS } from '../src/features/challenges/presets.ts'
import { GOAL_ICONS } from '../src/features/savings/icons.ts'
import { STATUSES as WATCH_STATUSES, WATCH_KINDS } from '../src/features/watch/logic.ts'
import { PREP_ITEMS } from '../src/features/prep/items.ts'
import { TOT_PAIRS } from '../src/features/quiz/pairs.ts'
import { PULSE_AREAS } from '../src/features/pulse/areas.ts'
import { CHECKPOINTS, WEEKS } from '../src/features/pregnancy/weeks.ts'
import { IDEA_CATEGORIES } from '../src/features/ideas/logic.ts'
import { CITY_IDS, PLACE_KINDS } from '../src/features/places/logic.ts'

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
  // Имена владельцев - данные, а не интерфейс
  'src/lib/accounts.ts',
  // Название по умолчанию: его задаёт сборка, и оно одно на все языки
  'src/lib/appName.ts',
  // ё→е в нормализации поиска - выражение алгоритма, а не текст
  'src/lib/search.ts',
  // Казахские суффиксы порядковых (-шы/-ші по гармонии гласных) - тоже правило, а не текст
  'src/features/story/logic.ts',
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

/** Строки файла без комментариев - то, что действительно исполняется. */
function code(source: string): string[] {
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
    out.push(line)
  }
  return out
}

/** Строковые литералы с кириллицей вне комментариев. */
function untranslated(source: string): string[] {
  const out: string[] = []
  for (const line of code(source)) {
    for (const m of line.matchAll(LITERAL)) out.push(m[2] ?? '')
    out.push(...inMarkup(line))
  }
  return out
}

/** Прибитая локаль: 'ru-RU' в toLocale*, минуя activeLocale(). */
const HARDCODED_LOCALE = /toLocale\w*\(\s*(['"])(?!\1)[a-z]{2}(-[A-Z]{2})?\1/g

/**
 * Файлы вне src/, которые видит человек.
 *
 * Оболочка, Service Worker и серверный обработчик push. Собираются не бандлом
 * и в src/ не входят, но текст в них попадает на экран так же.
 */
// vite.config.ts сюда не входит: там лежат значения ПО УМОЛЧАНИЮ для сборки -
// название и описание, - и они по той же причине, что и src/lib/appName.ts,
// одни на развёртывание. Переопределяются переменными окружения.
const OUTSIDE = ['index.html', 'public/push-sw.js', 'api/push.ts']

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

// Оболочка: тут ищем любую кириллицу вне комментариев. Текста, зависящего
// от языка, в этих файлах быть не должно вовсе - он либо приходит переменной
// сборки, либо его нет
const shell = new Map<string, string[]>()
for (const file of OUTSIDE) {
  // Комментарии HTML бывают многострочными, и построчная чистка их не берёт:
  // снимаем их со всего текста, а уже потом разбираем построчно
  const source = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  const found = code(source)
    .filter((line) => /[А-Яа-яЁё]/.test(line))
    .map((line) => line.trim())
  if (found.length > 0) shell.set(file, found)
}

const locales = new Map<string, number>()
for (const file of files) {
  // По тем же правилам, что и строки: в комментариях 'ru-RU' встречается
  // как пример того, чего делать нельзя, и считать его находкой глупо
  const found = code(readFileSync(file, 'utf8')).flatMap((line) => [
    ...line.matchAll(HARDCODED_LOCALE),
  ])
  if (found.length > 0) locales.set(file, found.length)
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

/**
 * Откуда берутся идентификаторы для составных ключей.
 *
 * Список обязан покрывать каждый вызов dynamicKey в приложении. Новый вызов
 * без строки здесь - это ровно та дыра, ради которой проверка и написана.
 */
const FAMILIES: { prefix: string; ids: readonly string[]; suffixes?: string[] }[] = [
  { prefix: 'symptom', ids: SYMPTOMS },
  { prefix: 'flow', ids: FLOW },
  { prefix: 'mood', ids: MOODS },
  { prefix: 'phase', ids: PHASES },
  { prefix: 'phaseSummary', ids: PHASES },
  { prefix: 'state', ids: STATES.map((x) => x.id) },
  { prefix: 'checkinGroup', ids: STATE_GROUPS },
  { prefix: 'tipCat', ids: TIP_CATEGORIES },
  { prefix: 'meal', ids: MEALS },
  { prefix: 'workout', ids: WORKOUT_KINDS.map((x) => x.id) },
  { prefix: 'wish', ids: CATEGORIES.map((x) => x.id) },
  { prefix: 'occasion', ids: OCCASION_KINDS },
  { prefix: 'activity', ids: ACTIVITY_LEVELS },
  { prefix: 'goal', ids: GOAL_DIRECTIONS },
  { prefix: 'notif', ids: NOTIFICATION_KINDS.map((x) => x.id), suffixes: ['', '.hint'] },
  { prefix: 'band', ids: BANDS },
  { prefix: 'bubble.title', ids: BUBBLE_MOODS },
  {
    prefix: 'bubble',
    ids: BUBBLE_MOODS.flatMap((m) => Array.from({ length: PHRASES[m] }, (_, i) => `${m}.${i}`)),
  },
  // Разделы на двоих (2026-10-02)
  { prefix: 'q', ids: QUESTIONS.map((x) => x.id) },
  { prefix: 'qcat', ids: QUESTION_CATEGORIES },
  { prefix: 'chp', ids: CHALLENGE_PRESETS.map((x) => x.id) },
  { prefix: 'chi', ids: Object.keys(CHALLENGE_ICONS) },
  { prefix: 'svi', ids: Object.keys(GOAL_ICONS) },
  { prefix: 'w.tab', ids: WATCH_STATUSES },
  { prefix: 'w.empty', ids: WATCH_STATUSES },
  { prefix: 'w.kind', ids: WATCH_KINDS },
  { prefix: 'prep.item', ids: PREP_ITEMS.map((x) => x.id) },
  { prefix: 'prep.hint', ids: PREP_ITEMS.map((x) => x.id) },
  // Разделы на двоих, вторая серия (2026-10-03)
  { prefix: 'tot', ids: TOT_PAIRS.map((x) => x.id), suffixes: ['.a', '.b'] },
  { prefix: 'nm.origin', ids: ['kazakh', 'slavic', 'intl', 'custom'] },
  { prefix: 'id.cat', ids: IDEA_CATEGORIES },
  { prefix: 'places.kind', ids: PLACE_KINDS },
  { prefix: 'places.city', ids: CITY_IDS },
  { prefix: 'pl.area', ids: PULSE_AREAS.map((x) => x.id) },
  { prefix: 'pl.hint', ids: PULSE_AREAS.map((x) => x.id) },
  { prefix: 'preg.size', ids: WEEKS.map((w) => String(w.week)) },
  { prefix: 'preg.baby', ids: WEEKS.map((w) => String(w.week)) },
  { prefix: 'preg.mom', ids: WEEKS.map((w) => String(w.week)) },
  { prefix: 'preg.partner', ids: WEEKS.map((w) => String(w.week)) },
  { prefix: 'preg.cp', ids: CHECKPOINTS.map((c) => c.id) },
  { prefix: 'preg.cpHint', ids: CHECKPOINTS.map((c) => c.id) },
  { prefix: 'pg.trimester', ids: ['1', '2', '3'] },
  // Пустой префикс: эти ключи приходят из базы целиком. Функция состава тела
  // возвращает не «почему не посчитано», а сам ключ словаря.
  { prefix: '', ids: BODY_GAPS },
]

const dynamicGaps = FAMILIES.flatMap(({ prefix, ids, suffixes }) =>
  ids.flatMap((id) =>
    (suffixes ?? [''])
      .map((sfx) => `${prefix === '' ? id : `${prefix}.${id}`}${sfx}`)
      .filter((key) => !(key in ru)),
  ),
)
check(
  dynamicGaps.length === 0,
  'Составные ключи собираются из живых идентификаторов',
  dynamicGaps.length === 0
    ? `семейств ${FAMILIES.length}, ключей ${FAMILIES.reduce((n, f) => n + f.ids.length * (f.suffixes?.length ?? 1), 0)}`
    : `нет в словаре: ${dynamicGaps.join(', ')}`,
)

// Подсказки цикла: у каждой должны быть и заголовок, и тело
const tipsSource = readFileSync('src/features/cycle/tips.ts', 'utf8')
const tipIds = [...new Set([...tipsSource.matchAll(/id: '([^']+)'/g)].map((m) => m[1] ?? ''))]

// Две подсказки собирают заголовок из состояния цикла и задают title сами -
// у таких ключа title быть и не должно
const ownTitle = new Set(
  [...tipsSource.matchAll(/id: '([^']+)',[\s\S]{0,120}?\btitle:/g)].map((m) => m[1] ?? ''),
)
const tipGaps = tipIds.flatMap((id) =>
  (['title', 'body'] as const)
    .filter((part) => !(part === 'title' && ownTitle.has(id)))
    .filter((part) => !(`tip.${id}.${part}` in ru))
    .map((part) => `tip.${id}.${part}`),
)
check(
  tipGaps.length === 0 && tipIds.length > 0,
  'У каждой подсказки цикла есть заголовок и тело',
  tipGaps.length === 0
    ? `подсказок ${tipIds.length}, из них со своим заголовком ${ownTitle.size}`
    : `нет в словаре: ${tipGaps.join(', ')}`,
)

// И то же самое, но не по списку ключей, а тем же путём, каким текст
// достаётся на экране: через tipsToday()/tipsLibrary() и tr(). Так проверяется
// не только наличие ключа, но и то, что компонент соберёт именно его
const DELAYS = [
  null,
  { days: 4, level: 'slight', expectedOn: '2026-09-10', sinceLast: 32, basis: 'measured' },
  { days: 10, level: 'notable', expectedOn: '2026-09-04', sinceLast: 38, basis: 'assumed' },
  { days: 20, level: 'long', expectedOn: '2026-08-25', sinceLast: 48, basis: 'measured' },
  { days: 62, level: 'absent', expectedOn: '2026-07-14', sinceLast: 90, basis: 'measured' },
] as const

const unresolved: string[] = []
let resolved = 0
for (const lang of LANGS) {
  setActiveLang(lang)
  for (const phase of PHASES) {
    for (const audience of ['owner', 'partner'] as const) {
      // Задержка перебирается вся: подсказки о ней появляются по порогам,
      // и без перебора самые важные - про тест и про врача - не развернулись
      // бы ни разу. `assumed` отдельно: у него своя карточка.
      for (const delay of DELAYS) {
      const state = {
        day: 3,
        phase,
        cycleLength: 28,
        nextStart: '2026-10-01',
        daysToNext: 5,
        fertileFrom: '2026-09-14',
        fertileTo: '2026-09-19',
        delay,
      }
      for (const group of [
        ...tipsToday(state as never, audience),
        ...tipsLibrary(audience),
      ]) {
        for (const tip of group.tips) {
          const title = tip.title ?? tr(`tip.${tip.id}.title` as never)
          const body = tr(`tip.${tip.id}.body` as never)
          resolved += 2
          // Промах tr() возвращает сам ключ - он и начинается с «tip.»
          if (title.startsWith('tip.')) unresolved.push(`${lang}/${tip.id}/title`)
          if (body.startsWith('tip.')) unresolved.push(`${lang}/${tip.id}/body`)
        }
      }
      }
    }
  }
}
setActiveLang('ru')
check(
  unresolved.length === 0 && resolved > 0,
  'Подсказки цикла разворачиваются на всех языках',
  unresolved.length === 0
    ? `разрешено строк: ${resolved}`
    : `остались ключами: ${unresolved.slice(0, 5).join(', ')}`,
)

check(
  shell.size === 0,
  'В оболочке и воркере нет текста на одном языке',
  shell.size === 0
    ? `проверено: ${OUTSIDE.join(', ')}`
    : [...shell.entries()].map(([f, v]) => `${f}: ${v[0]}`).join('; '),
)

check(
  locales.size === 0,
  'Локаль нигде не прибита строкой',
  locales.size === 0
    ? 'даты и числа считаются по активному языку'
    : [...locales.entries()].map(([f, n]) => `${f} (${n})`).join(', '),
)

console.log(failed === 0 ? '\nПеревод полон.' : `\nПровалено: ${failed}`)
if (failed > 0) process.exit(1)
