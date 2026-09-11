import { dynamicKey, tr, trPlural, useT } from '@/lib/i18n'
import { useState } from 'react'
import { Cake, CalendarHeart, Plus, Star, Trash2 } from 'lucide-react'
import { useLocalFlag } from '@/lib/localFlag'
import { LettersTab } from '@/features/letters/LettersTab'
import { formatDayMonth, fromLocalISO, todayLocal } from '@/lib/date'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import {
  useDeleteOccasion,
  useOccasions,
  useSaveOccasion,
  type Occasion,
  type OccasionKind,
} from './api'

const KINDS: { id: OccasionKind; icon: typeof Cake }[] = [
  { id: 'birthday', icon: Cake },
  { id: 'anniversary', icon: CalendarHeart },
  { id: 'other', icon: Star },
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
    <div className="mx-auto max-w-2xl px-4 pt-3 pb-28">
      <div className="mb-4 flex gap-1 rounded-xl bg-raised p-1">
        <TabButton active={!tab} onClick={() => setTab(false)}>
          {t('dates.tabDates')}
        </TabButton>
        <TabButton active={tab} onClick={() => setTab(true)}>
          {t('dates.tabLetters')}
        </TabButton>
      </div>

      {tab ? (
        <LettersTab />
      ) : (
        <DatesTab items={items} onEdit={setEditing} editing={editing} />
      )}
    </div>
  )
}

function TabButton({
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
      className={`flex-1 rounded-lg py-2 text-sm transition-colors ${
        active ? 'bg-surface font-medium text-ink shadow-sm' : 'text-muted'
      }`}
    >
      {children}
    </button>
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
  return (
    <>
      {items.length === 0 ? (
        <EmptyState
          title={t('common.nothingYet')}
          hint={t('dates.emptyHint')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((o) => (
            <li key={o.id}>
              <Card occasion={o} onOpen={() => onEdit(o)} />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onEdit('new')}
        aria-label={t('dates.new')}
        className="fixed right-5 bottom-6 z-20 flex size-14 items-center justify-center
                   rounded-full bg-accent text-accent-ink shadow-lg
                   transition-transform active:scale-95"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Plus size={26} aria-hidden />
      </button>

      {editing && (
        <Editor occasion={editing === 'new' ? null : editing} onClose={() => onEdit(null)} />
      )}
    </>
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

function Card({ occasion, onOpen }: { occasion: Occasion; onOpen: () => void }) {
  const Icon = KIND_BY_ID[occasion.kind].icon
  const soon = occasion.days <= 7
  const mark = anniversary(occasion)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left ring-1 ring-line"
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
          soon ? 'bg-accent text-accent-ink' : 'bg-raised text-muted'
        }`}
      >
        <Icon size={19} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{occasion.title}</span>
        <span className="block text-sm text-muted">
          {dayMonth(occasion.nextOn)}
          {mark && ` · ${mark}`}
        </span>
      </span>
      <span className={`shrink-0 text-sm ${soon ? 'text-accent' : 'text-muted'}`}>
        {countdown(occasion.days)}
      </span>
    </button>
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
  const [error, setError] = useState<string | null>(null)

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

        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => {
            const Icon = k.icon
            const active = kind === k.id
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm transition-colors ${
                  active ? 'bg-accent text-accent-ink' : 'bg-raised text-ink ring-1 ring-line'
                }`}
              >
                <Icon size={15} aria-hidden />
                {t(dynamicKey('occasion', k.id))}
              </button>
            )
          })}
        </div>

        <Field
          label={t('dates.when')}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          hint={t('dates.whenHint')}
        />

        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
          <span className="text-sm">{t('dates.yearly')}</span>
          <input
            type="checkbox"
            checked={yearly}
            onChange={(e) => setYearly(e.target.checked)}
            className="size-5 accent-[var(--color-accent)]"
          />
        </label>

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
