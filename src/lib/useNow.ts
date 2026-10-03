import { useEffect, useState } from 'react'

/**
 * Текущее время, обновляемое с шагом `ms` - для живых таймеров
 * (кадр дня, пауза, кормление). Выключенный не тикает и не будит экран.
 */
export function useNow(ms: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms, enabled])
  return now
}
