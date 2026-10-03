export type Agreement = {
  id: string
  title: string
  resolution: string
  closedAt: string
  closedBy: string
  pinnedAt: string | null
}

/** Поиск по названию и тексту решения - договорённостей десятки, хватает клиента. */
export function matches(a: Agreement, query: string): boolean {
  const q = query.trim().toLowerCase()
  return q === '' || a.title.toLowerCase().includes(q) || a.resolution.toLowerCase().includes(q)
}
