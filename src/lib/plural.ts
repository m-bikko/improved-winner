/**
 * Русское склонение числительных: `plural(5, 'день', 'дня', 'дней')` → 'дней'.
 *
 * Форма «5 дн.» или «5 день» в интерфейсе, который человек видит каждый день,
 * читается как недоделка. Правило одно на все слова, поэтому пусть лежит
 * в одном месте, а не переписывается в каждом компоненте.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  if (abs > 10 && abs < 20) return many
  const last = abs % 10
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}
