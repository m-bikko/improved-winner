import { Landmark, Luggage, MapPin, Ticket, TreePine, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import type { Tone } from '@/ui/tones'
import type { PlaceKind } from './logic'

/** Один вид - один значок и тон: и в списке, и на булавке карты. */
export const KIND_LOOK: Record<PlaceKind, { icon: LucideIcon; tone: Tone }> = {
  food: { icon: UtensilsCrossed, tone: 'orange' },
  nature: { icon: TreePine, tone: 'green' },
  culture: { icon: Landmark, tone: 'indigo' },
  fun: { icon: Ticket, tone: 'violet' },
  trip: { icon: Luggage, tone: 'sky' },
  other: { icon: MapPin, tone: 'rose' },
}
