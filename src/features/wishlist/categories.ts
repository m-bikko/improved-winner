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
  label: string
  icon: LucideIcon
}

export const CATEGORIES: Category[] = [
  { id: 'buy', label: 'Хочу купить', icon: ShoppingBag },
  { id: 'visit', label: 'Хочу посетить', icon: MapPin },
  { id: 'try', label: 'Хочу попробовать', icon: Sparkles },
  { id: 'food', label: 'Еда', icon: UtensilsCrossed },
  { id: 'watch', label: 'Посмотреть', icon: Popcorn },
  { id: 'read', label: 'Прочитать', icon: BookOpen },
  { id: 'together', label: 'Сделать вместе', icon: Users },
  { id: 'gift', label: 'Подарить', icon: Gift },
]

export const CATEGORY_BY_ID: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
)
