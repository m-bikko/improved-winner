import {
  Activity,
  Apple,
  Baby,
  BellRing,
  BookHeart,
  CalendarHeart,
  CalendarRange,
  Camera,
  Clapperboard,
  Dices,
  Droplet,
  Gift,
  Handshake,
  Heart,
  HeartHandshake,
  HeartPulse,
  Images,
  Lightbulb,
  ListChecks,
  MessageCircleHeart,
  MessagesSquare,
  Mic,
  Milk,
  NotebookPen,
  PiggyBank,
  Signature,
  Smile,
  Sparkles,
  Stethoscope,
  Trophy,
  UserRound,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import type { Key } from '@/lib/i18n'
import type { Tone } from '@/ui/tones'

export type Section = {
  to: string
  key: Key
  icon: LucideIcon
  tone: Tone
  /** Плитка видна только при условии - например, когда малыш уже родился. */
  gate?: 'baby'
}

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

/**
 * Всё остальное - плиткой в шторке «Ещё», группами.
 *
 * Разделов стало под тридцать, и одной сеткой они читались как свалка:
 * нужное искалось глазами по цветам. Группы - по тому, зачем заходят:
 * про нас двоих, чем заняться вместе, разговоры, малыш, быт и итоги.
 */
export const MORE_GROUPS: readonly { key: Key; items: readonly Section[] }[] = [
  {
    key: 'nav.group.us',
    items: [
      { to: '/question', key: 'nav.question', icon: MessageCircleHeart, tone: 'violet' },
      { to: '/shots', key: 'nav.shots', icon: Camera, tone: 'sky' },
      { to: '/voice', key: 'nav.voice', icon: Mic, tone: 'violet' },
      { to: '/meetings', key: 'nav.meetings', icon: HeartHandshake, tone: 'rose' },
      { to: '/memories', key: 'nav.memories', icon: Images, tone: 'rose' },
      { to: '/story', key: 'nav.story', icon: BookHeart, tone: 'rose' },
    ],
  },
  {
    key: 'nav.group.fun',
    items: [
      { to: '/ideas', key: 'nav.ideas', icon: Lightbulb, tone: 'violet' },
      { to: '/quiz', key: 'nav.quiz', icon: Dices, tone: 'amber' },
      { to: '/watch', key: 'nav.watch', icon: Clapperboard, tone: 'sky' },
      { to: '/challenges', key: 'nav.challenges', icon: Trophy, tone: 'green' },
      { to: '/savings', key: 'nav.savings', icon: PiggyBank, tone: 'amber' },
    ],
  },
  {
    key: 'nav.group.talk',
    items: [
      { to: '/topics', key: 'nav.topics', icon: MessagesSquare, tone: 'indigo' },
      { to: '/pulse', key: 'nav.pulse', icon: Activity, tone: 'indigo' },
      { to: '/pause', key: 'nav.pause', icon: Wind, tone: 'sky' },
      { to: '/agreements', key: 'nav.agreements', icon: Handshake, tone: 'indigo' },
    ],
  },
  {
    key: 'nav.group.baby',
    items: [
      { to: '/prep', key: 'nav.prep', icon: Baby, tone: 'teal' },
      { to: '/pregnancy', key: 'nav.pregnancy', icon: HeartPulse, tone: 'plum' },
      { to: '/names', key: 'nav.names', icon: Signature, tone: 'orange' },
      // Только когда малыш уже есть: до рождения плитка вела бы в пустоту
      { to: '/baby', key: 'nav.baby', icon: Milk, tone: 'teal', gate: 'baby' },
    ],
  },
  {
    key: 'nav.group.life',
    items: [
      { to: '/tasks', key: 'nav.tasks', icon: ListChecks, tone: 'sky' },
      { to: '/foods', key: 'nav.foods', icon: Apple, tone: 'green' },
      { to: '/cycle', key: 'nav.cycle', icon: Droplet, tone: 'plum' },
      { to: '/dates', key: 'nav.dates', icon: CalendarHeart, tone: 'teal' },
      { to: '/wishlist', key: 'nav.wishlist', icon: Gift, tone: 'orange' },
      { to: '/health', key: 'nav.health', icon: Stethoscope, tone: 'teal' },
    ],
  },
  {
    key: 'nav.group.app',
    items: [
      { to: '/week', key: 'nav.week', icon: CalendarRange, tone: 'accent' },
      { to: '/year', key: 'title.year', icon: Sparkles, tone: 'accent' },
      { to: '/notifications', key: 'title.notifications', icon: BellRing, tone: 'slate' },
    ],
  },
]

/** Все разделы «Ещё» подряд - для заголовка шапки и тона по пути. */
export const MORE: readonly Section[] = MORE_GROUPS.flatMap((g) => g.items)

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
