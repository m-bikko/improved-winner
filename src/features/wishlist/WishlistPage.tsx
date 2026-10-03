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
import { Gift, GripVertical, ImageOff, ImagePlus, PartyPopper, Trash2 } from 'lucide-react'
import { formatBytes, loadBitmap, prepareSquare, type SquareCrop } from '@/lib/image'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { Field, INPUT_CLASS } from '@/ui/Field'
import { PhotoViewer } from '@/ui/PhotoViewer'
import { Sheet } from '@/ui/Sheet'
import { SquareCropper } from '@/ui/SquareCropper'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { useProfiles } from '@/features/profile/api'
import { useUserId } from '@/auth/AuthProvider'
import { todayLocal } from '@/lib/date'
import { CATEGORIES, CATEGORY_BY_ID } from './categories'
import {
  useDeleteWish,
  useRemoveWishPhoto,
  useReorderWishes,
  useReservations,
  useSaveWish,
  useSetReservation,
  useUploadWishPhoto,
  useWishPhotoUrls,
  useWishes,
  type Reservation,
  type Wish,
} from './api'
import { Fab } from '@/ui/Fab'

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
  const reservations = useReservations()

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
    profiles.data?.find((p) => p.userId === who)?.nickname ?? t('partner')

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {/* Фильтр прокручивается вбок: категорий восемь, в две строки они
          съедали бы верх экрана на каждом заходе. Лента выходит под края
          экрана (-mx-4 и обратно px-4): обрезанный на краю чип и есть
          подсказка, что дальше есть ещё. Полоса прокрутки спрятана - на
          телефоне ленту листают пальцем, а полоса только съедает высоту */}
      <div
        className="-mx-4 overflow-x-auto px-4 py-1 [scrollbar-width:none]
                   [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max gap-2">
          <FilterChip active={category === null} onClick={() => setCategory(null)}>
            {t('wish.all')}
            {all.length > 0 && <Count n={all.length} />}
          </FilterChip>
          {CATEGORIES.map((c) => {
            const n = counts.get(c.id) ?? 0
            const Icon = c.icon
            return (
              <FilterChip
                key={c.id}
                active={category === c.id}
                dim={n === 0}
                onClick={() => setCategory(category === c.id ? null : c.id)}
              >
                <Icon size={16} aria-hidden />
                {t(dynamicKey('wish', c.id))}
                {n > 0 && <Count n={n} />}
              </FilterChip>
            )
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={t(category === null ? 'wish.emptyAll' : 'wish.emptyCategory')}
          hint={t(
            category === null ? 'wish.emptyHintAll' : 'wish.emptyHintCategory',
          )}
          icon={category === null ? Gift : (CATEGORY_BY_ID[category]?.icon ?? Gift)}
          tone="orange"
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2.5">
              {shown.map((wish) => (
                <Row
                  key={wish.id}
                  wish={wish}
                  url={wish.imagePath ? urls.data?.[wish.imagePath] : undefined}
                  author={nick(wish.createdBy)}
                  reservation={reservations.data?.[wish.id]}
                  onOpen={() => setEditing(wish)}
                  onView={(url) => setViewing({ url, alt: wish.title })}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <Fab onClick={() => setEditing('new')} label={t('wish.new')} />

      {editing && (
        <Editor
          wish={editing === 'new' ? null : editing}
          ownerName={editing === 'new' ? '' : nick(editing.createdBy)}
          reservation={editing === 'new' ? undefined : reservations.data?.[editing.id]}
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

/**
 * Чип фильтра.
 *
 * Свой, а не общий Chip: выбран всегда ровно один, и выбор заливается
 * акцентом целиком - это фильтр, а не набор отметок. И у пустой категории
 * приглушённый текст: выбрать её можно (новое желание создастся сразу в ней),
 * но видно, что там пока ничего.
 */
function FilterChip({
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
      className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium
                  transition-[background-color,color,transform] duration-150 active:scale-95 ${
                    active
                      ? 'bg-accent text-accent-ink'
                      : `bg-surface shadow-card ${dim ? 'text-muted' : 'text-ink'}`
                  }`}
    >
      {children}
    </button>
  )
}

/** Счётчик в чипе - отдельно и тише подписи, чтобы не читался её частью. */
function Count({ n }: { n: number }) {
  return <span className="text-[13px] font-semibold tabular-nums opacity-70">{n}</span>
}

/** Карточка желания: картинка, название, подпись, ручка перестановки. */
function Row({
  wish,
  url,
  author,
  reservation,
  onOpen,
  onView,
}: {
  wish: Wish
  url: string | undefined
  author: string
  reservation: Reservation | undefined
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
      // Поднятая карточка парит над соседями: без тени и слоя выше она
      // проезжала бы под ними, и было бы не видно, что именно тянешь
      className={`flex items-center gap-3 rounded-3xl bg-surface p-3 pr-1 ${
        isDragging ? 'relative z-10 shadow-float' : 'shadow-card'
      }`}
    >
      {/* Картинка - отдельная кнопка: тап по ней открывает просмотр,
          а не форму. Это то, чего ждёшь от превью */}
      <button
        type="button"
        onClick={() => url && onView(url)}
        disabled={!url}
        aria-label={url ? t('wish.viewPhoto', { name: wish.title }) : wish.title}
        className={`flex size-18 shrink-0 items-center justify-center overflow-hidden rounded-2xl ${
          url ? 'bg-raised' : 'bg-tone-orange-soft text-tone-orange'
        }`}
      >
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <Icon size={26} strokeWidth={2.1} aria-hidden />
        )}
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-18 min-w-0 flex-1 flex-col justify-center self-stretch text-left
                   transition-opacity active:opacity-60"
      >
        <span className="block truncate text-base font-semibold">{wish.title}</span>
        {wish.details && (
          <span className="mt-0.5 line-clamp-2 text-sm text-muted">{wish.details}</span>
        )}
        <span className="mt-1 flex min-w-0 items-center gap-1 text-[13px] text-muted">
          <Icon size={13} aria-hidden className="shrink-0" />
          <span className="truncate">
            {category ? t(dynamicKey('wish', category.id)) : wish.category} · {author}
          </span>
        </span>
        {/* Бронь видна только тому, кто бронировал: владельцу её не отдаёт база */}
        {reservation && (
          <span
            className={`mt-1.5 flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[12px] font-semibold ${
              reservation.giftedOn ? 'bg-tone-green-soft text-tone-green' : 'bg-accent-soft text-accent-soft-ink'
            }`}
          >
            {reservation.giftedOn ? <PartyPopper size={12} aria-hidden /> : <Gift size={12} aria-hidden />}
            {reservation.giftedOn ? t('wish.gifted') : t('wish.youGive')}
          </span>
        )}
      </button>

      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={wish.title}
        className="flex w-11 shrink-0 touch-none items-center justify-center self-stretch text-muted/70"
      >
        <GripVertical size={20} aria-hidden />
      </button>
    </li>
  )
}

function Editor({
  wish,
  ownerName,
  reservation,
  defaultCategory,
  onClose,
}: {
  wish: Wish | null
  ownerName: string
  reservation: Reservation | undefined
  defaultCategory: string
  onClose: () => void
}) {
  const t = useT()
  const userId = useUserId()
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
      setError(t('wish.noTitle'))
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
    <Sheet open onClose={onClose} title={t(wish ? 'wish.title' : 'wish.new')}>
      <div className="flex flex-col gap-4">
        <Field
          label={t('wish.what')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('wish.placeholder')}
          autoFocus={!wish}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('wish.details')}</span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            placeholder={t('wish.detailsPlaceholder')}
            className={`${INPUT_CLASS} min-w-0 resize-none`}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">{t('wish.category')}</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Chip
                key={c.id}
                icon={c.icon}
                selected={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {t(dynamicKey('wish', c.id))}
              </Chip>
            ))}
          </div>
        </div>

        <Photo
          wish={wish}
          savedId={savedId}
          onNeedSave={async () => {
            if (title.trim() === '') {
              setError(t('wish.needTitleFirst'))
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

        {wish && wish.createdBy !== userId && <Reserve wishId={wish.id} ownerName={ownerName} reservation={reservation} />}

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} loading={save.isPending}>
          {t('common.save')}
        </Button>

        {wish && (
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => void remove.mutateAsync(wish.id).then(onClose)}
          >
            <Trash2 size={18} aria-hidden />
            {t('common.delete')}
          </Button>
        )}
      </div>
    </Sheet>
  )
}

/**
 * Бронь подарка в чужом желании: «подарю я» и потом «подарено». Владелец
 * ничего из этого не видит - ни в списке, ни в напоминаниях.
 */
function Reserve({ wishId, ownerName, reservation }: { wishId: string; ownerName: string; reservation: Reservation | undefined }) {
  const t = useT()
  const set = useSetReservation()
  const state = reservation ? (reservation.giftedOn ? 'gifted' : 'reserved') : null
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-accent-soft/60 p-4">
      <div className="flex items-start gap-3">
        <Gift size={20} aria-hidden className="mt-0.5 shrink-0 text-accent-soft-ink" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{state === 'gifted' ? t('wish.gifted') : state ? t('wish.youGive') : t('wish.reserve')}</p>
          <p className="mt-0.5 text-sm text-muted">{t('wish.reserveHint', { name: ownerName })}</p>
        </div>
      </div>
      <div className="flex gap-2">
        {state === null ? (
          <Button className="flex-1" variant="primary" loading={set.isPending} onClick={() => set.mutate({ wishId, state: 'reserved', today: todayLocal() })}>
            {t('wish.reserveDo')}
          </Button>
        ) : (
          <>
            {state === 'reserved' && (
              <Button className="flex-1" variant="primary" loading={set.isPending} onClick={() => set.mutate({ wishId, state: 'gifted', today: todayLocal() })}>
                <PartyPopper size={17} aria-hidden />
                {t('wish.markGifted')}
              </Button>
            )}
            <Button className="flex-1" variant="secondary" loading={set.isPending} onClick={() => set.mutate({ wishId, state: null, today: todayLocal() })}>
              {t('wish.unreserve')}
            </Button>
          </>
        )}
      </div>
    </div>
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
  const t = useT()
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
        <p className="text-sm text-muted">{t('wish.cropHint')}</p>
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
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-raised">
        {preview ? (
          <img src={preview} alt="" className="size-full object-cover" />
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
          className="flex min-h-10 items-center gap-1.5 rounded-full bg-accent-soft px-4 text-sm font-semibold
                     text-accent-soft-ink transition-transform active:scale-95"
        >
          <ImagePlus size={16} aria-hidden className="shrink-0" />
          {t(path ? 'wish.replacePhoto' : 'wish.addPhoto')}
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
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium
                       text-muted transition-transform active:scale-95"
          >
            <Trash2 size={15} aria-hidden className="shrink-0" />
            {t('wish.removePhoto')}
          </button>
        )}

        {saved && (
          <p className="text-[13px] text-muted tabular-nums">
            {formatBytes(saved.from)} → {formatBytes(saved.to)}
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  )
}
