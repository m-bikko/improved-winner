/**
 * Поиск по продуктам - на клиенте.
 *
 * Двести-две тысячи продуктов это примерно 250 КБ: один запрос при старте,
 * кэш в IndexedDB, дальше фильтрация в памяти. Взамен получаем отклик без
 * сетевого round-trip на каждую букву, работу офлайн и отсутствие риска
 * сломать to_tsquery сырым вводом. Порог пересмотра - тысяч пять продуктов.
 *
 * Полнотекстовый поиск здесь бесполезен: проверено на живом Postgres, русский
 * стеммер это не лемматизатор - «творожок» не сводится к «творог», «мясо»
 * не связывается с «мясной». На коротких названиях префиксы и триграммы
 * работают лучше.
 *
 * Серверный similarity() тоже не подошёл бы: у «мол» против
 * «молоко 3.2% простоквашино» он близок к нулю, потому что нормируется на длину
 * всей строки. На клиенте эта ловушка просто не возникает - мы сравниваем
 * запрос со словами по отдельности.
 */

/** lower + ё→е. Должна совпадать с выражением колонки foods.name_norm. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').trim()
}

export function tokenize(query: string): string[] {
  return normalize(query)
    .split(/[^\p{L}\p{N}.%]+/u)
    .filter((t) => t.length > 0)
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text} `
  const out = new Set<string>()
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3))
  return out
}

/** Коэффициент Дайса: доля общих триграмм. 1 - совпадение, 0 - ничего общего. */
function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return (2 * shared) / (a.size + b.size)
}

const MIN_TRIGRAM_LENGTH = 4
const TRIGRAM_THRESHOLD = 0.45

/**
 * Оценка одного продукта. 0 означает «не показывать».
 *
 * Порядок весов и есть ранжирование: точное совпадение, затем начало строки,
 * затем начало любого слова, затем подстрока, и только потом - опечатки.
 */
export function scoreName(nameNorm: string, tokens: string[]): number {
  if (tokens.length === 0) return 1
  if (nameNorm.length === 0) return 0

  const words = nameNorm.split(/\s+/)
  let total = 0

  for (const token of tokens) {
    let best = 0

    if (nameNorm === token) best = 1000
    else if (nameNorm.startsWith(token)) best = 500
    else if (words.some((w) => w.startsWith(token))) best = 300
    else if (nameNorm.includes(token)) best = 150
    else if (token.length >= MIN_TRIGRAM_LENGTH) {
      // Опечатки. Сравниваем со словами по отдельности, а не со всей строкой:
      // иначе «курца» против «куриная грудка без кожи» утонет в длине.
      const tri = trigrams(token)
      let bestSim = 0
      for (const w of words) {
        const sim = dice(tri, trigrams(w))
        if (sim > bestSim) bestSim = sim
      }
      if (bestSim >= TRIGRAM_THRESHOLD) best = Math.round(bestSim * 100)
    }

    // Каждое слово запроса должно за что-то зацепиться, иначе «молоко козье»
    // выдавало бы всё молоко подряд
    if (best === 0) return 0
    total += best
  }

  // Короткое название при равном совпадении релевантнее длинного:
  // «Молоко 3.2%» должно опережать «Молоко сгущённое с сахаром»
  return total - Math.min(nameNorm.length, 60) / 10
}

export type Searchable = { nameNorm: string }

/**
 * Фильтрация и сортировка. `boost` позволяет поднять недавние или частые
 * продукты, не размывая при этом основную релевантность.
 */
export function searchItems<T extends Searchable>(
  items: readonly T[],
  query: string,
  options: { limit?: number; boost?: (item: T) => number } = {},
): T[] {
  const { limit = 50, boost } = options
  const tokens = tokenize(query)

  const scored: { item: T; score: number }[] = []
  for (const item of items) {
    const score = scoreName(item.nameNorm, tokens)
    if (score > 0) scored.push({ item, score: score + (boost?.(item) ?? 0) })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.item)
}
