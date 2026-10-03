import { dynamicKey, tr, trPlural, useT } from '@/lib/i18n'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cake, CalendarHeart, Gift, Star, Trash2, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useLocalFlag } from '@/lib/localFlag'
import { LettersTab } from '@/features/letters/LettersTab'
import { formatDayMonth, fromLocalISO, todayLocal } from '@/lib/date'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { Field } from '@/ui/Field'
import { IconBadge } from '@/ui/IconBadge'
import { Sparkles } from '@/ui/Sparkles'
import { ListGroup, ListRow } from '@/ui/List'
import { PRESS, SPRING } from '@/ui/motion'
import { Sheet } from '@/ui/Sheet'
import { Switch } from '@/ui/Switch'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import type { Tone } from '@/ui/tones'
import {
  useDeleteOccasion,
  useOccasions,
  useSaveOccasion,
  type Occasion,
  type OccasionKind,
} from './api'
import { Segmented } from '@/ui/Segmented'
import { Fab } from '@/ui/Fab'
import { Card } from '@/ui/Card'
import { usePair } from '@/features/profile/pair'
import { useReservations, useWishes } from '@/features/wishlist/api'

/*
 * Тон у каждого вида свой, а не один тон раздела на всех: в списке из десятка
 * дат день рождения от годовщины отличается цветом раньше, чем прочтёшь.
 * Основной тон раздела (teal) - у самого частого вида.
 */
const KINDS: { id: OccasionKind; icon: LucideIcon; tone: Tone }[] = [
  { id: 'birthday', icon: Cake, tone: 'teal' },
  { id: 'anniversary', icon: CalendarHeart, tone: 'rose' },
  { id: 'other', icon: Star, tone: 'amber' },
]

const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k])) as Record<
  OccasionKind,
  (typeof KINDS)[number]
>

/**
 * Даты, которые нельзя забыть.
 *
 * Отдельно от задач намеренно. Задача - про «сделать»: у неё есть исполнитель,
 * её закрывают, и после закрытия она уходит из списка. Дата - про «помнить»:
 * закрыть её нельзя, каждый год она возвращается сама, и главный вопрос
 * к ней не «сделано ли», а «сколько осталось». Поэтому и список отсортирован
 * не по календарю, а по близости.
 *
 * Напоминание приходит дважды: за неделю - чтобы успеть с подарком, - и в день.
 */
export function DatesPage() {
  const t = useT()
  const today = todayLocal()
  const list = useOccasions(today)
  const [editing, setEditing] = useState<Occasion | 'new' | null>(null)
  // Выбор вкладки переживает уход в другой раздел: человек, который сейчас
  // пишет письма, вернётся к письмам, а не к списку дат
  const [tab, setTab] = useLocalFlag('dates-letters-tab', false)

  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />
  if (list.isPending) return <Loading />

  const items = list.data

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Segmented
        value={tab ? 'letters' : 'dates'}
        onChange={(v) => setTab(v === 'letters')}
        ariaLabel={t('nav.dates')}
        options={[
          { value: 'dates', label: t('dates.tabDates') },
          { value: 'letters', label: t('dates.tabLetters') },
        ]}
      />

      {tab ? (
        <LettersTab />
      ) : (
        <DatesTab items={items} onEdit={setEditing} editing={editing} />
      )}
    </div>
  )
}

function DatesTab({
  items,
  onEdit,
  editing,
}: {
  items: Occasion[]
  onEdit: (value: Occasion | 'new' | null) => void
  editing: Occasion | 'new' | null
}) {
  const t = useT()
  // Список уже отсортирован базой по близости, так что первая - ближайшая
  const [next, ...rest] = items

  return (
    <>
      {next === undefined ? (
        <EmptyState
          title={t('common.nothingYet')}
          hint={t('dates.emptyHint')}
          icon={CalendarHeart}
          tone="teal"
        />
      ) : (
        <>
          <Hero occasion={next} onOpen={() => onEdit(next)} />

          <GiftIdeas items={items} />

          {rest.length > 0 && (
            <ListGroup>
              {rest.map((o) => (
                <Row key={o.id} occasion={o} onOpen={() => onEdit(o)} />
              ))}
            </ListGroup>
          )}
        </>
      )}

      <Fab onClick={() => onEdit('new')} label={t('dates.new')} />

      {editing && (
        <Editor occasion={editing === 'new' ? null : editing} onClose={() => onEdit(null)} />
      )}
    </>
  )
}

/**
 * Идеи подарка: ближайший в пределах месяца день рождения второго или
 * годовщина пары - и первые желания из вишлиста второго. Имениннику
 * блок не показывается: подсказка - для того, кто дарит.
 */
function GiftIdeas({ items }: { items: Occasion[] }) {
  const t = useT()
  const pair = usePair()
  const wishes = useWishes()
  const reservations = useReservations()
  const target = items.find(
    (o) =>
      o.days <= 30 &&
      ((o.kind === 'birthday' && o.personId !== null && o.personId === pair.partnerId) || o.kind === 'anniversary'),
  )
  const mine = reservations.data ?? {}
  const theirs = (wishes.data ?? []).filter((w) => w.createdBy === pair.partnerId)
  // Выбранный подарок - первым, подаренное - уже не идея
  const chosen = theirs.filter((w) => mine[w.id] && mine[w.id]?.giftedOn === null)
  const ideas = [...chosen, ...theirs.filter((w) => !mine[w.id])].slice(0, 5)
  if (!target || pair.partnerId === '' || ideas.length === 0) return null

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5">
        <IconBadge icon={Gift} tone="orange" size="sm" />
        <p className="min-w-0 flex-1 text-[15px] font-semibold">{t('dates.giftFor', { title: target.title })}</p>
      </div>
      <p className="mt-2 text-[13px] text-muted">{t('dates.giftHint', { name: pair.partnerName })}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {ideas.map((w) => (
          <li key={w.id} className="flex items-center gap-2 text-[15px]">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-tone-orange" />
            <span className="min-w-0 flex-1 truncate">{w.title}</span>
            {mine[w.id] && (
              <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent-soft-ink">
                {t('wish.youGive')}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Link to="/wishlist" className="mt-3 inline-block text-sm font-semibold text-accent">
        {t('dates.openWishlist')}
      </Link>
    </Card>
  )
}

/** «через 6 дней», «сегодня», «завтра» - то, ради чего сюда заходят. */
function countdown(days: number): string {
  if (days === 0) return tr('cyc.todayLower')
  if (days === 1) return tr('common.tomorrow').toLowerCase()
  if (days === 2) return tr('common.dayAfterTomorrow')
  if (days < 31) return tr('dates.inDays', { n: days, unit: trPlural('unit.day', days) })
  const months = Math.round(days / 30)
  if (days < 350) {
    return tr('dates.inMonths', { n: months, unit: trPlural('unit.month', months) })
  }
  return tr('dates.inYear')
}

function dayMonth(iso: string): string {
  return formatDayMonth(fromLocalISO(iso))
}

function anniversary(o: Occasion): string | null {
  if (!o.yearly || o.years <= 0) return null
  if (o.kind === 'birthday') {
    return tr('dates.ageYears', { n: o.years, unit: trPlural('unit.year', o.years) })
  }
  return tr('dates.nthAnniversary', { n: o.years })
}

/** «12 марта · 30 лет» - одна строка под названием. */
function subtitle(o: Occasion): string {
  const mark = anniversary(o)
  return mark ? `${dayMonth(o.nextOn)} · ${mark}` : dayMonth(o.nextOn)
}

/**
 * Ближайшая дата - крупно.
 *
 * Число дней, а не «через 2 месяца»: у самой близкой даты главное - сколько
 * осталось, и счёт днями даёт почувствовать, что время идёт. Для остальных
 * хватает грубого «через месяц» в строке списка.
 */
const SPARKS = ['var(--c-accent)', 'var(--t-amber)', 'var(--t-teal)']

function Hero({ occasion, onOpen }: { occasion: Occasion; onOpen: () => void }) {
  const t = useT()
  const kind = KIND_BY_ID[occasion.kind]
  const soon = occasion.days <= 7

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={PRESS}
      transition={SPRING}
      // Мягкая заливка тоном акцента из угла - то, что отличает «ближайшую»
      // от просто первой карточки списка, без второй рамки и без бейджа
      className="flex w-full flex-col gap-4 rounded-3xl bg-surface bg-linear-to-br from-accent-soft
                 to-transparent to-65% p-5 text-left shadow-card"
    >
      <span className="flex items-center gap-2.5">
        <IconBadge icon={kind.icon} tone={kind.tone} size="md" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-muted">
          {t(dynamicKey('occasion', occasion.kind))}
        </span>
      </span>

      <span className="flex items-end justify-between gap-4">
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[22px] leading-tight font-extrabold tracking-tight break-words">
            {occasion.title}
          </span>
          <span className="mt-1 block text-sm text-muted">{subtitle(occasion)}</span>
        </span>

        {occasion.days === 0 ? (
          // Праздник сегодня - звёзд больше всего
          <Sparkles count={6} colors={SPARKS} className="shrink-0">
            <span className="font-display text-3xl leading-none font-extrabold text-accent">
              {t('common.today')}
            </span>
          </Sparkles>
        ) : (
          <span className="flex shrink-0 flex-col items-end">
            {soon ? (
              // Меньше недели - число искрится, как и плашка на главной
              <Sparkles count={4} colors={SPARKS}>
                <span className="font-display text-6xl leading-none font-extrabold tracking-tight text-accent tabular-nums">
                  {occasion.days}
                </span>
              </Sparkles>
            ) : (
              <span className="font-display text-6xl leading-none font-extrabold tracking-tight text-ink tabular-nums">
                {occasion.days}
              </span>
            )}
            <span className="mt-1 text-[13px] font-semibold text-muted">
              {t.plural('unit.day', occasion.days)}
            </span>
          </span>
        )}
      </span>
    </motion.button>
  )
}

function Row({ occasion, onOpen }: { occasion: Occasion; onOpen: () => void }) {
  const kind = KIND_BY_ID[occasion.kind]
  const soon = occasion.days <= 7

  return (
    <ListRow
      title={occasion.title}
      subtitle={subtitle(occasion)}
      icon={kind.icon}
      tone={kind.tone}
      // Шеврон убран: хвост занят обратным отсчётом, а что строка открывается,
      // и так понятно по всему разделу
      chevron={false}
      trailing={
        <span className={soon ? 'font-semibold text-accent' : ''}>{countdown(occasion.days)}</span>
      }
      onClick={onOpen}
    />
  )
}

function Editor({ occasion, onClose }: { occasion: Occasion | null; onClose: () => void }) {
  const t = useT()
  const save = useSaveOccasion()
  const remove = useDeleteOccasion()
  const [title, setTitle] = useState(occasion?.title ?? '')
  const [date, setDate] = useState(occasion?.date ?? todayLocal())
  const [kind, setKind] = useState<OccasionKind>(occasion?.kind ?? 'birthday')
  const [yearly, setYearly] = useState(occasion?.yearly ?? true)
  const [note, setNote] = useState(occasion?.note ?? '')
  const [personId, setPersonId] = useState<string>(occasion?.personId ?? '')
  const [error, setError] = useState<string | null>(null)
  const pair = usePair()

  const submit = async () => {
    setError(null)
    if (title.trim() === '') {
      setError(t('dates.noTitle'))
      return
    }
    try {
      await save.mutateAsync({
        ...(occasion ? { id: occasion.id } : {}),
        title,
        date,
        kind,
        yearly,
        note: note || null,
        personId: personId || null,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={t(occasion ? 'dates.title' : 'dates.new')}>
      <div className="flex flex-col gap-4">
        <Field
          label={t('dates.what')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('dates.placeholder')}
          autoFocus={!occasion}
        />

        {/* Чипы, а не сегменты: «День рождения» в трети ширины экрана
            обрезалось бы, а казахские подписи ещё длиннее */}
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <Chip
              key={k.id}
              icon={k.icon}
              selected={kind === k.id}
              onClick={() => setKind(k.id)}
            >
              {t(dynamicKey('occasion', k.id))}
            </Chip>
          ))}
        </div>

        {/* Чей день рождения: по нему за неделю второму приходят идеи из
            вишлиста именинника - а самому имениннику не приходят */}
        {kind === 'birthday' && pair.partnerId !== '' && (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">{t('dates.whose')}</span>
            <Segmented
              value={personId}
              onChange={setPersonId}
              options={[
                { value: pair.userId, label: pair.myName },
                { value: pair.partnerId, label: pair.partnerName },
                { value: '', label: t('dates.someoneElse') },
              ]}
            />
          </div>
        )}

        <Field
          label={t('dates.when')}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          hint={t('dates.whenHint')}
        />

        {/* Без заливки строки: выключенный трек цвета линии на заливке
            raised почти пропадает, и «выкл» не отличить от «нет переключателя» */}
        <div className="flex min-h-12 items-center justify-between gap-3 px-1">
          <span className="text-[15px]">{t('dates.yearly')}</span>
          <Switch checked={yearly} onChange={setYearly} label={t('dates.yearly')} />
        </div>

        <Field
          label={t('common.note')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('common.optional')}
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} loading={save.isPending}>
          {t('common.save')}
        </Button>

        {occasion && (
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => void remove.mutateAsync(occasion.id).then(onClose)}
          >
            <Trash2 size={18} aria-hidden />
            {t('common.delete')}
          </Button>
        )}
      </div>
    </Sheet>
  )
}
