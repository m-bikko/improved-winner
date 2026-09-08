import { useState } from 'react'
import { Cake, CalendarHeart, Plus, Star, Trash2 } from 'lucide-react'
import { fromLocalISO, todayLocal } from '@/lib/date'
import { plural } from '@/lib/plural'
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

const KINDS: { id: OccasionKind; label: string; icon: typeof Cake }[] = [
  { id: 'birthday', label: 'День рождения', icon: Cake },
  { id: 'anniversary', label: 'Годовщина', icon: CalendarHeart },
  { id: 'other', label: 'Другое', icon: Star },
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
  const today = todayLocal()
  const list = useOccasions(today)
  const [editing, setEditing] = useState<Occasion | 'new' | null>(null)

  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />
  if (list.isPending) return <Loading />

  const items = list.data

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3 pb-28">
      {items.length === 0 ? (
        <EmptyState
          title="Пока пусто"
          hint="Дни рождения, годовщины, всё что не хочется вспоминать в последний момент. Напомним за неделю и в день."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((o) => (
            <li key={o.id}>
              <Card occasion={o} onOpen={() => setEditing(o)} />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setEditing('new')}
        aria-label="Новая дата"
        className="fixed right-5 bottom-6 z-20 flex size-14 items-center justify-center
                   rounded-full bg-accent text-accent-ink shadow-lg
                   transition-transform active:scale-95"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Plus size={26} aria-hidden />
      </button>

      {editing && (
        <Editor
          occasion={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/** «через 6 дней», «сегодня», «завтра» - то, ради чего сюда заходят. */
function countdown(days: number): string {
  if (days === 0) return 'сегодня'
  if (days === 1) return 'завтра'
  if (days === 2) return 'послезавтра'
  if (days < 31) return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`
  const months = Math.round(days / 30)
  if (days < 350) return `через ${months} ${plural(months, 'месяц', 'месяца', 'месяцев')}`
  return 'через год'
}

function dayMonth(iso: string): string {
  return fromLocalISO(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

function anniversary(o: Occasion): string | null {
  if (!o.yearly || o.years <= 0) return null
  if (o.kind === 'birthday') {
    return `${o.years} ${plural(o.years, 'год', 'года', 'лет')}`
  }
  return `${o.years}-я годовщина`
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
      setError('Без названия непонятно, о чём напоминать')
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
    <Sheet open onClose={onClose} title={occasion ? 'Дата' : 'Новая дата'}>
      <div className="flex flex-col gap-4">
        <Field
          label="Что за дата"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="День рождения Аминош"
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
                {k.label}
              </button>
            )
          })}
        </div>

        <Field
          label="Когда"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          hint="С годом: по нему считается, которая это годовщина"
        />

        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
          <span className="text-sm">Повторяется каждый год</span>
          <input
            type="checkbox"
            checked={yearly}
            onChange={(e) => setYearly(e.target.checked)}
            className="size-5 accent-[var(--color-accent)]"
          />
        </label>

        <Field
          label="Заметка"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="необязательно"
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} loading={save.isPending}>
          Сохранить
        </Button>

        {occasion && (
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => void remove.mutateAsync(occasion.id).then(onClose)}
          >
            <Trash2 size={18} aria-hidden />
            Удалить
          </Button>
        )}
      </div>
    </Sheet>
  )
}
