import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'motion/react'
import { ChevronLeft, ChevronRight, Heart, ImagePlus, Images, LoaderCircle, MapPin, Pencil, Trash2, X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { formatDayLabel, formatDayMonthYear, fromLocalISO, monthName, todayLocal } from '@/lib/date'
import { formatBytes, prepareMemoryImage, type MemoryImage } from '@/lib/image'
import { readExifDate } from '@/lib/exif'
import { usePair, type Pair } from '@/features/profile/pair'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card, SectionTitle } from '@/ui/Card'
import { Fab } from '@/ui/Fab'
import { Field, INPUT_CLASS } from '@/ui/Field'
import { ProgressiveImage } from '@/ui/ProgressiveImage'
import { Sheet } from '@/ui/Sheet'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import {
  uploadMemoryPhoto,
  useDeleteMemory,
  useInvalidateMemories,
  useMemories,
  useMemoryUrls,
  useRemovePhoto,
  useSaveMemory,
  useToggleHeart,
  type Memory,
} from './api'
import { MAX_PHOTOS, byMonth, mosaicOf, onThisDay, singleAspect } from './logic'

/**
 * Лента воспоминаний.
 *
 * Общий альбом: снимки с подписью, местом и датой от любого из двоих.
 * Наверху - «в этот день» из прошлых лет, ниже - лента по месяцам.
 *
 * Про вес. В ленте - только превью (640 px), полный снимок качается при
 * открытии во весь экран, а до превью видна заглушка из строки базы.
 * Всё однажды скачанное Service Worker отдаёт с устройства (см. push-sw.js).
 */
export function MemoriesPage() {
  const t = useT()
  const pair = usePair()
  const memories = useMemories()
  const today = todayLocal()
  const [editing, setEditing] = useState<Memory | 'new' | null>(null)
  const [viewing, setViewing] = useState<{ memory: Memory; index: number } | null>(null)

  const thumbs = useMemo(
    () => (memories.data ?? []).flatMap((m) => m.photos.map((p) => p.thumbPath)),
    [memories.data],
  )
  const urls = useMemoryUrls(thumbs)

  if (memories.isError) return <ErrorState error={memories.error} onRetry={() => void memories.refetch()} />
  if (memories.isPending || pair.isPending) return <Loading />

  const list = memories.data
  const past = onThisDay(list, today)
  const fresh = (m: Memory) => list.find((x) => x.id === m.id) ?? m

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {past.length > 0 && past[0] && (
        <OnThisDay
          memory={past[0].memory}
          yearsAgo={past[0].yearsAgo}
          url={past[0].memory.photos[0] ? urls.data?.[past[0].memory.photos[0].thumbPath] : undefined}
          onOpen={() => past[0] && setViewing({ memory: past[0].memory, index: 0 })}
        />
      )}

      {list.length === 0 ? (
        <EmptyState
          icon={Images}
          tone="rose"
          title={t('mem.emptyTitle')}
          hint={t('mem.emptyHint')}
          action={<Button onClick={() => setEditing('new')}>{t('mem.add')}</Button>}
        />
      ) : (
        byMonth(list).map(({ month, items }) => {
          const date = fromLocalISO(`${month}-01`)
          const year = date.getFullYear()
          return (
            <section key={month} className="flex flex-col gap-3">
              <SectionTitle className="mt-2">
                {monthName(date.getMonth())}
                {String(year) !== today.slice(0, 4) ? ` ${year}` : ''}
              </SectionTitle>
              {items.map((m) => (
                <MemoryCard
                  key={m.id}
                  memory={m}
                  pair={pair}
                  urls={urls.data ?? {}}
                  onOpen={(index) => setViewing({ memory: m, index })}
                  onEdit={() => setEditing(m)}
                />
              ))}
            </section>
          )
        })
      )}

      <Fab onClick={() => setEditing('new')} label={t('mem.add')} />

      {editing && (
        <Composer memory={editing === 'new' ? null : fresh(editing)} today={today} onClose={() => setEditing(null)} />
      )}
      <AnimatePresence>
        {viewing && (
          <Viewer
            key="viewer"
            memory={viewing.memory}
            start={viewing.index}
            thumbs={urls.data ?? {}}
            pair={pair}
            onClose={() => setViewing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function OnThisDay({
  memory,
  yearsAgo,
  url,
  onOpen,
}: {
  memory: Memory
  yearsAgo: number
  url: string | undefined
  onOpen: () => void
}) {
  const t = useT()
  const photo = memory.photos[0]
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative isolate block aspect-[16/10] w-full overflow-hidden rounded-[28px] bg-tone-rose-soft text-left shadow-card transition-transform active:scale-[0.98]"
    >
      {/* Обёртка задаёт место, а не сама картинка: у неё своё relative,
          и absolute рядом с ним проигрывал - снимок схлопывался в ноль */}
      {photo && (
        <span className="absolute inset-0">
          <ProgressiveImage src={url} placeholder={photo.placeholder} alt="" className="size-full" />
        </span>
      )}
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 p-5 text-white">
        <span className="block text-[13px] font-semibold tracking-wide uppercase opacity-85">
          {t('mem.yearsAgo', { n: yearsAgo, unit: t.plural('unit.year', yearsAgo) })}
        </span>
        <span className="mt-1 line-clamp-2 block font-display text-[20px] leading-tight font-extrabold">
          {memory.caption ?? memory.place ?? formatDayMonthYear(fromLocalISO(memory.happenedOn))}
        </span>
      </span>
    </button>
  )
}

function MemoryCard({
  memory,
  pair,
  urls,
  onOpen,
  onEdit,
}: {
  memory: Memory
  pair: Pair
  urls: Record<string, string>
  onOpen: (index: number) => void
  onEdit: () => void
}) {
  const t = useT()
  const heart = useToggleHeart()
  const burst = useBurst()
  const [expanded, setExpanded] = useState(false)
  const mine = memory.authorId === pair.userId
  const iHeart = memory.hearts.includes(pair.userId)
  const otherHearts = memory.hearts.filter((h) => h !== pair.userId)

  return (
    <Card as="article" className="overflow-hidden">
      {memory.photos.length > 0 && <MosaicView memory={memory} urls={urls} onOpen={onOpen} />}

      <div className="p-4">
        {memory.caption && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={`block w-full text-left text-[16px] leading-relaxed whitespace-pre-wrap ${expanded ? '' : 'line-clamp-5'}`}
          >
            {memory.caption}
          </button>
        )}

        <div className={`flex items-center gap-2.5 ${memory.caption ? 'mt-3' : ''}`}>
          <Avatar name={pair.nameOf(memory.authorId)} tone={pair.toneOf(memory.authorId)} size="sm" />
          <span className="min-w-0 flex-1 text-[13px] text-muted">
            <span className="block truncate">
              <span className="font-semibold text-ink">{pair.nameOf(memory.authorId)}</span> ·{' '}
              {formatDayLabel(memory.happenedOn)}
            </span>
            {memory.place && (
              <span className="mt-0.5 flex items-center gap-1 truncate">
                <MapPin size={12} aria-hidden className="shrink-0" />
                <span className="truncate">{memory.place}</span>
              </span>
            )}
          </span>

          {mine && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={t('common.edit')}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors active:bg-raised"
            >
              <Pencil size={17} aria-hidden />
            </button>
          )}

          <button
            type="button"
            aria-pressed={iHeart}
            aria-label={t('mem.heart')}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              heart.mutate({ memoryId: memory.id, userId: pair.userId, on: !iHeart })
              if (!iHeart) burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 'hearts')
            }}
            className="flex h-10 shrink-0 items-center gap-1 rounded-full px-2 transition-transform active:scale-90"
          >
            {/* Сердце второго - его аватар рядом: людей двое, счётчик не нужен */}
            {otherHearts.map((id) => (
              <Avatar key={id} name={pair.nameOf(id)} tone={pair.toneOf(id)} size="sm" />
            ))}
            <motion.span animate={{ scale: iHeart ? [1, 1.35, 1] : 1 }} transition={{ duration: 0.3 }}>
              <Heart
                size={22}
                aria-hidden
                strokeWidth={iHeart ? 0 : 2}
                className={iHeart ? 'fill-accent text-accent' : 'text-muted'}
              />
            </motion.span>
          </button>
        </div>
      </div>
    </Card>
  )
}

/**
 * Мозаика: один снимок - в своих пропорциях (в рамках 4:5 - 16:9), два -
 * рядом, три - большой и два маленьких, больше - сетка 2x2 и «+N»
 * на последней плитке.
 */
function MosaicView({
  memory,
  urls,
  onOpen,
}: {
  memory: Memory
  urls: Record<string, string>
  onOpen: (index: number) => void
}) {
  const t = useT()
  const photos = memory.photos
  const layout = mosaicOf(photos.length)
  const tile = (i: number, className: string, extra?: number) => {
    const p = photos[i]
    if (!p) return null
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => onOpen(i)}
        aria-label={t('mem.openPhoto', { n: i + 1, total: photos.length })}
        className={`relative overflow-hidden bg-raised ${className}`}
      >
        <ProgressiveImage src={urls[p.thumbPath]} placeholder={p.placeholder} alt="" className="size-full" />
        {extra !== undefined && extra > 0 && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 font-display text-2xl font-extrabold text-white">
            +{extra}
          </span>
        )}
      </button>
    )
  }

  if (layout === 'one' && photos[0]) {
    return (
      <div style={{ aspectRatio: singleAspect(photos[0].width, photos[0].height) }} className="grid">
        {tile(0, 'size-full')}
      </div>
    )
  }
  if (layout === 'two') {
    return <div className="grid aspect-[2/1] grid-cols-2 gap-0.5">{[tile(0, 'size-full'), tile(1, 'size-full')]}</div>
  }
  if (layout === 'three') {
    return (
      <div className="grid aspect-[3/2] grid-cols-[2fr_1fr] grid-rows-2 gap-0.5">
        {[tile(0, 'row-span-2 size-full'), tile(1, 'size-full'), tile(2, 'size-full')]}
      </div>
    )
  }
  return (
    <div className="grid aspect-square grid-cols-2 grid-rows-2 gap-0.5">
      {[0, 1, 2, 3].map((i) => tile(i, 'size-full', i === 3 ? photos.length - 4 : undefined))}
    </div>
  )
}

/**
 * Просмотр во весь экран: свайп между снимками, сначала превью (оно уже
 * в кэше), поверх - полный размер, когда скачался. Закрывается крестиком,
 * свайпом вниз и Escape.
 */
function Viewer({
  memory,
  start,
  thumbs,
  pair,
  onClose,
}: {
  memory: Memory
  start: number
  thumbs: Record<string, string>
  pair: Pair
  onClose: () => void
}) {
  const t = useT()
  const [index, setIndex] = useState(start)
  const photos = memory.photos
  const full = useMemoryUrls(photos.map((p) => p.path))
  const count = photos.length

  const go = useCallback((d: number) => setIndex((i) => Math.min(Math.max(i + d, 0), Math.max(count - 1, 0))), [count])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, go])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.y) > 110 && Math.abs(info.offset.y) > Math.abs(info.offset.x)) return onClose()
    if (info.offset.x < -60 || info.velocity.x < -400) go(1)
    else if (info.offset.x > 60 || info.velocity.x > 400) go(-1)
  }

  const photo = photos[index]

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={memory.caption ?? t('nav.memories')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {photo ? (
          <motion.div
            key={photo.id}
            drag
            dragSnapToOrigin
            dragElastic={0.6}
            onDragEnd={onDragEnd}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 touch-none"
          >
            {/* Превью сразу, полный размер - поверх, когда скачался */}
            <ProgressiveImage
              src={full.data?.[photo.path] ?? thumbs[photo.thumbPath]}
              placeholder={photo.placeholder}
              alt={memory.caption ?? ''}
              fit="contain"
              className="size-full"
            />
          </motion.div>
        ) : (
          <div className="flex size-full items-center justify-center p-8 text-center text-lg">{memory.caption}</div>
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0}
              aria-label={t('mem.prev')}
              className="absolute top-1/2 left-2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 disabled:opacity-0 sm:flex"
            >
              <ChevronLeft size={24} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={index === count - 1}
              aria-label={t('mem.next')}
              className="absolute top-1/2 right-2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 disabled:opacity-0 sm:flex"
            >
              <ChevronRight size={24} aria-hidden />
            </button>
          </>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 pt-safe pb-6">
        <span className="pl-2 text-sm font-semibold tabular-nums">{count > 1 ? `${index + 1} / ${count}` : ''}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="pointer-events-auto mt-2 flex size-11 items-center justify-center rounded-full bg-black/40"
        >
          <X size={22} aria-hidden />
        </button>
      </div>

      {(memory.caption || count > 1) && (
        <div className="bg-gradient-to-t from-black via-black/80 to-transparent px-5 pt-6 pb-safe">
          {count > 1 && (
            <div className="mb-3 flex justify-center gap-1.5">
              {photos.map((p, i) => (
                <span key={p.id} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/40'}`} />
              ))}
            </div>
          )}
          {memory.caption && <p className="line-clamp-4 pb-4 text-[15px] leading-relaxed whitespace-pre-wrap">{memory.caption}</p>}
          <p className="pb-4 text-[13px] text-white/70">
            {pair.nameOf(memory.authorId)} · {formatDayMonthYear(fromLocalISO(memory.happenedOn))}
            {memory.place ? ` · ${memory.place}` : ''}
          </p>
        </div>
      )}
    </motion.div>
  )
}

type Pending = {
  key: string
  originalBytes: number
  status: 'preparing' | 'ready' | 'error'
  image?: MemoryImage
  preview?: string
  error?: string
}

/**
 * Новое воспоминание или правка своего.
 *
 * Снимки ужимаются прямо при выборе, по одному: так видно, что происходит,
 * и телефону не приходится держать в памяти десяток декодированных
 * оригиналов разом. Дата подставляется из EXIF самого раннего снимка,
 * пока человек не выбрал её сам.
 */
function Composer({ memory, today, onClose }: { memory: Memory | null; today: string; onClose: () => void }) {
  const t = useT()
  const save = useSaveMemory()
  const removePhoto = useRemovePhoto()
  const remove = useDeleteMemory()
  const invalidate = useInvalidateMemories()
  const burst = useBurst()
  const input = useRef<HTMLInputElement>(null)
  const [id] = useState(() => memory?.id ?? crypto.randomUUID())
  // Запись уже в базе: после первой удачной вставки повтор - это правка,
  // иначе вторая попытка упала бы на том же id
  const [stored, setStored] = useState(memory !== null)
  const uploaded = useRef(0)
  const [date, setDate] = useState(memory?.happenedOn ?? today)
  const [dateTouched, setDateTouched] = useState(memory !== null)
  const [caption, setCaption] = useState(memory?.caption ?? '')
  const [place, setPlace] = useState(memory?.place ?? '')
  const [pending, setPending] = useState<Pending[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const existing = memory?.photos ?? []
  const thumbUrls = useMemoryUrls(existing.map((p) => p.thumbPath))
  const previews = useRef<string[]>([])

  // Ссылки на превью живут, пока открыта шторка
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const room = MAX_PHOTOS - existing.length - pending.length
  const preparing = pending.some((p) => p.status === 'preparing')

  const pick = async (files: File[]) => {
    const chosen = files.slice(0, Math.max(room, 0))
    if (files.length > chosen.length) setError(t('mem.tooMany', { n: MAX_PHOTOS }))
    const items = chosen.map((file) => ({ key: crypto.randomUUID(), file }))
    setPending((list) => [
      ...list,
      ...items.map(({ key, file }) => ({ key, originalBytes: file.size, status: 'preparing' as const })),
    ])

    let earliest: string | null = null
    for (const { key, file } of items) {
      const taken = await readExifDate(file)
      if (taken && (earliest === null || taken < earliest)) earliest = taken
      try {
        const image = await prepareMemoryImage(file)
        const preview = URL.createObjectURL(image.thumb.blob)
        previews.current.push(preview)
        setPending((list) => list.map((p) => (p.key === key ? { ...p, status: 'ready', image, preview } : p)))
      } catch (e) {
        setPending((list) =>
          list.map((p) => (p.key === key ? { ...p, status: 'error', error: e instanceof Error ? e.message : String(e) } : p)),
        )
      }
    }
    // Дата съёмки - только пока человек не выбрал дату сам, и не из будущего
    if (earliest && !dateTouched && earliest <= today) setDate(earliest)
  }

  const ready = pending.filter((p) => p.status === 'ready' && p.image)
  const before = ready.reduce((s, p) => s + p.originalBytes, 0)
  const after = ready.reduce((s, p) => s + (p.image ? p.image.full.blob.size + p.image.thumb.blob.size : 0), 0)

  const submit = async (from: HTMLElement) => {
    setError(null)
    if (caption.trim() === '' && existing.length === 0 && ready.length === 0) return setError(t('mem.empty'))
    const rect = from.getBoundingClientRect()
    try {
      await save.mutateAsync({ id, isNew: !stored, happenedOn: date, caption, place })
      setStored(true)
      setProgress({ done: 0, total: ready.length })
      for (const [i, p] of ready.entries()) {
        if (p.image) await uploadMemoryPhoto(id, p.image, existing.length + uploaded.current)
        uploaded.current += 1
        // Загруженный снимок уходит из списка сразу: если следующий сорвётся,
        // повторное «Сохранить» дозагрузит только оставшиеся, без дублей
        setPending((list) => list.filter((x) => x.key !== p.key))
        setProgress({ done: i + 1, total: ready.length })
      }
      invalidate()
      burst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, 'hearts')
      onClose()
    } catch (e) {
      invalidate()
      setError(e instanceof Error ? e.message : String(e))
      setProgress(null)
    }
  }

  return (
    <Sheet open onClose={onClose} title={memory ? t('mem.edit') : t('mem.new')}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-2">
          {existing.map((p) => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-2xl bg-raised">
              <ProgressiveImage src={thumbUrls.data?.[p.thumbPath]} placeholder={p.placeholder} alt="" className="size-full" />
              <RemoveDot label={t('mem.removePhoto')} onClick={() => removePhoto.mutate(p)} />
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.key} className="relative aspect-square overflow-hidden rounded-2xl bg-raised">
              {p.preview && <img src={p.preview} alt="" className="size-full object-cover" />}
              {p.status === 'preparing' && (
                <span className="absolute inset-0 flex items-center justify-center text-muted">
                  <LoaderCircle size={20} className="animate-spin" aria-label={t('mem.preparing')} />
                </span>
              )}
              {p.status === 'error' && (
                <span className="absolute inset-0 flex items-center justify-center p-1 text-center text-[11px] text-danger">
                  {p.error}
                </span>
              )}
              {p.status !== 'preparing' && progress === null && (
                <RemoveDot label={t('mem.removePhoto')} onClick={() => setPending((list) => list.filter((x) => x.key !== p.key))} />
              )}
            </div>
          ))}
          {room > 0 && (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl bg-accent-soft text-accent-soft-ink transition-transform active:scale-95"
            >
              <ImagePlus size={22} aria-hidden />
              <span className="text-[11px] font-semibold">{t('mem.addPhotos')}</span>
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length > 0) void pick(files)
          }}
        />

        {before > 0 && (
          <p className="text-[13px] text-muted tabular-nums">
            {t('mem.compressed', { from: formatBytes(before), to: formatBytes(after) })}
          </p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('mem.caption')}</span>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t('mem.captionPlaceholder')}
            className={`${INPUT_CLASS} resize-none [field-sizing:content] min-h-24`}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm text-muted">{t('mem.date')}</span>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => {
                setDate(e.target.value || today)
                setDateTouched(true)
              }}
              className={INPUT_CLASS}
            />
          </label>
          <Field label={t('mem.place')} value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t('mem.placePlaceholder')} maxLength={120} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={(e) => void submit(e.currentTarget)} loading={save.isPending || progress !== null} disabled={preparing}>
          {progress ? t('mem.uploading', { done: progress.done, total: progress.total }) : t('common.save')}
        </Button>

        {memory && (
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() =>
              void remove
                .mutateAsync(memory)
                .then(onClose)
                .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
            }
          >
            <Trash2 size={18} aria-hidden />
            {t('common.delete')}
          </Button>
        )}
      </div>
    </Sheet>
  )
}

function RemoveDot({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-black/55 text-white"
    >
      <X size={15} aria-hidden />
    </button>
  )
}
