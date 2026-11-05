import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Eye, Heart, Lock, Play, Shuffle, Star, Trash2, Undo2 } from 'lucide-react'
import { dynamicKey, useT } from '@/lib/i18n'
import { formatDayLabel, todayLocal } from '@/lib/date'
import { usePair, type Pair } from '@/features/profile/pair'
import { Aurora } from '@/ui/Aurora'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Fab } from '@/ui/Fab'
import { Field, INPUT_CLASS, NumberField } from '@/ui/Field'
import { Segmented } from '@/ui/Segmented'
import { Sheet } from '@/ui/Sheet'
import { Sparkles } from '@/ui/Sparkles'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { toneVar } from '@/ui/tones'
import { useDeleteItem, useRate, useSaveItem, useSetStatus, useToggleWant, useWatch } from './api'
import {
  KIND_ICON,
  WATCH_KINDS,
  bothWant,
  posterTones,
  tasteMatch,
  tonightPool,
  type WatchItem,
  type WatchKind,
  type WatchStatus,
} from './logic'

/**
 * Смотрим вместе.
 *
 * Общая очередь фильмов и сериалов. Сверху - «что смотрим сегодня?»: выбор
 * из того, что хотят оба, с барабаном вместо долгого спора. После просмотра
 * оба ставят оценку вслепую - оценка второго открывается после своей, это
 * держит RLS, - и из оценок складывается «совпадение вкусов».
 */
export function WatchPage() {
  const t = useT()
  const pair = usePair()
  const watch = useWatch()
  const [tab, setTab] = useState<WatchStatus>('want')
  const [open, setOpen] = useState<WatchItem | 'new' | null>(null)

  if (watch.isError) return <ErrorState error={watch.error} onRetry={() => void watch.refetch()} />
  if (watch.isPending || pair.isPending) return <Loading />

  const items = watch.data
  const shown = items.filter((i) => i.status === tab)
  const count = (s: WatchStatus) => items.filter((i) => i.status === s).length
  const match = tasteMatch(items, pair.userId, pair.partnerId)
  const fresh = (i: WatchItem) => items.find((x) => x.id === i.id) ?? i

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Tonight items={items} pair={pair} onOpen={(i) => setOpen(i)} />

      <Segmented
        value={tab}
        onChange={setTab}
        options={(['want', 'watching', 'watched'] as const).map((s) => ({
          value: s,
          label: (
            <>
              {t(dynamicKey('w.tab', s))}
              {count(s) > 0 && <span className="ml-1 text-[12px] font-semibold opacity-60 tabular-nums">{count(s)}</span>}
            </>
          ),
        }))}
      />

      {tab === 'watched' && count('watched') > 0 && (
        <p className="px-1 text-sm text-muted">
          {t('w.stats', { n: count('watched') })}
          {match !== null && <> · {t('w.taste', { pct: match })}</>}
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={tab === 'want' ? Heart : tab === 'watching' ? Play : Eye}
          tone="sky"
          title={t(dynamicKey('w.empty', tab))}
          hint={tab === 'want' ? t('w.emptyHint') : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {shown.map((item) => (
            <WatchRow key={item.id} item={item} pair={pair} onOpen={() => setOpen(item)} />
          ))}
        </ul>
      )}

      <Fab onClick={() => setOpen('new')} label={t('w.new')} />

      {open && <ItemSheet item={open === 'new' ? null : fresh(open)} pair={pair} onClose={() => setOpen(null)} />}
    </div>
  )
}

/**
 * «Что смотрим сегодня?» - барабан из кандидатов.
 *
 * Названия мелькают чуть больше секунды и замедляются к концу, как
 * у настоящего барабана. При «уменьшить движение» выбор показывается сразу.
 * Сам выбор случаен намеренно: смысл в том, чтобы не спорить.
 */
function Tonight({ items, pair, onOpen }: { items: readonly WatchItem[]; pair: Pair; onOpen: (i: WatchItem) => void }) {
  const t = useT()
  const reduced = useReducedMotion()
  const status = useSetStatus()
  const burst = useBurst()
  const pool = tonightPool(items, pair.userId, pair.partnerId)
  const [shownId, setShownId] = useState<string | null>(null)
  const [spinning, setSpinning] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  const shown = pool.find((i) => i.id === shownId) ?? null
  const a = toneVar(pair.myTone)
  const b = toneVar(pair.partnerTone)

  const spin = () => {
    if (pool.length === 0) return
    const final = pool[Math.floor(Math.random() * pool.length)]
    if (!final) return
    if (reduced || pool.length === 1) {
      setShownId(final.id)
      return
    }
    setSpinning(true)
    let step = 0
    const steps = 14
    const tick = () => {
      step++
      if (step >= steps) {
        setShownId(final.id)
        setSpinning(false)
        return
      }
      setShownId(pool[(step + Math.floor(Math.random() * pool.length)) % pool.length]?.id ?? null)
      // Замедление к концу: от 60 до ~200 мс между кадрами
      timer.current = window.setTimeout(tick, 60 + step * step * 0.9)
    }
    tick()
  }

  return (
    <section className="relative isolate overflow-hidden rounded-[28px] bg-surface p-5 shadow-card">
      <Aurora colors={[a, b, 'var(--t-sky)']} />
      <p className="font-display text-[22px] leading-tight font-extrabold tracking-tight">{t('w.tonight')}</p>
      <p className="mt-1 text-sm text-muted">
        {pool.length === 0
          ? t('w.nothing')
          : pool.some((i) => bothWant(i, pair.userId, pair.partnerId))
            ? t('w.fromBoth', { n: pool.length })
            : t('w.fromAny', { n: pool.length })}
      </p>

      <AnimatePresence mode="popLayout" initial={false}>
        {shown && (
          <motion.button
            key={shown.id + (spinning ? '-s' : '')}
            type="button"
            onClick={() => !spinning && onOpen(shown)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: spinning ? 0.06 : 0.25 }}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-surface/80 p-2.5 text-left backdrop-blur"
          >
            <Poster item={shown} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-bold">{shown.title}</span>
              <span className="block truncate text-[13px] text-muted">
                {t(dynamicKey('w.kind', shown.kind))}
                {shown.year ? ` · ${shown.year}` : ''}
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {pool.length > 0 && (
        <div className="mt-4 flex gap-2">
          <Button variant={shown ? 'secondary' : 'primary'} onClick={spin} disabled={spinning} className="flex-1">
            <Shuffle size={18} aria-hidden />
            {shown ? t('w.again') : t('w.pick')}
          </Button>
          {shown && !spinning && (
            <Button
              className="flex-1"
              loading={status.isPending}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                status.mutate(
                  { id: shown.id, status: 'watching', watchedOn: null },
                  {
                    onSuccess: () => {
                      burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 'sparks')
                      setShownId(null)
                    },
                  },
                )
              }}
            >
              <Play size={18} aria-hidden />
              {t('w.start')}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

/** «Постер»: градиент в двух тонах по названию, значок вида и первая буква. */
function Poster({ item, size = 'md' }: { item: WatchItem; size?: 'sm' | 'md' }) {
  const [x, y] = posterTones(item.title)
  const Icon = KIND_ICON[item.kind]
  const box = size === 'sm' ? 'h-16 w-12 rounded-xl text-xl' : 'h-[84px] w-[60px] rounded-2xl text-2xl'
  return (
    <span
      aria-hidden
      className={`relative flex shrink-0 items-end overflow-hidden p-1.5 font-display font-extrabold text-white ${box}`}
      style={{ background: `linear-gradient(150deg, ${toneVar(x)}, ${toneVar(y)})` }}
    >
      <Icon size={size === 'sm' ? 30 : 40} strokeWidth={1.5} className="absolute -top-1 -right-2 opacity-25" />
      {/* Затемнение снизу держит белую букву читаемой на любом градиенте:
          в тёмной теме тона светлые, и без него буква пропадала */}
      <span className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
      <span className="relative leading-none drop-shadow-sm">{item.title.trim().charAt(0).toUpperCase()}</span>
    </span>
  )
}

function WatchRow({ item, pair, onOpen }: { item: WatchItem; pair: Pair; onOpen: () => void }) {
  const t = useT()
  const toggle = useToggleWant()
  const iWant = item.wants.includes(pair.userId)
  const theyWant = pair.partnerId !== '' && item.wants.includes(pair.partnerId)
  const mine = item.ratings.find((r) => r.userId === pair.userId)
  const theirs = item.ratings.find((r) => r.userId === pair.partnerId)
  const partnerRated = item.ratedBy.includes(pair.partnerId)

  return (
    <Card as="li" className="flex items-center gap-3 p-3 pr-2">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70">
        <Poster item={item} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">{item.title}</span>
          <span className="mt-0.5 block truncate text-[13px] text-muted">
            {t(dynamicKey('w.kind', item.kind))}
            {item.year ? ` · ${item.year}` : ''}
            {item.status === 'watched' && item.watchedOn ? ` · ${formatDayLabel(item.watchedOn)}` : ''}
          </span>
          {item.status === 'watched' ? (
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {mine ? (
                <Stars n={mine.stars} label={pair.myName} />
              ) : (
                <span className="text-[13px] font-semibold text-accent">{t('w.rateIt')}</span>
              )}
              {pair.partnerId !== '' &&
                (theirs ? (
                  <Stars n={theirs.stars} label={pair.partnerName} />
                ) : partnerRated ? (
                  <span className="flex items-center gap-1 text-[13px] text-muted">
                    <Lock size={12} aria-hidden />
                    {pair.partnerName}
                  </span>
                ) : null)}
            </span>
          ) : (
            item.note && <span className="mt-1 block truncate text-[13px] text-muted">{item.note}</span>
          )}
        </span>
      </button>

      {item.status !== 'watched' && (
        <div className="flex shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            aria-pressed={iWant}
            aria-label={t('w.want')}
            onClick={() => toggle.mutate({ itemId: item.id, userId: pair.userId, on: !iWant })}
            className="flex size-11 items-center justify-center rounded-full transition-transform active:scale-90"
          >
            <motion.span animate={{ scale: iWant ? [1, 1.3, 1] : 1 }} transition={{ duration: 0.3 }}>
              <Heart
                size={22}
                aria-hidden
                className={iWant ? 'fill-accent text-accent' : 'text-muted'}
                strokeWidth={iWant ? 0 : 2}
              />
            </motion.span>
          </button>
          {/* Кто ещё хочет - аватар второго. Оба хотят - это и есть кандидат на вечер */}
          {theyWant && <Avatar name={pair.partnerName} tone={pair.partnerTone} size="sm" />}
        </div>
      )}
    </Card>
  )
}

function Stars({ n, label }: { n: number; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[13px]">
      <span className="max-w-20 truncate text-muted">{label}</span>
      <Star size={13} aria-hidden className="fill-tone-amber text-tone-amber" />
      <span className="font-semibold tabular-nums">{n}</span>
    </span>
  )
}

function ItemSheet({ item, pair, onClose }: { item: WatchItem | null; pair: Pair; onClose: () => void }) {
  const t = useT()
  const save = useSaveItem()
  const remove = useDeleteItem()
  const status = useSetStatus()
  const [title, setTitle] = useState(item?.title ?? '')
  const [kind, setKind] = useState<WatchKind>(item?.kind ?? 'movie')
  const [year, setYear] = useState<number | ''>(item?.year ?? '')
  const [note, setNote] = useState(item?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const run = async (job: () => Promise<unknown>, close = true) => {
    setError(null)
    try {
      await job()
      if (close) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const submit = () => {
    if (title.trim() === '') return setError(t('w.noTitle'))
    if (year !== '' && (year < 1888 || year > 2100)) return setError(t('w.badYear'))
    void run(() =>
      save.mutateAsync({
        ...(item ? { id: item.id } : {}),
        userId: pair.userId,
        title,
        kind,
        year: year === '' ? null : year,
        note,
      }),
    )
  }

  return (
    <Sheet open onClose={onClose} title={item ? item.title : t('w.new')}>
      <div className="flex flex-col gap-5">
        {item?.status === 'watched' && <RateBlock item={item} pair={pair} />}

        <Field
          label={t('w.title')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('w.titlePlaceholder')}
          maxLength={200}
          autoFocus={!item}
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">{t('w.kindLabel')}</span>
          <div className="flex flex-wrap gap-2">
            {WATCH_KINDS.map((k) => (
              <Chip key={k} icon={KIND_ICON[k]} selected={kind === k} onClick={() => setKind(k)}>
                {t(dynamicKey('w.kind', k))}
              </Chip>
            ))}
          </div>
        </div>
        <NumberField label={t('w.year')} value={year} onValueChange={setYear} max={2100} placeholder="2014" />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('w.note')}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={t('w.notePlaceholder')}
            className={`${INPUT_CLASS} resize-none`}
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={submit} loading={save.isPending}>
          {item ? t('common.save') : t('w.add')}
        </Button>

        {item && (
          <div className="flex flex-col gap-2">
            {item.status === 'want' && (
              <Button variant="soft" onClick={() => void run(() => status.mutateAsync({ id: item.id, status: 'watching', watchedOn: null }))}>
                <Play size={18} aria-hidden />
                {t('w.markWatching')}
              </Button>
            )}
            {item.status !== 'watched' && (
              <Button
                variant="soft"
                onClick={() => void run(() => status.mutateAsync({ id: item.id, status: 'watched', watchedOn: todayLocal() }), false)}
              >
                <Eye size={18} aria-hidden />
                {t('w.markWatched')}
              </Button>
            )}
            {/* С оценками фильм остаётся просмотренным - это держит и база,
                поэтому кнопку, которая всё равно упадёт, не показываем */}
            {item.status !== 'want' && item.ratedBy.length === 0 && (
              <Button variant="secondary" onClick={() => void run(() => status.mutateAsync({ id: item.id, status: 'want', watchedOn: null }))}>
                <Undo2 size={18} aria-hidden />
                {t('w.backToWant')}
              </Button>
            )}
            <Button variant="danger" loading={remove.isPending} onClick={() => void run(() => remove.mutateAsync(item.id))}>
              <Trash2 size={18} aria-hidden />
              {t('common.delete')}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

/**
 * Оценка вслепую. Своя - звёздами; оценка второго открывается после своей.
 * Совпали - звёзды вокруг.
 */
function RateBlock({ item, pair }: { item: WatchItem; pair: Pair }) {
  const t = useT()
  const rate = useRate()
  const burst = useBurst()
  const mine = item.ratings.find((r) => r.userId === pair.userId)
  const theirs = item.ratings.find((r) => r.userId === pair.partnerId)
  const partnerRated = item.ratedBy.includes(pair.partnerId)
  const [comment, setComment] = useState(mine?.comment ?? '')
  const [error, setError] = useState<string | null>(null)

  const set = (stars: number, from: HTMLElement) => {
    setError(null)
    const r = from.getBoundingClientRect()
    rate.mutate(
      { itemId: item.id, userId: pair.userId, stars, comment },
      {
        onSuccess: () => {
          if (!mine) burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, partnerRated ? 'hearts' : 'sparks')
        },
        onError: (e) => setError(e.message),
      },
    )
  }

  const same = mine && theirs && mine.stars === theirs.stars

  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-card">
      <span className="text-sm font-semibold">{t('w.yourRating')}</span>
      <div className="flex gap-1" role="radiogroup" aria-label={t('w.yourRating')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={mine?.stars === n}
            aria-label={t('w.stars', { n })}
            onClick={(e) => set(n, e.currentTarget)}
            className="flex size-11 items-center justify-center rounded-full transition-transform active:scale-90"
          >
            <Star
              size={28}
              aria-hidden
              className={mine && n <= mine.stars ? 'fill-tone-amber text-tone-amber' : 'text-muted/50'}
            />
          </button>
        ))}
      </div>
      {mine && (
        <Field
          label={t('w.comment')}
          hideLabel
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => {
            if ((mine.comment ?? '') !== comment.trim()) rate.mutate({ itemId: item.id, userId: pair.userId, stars: mine.stars, comment })
          }}
          placeholder={t('w.commentPlaceholder')}
          maxLength={300}
        />
      )}

      {pair.partnerId !== '' && (
        <div className="flex items-center gap-2.5 border-t border-line pt-3">
          <Avatar name={pair.partnerName} tone={pair.partnerTone} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{pair.partnerName}</span>
          {theirs ? (
            same ? (
              <Sparkles count={3} colors={['var(--t-amber)', 'var(--c-accent)']}>
                <Stars n={theirs.stars} label="" />
              </Sparkles>
            ) : (
              <Stars n={theirs.stars} label="" />
            )
          ) : (
            <span className="flex items-center gap-1 text-[13px] text-muted">
              <Lock size={13} aria-hidden />
              {partnerRated ? t('w.lockedRating') : t('w.notRated')}
            </span>
          )}
        </div>
      )}
      {theirs?.comment && <p className="text-sm text-muted italic">{theirs.comment}</p>}
      {same && <p className="text-sm font-semibold text-tone-green">{t('w.match')}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
