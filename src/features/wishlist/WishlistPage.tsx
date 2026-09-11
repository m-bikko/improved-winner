import { dynamicKey, useT } from '@/lib/i18n'
import { useMemo, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, ImageOff, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { formatBytes, loadBitmap, prepareSquare, type SquareCrop } from '@/lib/image'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { PhotoViewer } from '@/ui/PhotoViewer'
import { Sheet } from '@/ui/Sheet'
import { SquareCropper } from '@/ui/SquareCropper'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { useProfiles } from '@/features/profile/api'
import { CATEGORIES, CATEGORY_BY_ID } from './categories'
import {
  useDeleteWish,
  useRemoveWishPhoto,
  useReorderWishes,
  useSaveWish,
  useUploadWishPhoto,
  useWishPhotoUrls,
  useWishes,
  type Wish,
} from './api'

/**
 * Вишлист: список желаний с картинками.
 *
 * Плоский. Прежняя карточка с чеклистом внутри требовала решить, что тут
 * «желание», а что «шаг к нему», - а для «хочу съездить в Грузию» такого
 * деления нет, и нижний уровень выдумывался ради структуры.
 *
 * Фильтр по категории, а не вкладки «хотим / приобретено»: вкладки делили
 * список по признаку, который меняется сам, а по смыслу желания
 * действительно хочется отфильтровать - «покажи, куда мы хотели съездить».
 */
export function WishlistPage() {
  const t = useT()
  const wishes = useWishes()
  const reorder = useReorderWishes()
  const profiles = useProfiles()

  const [category, setCategory] = useState<string | null>(null)
  const [editing, setEditing] = useState<Wish | 'new' | null>(null)
  const [viewing, setViewing] = useState<{ url: string; alt: string } | null>(null)
  const [order, setOrder] = useState<string[] | null>(null)

  const sensors = useSensors(
    // Тянем за ручку, поэтому порога в пикселях достаточно: жест не спорит
    // ни с тапом по строке, ни с прокруткой
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const paths = useMemo(
    () => (wishes.data ?? []).map((w) => w.imagePath).filter((p): p is string => p !== null),
    [wishes.data],
  )
  const urls = useWishPhotoUrls(paths)

  const all = useMemo(() => {
    const data = wishes.data ?? []
    if (!order) return data
    // Пока перестановка летит на сервер, показываем её же: иначе строка
    // прыгнет обратно и вернётся только после ответа
    const index = new Map(order.map((id, i) => [id, i]))
    return [...data].sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0))
  }, [wishes.data, order])

  if (wishes.isError) return <ErrorState error={wishes.error} onRetry={() => void wishes.refetch()} />
  if (wishes.isPending) return <Loading />

  const shown = category === null ? all : all.filter((w) => w.category === category)
  const counts = new Map<string, number>()
  for (const w of all) counts.set(w.category, (counts.get(w.category) ?? 0) + 1)

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = all.map((w) => w.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = [...ids]
    next.splice(to, 0, ...next.splice(from, 1))
    setOrder(next)
    reorder.mutate(next, { onSettled: () => setOrder(null) })
  }

  const nick = (who: string): string =>
    profiles.data?.find((p) => p.userId === who)?.nickname ?? 'Партнёр'

  return (
    <div className="mx-auto max-w-2xl pt-3 pb-28">
      {/* Фильтр прокручивается вбок: категорий восемь, в две строки они
          съедали бы верх экрана на каждом заходе. Отступ здесь, а не
          на всей странице: список должен занимать её целиком */}
      <div className="overflow-x-auto px-4 pb-1">
        <div className="flex w-max gap-2">
          <Chip active={category === null} onClick={() => setCategory(null)}>
            Все{all.length > 0 && ` · ${all.length}`}
          </Chip>
          {CATEGORIES.map((c) => {
            const n = counts.get(c.id) ?? 0
            const Icon = c.icon
            return (
              <Chip
                key={c.id}
                active={category === c.id}
                dim={n === 0}
                onClick={() => setCategory(category === c.id ? null : c.id)}
              >
                <Icon size={14} aria-hidden />
                {t(dynamicKey('wish', c.id))}
                {n > 0 && ` · ${n}`}
              </Chip>
            )
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="px-4">
          <EmptyState
            title={category === null ? 'Вишлист пуст' : 'В этой категории пусто'}
            hint={
              category === null
                ? 'Всё, что хочется: съездить, купить, попробовать, посмотреть. С картинкой и подробностями.'
                : 'Выберите «Все», чтобы увидеть остальные желания.'
            }
          />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <ul className="mx-4 mt-3 divide-y divide-line overflow-hidden rounded-2xl ring-1 ring-line">
              {shown.map((wish) => (
                <Row
                  key={wish.id}
                  wish={wish}
                  url={wish.imagePath ? urls.data?.[wish.imagePath] : undefined}
                  author={nick(wish.createdBy)}
                  onOpen={() => setEditing(wish)}
                  onView={(url) => setViewing({ url, alt: wish.title })}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <button
        type="button"
        onClick={() => setEditing('new')}
        aria-label="Новое желание"
        className="fixed right-5 bottom-6 z-20 flex size-14 items-center justify-center
                   rounded-full bg-accent text-accent-ink shadow-lg
                   transition-transform active:scale-95"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Plus size={26} aria-hidden />
      </button>

      {editing && (
        <Editor
          wish={editing === 'new' ? null : editing}
          defaultCategory={category ?? 'buy'}
          onClose={() => setEditing(null)}
        />
      )}
      {viewing && (
        <PhotoViewer url={viewing.url} alt={viewing.alt} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}

function Chip({
  active,
  dim,
  onClick,
  children,
}: {
  active: boolean
  dim?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-accent text-accent-ink'
          : `bg-raised ring-1 ring-line ${dim ? 'text-muted' : 'text-ink'}`
      }`}
    >
      {children}
    </button>
  )
}

/** Строка списка - как у продуктов: превью, название, подпись. */
function Row({
  wish,
  url,
  author,
  onOpen,
  onView,
}: {
  wish: Wish
  url: string | undefined
  author: string
  onOpen: () => void
  onView: (url: string) => void
}) {
  const t = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: wish.id,
  })
  const category = CATEGORY_BY_ID[wish.category]
  const Icon = category?.icon ?? ImageOff

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 bg-surface px-3 py-3 ${isDragging ? 'opacity-80' : ''}`}
    >
      {/* Картинка - отдельная кнопка: тап по ней открывает просмотр,
          а не форму. Это то, чего ждёшь от превью */}
      <button
        type="button"
        onClick={() => url && onView(url)}
        disabled={!url}
        aria-label={url ? `Посмотреть картинку: ${wish.title}` : wish.title}
        className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-raised ring-1 ring-line"
      >
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <Icon size={20} className="text-muted" aria-hidden />
        )}
      </button>

      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-base">{wish.title}</span>
        {wish.details && (
          <span className="mt-0.5 block truncate text-sm text-muted">{wish.details}</span>
        )}
        <span className="mt-0.5 block truncate text-xs text-muted">
          {category ? t(dynamicKey('wish', category.id)) : wish.category} · {author}
        </span>
      </button>

      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={wish.title}
        className="shrink-0 touch-none p-2 text-muted"
      >
        <GripVertical size={18} aria-hidden />
      </button>
    </li>
  )
}

function Editor({
  wish,
  defaultCategory,
  onClose,
}: {
  wish: Wish | null
  defaultCategory: string
  onClose: () => void
}) {
  const t = useT()
  const save = useSaveWish()
  const remove = useDeleteWish()
  const [title, setTitle] = useState(wish?.title ?? '')
  const [details, setDetails] = useState(wish?.details ?? '')
  const [category, setCategory] = useState(wish?.category ?? defaultCategory)
  const [savedId, setSavedId] = useState<string | null>(wish?.id ?? null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (title.trim() === '') {
      setError('Без названия желание не найти')
      return
    }
    try {
      await save.mutateAsync({ ...(savedId ? { id: savedId } : {}), title, details, category })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={wish ? 'Желание' : 'Новое желание'}>
      <div className="flex flex-col gap-4">
        <Field
          label="Что хочется"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Поездка в Грузию"
          autoFocus={!wish}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Подробности</span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            placeholder="Ссылка, размер, цена, почему хочется"
            className="w-full min-w-0 resize-none rounded-xl bg-surface px-4 py-3 ring-1 ring-line
                       outline-none focus:ring-2 focus:ring-accent placeholder:text-muted"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">Категория</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const Icon = c.icon
              const active = category === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm transition-colors ${
                    active ? 'bg-accent text-accent-ink' : 'bg-raised text-ink ring-1 ring-line'
                  }`}
                >
                  <Icon size={15} aria-hidden />
                  {t(dynamicKey('wish', c.id))}
                </button>
              )
            })}
          </div>
        </div>

        <Photo
          wish={wish}
          savedId={savedId}
          onNeedSave={async () => {
            if (title.trim() === '') {
              setError('Сначала впишите название - картинка привязывается к записи')
              return null
            }
            const id = await save.mutateAsync({
              ...(savedId ? { id: savedId } : {}),
              title,
              details,
              category,
            })
            setSavedId(id)
            return id
          }}
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} loading={save.isPending}>
          Сохранить
        </Button>

        {wish && (
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => void remove.mutateAsync(wish.id).then(onClose)}
          >
            <Trash2 size={18} aria-hidden />
            Удалить
          </Button>
        )}
      </div>
    </Sheet>
  )
}

/**
 * Картинка желания: превью, кадрирование, замена.
 *
 * Путь в хранилище строится от id записи, а у новой записи его ещё нет.
 * Поэтому перед первой загрузкой желание сохраняется - молча, без выхода
 * из формы: заставлять человека сохранить, вернуться и открыть заново
 * значило бы объяснять ему устройство хранилища.
 */
function Photo({
  wish,
  savedId,
  onNeedSave,
}: {
  wish: Wish | null
  savedId: string | null
  onNeedSave: () => Promise<string | null>
}) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploadWishPhoto()
  const remove = useRemoveWishPhoto()

  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [path, setPath] = useState<string | null>(wish?.imagePath ?? null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ from: number; to: number } | null>(null)
  const original = useRef(0)

  const pick = async (file: File) => {
    setError(null)
    setSaved(null)
    original.current = file.size
    try {
      setBitmap(await loadBitmap(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const confirm = async (crop: SquareCrop) => {
    if (!bitmap) return
    try {
      const id = savedId ?? (await onNeedSave())
      if (!id) return
      const prepared = await prepareSquare(bitmap, crop)
      const result = await upload.mutateAsync({
        wishId: id,
        blob: prepared.blob,
        extension: prepared.extension,
        previousPath: path,
      })
      setPath(result.path)
      setPreview(URL.createObjectURL(prepared.blob))
      setSaved({ from: original.current, to: prepared.blob.size })
      bitmap.close()
      setBitmap(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (bitmap) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Выберите квадрат: тяните, щипком меняйте масштаб</p>
        <SquareCropper
          bitmap={bitmap}
          busy={upload.isPending}
          onConfirm={(crop) => void confirm(crop)}
          onCancel={() => {
            bitmap.close()
            setBitmap(null)
          }}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-raised ring-1 ring-line">
        {preview ? (
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus size={22} className="text-muted" aria-hidden />
        )}
      </div>

      <div className="flex min-w-0 flex-col items-start gap-1">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Сбрасываем значение: без этого повторный выбор ТОГО ЖЕ файла
            // не даёт события, и «заменить» молча ничего не делает
            e.target.value = ''
            if (file) void pick(file)
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="text-sm text-accent underline"
        >
          {path ? 'Заменить картинку' : 'Добавить картинку'}
        </button>

        {path && savedId && (
          <button
            type="button"
            onClick={() =>
              void remove.mutateAsync({ wishId: savedId, path }).then(() => {
                setPath(null)
                setPreview(null)
              })
            }
            className="text-sm text-muted underline"
          >
            Убрать
          </button>
        )}

        {saved && (
          <p className="text-xs text-muted">
            {formatBytes(saved.from)} → {formatBytes(saved.to)}
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  )
}
