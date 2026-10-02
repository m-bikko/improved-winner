import {
  Baby,
  Car,
  Gem,
  Gift,
  GraduationCap,
  Heart,
  House,
  PiggyBank,
  Plane,
  Smartphone,
  Target,
  TreePalm,
  type LucideIcon,
} from 'lucide-react'

/** Значки целей. Ключ хранится в базе - не переименовывать, только добавлять. */
export const GOAL_ICONS = {
  piggy: PiggyBank,
  trip: Plane,
  beach: TreePalm,
  home: House,
  ring: Gem,
  baby: Baby,
  car: Car,
  study: GraduationCap,
  gadget: Smartphone,
  gift: Gift,
  heart: Heart,
  target: Target,
} as const satisfies Record<string, LucideIcon>

export type GoalIcon = keyof typeof GOAL_ICONS

export function goalIcon(key: string): LucideIcon {
  return (GOAL_ICONS as Record<string, LucideIcon>)[key] ?? PiggyBank
}
