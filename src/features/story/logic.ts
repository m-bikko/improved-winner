/**
 * Порядковое числительное цифрами - для вех истории («10th», «10-шы»).
 *
 * По-русски окончание зависит от рода слова («10-е спасибо», «10-й день»),
 * поэтому оно в самом шаблоне перевода. По-английски - st/nd/rd/th.
 * По-казахски - -шы или -ші по гармонии гласных последнего слова числа:
 * он → 10-шы, елу → 50-ші, жүз → 100-ші, мың → 1000-шы.
 */
export function ordinal(n: number, lang: 'ru' | 'en' | 'kk'): string {
  if (lang === 'en') {
    const tens = n % 100
    if (tens >= 11 && tens <= 13) return `${n}th`
    return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`
  }
  if (lang === 'kk') return `${n}-${kkBack(n) ? 'шы' : 'ші'}`
  return String(n)
}

// Последнее слово числа: заднерядное (а, о, ы, ұ) - «шы», переднерядное - «ші»
const ONES_BACK = new Set([6, 9]) // алты, тоғыз
const TENS_BACK = new Set([10, 20, 30, 40, 60, 90]) // он, жиырма, отыз, қырық, алпыс, тоқсан

function kkBack(n: number): boolean {
  if (n % 1000 === 0) return true // мың
  if (n % 100 === 0) return false // жүз
  if (n % 10 === 0) return TENS_BACK.has(n % 100)
  return ONES_BACK.has(n % 10)
}
