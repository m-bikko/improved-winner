import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, ChevronLeft, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { formatBytes, loadBitmap, prepareSquare, type SquareCrop } from '@/lib/image'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { SquareCropper } from '@/ui/SquareCropper'
import { ErrorState, Loading } from '@/ui/States'
import { useProfiles } from '@/features/profile/api'
import {
  isClosed,
  useAddItem,
  useDeleteItem,
  useDeleteWishlist,
  useRemoveWishlistPhoto,
  useSaveItem,
  useSaveWishlist,
  useToggleItem,
  useUploadWishlistPhoto,
  useWishlistPhotoUrls,
  useWishlists,
  type Wishlist,
  type WishlistItem,
} from './api'

/** «8 сентября» или «8 сентября 2025» - год только когда он не нынешний. */
function day(iso: string): string {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/**
 * Одна карточка желания: картинка, чеклист, кто чего хочет.
 *
 * Состояние карточки («Хотим» или «Приобретено») тут не переключают -
 * оно следствие галочек. Поэтому и кнопки «закрыть» нет: закрывает
 * последняя галочка, открывает любая снятая.
 */
export function WishlistDetailPage() {
  const { id = '' } = useParams()
  const userId = useUserId()
  const lists = useWishlists()
  const profiles = useProfiles()

  const list = lists.data?.find((l) => l.id === id)
  const paths = useMemo(() => (list?.imagePath ? [list.imagePath] : []), [list?.imagePath])
  const urls = useWishlistPhotoUrls(paths)

  const [opened, setOpened] = useState<WishlistItem | null>(null)
  const [editing, setEditing] = useState(false)

  if (lists.isError) return <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />
  if (lists.isPending || profiles.isPending) return <Loading />

  if (!list) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-muted">Такой карточки нет - возможно, её удалили.</p>
        <Link to="/wishlist" className="mt-3 inline-block text-accent underline">
          Ко всем вишлистам
        </Link>
      </div>
    )
  }

  const nick = (who: string): string =>
    profiles.data?.find((p) => p.userId === who)?.nickname ?? 'Партнёр'

  const open = list.items.filter((i) => i.doneAt === null)
  const done = list.items
    .filter((i) => i.doneAt !== null)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))

  // Свежая версия открытого пункта: после правки в замыкании остался бы старый
  const current = opened ? (list.items.find((i) => i.id === opened.id) ?? null) : null

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3 pb-16">
      <Link to="/wishlist" className="-ml-2 inline-flex items-center gap-1 p-2 text-sm text-muted">
        <ChevronLeft size={18} aria-hidden />
        Все вишлисты
      </Link>

      <Photo list={list} url={list.imagePath ? urls.data?.[list.imagePath] : undefined} />

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{list.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {nick(list.createdBy)} · завели {day(list.createdAt)}
          </p>
          {isClosed(list) && list.closedAt && (
            <p className="text-sm text-accent">Собрано {day(list.closedAt)}</p>
          )}
        </div>
        {list.createdBy === userId && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 text-sm text-accent underline"
          >
            Изменить
          </button>
        )}
      </div>

      <section className="mt-5 rounded-2xl bg-surface p-4 ring-1 ring-line">
        {open.length > 0 && (
          <ul className="flex flex-col">
            {open.map((item) => (
              <Row key={item.id} item={item} nick={nick} onOpen={() => setOpened(item)} />
            ))}
          </ul>
        )}

        <AddItem wishlistId={list.id} />

        {done.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-1 text-sm text-muted">Приобретено</p>
            <ul className="flex flex-col">
              {done.map((item) => (
                <Row key={item.id} item={item} nick={nick} onOpen={() => setOpened(item)} />
              ))}
            </ul>
          </div>
        )}
      </section>

      {current && (
        <ItemSheet item={current} onClose={() => setOpened(null)} />
      )}
      {editing && <WishlistSheet list={list} onClose={() => setEditing(false)} />}
    </div>
  )
}

function Row({
  item,
  nick,
  onOpen,
}: {
  item: WishlistItem
  nick: (who: string) => string
  onOpen: () => void
}) {
  const toggle = useToggleItem()
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

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Открыть «${item.title}»`}
        className="min-w-0 flex-1 py-0.5 text-left"
      >
        <span className={`block truncate ${isDone ? 'text-muted line-through' : ''}`}>
          {item.title}
        </span>
        <span className="block truncate text-xs text-muted">
          хочет {nick(item.wantedBy)} · {day(item.createdAt)}
          {isDone && item.doneAt && ` · взяли ${day(item.doneAt)}`}
        </span>
      </button>
    </li>
  )
}

function AddItem({ wishlistId }: { wishlistId: string }) {
  const add = useAddItem()
  const [draft, setDraft] = useState('')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const title = draft.trim()
        if (title === '') return
        setDraft('')
        add.mutate({ wishlistId, title })
      }}
      className="mt-3 flex items-center gap-2"
    >
      <Plus size={18} aria-hidden className="shrink-0 text-muted" />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Добавить пункт"
        aria-label="Добавить пункт"
        className="w-full min-w-0 bg-transparent py-1.5 outline-none placeholder:text-muted"
      />
    </form>
  )
}

function ItemSheet({ item, onClose }: { item: WishlistItem; onClose: () => void }) {
  const profiles = useProfiles()
  const save = useSaveItem()
  const remove = useDeleteItem()
  const [title, setTitle] = useState(item.title)
  const [note, setNote] = useState(item.note ?? '')
  const [wantedBy, setWantedBy] = useState(item.wantedBy)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (title.trim() === '') {
      setError('Без названия пункт не найти')
      return
    }
    try {
      await save.mutateAsync({ id: item.id, title, note: note || null, wantedBy })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={item.title}>
      <div className="flex flex-col gap-4">
        <Field label="Что это" value={title} onChange={(e) => setTitle(e.target.value)} />

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">Кто хочет</span>
          <div className="flex flex-wrap gap-2">
            {(profiles.data ?? []).map((p) => (
              <button
                key={p.userId}
                type="button"
                onClick={() => setWantedBy(p.userId)}
                aria-pressed={wantedBy === p.userId}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  wantedBy === p.userId
                    ? 'bg-accent text-accent-ink'
                    : 'bg-raised text-ink ring-1 ring-line'
                }`}
              >
                {p.nickname}
              </button>
            ))}
          </div>
        </div>

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
          Удалить пункт
        </Button>
      </div>
    </Sheet>
  )
}

/**
 * Картинка карточки: превью, кадрирование, замена.
 *
 * Квадрат режется НА КЛИЕНТЕ до загрузки, а не подгоняется стилями при показе.
 * Иначе в хранилище лежал бы произвольный формат, и кадр выбирал бы браузер
 * своим object-fit - то есть всегда центр, даже когда нужное не в центре.
 */
function Photo({ list, url }: { list: Wishlist; url: string | undefined }) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploadWishlistPhoto()
  const remove = useRemoveWishlistPhoto()

  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
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
      const prepared = await prepareSquare(bitmap, crop)
      await upload.mutateAsync({
        wishlistId: list.id,
        blob: prepared.blob,
        extension: prepared.extension,
        previousPath: list.imagePath,
      })
      setSaved({ from: original.current, to: prepared.blob.size })
      bitmap.close()
      setBitmap(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (bitmap) {
    return (
      <div className="mt-3 flex flex-col gap-3">
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
    <div className="mt-3">
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-raised ring-1 ring-line">
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus size={28} className="text-muted" aria-hidden />
        )}
      </div>

      <div className="mt-2 flex items-center gap-4">
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

        {url && list.imagePath && (
          <button
            type="button"
            onClick={() =>
              void remove.mutateAsync({ wishlistId: list.id, path: list.imagePath as string })
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
      </div>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  )
}

function WishlistSheet({ list, onClose }: { list: Wishlist; onClose: () => void }) {
  const navigate = useNavigate()
  const save = useSaveWishlist()
  const remove = useDeleteWishlist()
  const [title, setTitle] = useState(list.title)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (title.trim() === '') {
      setError('Без названия вишлист не найти')
      return
    }
    try {
      await save.mutateAsync({ id: list.id, title })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title="Вишлист">
      <div className="flex flex-col gap-4">
        <Field label="Название" value={title} onChange={(e) => setTitle(e.target.value)} />

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} loading={save.isPending}>
          Сохранить
        </Button>

        <Button
          variant="danger"
          loading={remove.isPending}
          onClick={() =>
            void remove.mutateAsync(list.id).then(() => navigate('/wishlist', { replace: true }))
          }
        >
          <Trash2 size={18} aria-hidden />
          Удалить вишлист
        </Button>
      </div>
    </Sheet>
  )
}
