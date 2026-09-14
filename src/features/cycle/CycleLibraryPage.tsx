import { useMemo, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { dynamicKey, useT } from '@/lib/i18n'
import { normalize, tokenize } from '@/lib/search'
import { useCycleSettings } from './api'
import { tipsLibrary, TIP_CATEGORIES, type TipCategory } from './tips'

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
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="relative">
        <Search
          size={17}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
        />
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('lib.search')}
          aria-label={t('lib.search')}
          className="w-full min-w-0 rounded-xl bg-surface py-3 pr-10 pl-10 ring-1 ring-line
                     outline-none focus:ring-2 focus:ring-accent placeholder:text-muted"
        />
        {query !== '' && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('common.cancel')}
            className="absolute top-1/2 right-2 -translate-y-1/2 p-2 text-muted"
          >
            <X size={17} aria-hidden />
          </button>
        )}
      </div>

      {/* Чипы тем. Прокручиваются вбок, а не переносятся: восемь тем в две
          строки съедают экран до первого материала. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={only === null} onClick={() => setOnly(null)}>
          {t('lib.all')}
        </Chip>
        {groups.map(({ category }) => (
          <Chip
            key={category}
            active={only === category}
            onClick={() => setOnly(only === category ? null : category)}
          >
            {t(dynamicKey('tipCat', category))}
          </Chip>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-muted">{t('lib.found', { n: found.length })}</p>
        {byCategory.length > 0 && !searching && (
          <button
            type="button"
            onClick={() => setOpened(allOpen ? [] : byCategory.map((g) => g.category))}
            className="text-xs text-accent"
          >
            {allOpen ? t('lib.collapseAll') : t('lib.expandAll')}
          </button>
        )}
      </div>

      {found.length === 0 ? (
        <div className="rounded-2xl bg-surface p-5 ring-1 ring-line">
          <p className="font-medium">{t('lib.nothing')}</p>
          <p className="mt-1 text-sm text-muted">{t('lib.nothingHint')}</p>
        </div>
      ) : (
        byCategory.map(({ category, cards }) => {
          // При поиске всё развёрнуто: искать в свёрнутом нечего.
          const open = searching || opened.includes(category)
          return (
            <section
              key={category}
              className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line"
            >
              <button
                type="button"
                onClick={() => toggle(category)}
                aria-expanded={open}
                disabled={searching}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
              >
                <span className="font-medium">{t(dynamicKey('tipCat', category))}</span>
                <span className="flex items-center gap-2 text-sm text-muted">
                  {cards.length}
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
                <div className="flex flex-col gap-3.5 border-t border-line px-4 py-3.5">
                  {cards.map((card) => (
                    <div key={card.id}>
                      <p className="text-sm font-medium">{card.title}</p>
                      <p className="mt-1 text-sm text-muted">{card.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ring-1 ${
        active ? 'bg-accent text-accent-ink ring-accent' : 'bg-surface text-muted ring-line'
      }`}
    >
      {children}
    </button>
  )
}
