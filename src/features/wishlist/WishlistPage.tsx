import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, GripVertical, ImageOff, ListPlus } from 'lucide-react'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { plural } from '@/lib/plural'
import {
  isClosed,
  useReorderWishlists,
  useSaveWishlist,
  useWishlistPhotoUrls,
  useWishlists,
  type Wishlist,
} from './api'

/**
 * Доска вишлистов: карточка с картинкой, чеклист внутри.
 *
 * «Приобретено» - не статус, который выставляют руками, а следствие галочек:
 * карточка уезжает туда, когда закрыт последний пункт, и возвращается,
 * стоит снять любую. Ручной статус рядом с галочками неизбежно с ними
 * разъезжается, и человеку приходится помнить, что нажать вторым.
 *
 * Порядок карточек - ручной: доска желаний упорядочена не датой, а тем,
 * чего хочется сильнее.
 */
export function WishlistPage() {
  const lists = useWishlists()
  const reorder = useReorderWishlists()
  const [tab, setTab] = useState<'want' | 'got'>('want')
  const [creating, setCreating] = useState(false)
  const [order, setOrder] = useState<string[] | null>(null)

  const sensors = useSensors(
    // Порог в пикселях, а не удержание: карточка тянется ручкой, и жест
    // не спорит ни с тапом по ней, ни с прокруткой доски
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const paths = useMemo(
    () =>
      (lists.data ?? []).map((l) => l.imagePath).filter((p): p is string => p !== null),
    [lists.data],
  )
  const urls = useWishlistPhotoUrls(paths)

  const all = useMemo(() => {
    const data = lists.data ?? []
    if (!order) return data
    // Пока перестановка летит на сервер, показываем её же: иначе карточка
    // прыгнет обратно и вернётся только после ответа
    const index = new Map(order.map((id, i) => [id, i]))
    return [...data].sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0))
  }, [lists.data, order])

  const shown = all.filter((l) => (tab === 'got' ? isClosed(l) : !isClosed(l)))

  if (lists.isError) return <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />
  if (lists.isPending) return <Loading />

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const ids = all.map((l) => l.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return

    const next = [...ids]
    next.splice(to, 0, ...next.splice(from, 1))
    setOrder(next)
    reorder.mutate(next, { onSettled: () => setOrder(null) })
  }

  const gotCount = all.filter(isClosed).length

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3 pb-28">
      <div className="mb-4 flex gap-1 rounded-xl bg-raised p-1">
        <Tab active={tab === 'want'} onClick={() => setTab('want')}>
          Хотим
        </Tab>
        <Tab active={tab === 'got'} onClick={() => setTab('got')}>
          Приобретено{gotCount > 0 && ` · ${gotCount}`}
        </Tab>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={tab === 'want' ? 'Хотелок пока нет' : 'Пока ничего не собрано'}
          hint={
            tab === 'want'
              ? 'Карточка - это одно желание: посуда на кухню, поездка, подарок. Внутри чеклист из того, что для него нужно.'
              : 'Сюда карточка попадает сама, когда закрыт последний пункт её чеклиста.'
          }
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((l) => l.id)} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-3">
              {shown.map((list) => (
                <Card key={list.id} list={list} urls={urls.data ?? {}} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <button
        type="button"
        onClick={() => setCreating(true)}
        aria-label="Новый вишлист"
        className="fixed right-5 bottom-6 z-20 flex size-14 items-center justify-center
                   rounded-full bg-accent text-accent-ink shadow-lg
                   transition-transform active:scale-95"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ListPlus size={24} aria-hidden />
      </button>

      {creating && <NewWishlist onClose={() => setCreating(false)} />}
    </div>
  )
}

function Tab({
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

function Card({ list, urls }: { list: Wishlist; urls: Record<string, string> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
  })
  const url = list.imagePath ? urls[list.imagePath] : undefined
  const done = list.items.filter((i) => i.doneAt !== null).length
  const closed = isClosed(list)

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative ${isDragging ? 'z-10 opacity-80' : ''}`}
    >
      <Link
        to={`/wishlist/${list.id}`}
        className="block overflow-hidden rounded-2xl bg-surface ring-1 ring-line"
      >
        <div className="relative flex aspect-square items-center justify-center bg-raised">
          {url ? (
            <img src={url} alt="" className={`size-full object-cover ${closed ? 'opacity-60' : ''}`} />
          ) : (
            <ImageOff size={24} className="text-muted" aria-hidden />
          )}
          {closed && (
            <span className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-full bg-accent text-accent-ink">
              <Check size={16} aria-hidden />
            </span>
          )}
        </div>
        <div className="p-3">
          <p className="truncate font-medium">{list.title}</p>
          <p className="text-sm text-muted">
            {list.items.length === 0
              ? 'пусто'
              : `${done} из ${list.items.length} ${plural(list.items.length, 'пункта', 'пунктов', 'пунктов')}`}
          </p>
        </div>
      </Link>

      {/* Ручка отдельно от ссылки: иначе любое перетаскивание заканчивалось бы
          переходом внутрь карточки */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Переставить «${list.title}»`}
        className="absolute top-2 right-2 flex size-8 touch-none items-center justify-center
                   rounded-full bg-bg/80 text-muted backdrop-blur-sm"
      >
        <GripVertical size={16} aria-hidden />
      </button>
    </li>
  )
}

function NewWishlist({ onClose }: { onClose: () => void }) {
  const save = useSaveWishlist()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (title.trim() === '') {
      setError('Без названия вишлист не найти')
      return
    }
    try {
      await save.mutateAsync({ title })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title="Новый вишлист">
      <div className="flex flex-col gap-4">
        <Field
          label="Название"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Посуда на кухню"
          autoFocus
        />
        <p className="text-sm text-muted">
          Картинку и пункты добавите внутри - карточка откроется сразу после сохранения.
        </p>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} loading={save.isPending}>
          Создать
        </Button>
      </div>
    </Sheet>
  )
}
