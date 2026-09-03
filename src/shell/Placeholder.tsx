import { Hammer } from 'lucide-react'

/** Заглушка для разделов, до которых ещё не дошла очередь по плану. */
export function Placeholder({ stage }: { stage: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-24 text-center text-muted">
      <Hammer size={28} aria-hidden />
      <p className="text-sm">{stage}</p>
    </div>
  )
}
