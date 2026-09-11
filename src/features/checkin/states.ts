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

export type StateDef = {
  id: string
  group: StateGroup
  icon: LucideIcon
}

export const STATES: StateDef[] = [
  { id: 'joy', group: 'mood', icon: Laugh },
  { id: 'calm', group: 'mood', icon: Cloud },
  { id: 'inlove', group: 'mood', icon: Heart },
  { id: 'grateful', group: 'mood', icon: HandHeart },
  { id: 'inspired', group: 'mood', icon: Sparkles },
  { id: 'proud', group: 'mood', icon: Star },
  { id: 'sad', group: 'mood', icon: CloudRain },
  { id: 'anxious', group: 'mood', icon: TriangleAlert },
  { id: 'irritated', group: 'mood', icon: Annoyed },
  { id: 'angry', group: 'mood', icon: Angry },
  { id: 'lonely', group: 'mood', icon: HeartCrack },
  { id: 'bored', group: 'mood', icon: Meh },
  { id: 'lost', group: 'mood', icon: Umbrella },
  { id: 'guilty', group: 'mood', icon: Frown },

  { id: 'energetic', group: 'energy', icon: Sun },
  { id: 'strong', group: 'energy', icon: Zap },
  { id: 'secondwind', group: 'energy', icon: Rocket },
  { id: 'sleepy', group: 'energy', icon: Moon },
  { id: 'exhausted', group: 'energy', icon: BatteryLow },
  { id: 'broken', group: 'energy', icon: Snail },

  { id: 'healthy', group: 'body', icon: CircleCheck },
  { id: 'headache', group: 'body', icon: Brain },
  { id: 'stomach', group: 'body', icon: Pill },
  { id: 'nausea', group: 'body', icon: Wind },
  { id: 'sore', group: 'body', icon: Dumbbell },
  { id: 'back', group: 'body', icon: Hourglass },
  { id: 'sick', group: 'body', icon: Thermometer },
  { id: 'poop', group: 'body', icon: Toilet },
  { id: 'hungry', group: 'body', icon: Utensils },
  { id: 'stuffed', group: 'body', icon: Beef },
  { id: 'thirsty', group: 'body', icon: GlassWater },
  { id: 'cold', group: 'body', icon: Snowflake },
  { id: 'hot', group: 'body', icon: Flame },
  { id: 'pms', group: 'body', icon: Stethoscope },
  { id: 'period', group: 'body', icon: Baby },

  { id: 'miss', group: 'us', icon: HeartCrack },
  { id: 'wantmeet', group: 'us', icon: Users },
  { id: 'wanthug', group: 'us', icon: HeartHandshake },
  { id: 'needtalk', group: 'us', icon: MessageCircle },
  { id: 'allgoodus', group: 'us', icon: Smile },

  { id: 'working', group: 'doing', icon: Briefcase },
  { id: 'swamped', group: 'doing', icon: Coffee },
  { id: 'free', group: 'doing', icon: Sofa },
  { id: 'onroad', group: 'doing', icon: Car },
  { id: 'training', group: 'doing', icon: Dumbbell },
  { id: 'resting', group: 'doing', icon: BookOpen },
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
