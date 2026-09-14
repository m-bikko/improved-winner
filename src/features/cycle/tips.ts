/**
 * Подсказки по дням цикла.
 *
 * Правило отбора одно: подсказка попадает сюда, только если из неё следует
 * действие, и по возможности - действие в этом же приложении. Общих слов
 * вроде «слушайте своё тело» здесь нет намеренно: они занимают место
 * и ничего не меняют.
 *
 * Разбиты по темам, потому что плоский список из пятнадцати карточек никто
 * не дочитывает. Порядок тем не случаен: сначала то, что человек чувствует
 * прямо сейчас, потом еда и нагрузка, потом близость, и в конце то, что
 * касается двоих.
 *
 * Медицинских утверждений здесь нет. Где речь о том, что бывает нормой,
 * сказано и то, когда норма кончается. Где про вероятность - сказано, что
 * она не ноль.
 */
import { tr, trPlural } from '@/lib/i18n'
import { DELAY, type CycleDay, type Delay, type Phase } from './cycle'

// Порядок не алфавитный и не случайный. Сначала то, что человек чувствует
// прямо сейчас, потом объяснение почему, потом что с этим делать, потом
// про двоих. Библиотечные темы - близость и её польза - идут последними:
// они не про сегодня, а про вообще, и открывают их по желанию.
export const TIP_CATEGORIES = [
  // Задержка идёт первой и появляется только когда она есть. Всё остальное
  // на экране в этот момент второстепенно: человек открыл раздел не затем,
  // чтобы почитать про железо.
  'delay',
  'body',
  'hormones',
  'food',
  'training',
  'together',
  'intimacy',
  'practices',
  'benefits',
] as const
export type TipCategory = (typeof TIP_CATEGORIES)[number]

/**
 * Темы, которые не зависят от дня цикла.
 *
 * Гормоны, близость и её польза - это справка, а не «что делать сегодня».
 * Показывать их развёрнутыми рядом с сиюминутным значило бы утопить главное:
 * человек открыл раздел узнать про сегодня, а получил бы лекцию.
 */
export const LIBRARY_CATEGORIES: readonly TipCategory[] = [
  'intimacy',
  'practices',
  'benefits',
]

export type Tip = {
  id: string
  category: TipCategory
  /**
   * Заголовок, собранный на лету.
   *
   * У подавляющего большинства подсказок его нет: текст лежит в словаре
   * под `tip.<id>.title`, и брать его оттуда - единственный способ иметь
   * три языка. Поле нужно двум подсказкам, где в заголовке стоит число,
   * посчитанное из состояния цикла.
   */
  title?: string
  /**
   * В каких фазах подсказка уместна. Пусто - уместна всегда.
   *
   * Так справочное и сиюминутное лежат в одном списке, но всплывают
   * по-разному: «прогестерон поднимает температуру» имеет смысл во второй
   * половине цикла, а «боль во время секса - не то, что терпят» - в любой день.
   */
  phases?: Phase[]
}

const BY_PHASE: Record<Phase, Tip[]> = {
  menstrual: [
    {
      id: 'cramps',
      category: 'body',
    },
    {
      id: 'iron',
      category: 'food',
    },
    {
      id: 'water',
      category: 'food',
    },
    {
      id: 'train-light',
      category: 'training',
    },
    {
      id: 'ask-what-helps',
      category: 'together',
    },
  ],

  follicular: [
    {
      id: 'peak-energy',
      category: 'body',
    },
    {
      id: 'appetite-calm',
      category: 'food',
    },
    {
      id: 'heavy-training',
      category: 'training',
    },
    {
      id: 'libido-rising',
      category: 'intimacy',
    },
    {
      id: 'hard-talks',
      category: 'together',
    },
    {
      id: 'plan',
      category: 'together',
    },
  ],

  ovulation: [
    {
      id: 'mittelschmerz',
      category: 'body',
    },
    {
      id: 'energy-peak',
      category: 'body',
    },
    {
      id: 'pr-window',
      category: 'training',
    },
    {
      id: 'appetite-low',
      category: 'food',
    },
    {
      id: 'peak-together',
      category: 'together',
    },
    {
      id: 'libido-peak',
      category: 'intimacy',
    },
  ],

  luteal: [
    {
      id: 'water-weight',
      category: 'body',
    },
    {
      id: 'sleep-caffeine',
      category: 'body',
    },
    {
      id: 'carb-craving',
      category: 'food',
    },
    {
      id: 'magnesium',
      category: 'food',
    },
    {
      id: 'volume-down',
      category: 'training',
    },
    {
      id: 'hydrate-heat',
      category: 'training',
    },
    {
      id: 'libido-down',
      category: 'intimacy',
    },
    {
      id: 'not-character',
      category: 'together',
    },
    {
      id: 'plan-light-week',
      category: 'together',
    },
  ],
}


/**
 * Гормоны: что происходит и почему это чувствуется.
 *
 * Раздел объясняющий, а не предписывающий. Человек, который знает, что
 * прогестерон поднимает температуру тела, перестаёт считать себя слабым
 * из-за того, что в зале в эти дни тяжелее.
 *
 * Часть подсказок привязана к фазе - тогда они всплывают в свой день.
 * Часть общая: она про устройство, а не про сегодня.
 */
const HORMONES: Tip[] = [
  {
    id: 'h-estrogen',
    category: 'hormones',
    phases: ['follicular'],
  },
  {
    id: 'h-progesterone',
    category: 'hormones',
    phases: ['luteal'],
  },
  {
    id: 'h-temp',
    category: 'hormones',
    phases: ['luteal'],
  },
  {
    id: 'h-lh',
    category: 'hormones',
    phases: ['ovulation'],
  },
  {
    id: 'h-fsh',
    category: 'hormones',
    phases: ['menstrual'],
  },
  {
    id: 'h-prostaglandins',
    category: 'hormones',
    phases: ['menstrual'],
  },
  {
    id: 'h-testosterone',
    category: 'hormones',
  },
  {
    id: 'h-insulin',
    category: 'hormones',
  },
  {
    id: 'h-cortisol',
    category: 'hormones',
  },
  {
    id: 'h-melatonin',
    category: 'hormones',
  },
  {
    id: 'h-serotonin',
    category: 'hormones',
    phases: ['luteal'],
  },
  {
    id: 'h-prolactin',
    category: 'hormones',
  },
  {
    id: 'h-thyroid',
    category: 'hormones',
  },
  {
    id: 'h-contraception',
    category: 'hormones',
  },
  {
    id: 'h-oxytocin',
    category: 'hormones',
  },
  {
    id: 'h-endorphins',
    category: 'hormones',
  },
  {
    id: 'h-desire-responsive',
    category: 'hormones',
  },
  {
    id: 'h-desire-vs-arousal',
    category: 'hormones',
  },
  {
    id: 'h-dopamine',
    category: 'hormones',
  },
  {
    id: 'h-prolactin-refractory',
    category: 'hormones',
  },
  {
    id: 'h-testosterone-sleep',
    category: 'hormones',
  },
  {
    id: 'h-cortisol-desire',
    category: 'hormones',
  },
  {
    id: 'h-contraception-libido',
    category: 'hormones',
  },
  {
    id: 'h-ssri',
    category: 'hormones',
  },
  {
    id: 'h-alcohol-hormones',
    category: 'hormones',
  },
  {
    id: 'h-track-not-guess',
    category: 'hormones',
  },
]

/**
 * Близость: как половая жизнь связана с циклом и что с этим делать.
 *
 * Тон здесь важнее содержания. Раздел читают двое, и он не имеет права
 * звучать как инструкция для одного из них. Поэтому: факты, а не советы
 * «как надо»; и ни одной фразы, из которой следует, что кто-то кому-то
 * должен.
 */
const INTIMACY: Tip[] = [
  {
    id: 'i-desire-curve',
    category: 'intimacy',
  },
  {
    id: 'i-not-schedule',
    category: 'intimacy',
  },
  {
    id: 'i-dryness',
    category: 'intimacy',
  },
  {
    id: 'i-lube-condom',
    category: 'intimacy',
  },
  {
    id: 'i-pain-not-normal',
    category: 'intimacy',
  },
  {
    id: 'i-period-sex',
    category: 'intimacy',
  },
  {
    id: 'i-period-risk',
    category: 'intimacy',
  },
  {
    id: 'i-window-estimate',
    category: 'intimacy',
  },
  {
    id: 'i-pee-after',
    category: 'intimacy',
  },
  {
    id: 'i-sti',
    category: 'intimacy',
  },
  {
    id: 'i-mismatch',
    category: 'intimacy',
  },
  {
    id: 'i-talk',
    category: 'intimacy',
  },
  {
    id: 'i-planned-ok',
    category: 'intimacy',
  },
  {
    id: 'i-libido-meds',
    category: 'intimacy',
  },
  {
    id: 'i-libido-health',
    category: 'intimacy',
  },
  {
    id: 'i-alcohol',
    category: 'intimacy',
  },
  {
    id: 'i-sleep',
    category: 'intimacy',
  },
  {
    id: 'i-consent',
    category: 'intimacy',
  },
]

/**
 * Виды близости: что чем отличается и для чего годится.
 *
 * Раздел справочный и намеренно скучный по тону. Он отвечает на вопросы,
 * которые неудобно задавать вслух и на которые в поиске отвечают статьи
 * сомнительного качества: что делать, когда больно, что безопасно, чем
 * один способ отличается от другого по последствиям.
 *
 * Три правила, которым подчинён каждый текст здесь:
 *
 * 1. Ничего про технику ради техники. Только то, из чего следует решение:
 *    чем смазывать, что нельзя совмещать, когда идти к врачу.
 * 2. Риски названы там, где они есть. Умолчать о переносе бактерий или
 *    о том, что оральный секс не защищает от инфекций, - хуже, чем
 *    не написать вовсе.
 * 3. Ни одна строка не превращается в ожидание. Перечень возможностей -
 *    это не список того, что «надо попробовать».
 */
const PRACTICES: Tip[] = [
  {
    id: 'pr-orgasm-gap',
    category: 'practices',
  },
  {
    id: 'pr-nonpenetrative',
    category: 'practices',
  },
  {
    id: 'pr-oral',
    category: 'practices',
  },
  {
    id: 'pr-anal-lube',
    category: 'practices',
  },
  {
    id: 'pr-anal-order',
    category: 'practices',
  },
  {
    id: 'pr-anal-slow',
    category: 'practices',
  },
  {
    id: 'pr-lube-types',
    category: 'practices',
  },
  {
    id: 'pr-toys-material',
    category: 'practices',
  },
  {
    id: 'pr-toys-shared',
    category: 'practices',
  },
  {
    id: 'pr-positions-pain',
    category: 'practices',
  },
  {
    id: 'pr-period',
    category: 'practices',
  },
  {
    id: 'pr-solo',
    category: 'practices',
  },
  {
    id: 'pr-mutual',
    category: 'practices',
  },
  {
    id: 'pr-quickie',
    category: 'practices',
  },
  {
    id: 'pr-afterplay',
    category: 'practices',
  },
  {
    id: 'pr-pelvic-floor',
    category: 'practices',
  },
  {
    id: 'pr-hygiene',
    category: 'practices',
  },
  {
    id: 'pr-no-checklist',
    category: 'practices',
  },
]

/**
 * Что даёт близость.
 *
 * Самый скользкий раздел из всех, и вот почему. Список пользы, прочитанный
 * одним из двоих, легко превращается в аргумент против другого: «тут написано,
 * что это полезно». Поэтому он открывается и закрывается напоминанием, что
 * польза - не повод и не обязанность, а внутри держится доказанного и честно
 * помечает то, где доказательства слабые.
 *
 * И половина пунктов здесь не про секс, а про прикосновение вообще - потому
 * что механизм у них один и работает он у обоих.
 */
const BENEFITS: Tip[] = [
  {
    id: 'b-not-a-duty',
    category: 'benefits',
  },
  {
    id: 'b-stress',
    category: 'benefits',
  },
  {
    id: 'b-sleep',
    category: 'benefits',
  },
  {
    id: 'b-cramps',
    category: 'benefits',
  },
  {
    id: 'b-headache',
    category: 'benefits',
  },
  {
    id: 'b-pelvic',
    category: 'benefits',
  },
  {
    id: 'b-cardio',
    category: 'benefits',
  },
  {
    id: 'b-mood',
    category: 'benefits',
  },
  {
    id: 'b-bonding',
    category: 'benefits',
  },
  {
    id: 'b-satisfaction',
    category: 'benefits',
  },
  {
    id: 'b-pain-threshold',
    category: 'benefits',
  },
  {
    id: 'b-selfimage',
    category: 'benefits',
  },
  {
    id: 'b-bp',
    category: 'benefits',
  },
  {
    id: 'b-immunity',
    category: 'benefits',
  },
  {
    id: 'b-touch-counts',
    category: 'benefits',
  },
  {
    id: 'b-quality',
    category: 'benefits',
  },
  {
    id: 'b-no-pressure',
    category: 'benefits',
  },
]

/**
 * Подсказки для того, кто смотрит чужой цикл.
 *
 * Весь остальной раздел написан для владельца: «уменьшить рабочий вес»,
 * «пить больше воды». Показать это партнёру - значит дать ему инструкции
 * к чужому телу, а заодно намекнуть, что он должен их проследить.
 *
 * Поэтому здесь другой набор и другая грамматика: не «сделай», а «сейчас
 * у неё вероятно вот так». Про действия говорится только там, где действие
 * принадлежит самому читателю - спросить, не планировать переезд, не спорить
 * с цифрой на весах.
 *
 * И главное правило раздела: ни одна подсказка не даёт права объяснять
 * человеку его состояние. «Это у тебя ПМС» - самая частая и самая обидная
 * ошибка, и она названа здесь прямо.
 */
const PARTNER: Record<Phase, Tip[]> = {
  menstrual: [
    {
      id: 'p-m-energy',
      category: 'body',
    },
    {
      id: 'p-m-pain',
      category: 'body',
    },
    {
      id: 'p-m-help',
      category: 'together',
    },
    {
      id: 'p-m-space',
      category: 'together',
    },
  ],

  follicular: [
    {
      id: 'p-f-energy',
      category: 'body',
    },
    {
      id: 'p-f-talks',
      category: 'together',
    },
    {
      id: 'p-f-plan',
      category: 'together',
    },
  ],

  ovulation: [
    {
      id: 'p-o-peak',
      category: 'body',
    },
    {
      id: 'p-o-pain',
      category: 'body',
    },
    {
      id: 'p-o-fertile',
      category: 'intimacy',
    },
  ],

  luteal: [
    {
      id: 'p-l-mood',
      category: 'body',
    },
    {
      id: 'p-l-dont-explain',
      category: 'together',
    },
    {
      id: 'p-l-weight',
      category: 'body',
    },
    {
      id: 'p-l-food',
      category: 'together',
    },
    {
      id: 'p-l-load',
      category: 'together',
    },
    {
      id: 'p-l-severe',
      category: 'body',
    },
  ],
}

/** Общее для наблюдателя - вне зависимости от фазы. */
const PARTNER_ALWAYS: Tip[] = [
  {
    id: 'p-a-read-only',
    category: 'together',
  },
  {
    id: 'p-a-not-a-tool',
    category: 'together',
  },
  {
    id: 'p-a-ask',
    category: 'together',
  },
  {
    id: 'p-a-estimate',
    category: 'body',
  },
]


/**
 * Добавленные позже, по просьбе автора «увеличь количество».
 *
 * Отдельным списком, а не вперемешку с исходными: так видно, что добавлено,
 * и при следующей чистке будет понятно, где искать. Правило отбора то же -
 * из подсказки должно следовать действие.
 */
const EXTRA: Tip[] = [
  { id: 'x-iron-test', category: 'body', },
  { id: 'x-clots', category: 'body', },
  { id: 'x-pad-count', category: 'body', },
  { id: 'x-spotting', category: 'body', },
  { id: 'x-temp-chart', category: 'body', },
  { id: 'x-cm', category: 'body', },
  { id: 'x-hydration', category: 'food', },
  { id: 'x-caffeine-cramps', category: 'food', },
  { id: 'x-omega', category: 'food', },
  { id: 'x-protein-luteal', category: 'food', },
  { id: 'x-alcohol-pms', category: 'food', },
  { id: 'x-fiber', category: 'food', },
  { id: 'x-training-log', category: 'training', },
  { id: 'x-warmup', category: 'training', },
  { id: 'x-deload', category: 'training', },
  { id: 'x-cardio-period', category: 'training', },
  { id: 'x-hydrate-train', category: 'training', },
  { id: 'x-sleep-training', category: 'training', },
  { id: 'x-h-fsh-lh', category: 'hormones', },
  { id: 'x-h-bodyfat', category: 'hormones', },
  { id: 'x-h-pcos', category: 'hormones', },
  { id: 'x-h-endometriosis', category: 'hormones', },
  { id: 'x-h-thyroid-2', category: 'hormones', },
  { id: 'x-h-age', category: 'hormones', },
  { id: 'x-h-post-pill', category: 'hormones', },
  { id: 'x-h-cortisol-belly', category: 'hormones', },
  { id: 'x-us-apart', category: 'together', },
  { id: 'x-us-call', category: 'together', },
  { id: 'x-us-delivery', category: 'together', },
  { id: 'x-us-plan-apart', category: 'together', },
  { id: 'x-us-nodemand', category: 'together', },
  { id: 'x-us-checkin', category: 'together', },
  { id: 'x-pr-timing', category: 'practices', },
  { id: 'x-pr-pain-period', category: 'practices', },
  { id: 'x-pr-uti', category: 'practices', },
  { id: 'x-pr-condom-size', category: 'practices', },
  { id: 'x-pr-expiry', category: 'practices', },
  { id: 'x-pr-emergency', category: 'practices', },
  { id: 'x-b-touch-apart', category: 'benefits', },
  { id: 'x-b-anticipation', category: 'benefits', },
  { id: 'x-b-routine-sex', category: 'benefits', },
  { id: 'x-b-selfcare', category: 'benefits', },
]

/**
 * Вторая добавка, тоже по просьбе автора: по пять пунктов в каждую тему.
 *
 * Ни одна не привязана к фазе намеренно. Привязанная к фазе подсказка
 * не попадает в список «Что полезно знать» - до первой отметки фазы нет,
 * и решить, уместна ли она сегодня, нечем. А просьба была именно про этот
 * список.
 *
 * Порядок внутри темы - как написано: они добавлены в конец, чтобы уже
 * прочитанное не поехало.
 */
const MORE: Tip[] = [
  { id: 'y-body-headache', category: 'body' },
  { id: 'y-body-bowel', category: 'body' },
  { id: 'y-body-back-heat', category: 'body' },
  { id: 'y-body-breast-lump', category: 'body' },
  { id: 'y-body-nausea-limit', category: 'body' },

  { id: 'y-h-sleep-cortisol', category: 'hormones' },
  { id: 'y-h-travel', category: 'hormones' },
  { id: 'y-h-underfuel', category: 'hormones' },
  { id: 'y-h-stress-phase', category: 'hormones' },
  { id: 'y-h-vitamind', category: 'hormones' },

  { id: 'y-food-salt', category: 'food' },
  { id: 'y-food-calcium', category: 'food' },
  { id: 'y-food-breakfast-protein', category: 'food' },
  { id: 'y-food-iron-vitc', category: 'food' },
  { id: 'y-food-no-deficit', category: 'food' },

  { id: 'y-tr-rpe', category: 'training' },
  { id: 'y-tr-jumps', category: 'training' },
  { id: 'y-tr-short-sleep', category: 'training' },
  { id: 'y-tr-records', category: 'training' },
  { id: 'y-tr-walk', category: 'training' },

  { id: 'y-us-one-question', category: 'together' },
  { id: 'y-us-share-what', category: 'together' },
  { id: 'y-us-not-a-forecast', category: 'together' },
  { id: 'y-us-thanks', category: 'together' },
  { id: 'y-us-make-task', category: 'together' },

  { id: 'y-i-no-score', category: 'intimacy' },
  { id: 'y-i-say-tired', category: 'intimacy' },
  { id: 'y-i-your-curve', category: 'intimacy' },
  { id: 'y-i-restart', category: 'intimacy' },
  { id: 'y-i-privacy', category: 'intimacy' },

  { id: 'y-pr-lube-amount', category: 'practices' },
  { id: 'y-pr-toy-wash', category: 'practices' },
  { id: 'y-pr-cup-out', category: 'practices' },
  { id: 'y-pr-shaving', category: 'practices' },
  { id: 'y-pr-no-douching', category: 'practices' },

  { id: 'y-b-twenty-seconds', category: 'benefits' },
  { id: 'y-b-not-a-fix', category: 'benefits' },
  { id: 'y-b-laugh', category: 'benefits' },
  { id: 'y-b-ritual-apart', category: 'benefits' },
  { id: 'y-b-count-touch', category: 'benefits' },
]

/**
 * Что из добавленного уместно показать наблюдателю.
 *
 * Тело - не его, и «держите норму в дни менструации» ему говорить незачем.
 * Остаются темы, написанные для двоих изначально.
 */
const FOR_BOTH: readonly TipCategory[] = ['intimacy', 'practices', 'benefits', 'together']

/**
 * Задержка: что это значит и что с этим делать.
 *
 * Появляются только когда задержка есть, и не все сразу: на третий день
 * говорить про врача рано, а на двадцатый молчать про тест поздно. Порог
 * у каждой свой и совпадает с порогами в `DELAY` - иначе текст и условие
 * разошлись бы молча.
 *
 * Владелице - весь набор. Наблюдателю - одна, и не про тест: решение
 * делать его и идти к врачу принадлежит не ему, а вопрос «ну что, проверила?»
 * каждый день - самое неприятное, чем можно ответить на задержку.
 */
const DELAY_TIPS: { id: string; fromDays: number; assumedOnly?: boolean }[] = [
  { id: 'd-happens', fromDays: 0 },
  { id: 'd-assumed', fromDays: 0, assumedOnly: true },
  { id: 'd-note-it', fromDays: 0 },
  { id: 'd-test-when', fromDays: 0 },
  { id: 'd-irregular', fromDays: 0 },
  { id: 'd-after-pill', fromDays: 0 },
  { id: 'd-test-negative', fromDays: DELAY.notable },
  { id: 'd-doctor-when', fromDays: DELAY.long },
]

const DELAY_PARTNER: string[] = ['d-p-dont-ask', 'd-p-not-a-verdict']

function delayTips(delay: Delay | null, audience: 'owner' | 'partner'): Tip[] {
  if (delay === null) return []
  if (audience === 'partner') {
    return DELAY_PARTNER.map((id) => ({ id, category: 'delay' as const }))
  }
  return DELAY_TIPS.filter(
    (t) => delay.days >= t.fromDays && (!t.assumedOnly || delay.basis === 'assumed'),
  ).map((t) => ({ id: t.id, category: 'delay' as const }))
}

/** Подсказки для конкретных дней - они важнее фазовых и идут первыми. */
function specific(state: CycleDay): Tip[] {
  const out: Tip[] = []

  if (state.day === 1) {
    out.push({
      id: 'day-one',
      category: 'body',
    })
  }

  if (state.phase === 'luteal' && state.daysToNext >= 0 && state.daysToNext <= 2) {
    out.push({
      id: 'almost',
      category: 'body',
      title:
        state.daysToNext === 0
          ? tr('tip.almost.today')
          : tr('tip.almost.inDays', {
              n: state.daysToNext,
              unit: trPlural('unit.day', state.daysToNext),
            }),
    })
  }

  if (state.daysToNext < 0) {
    out.push({
      id: 'delay',
      category: 'body',
      title: tr('tip.delay.title', {
        n: -state.daysToNext,
        unit: trPlural('unit.day', -state.daysToNext),
      }),
    })
  }

  return out
}

/**
 * Всё, что в принципе может быть показано этому читателю.
 *
 * Владелице - полный набор. Наблюдателю - только то, что написано для двоих:
 * близость, её виды, польза и «мы». Остальное обращено к телу, которое
 * не его, и в повелительном наклонении звучит как указание.
 */
function pool(audience: 'owner' | 'partner'): Tip[] {
  if (audience === 'partner') {
    return [
      ...INTIMACY,
      ...PRACTICES,
      ...BENEFITS,
      ...PARTNER_ALWAYS,
      ...[...EXTRA, ...MORE].filter((t) => FOR_BOTH.includes(t.category)),
    ]
  }
  return [...HORMONES, ...INTIMACY, ...PRACTICES, ...BENEFITS, ...EXTRA, ...MORE]
}

/**
 * Про сегодня: день, фаза и задержка.
 *
 * Раздел раньше показывал одним списком и это, и всю справку - две сотни
 * карточек, где «сегодня третий день, вот что с этим делать» тонуло между
 * щитовидкой и видами смазки. Разделение проведено по одному признаку:
 * подсказка про сегодня, если она зависит от дня. Всё остальное - база
 * знаний, и она одинакова хоть в первый день цикла, хоть до первой записи.
 */
export function tipsToday(
  state: CycleDay,
  audience: 'owner' | 'partner' = 'owner',
): TipGroup[] {
  const own = audience === 'partner' ? PARTNER[state.phase] : BY_PHASE[state.phase]
  const phased = pool(audience).filter((t) => t.phases?.includes(state.phase))
  // Подсказки конкретного дня - только владелице. Они написаны тому, кто
  // отмечает: «чем аккуратнее отмечена эта дата, тем ближе к правде всё
  // остальное». Наблюдателю это указание к чужому телу и чужим записям.
  const mine = audience === 'owner' ? specific(state) : []
  return group([...mine, ...delayTips(state.delay, audience), ...own, ...phased])
}

/**
 * База знаний: всё, что от дня не зависит.
 *
 * Не требует ни цикла, ни единой отметки - и в этом смысл. Раздел включают
 * до первой менструации, и до неё «про сегодня» посчитать не из чего;
 * а гормоны, близость, её виды и то, что она даёт, написаны про вообще.
 */
export function tipsLibrary(audience: 'owner' | 'partner' = 'owner'): TipGroup[] {
  return group(pool(audience).filter((t) => !t.phases))
}

export type TipGroup = { category: TipCategory; tips: Tip[]; library: boolean }

function group(all: Tip[]): TipGroup[] {
  return TIP_CATEGORIES.map((category) => {
    const tips = all.filter((t) => t.category === category)
    // Привязанное к фазе выше общего: внутри «Гормонов» подсказка про
    // прогестерон нужнее в лютеиновой фазе, чем справка про щитовидку.
    tips.sort((a, b) => Number(Boolean(b.phases)) - Number(Boolean(a.phases)))
    return { category, tips, library: LIBRARY_CATEGORIES.includes(category) }
  }).filter((group) => group.tips.length > 0)
}

/** Короткое описание фазы для шапки - одна строка, без советов. */
