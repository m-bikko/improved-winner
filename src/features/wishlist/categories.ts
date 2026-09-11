import {
  BookOpen,
  Gift,
  MapPin,
  Popcorn,
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from 'lucide-react'

/**
 * Виды желаний.
 *
 * Список закрыт и продублирован в CHECK у `wishlists`: база обязана отвергать
 * неизвестную категорию, а форма - не предлагать того, чего база не примет.
 * Совпадение проверяет `check-wishlist` - та же ловушка, что у состояний
 * в «Как ты» и у видов уведомлений.
 *
 * Порядок здесь - порядок фильтра на экране, от самых частых к редким.
 */
export type Category = {
  id: string
  icon: LucideIcon
}

export const CATEGORIES: Category[] = [
  { id: 'buy', icon: ShoppingBag },
  { id: 'visit', icon: MapPin },
  { id: 'try', icon: Sparkles },
  { id: 'food', icon: UtensilsCrossed },
  { id: 'watch', icon: Popcorn },
  { id: 'read', icon: BookOpen },
  { id: 'together', icon: Users },
  { id: 'gift', icon: Gift },
]

export const CATEGORY_BY_ID: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
)
