import { useMemo, useState } from 'react'
import {
  Activity,
  Apple,
  CalendarClock,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Dumbbell,
  Flower2,
  HeartHandshake,
  HeartPulse,
  SearchX,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { dynamicKey, useT } from '@/lib/i18n'
import { normalize, tokenize } from '@/lib/search'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { IconBadge } from '@/ui/IconBadge'
import { SearchInput } from '@/ui/SearchInput'
import { EmptyState } from '@/ui/States'
import type { Tone } from '@/ui/tones'
import { useCycleSettings } from './api'
import { tipsLibrary, TIP_CATEGORIES, type TipCategory } from './tips'

/**
 * Значок темы. Оглавление из девяти одинаковых строк читалось сплошным
 * списком; со значком тему находят глазами, не вчитываясь в названия.
 * Тона - от разделов с тем же смыслом: еда зелёная, как «Продукты».
 */
const CATEGORY_LOOK: Record<TipCategory, { icon: LucideIcon; tone: Tone }> = {
  delay: { icon: CalendarClock, tone: 'orange' },
  body: { icon: HeartPulse, tone: 'rose' },
  hormones: { icon: Activity, tone: 'violet' },
  food: { icon: Apple, tone: 'green' },
  training: { icon: Dumbbell, tone: 'sky' },
  together: { icon: HeartHandshake, tone: 'teal' },
  intimacy: { icon: Flower2, tone: 'plum' },
  practices: { icon: Sparkles, tone: 'plum' },
  benefits: { icon: Sun, tone: 'amber' },
}

/**
 * База знаний по циклу.
 *
 * Отдельная страница, а не хвост главного экрана. Материалов полторы сотни,
 * и любой аккордеон такой длины под календарём означает, что до истории
 * менструаций человек не долистает никогда.
 *
 * Три вещи, без которых такой объём нечитаем:
 *
 * Поиск. При ста пятидесяти карточках листать бессмысленно - нужен вопрос
 * и ответ. Ищем по заголовку И по телу: половина того, что спрашивают,
 * в заголовок не вынесено («спираль», «смазка», «тест»). Совпадение по телу
 * ценим ниже, чем по заголовку, - иначе точное попадание уезжает вниз.
 *
 * Фильтр по темам. Восемь чипов одной строкой: человек чаще знает тему,
 * чем слово. Выбранная тема сужает и поиск тоже.
 *
 * Свёрнутые темы. По умолчанию видно только заголовки и числа - это
 * оглавление, с которого начинают. При поиске всё разворачивается само:
 * искать в свёрнутом бессмысленно.
 *
 * Чего здесь нет: фаз, дней и задержки. Всё, что зависит от сегодня, живёт
 * на главном экране раздела в «Советах на сегодня», и дублировать это сюда
 * значило бы снова смешать справку с сиюминутным.
 */
export function CycleLibraryPage() {
  const t = useT()
  const userId = useUserId()
  const settings = useCycleSettings()
  const [query, setQuery] = useState('')
  const [only, setOnly] = useState<TipCategory | null>(null)
  const [opened, setOpened] = useState<string[]>([])

  // Свой раздел включён - значит читаем как владелица. Иначе это наблюдатель,
  // и ему достаётся то же, что на главном экране: написанное для двоих.
  const audience = settings.data?.trackingEnabled === true ? 'owner' : 'partner'
  void userId

  const groups = useMemo(() => tipsLibrary(audience), [audience])

  /**
   * Тексты карточек - один раз на язык, а не на каждое нажатие клавиши.
   *
   * Нормализованная строка собирается из заголовка и тела: искать по телу
   * обязательно, потому что вопросы задают словами из него.
   */
  const searchable = useMemo(
    () =>
      groups.flatMap((g) =>
        g.tips.map((tip) => {
          const title = tip.title ?? t(dynamicKey('tip', `${tip.id}.title`))
          const body = t(dynamicKey('tip', `${tip.id}.body`))
          return {
            id: tip.id,
            category: g.category,
            title,
            body,
            titleNorm: normalize(title),
            bodyNorm: normalize(body),
          }
        }),
      ),
    [groups, t],
  )

  /**
   * Основа слова - грубо, отсечением окончания.
   *
   * Без неё поиск «смазка» не находил карточку со словом «смазки»: сравнение
   * шло по точному вхождению, а русский язык склоняется. Полноценная
   * лемматизация тут не нужна и не окупается - достаточно отрезать хвост
   * у слов от пяти букв, и «смазк» находит все падежи разом.
   *
   * Короткие слова не трогаем: от «еда» после отсечения остаётся «ед»,
   * и находиться начинает половина базы.
   */
  const stem = (token: string): string =>
    token.length >= 8 ? token.slice(0, -2) : token.length >= 5 ? token.slice(0, -1) : token

  const tokens = tokenize(query).map(stem)

  const found = useMemo(() => {
    const base = only === null ? searchable : searchable.filter((c) => c.category === only)
    if (tokens.length === 0) return base
    // Все слова запроса должны найтись - иначе «боль тест» выдал бы всё
    // про боль и всё про тест вперемешку. Совпадение в заголовке весомее:
    // при равном числе слов сверху окажется то, что названо прямо.
    return base
      .map((card) => {
        let score = 0
        for (const token of tokens) {
          const inTitle = card.titleNorm.includes(token)
          const inBody = card.bodyNorm.includes(token)
          if (!inTitle && !inBody) return null
          score += inTitle ? 3 : 1
        }
        return { card, score }
      })
      .filter((x): x is { card: (typeof base)[number]; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.card)
  }, [searchable, only, tokens])

  const searching = tokens.length > 0
  const byCategory = TIP_CATEGORIES.map((category) => ({
    category,
    cards: found.filter((c) => c.category === category),
  })).filter((g) => g.cards.length > 0)

  const toggle = (category: string) =>
    setOpened((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    )

  const allOpen = opened.length === byCategory.length && byCategory.length > 0

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <SearchInput value={query} onChange={setQuery} placeholder={t('lib.search')} />

      {/* Чипы тем. Прокручиваются вбок, а не переносятся: восемь тем в две
          строки съедают экран до первого материала. nowrap и shrink-0 у детей -
          иначе в узкой строке чип «Что даёт близость» переносится сам. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 whitespace-nowrap *:shrink-0">
        <Chip size="sm" selected={only === null} onClick={() => setOnly(null)}>
          {t('lib.all')}
        </Chip>
        {groups.map(({ category }) => (
          <Chip
            key={category}
            size="sm"
            selected={only === category}
            onClick={() => setOnly(only === category ? null : category)}
          >
            {t(dynamicKey('tipCat', category))}
          </Chip>
        ))}
      </div>

      <div className="flex min-h-10 items-center justify-between gap-3 px-1">
        <p className="text-[13px] text-muted tabular-nums">{t('lib.found', { n: found.length })}</p>
        {byCategory.length > 0 && !searching && (
          <button
            type="button"
            onClick={() => setOpened(allOpen ? [] : byCategory.map((g) => g.category))}
            className="flex min-h-10 items-center gap-1 rounded-full bg-accent-soft px-3 text-[13px]
                       font-semibold text-accent-soft-ink transition-transform active:scale-95"
          >
            {allOpen ? (
              <ChevronsDownUp size={15} aria-hidden />
            ) : (
              <ChevronsUpDown size={15} aria-hidden />
            )}
            {allOpen ? t('lib.collapseAll') : t('lib.expandAll')}
          </button>
        )}
      </div>

      {found.length === 0 ? (
        <EmptyState
          icon={SearchX}
          tone="plum"
          title={t('lib.nothing')}
          hint={t('lib.nothingHint')}
        />
      ) : (
        byCategory.map(({ category, cards }) => {
          // При поиске всё развёрнуто: искать в свёрнутом нечего.
          const open = searching || opened.includes(category)
          const look = CATEGORY_LOOK[category]
          return (
            <Card key={category} as="section" className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(category)}
                aria-expanded={open}
                disabled={searching}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors
                           enabled:active:bg-raised"
              >
                <IconBadge icon={look.icon} tone={look.tone} size="sm" />
                <span className="min-w-0 flex-1 truncate font-display text-[17px] font-bold">
                  {t(dynamicKey('tipCat', category))}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-muted">
                  <span className="rounded-full bg-raised px-2.5 py-0.5 text-[13px] font-semibold tabular-nums">
                    {cards.length}
                  </span>
                  {!searching && (
                    <ChevronDown
                      size={18}
                      aria-hidden
                      className={`transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  )}
                </span>
              </button>
              {open && (
                // Материал - длинный текст, и читают его подряд: разделитель
                // между карточками вместо отдельных плашек, поля пошире,
                // тело не серым - приглушённый абзац в десять строк утомляет
                <div className="divide-y divide-line border-t border-line">
                  {cards.map((card) => (
                    <article key={card.id} className="px-5 py-4">
                      <h3 className="text-[15px] leading-snug font-semibold">{card.title}</h3>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-ink/80">{card.body}</p>
                    </article>
                  ))}
                </div>
              )}
            </Card>
          )
        })
      )}
    </div>
  )
}
