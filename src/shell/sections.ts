import {
  Apple,
  Baby,
  BellRing,
  CalendarHeart,
  Clapperboard,
  Droplet,
  Gift,
  Heart,
  Images,
  ListChecks,
  MessageCircleHeart,
  MessagesSquare,
  NotebookPen,
  PiggyBank,
  Smile,
  Sparkles,
  Trophy,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { Key } from '@/lib/i18n'
import type { Tone } from '@/ui/tones'

export type Section = { to: string; key: Key; icon: LucideIcon; tone: Tone }

/**
 * Вкладки внизу - то, чем пользуются каждый день.
 *
 * Выбраны по базе, а не по ощущению: за месяц 310 записей в дневнике,
 * 42 «Думаю о тебе» с главной, 35 отметок «Как ты» и взвешивание каждый
 * день (оно в профиле). Темы и задачи - по пять за месяц, им место в «Ещё».
 */
export const TABS: readonly Section[] = [
  { to: '/today', key: 'nav.today', icon: Heart, tone: 'rose' },
  { to: '/diary', key: 'nav.diary', icon: NotebookPen, tone: 'amber' },
  { to: '/checkin', key: 'nav.checkin', icon: Smile, tone: 'violet' },
  { to: '/profile', key: 'nav.profile', icon: UserRound, tone: 'slate' },
]

/** Всё остальное - плиткой в шторке «Ещё». */
export const MORE: readonly Section[] = [
  { to: '/question', key: 'nav.question', icon: MessageCircleHeart, tone: 'violet' },
  { to: '/topics', key: 'nav.topics', icon: MessagesSquare, tone: 'indigo' },
  { to: '/tasks', key: 'nav.tasks', icon: ListChecks, tone: 'sky' },
  { to: '/foods', key: 'nav.foods', icon: Apple, tone: 'green' },
  { to: '/cycle', key: 'nav.cycle', icon: Droplet, tone: 'plum' },
  { to: '/dates', key: 'nav.dates', icon: CalendarHeart, tone: 'teal' },
  { to: '/wishlist', key: 'nav.wishlist', icon: Gift, tone: 'orange' },
  { to: '/memories', key: 'nav.memories', icon: Images, tone: 'rose' },
  { to: '/watch', key: 'nav.watch', icon: Clapperboard, tone: 'sky' },
  { to: '/challenges', key: 'nav.challenges', icon: Trophy, tone: 'green' },
  { to: '/savings', key: 'nav.savings', icon: PiggyBank, tone: 'amber' },
  { to: '/prep', key: 'nav.prep', icon: Baby, tone: 'teal' },
  { to: '/year', key: 'title.year', icon: Sparkles, tone: 'accent' },
  { to: '/notifications', key: 'title.notifications', icon: BellRing, tone: 'slate' },
]

/** Тон раздела по пути - для значков на главной и в «Ещё». */
export function sectionTone(to: string): Tone {
  return [...TABS, ...MORE].find((s) => s.to === to)?.tone ?? 'slate'
}

/**
 * Вложенные экраны и куда с них «назад», если истории нет - например,
 * экран открыт по ссылке из уведомления и приложение запустилось прямо на нём.
 * Порядок важен: частные пути раньше общих.
 */
export const NESTED: readonly { prefix: string; parent: string; tab: string; title?: Key }[] = [
  { prefix: '/cycle/report', parent: '/cycle', tab: 'more', title: 'title.cycleReport' },
  { prefix: '/cycle/library', parent: '/cycle', tab: 'more', title: 'title.cycleLibrary' },
  { prefix: '/topics/', parent: '/topics', tab: 'more' },
  { prefix: '/foods/', parent: '/foods', tab: 'more' },
  { prefix: '/month', parent: '/diary', tab: '/diary', title: 'title.month' },
]
