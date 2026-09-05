import {
  Angry, Annoyed, Baby, BatteryLow, Beef, BookOpen, Brain, Briefcase, Car,
  CircleCheck, Cloud, CloudRain, Coffee, Dumbbell, Flame, Frown, GlassWater,
  HandHeart, Heart, HeartCrack, HeartHandshake, Hourglass, Laugh, Meh, MessageCircle,
  Moon, Pill, Rocket, Smile, Snail, Snowflake, Sofa, Sparkles, Star, Stethoscope,
  Sun, Thermometer, Toilet, TriangleAlert, Umbrella, Users, Utensils, Wind, Zap,
  type LucideIcon,
} from 'lucide-react'

/**
 * Словарь состояний для ежедневного опроса.
 *
 * Ключи совпадают со значениями, которые разрешает CHECK в базе. Совпадение
 * не случайно: предлагать в интерфейсе то, что база откажется принять, - та же
 * ошибка, что была бы с напоминаниями задач.
 *
 * Иконки, а не эмодзи. Эмодзи в этом проекте запрещены: они выглядят по-разному
 * на разных системах, а половина состояний здесь - про тело, где двусмысленность
 * особенно ни к чему.
 *
 * Список намеренно длинный и с бытовыми пунктами вроде «какаю». Опрос, где
 * можно отметить только «хорошо» и «плохо», отвечается один раз и забрасывается;
 * опрос, где есть про что пошутить, живёт дольше.
 */
export const STATE_GROUPS = [
  'mood',
  'energy',
  'body',
  'us',
  'doing',
] as const
export type StateGroup = (typeof STATE_GROUPS)[number]

export const GROUP_LABELS: Record<StateGroup, string> = {
  mood: 'Настроение',
  energy: 'Силы',
  body: 'Тело',
  us: 'Про нас',
  doing: 'Чем занят',
}

export type StateDef = {
  id: string
  label: string
  group: StateGroup
  icon: LucideIcon
}

export const STATES: StateDef[] = [
  { id: 'joy', label: 'Радостно', group: 'mood', icon: Laugh },
  { id: 'calm', label: 'Спокойно', group: 'mood', icon: Cloud },
  { id: 'inlove', label: 'Влюблённо', group: 'mood', icon: Heart },
  { id: 'grateful', label: 'Благодарно', group: 'mood', icon: HandHeart },
  { id: 'inspired', label: 'Вдохновлённо', group: 'mood', icon: Sparkles },
  { id: 'proud', label: 'Гордо', group: 'mood', icon: Star },
  { id: 'sad', label: 'Грустно', group: 'mood', icon: CloudRain },
  { id: 'anxious', label: 'Тревожно', group: 'mood', icon: TriangleAlert },
  { id: 'irritated', label: 'Раздражённо', group: 'mood', icon: Annoyed },
  { id: 'angry', label: 'Злюсь', group: 'mood', icon: Angry },
  { id: 'lonely', label: 'Одиноко', group: 'mood', icon: HeartCrack },
  { id: 'bored', label: 'Скучно', group: 'mood', icon: Meh },
  { id: 'lost', label: 'Растерянно', group: 'mood', icon: Umbrella },
  { id: 'guilty', label: 'Виновато', group: 'mood', icon: Frown },

  { id: 'energetic', label: 'Бодро', group: 'energy', icon: Sun },
  { id: 'strong', label: 'Полон сил', group: 'energy', icon: Zap },
  { id: 'secondwind', label: 'Второе дыхание', group: 'energy', icon: Rocket },
  { id: 'sleepy', label: 'Сонливо', group: 'energy', icon: Moon },
  { id: 'exhausted', label: 'Вымотан', group: 'energy', icon: BatteryLow },
  { id: 'broken', label: 'Разбито', group: 'energy', icon: Snail },

  { id: 'healthy', label: 'Всё отлично', group: 'body', icon: CircleCheck },
  { id: 'headache', label: 'Болит голова', group: 'body', icon: Brain },
  { id: 'stomach', label: 'Болит живот', group: 'body', icon: Pill },
  { id: 'nausea', label: 'Тошнит', group: 'body', icon: Wind },
  { id: 'sore', label: 'Мышцы болят', group: 'body', icon: Dumbbell },
  { id: 'back', label: 'Спина', group: 'body', icon: Hourglass },
  { id: 'sick', label: 'Простыл', group: 'body', icon: Thermometer },
  { id: 'poop', label: 'Какаю', group: 'body', icon: Toilet },
  { id: 'hungry', label: 'Голоден', group: 'body', icon: Utensils },
  { id: 'stuffed', label: 'Объелся', group: 'body', icon: Beef },
  { id: 'thirsty', label: 'Хочу пить', group: 'body', icon: GlassWater },
  { id: 'cold', label: 'Мёрзну', group: 'body', icon: Snowflake },
  { id: 'hot', label: 'Жарко', group: 'body', icon: Flame },
  { id: 'pms', label: 'ПМС', group: 'body', icon: Stethoscope },
  { id: 'period', label: 'Эти дни', group: 'body', icon: Baby },

  { id: 'miss', label: 'Скучаю', group: 'us', icon: HeartCrack },
  { id: 'wantmeet', label: 'Хочу увидеться', group: 'us', icon: Users },
  { id: 'wanthug', label: 'Хочу обняться', group: 'us', icon: HeartHandshake },
  { id: 'needtalk', label: 'Надо поговорить', group: 'us', icon: MessageCircle },
  { id: 'allgoodus', label: 'У нас всё хорошо', group: 'us', icon: Smile },

  { id: 'working', label: 'Работаю', group: 'doing', icon: Briefcase },
  { id: 'swamped', label: 'Завал', group: 'doing', icon: Coffee },
  { id: 'free', label: 'Свободен', group: 'doing', icon: Sofa },
  { id: 'onroad', label: 'В дороге', group: 'doing', icon: Car },
  { id: 'training', label: 'На тренировке', group: 'doing', icon: Dumbbell },
  { id: 'resting', label: 'Отдыхаю', group: 'doing', icon: BookOpen },
]

export const STATE_BY_ID: Record<string, StateDef> = Object.fromEntries(
  STATES.map((s) => [s.id, s]),
)

export type Checkin = {
  userId: string
  date: string
  states: string[]
  note: string | null
}
