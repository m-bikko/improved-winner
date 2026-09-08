import { useMemo, useRef, useState } from 'react'
import { Check, ImagePlus, ListPlus, Plus, Trash2 } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { formatBytes, loadBitmap, prepareSquare, type SquareCrop } from '@/lib/image'
import { plural } from '@/lib/plural'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { SquareCropper } from '@/ui/SquareCropper'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import {
  useAddItem,
  useDeleteItem,
  useDeleteWishlist,
  useRemoveItemPhoto,
  useSaveItem,
  useSaveWishlist,
  useToggleItem,
  useUploadItemPhoto,
  useWishlistPhotoUrls,
  useWishlists,
  type Wishlist,
  type WishlistItem,
} from './api'

/**
 * Вишлисты: что посмотреть, куда сходить, что подарить.
 *
 * Все вишлисты на одном экране, без захода внутрь. Вишлистов у пары единицы,
 * а лишний уровень навигации на телефоне стоит дороже, чем длинная страница:
 * добавить фильм должно быть одним движением, а не «открыть - добавить -
 * вернуться».
 *
 * Вычеркнутое не удаляется, а сворачивается: это и есть история
 * «что мы уже посмотрели», и стирать её жалко.
 */
export function WishlistPage() {
  const lists = useWishlists()
  const [creating, setCreating] = useState(false)

  // Ссылки на картинки берутся одной пачкой на весь экран: бакет приватный,
  // и запрос на строку превратил бы открытие раздела в десяток походов в сеть
  const paths = useMemo(
    () =>
      (lists.data ?? [])
        .flatMap((l) => l.items)
        .map((i) => i.imagePath)
        .filter((p): p is string => p !== null),
    [lists.data],
  )
  const urls = useWishlistPhotoUrls(paths)

  if (lists.isError) return <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />
  if (lists.isPending) return <Loading />

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-3 pb-28">
      {lists.data.length === 0 ? (
        <EmptyState
          title="Вишлистов пока нет"
          hint="Что посмотреть, куда сходить, что подарить. Без сроков и без ответственных - просто чтобы не забылось."
        />
      ) : (
        lists.data.map((list) => (
          <WishlistCard key={list.id} list={list} urls={urls.data ?? {}} />
        ))
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

      {creating && <WishlistEditor list={null} onClose={() => setCreating(false)} />}
    </div>
  )
}

function WishlistCard({ list, urls }: { list: Wishlist; urls: Record<string, string> }) {
  const userId = useUserId()
  const add = useAddItem()
  const [draft, setDraft] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [editing, setEditing] = useState(false)
  const [opened, setOpened] = useState<WishlistItem | null>(null)

  const { open, done } = useMemo(
    () => ({
      open: list.items.filter((i) => i.doneAt === null),
      done: list.items
        .filter((i) => i.doneAt !== null)
        .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')),
    }),
    [list.items],
  )

  // Открытый пункт берём из свежего списка, а не из состояния: после загрузки
  // картинки в замыкании остался бы пункт без неё, и превью не появилось бы
  // до закрытия шторки
  const current = opened ? (list.items.find((i) => i.id === opened.id) ?? null) : null

  const submit = () => {
    const title = draft.trim()
    if (title === '') return
    setDraft('')
    add.mutate({ wishlistId: list.id, title })
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
            <Row key={item.id} item={item} urls={urls} onOpen={() => setOpened(item)} />
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
                <Row key={item.id} item={item} urls={urls} onOpen={() => setOpened(item)} />
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && <WishlistEditor list={list} onClose={() => setEditing(false)} />}
      {current && <ItemSheet item={current} urls={urls} onClose={() => setOpened(null)} />}
    </section>
  )
}

function Row({
  item,
  urls,
  onOpen,
}: {
  item: WishlistItem
  urls: Record<string, string>
  onOpen: () => void
}) {
  const toggle = useToggleItem()
  const isDone = item.doneAt !== null
  const url = item.imagePath ? urls[item.imagePath] : undefined

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

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Открыть «${item.title}»`}
        className="flex min-w-0 flex-1 items-center gap-3 py-0.5 text-left"
      >
        {url && (
          <img
            src={url}
            alt=""
            className={`size-10 shrink-0 rounded-lg object-cover ${isDone ? 'opacity-50' : ''}`}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${isDone ? 'text-muted line-through' : ''}`}>
            {item.title}
          </span>
          {item.note && <span className="block truncate text-sm text-muted">{item.note}</span>}
        </span>
      </button>
    </li>
  )
}

function ItemSheet({
  item,
  urls,
  onClose,
}: {
  item: WishlistItem
  urls: Record<string, string>
  onClose: () => void
}) {
  const save = useSaveItem()
  const remove = useDeleteItem()
  const [title, setTitle] = useState(item.title)
  const [note, setNote] = useState(item.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (title.trim() === '') {
      setError('Без названия пункт не найти')
      return
    }
    try {
      await save.mutateAsync({ id: item.id, title, note: note || null })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={item.title}>
      <div className="flex flex-col gap-4">
        <Photo item={item} urls={urls} />

        <Field label="Что это" value={title} onChange={(e) => setTitle(e.target.value)} />
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

        <Button
          variant="danger"
          loading={remove.isPending}
          onClick={() => void remove.mutateAsync(item.id).then(onClose)}
        >
          <Trash2 size={18} aria-hidden />
          Удалить
        </Button>
      </div>
    </Sheet>
  )
}

/**
 * Картинка пункта: превью, кадрирование, замена.
 *
 * Квадрат режется НА КЛИЕНТЕ до загрузки, а не подгоняется стилями при показе.
 * Иначе в хранилище лежал бы произвольный формат, и кадр выбирал бы браузер
 * своим object-fit - то есть всегда центр, даже когда нужное не в центре.
 */
function Photo({ item, urls }: { item: WishlistItem; urls: Record<string, string> }) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploadItemPhoto()
  const remove = useRemoveItemPhoto()

  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ from: number; to: number } | null>(null)
  const original = useRef(0)

  const url = item.imagePath ? urls[item.imagePath] : undefined

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
      const prepared = await prepareSquare(bitmap, crop)
      await upload.mutateAsync({
        itemId: item.id,
        blob: prepared.blob,
        extension: prepared.extension,
        previousPath: item.imagePath,
      })
      setSaved({ from: original.current, to: prepared.blob.size })
      bitmap.close()
      setBitmap(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const cancel = () => {
    bitmap?.close()
    setBitmap(null)
  }

  if (bitmap) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Выберите квадрат: тяните, щипком меняйте масштаб</p>
        <SquareCropper
          bitmap={bitmap}
          busy={upload.isPending}
          onConfirm={(crop) => void confirm(crop)}
          onCancel={cancel}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex items-start gap-4">
      <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-raised ring-1 ring-line">
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus size={22} className="text-muted" aria-hidden />
        )}
      </div>

      <div className="flex min-w-0 flex-col items-start gap-2">
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
          {url ? 'Заменить картинку' : 'Добавить картинку'}
        </button>

        {url && item.imagePath && (
          <button
            type="button"
            onClick={() =>
              void remove.mutateAsync({ itemId: item.id, path: item.imagePath as string })
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

function WishlistEditor({ list, onClose }: { list: Wishlist | null; onClose: () => void }) {
  const save = useSaveWishlist()
  const remove = useDeleteWishlist()
  const [title, setTitle] = useState(list?.title ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (title.trim() === '') {
      setError('Без названия вишлист не найти')
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
    <Sheet open onClose={onClose} title={list ? 'Вишлист' : 'Новый вишлист'}>
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
            Удалить вишлист
            {list.items.length > 0 &&
              ` и ${list.items.length} ${plural(list.items.length, 'пункт', 'пункта', 'пунктов')}`}
          </Button>
        )}
      </div>
    </Sheet>
  )
}
