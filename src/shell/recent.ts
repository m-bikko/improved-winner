import { useState } from 'react'

const KEY = 'love-promises-recent-sections'
const LIMIT = 4

function read(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** Запомнить раздел из «Ещё»: тридцать плиток нужны редко, а три-четыре - постоянно. */
export function rememberSection(to: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([to, ...read().filter((s) => s !== to)].slice(0, LIMIT)))
  } catch {
    // Закрытое хранилище в приватном режиме: список просто не запомнится
  }
}

export function useRecentSections(): string[] {
  const [recent] = useState(read)
  return recent
}
