import { useMemo, useState } from 'react'
import { Check, ListPlus, Plus, Trash2, X } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { plural } from '@/lib/plural'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import {
  useAddItem,
  useDeleteItem,
  useDeleteList,
  useLists,
  useSaveList,
  useToggleItem,
  type List,
  type ListItem,
} from './api'

/**
 * Совместные списки: что посмотреть, куда сходить, что подарить.
 *
 * Все списки на одном экране, без захода внутрь. Списков у пары единицы,
 * а лишний уровень навигации на телефоне стоит дороже, чем длинная страница:
 * добавить фильм должно быть одним движением, а не «открыть - добавить -
 * вернуться».
 *
 * Выполненные не удаляются, а сворачиваются: вычеркнутое - это и есть
 * история «что мы уже посмотрели», и стирать её жалко.
 */
export function ListsPage() {
  const lists = useLists()
  const [creating, setCreating] = useState(false)

  if (lists.isError) return <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />
  if (lists.isPending) return <Loading />

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-3 pb-28">
      {lists.data.length === 0 ? (
        <EmptyState
          title="Списков пока нет"
          hint="Что посмотреть, куда сходить, что подарить. Без сроков и без ответственных - просто чтобы не забылось."
        />
      ) : (
        lists.data.map((list) => <ListCard key={list.id} list={list} />)
      )}

      <button
        type="button"
        onClick={() => setCreating(true)}
        aria-label="Новый список"
        className="fixed right-5 bottom-6 z-20 flex size-14 items-center justify-center
                   rounded-full bg-accent text-accent-ink shadow-lg
                   transition-transform active:scale-95"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ListPlus size={24} aria-hidden />
      </button>

      {creating && <ListEditor list={null} onClose={() => setCreating(false)} />}
    </div>
  )
}

function ListCard({ list }: { list: List }) {
  const userId = useUserId()
  const add = useAddItem()
  const [draft, setDraft] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [editing, setEditing] = useState(false)

  const { open, done } = useMemo(
    () => ({
      open: list.items.filter((i) => i.doneAt === null),
      done: list.items
        .filter((i) => i.doneAt !== null)
        .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')),
    }),
    [list.items],
  )

  const submit = () => {
    const title = draft.trim()
    if (title === '') return
    setDraft('')
    add.mutate({ listId: list.id, title })
  }

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium">{list.title}</h2>
        {list.createdBy === userId && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-accent underline"
          >
            Изменить
          </button>
        )}
      </div>

      {open.length > 0 && (
        <ul className="mt-3 flex flex-col">
          {open.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="mt-3 flex items-center gap-2"
      >
        <Plus size={18} aria-hidden className="shrink-0 text-muted" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Добавить"
          aria-label={`Добавить в «${list.title}»`}
          className="w-full min-w-0 bg-transparent py-1.5 outline-none placeholder:text-muted"
        />
      </form>

      {done.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="text-sm text-muted underline"
          >
            {showDone
              ? 'Свернуть'
              : `${done.length} ${plural(done.length, 'вычеркнут', 'вычеркнуто', 'вычеркнуто')}`}
          </button>
          {showDone && (
            <ul className="mt-2 flex flex-col">
              {done.map((item) => (
                <Row key={item.id} item={item} />
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && <ListEditor list={list} onClose={() => setEditing(false)} />}
    </section>
  )
}

function Row({ item }: { item: ListItem }) {
  const toggle = useToggleItem()
  const remove = useDeleteItem()
  const isDone = item.doneAt !== null

  return (
    <li className="flex items-center gap-3 py-1.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={item.title}
        onClick={() => toggle.mutate({ id: item.id, done: !isDone })}
        className={`flex size-6 shrink-0 items-center justify-center rounded-md ring-1 transition-colors ${
          isDone ? 'bg-accent text-accent-ink ring-accent' : 'bg-bg ring-line'
        }`}
      >
        {isDone && <Check size={15} aria-hidden />}
      </button>
      <span className={`min-w-0 flex-1 truncate ${isDone ? 'text-muted line-through' : ''}`}>
        {item.title}
      </span>
      <button
        type="button"
        onClick={() => remove.mutate(item.id)}
        aria-label={`Удалить «${item.title}»`}
        className="shrink-0 p-1 text-muted"
      >
        <X size={16} aria-hidden />
      </button>
    </li>
  )
}

function ListEditor({ list, onClose }: { list: List | null; onClose: () => void }) {
  const save = useSaveList()
  const remove = useDeleteList()
  const [title, setTitle] = useState(list?.title ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (title.trim() === '') {
      setError('Без названия список не найти')
      return
    }
    try {
      await save.mutateAsync({ ...(list ? { id: list.id } : {}), title })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={list ? 'Список' : 'Новый список'}>
      <div className="flex flex-col gap-4">
        <Field
          label="Название"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Что посмотреть"
          autoFocus={!list}
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} loading={save.isPending}>
          Сохранить
        </Button>

        {list && (
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => void remove.mutateAsync(list.id).then(onClose)}
          >
            <Trash2 size={18} aria-hidden />
            Удалить список
            {list.items.length > 0 && ` и ${list.items.length} ${plural(list.items.length, 'пункт', 'пункта', 'пунктов')}`}
          </Button>
        )}
      </div>
    </Sheet>
  )
}
