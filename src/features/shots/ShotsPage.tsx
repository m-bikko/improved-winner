import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Camera, Clock, Lock, Send, Trash2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { formatDayLabel, formatTime } from '@/lib/date'
import { useNow } from '@/lib/useNow'
import { usePair, type Pair } from '@/features/profile/pair'
import { Aurora } from '@/ui/Aurora'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card, SectionTitle } from '@/ui/Card'
import { Field } from '@/ui/Field'
import { PhotoViewer } from '@/ui/PhotoViewer'
import { ProgressiveImage } from '@/ui/ProgressiveImage'
import { Sheet } from '@/ui/Sheet'
import { ShineBorder } from '@/ui/ShineBorder'
import { ErrorState, Loading } from '@/ui/States'
import { toneVar } from '@/ui/tones'
import { useDeleteShot, useSendShot, useShotUrls, useShots, type Shot, type ShotDay } from './api'
import { lateMinutes, mmss, shotState } from './logic'

/**
 * Кадр дня.
 *
 * Раз в день в случайный момент обоим приходит сигнал: десять минут, чтобы
 * снять то, что вокруг. Кадр второго открывается после своего. Наверху -
 * сегодняшний день: ожидание сигнала, отсчёт, ожидание второго или оба
 * кадра рядом. Ниже - прошлые дни парами.
 */
export function ShotsPage() {
  const t = useT()
  const pair = usePair()
  const shots = useShots()
  const now = useNow(1000)
  const [viewing, setViewing] = useState<Shot | null>(null)

  const days = shots.data ?? []
  const paths = useMemo(() => days.flatMap((d) => d.shots.flatMap((s) => [s.thumbPath, s.path])), [days])
  const urls = useShotUrls(paths)

  if (shots.isError) return <ErrorState error={shots.error} onRetry={() => void shots.refetch()} />
  if (shots.isPending || pair.isPending) return <Loading />

  // Текущий день - последний, где снимать ещё можно (сутки после сигнала)
  const current = days.find((d) => shotState(d.sentAt, now).kind !== 'closed') ?? null
  const past = days.filter((d) => d !== current && (d.shots.length > 0 || d.posted.length > 0))

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {current ? (
        <Today day={current} pair={pair} now={now} urls={urls.data ?? {}} onView={setViewing} />
      ) : (
        <Waiting />
      )}

      {past.length > 0 && (
        <>
          <SectionTitle className="mt-3">{t('sh.past')}</SectionTitle>
          {past.map((d) => (
            <PastDay key={d.day} day={d} pair={pair} urls={urls.data ?? {}} onView={setViewing} />
          ))}
        </>
      )}

      {viewing && urls.data?.[viewing.path] && (
        <PhotoViewer url={urls.data[viewing.path] ?? ''} alt={viewing.caption ?? ''} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}

/** Сигнала сегодня ещё не было: время не знает никто, и это нормально. */
function Waiting() {
  const t = useT()
  return (
    <section className="relative isolate flex flex-col items-center overflow-hidden rounded-[28px] bg-surface px-6 pt-8 pb-7 text-center shadow-card">
      <Aurora colors={['var(--t-sky)', 'var(--t-violet)', 'var(--c-accent)']} />
      <span className="relative flex size-20 items-center justify-center">
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-tone-sky-soft [animation-duration:2.4s] motion-reduce:animate-none" />
        <span className="relative flex size-20 items-center justify-center rounded-full bg-tone-sky-soft text-tone-sky">
          <Camera size={34} aria-hidden />
        </span>
      </span>
      <h2 className="mt-5 font-display text-2xl font-extrabold">{t('sh.waitTitle')}</h2>
      <p className="mt-2 max-w-sm text-[15px] text-muted">{t('sh.waitHint')}</p>
    </section>
  )
}

/** День с сигналом: снять, ждать второго или смотреть оба. */
function Today({
  day,
  pair,
  now,
  urls,
  onView,
}: {
  day: ShotDay
  pair: Pair
  now: number
  urls: Record<string, string>
  onView: (s: Shot) => void
}) {
  const t = useT()
  const state = shotState(day.sentAt, now)
  const mine = day.shots.find((s) => s.userId === pair.userId)
  const theirs = day.shots.find((s) => s.userId === pair.partnerId)
  const partnerPosted = day.posted.includes(pair.partnerId)
  const a = toneVar(pair.myTone)
  const b = toneVar(pair.partnerTone)

  if (!mine) {
    return (
      <section
        className="relative isolate overflow-hidden rounded-[28px] bg-surface p-5 shadow-card"
        style={{ '--pair-a': a, '--pair-b': b } as CSSProperties}
      >
        {state.kind === 'open' && <ShineBorder colors={[a, 'var(--c-accent)', b]} />}
        <Aurora colors={[a, b, 'var(--c-accent)']} />
        <p className="text-[13px] font-semibold text-muted">
          {t('sh.signalAt', { time: formatTime(new Date(day.sentAt)) })}
        </p>
        {state.kind === 'open' ? (
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-[56px] leading-none font-extrabold tracking-tight tabular-nums">
              {mmss(state.secondsLeft)}
            </span>
            <span className="font-display text-lg font-extrabold">{t('sh.left')}</span>
          </p>
        ) : (
          <p className="mt-1 font-display text-[26px] leading-tight font-extrabold">{t('sh.lateTitle')}</p>
        )}
        <p className="mt-2 text-[15px] text-muted">{state.kind === 'open' ? t('sh.openHint') : t('sh.lateHint')}</p>

        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-raised/70 p-3">
          <Avatar name={pair.partnerName} tone={pair.partnerTone} size="sm" />
          <p className="min-w-0 flex-1 text-sm">
            {partnerPosted ? t('sh.partnerPosted', { name: pair.partnerName }) : t('sh.partnerNotYet', { name: pair.partnerName })}
          </p>
          {partnerPosted && <Lock size={16} aria-hidden className="shrink-0 text-muted" />}
        </div>

        <Capture day={day.day} pair={pair} />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <ShotCard shot={mine} sentAt={day.sentAt} pair={pair} url={urls[mine.thumbPath]} onView={onView} own />
        {theirs ? (
          <ShotCard shot={theirs} sentAt={day.sentAt} pair={pair} url={urls[theirs.thumbPath]} onView={onView} />
        ) : (
          <div className="relative flex aspect-[3/4] flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl bg-surface p-4 text-center shadow-card">
            <span className="relative">
              <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-raised [animation-duration:2s] motion-reduce:animate-none" />
              <span className="relative block">
                <Avatar name={pair.partnerName} tone={pair.partnerTone} size="lg" />
              </span>
            </span>
            <p className="text-sm text-muted">{t('sh.waitingFor', { name: pair.partnerName })}</p>
          </div>
        )}
      </div>
      {theirs && (
        <p className="text-center text-[13px] text-muted">{t('sh.bothOpen')}</p>
      )}
    </section>
  )
}

/**
 * Кадр с подписью: кто, когда, вовремя ли. Свой можно убрать - это
 * фотография человека, а не запись в журнале.
 */
function ShotCard({
  shot,
  sentAt,
  pair,
  url,
  onView,
  own = false,
  small = false,
}: {
  shot: Shot
  sentAt: string
  pair: Pair
  url: string | undefined
  onView: (s: Shot) => void
  own?: boolean
  small?: boolean
}) {
  const t = useT()
  const remove = useDeleteShot()
  const late = lateMinutes(sentAt, shot.createdAt)
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <div className={`relative overflow-hidden bg-raised shadow-card ${small ? 'aspect-square rounded-2xl' : 'aspect-[3/4] rounded-3xl'}`}>
        <button type="button" onClick={() => onView(shot)} className="block size-full" aria-label={t('sh.open')}>
          <ProgressiveImage src={url} placeholder={shot.placeholder} alt={shot.caption ?? ''} className="size-full" />
        </button>
        {!small && (
          <>
            <span className="pointer-events-none absolute top-2.5 left-2.5">
              <Avatar name={pair.nameOf(shot.userId)} tone={pair.toneOf(shot.userId)} size="sm" ring />
            </span>
            <span
              className={`pointer-events-none absolute bottom-2.5 left-2.5 rounded-full px-2 py-0.5 text-[12px] font-semibold backdrop-blur ${
                late === 0 ? 'bg-tone-green/85 text-white' : 'bg-black/45 text-white'
              }`}
            >
              {late === 0 ? t('sh.onTime') : t('sh.late', { n: late < 120 ? `${late} ${t('unit.min')}` : `${Math.round(late / 60)} ${t.plural('unit.hour', Math.round(late / 60))}` })}
            </span>
            {own && (
              <button
                type="button"
                onClick={() => remove.mutate(shot)}
                aria-label={t('common.delete')}
                className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur active:scale-90"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            )}
          </>
        )}
      </div>
      {!small && shot.caption && <figcaption className="line-clamp-2 px-1 text-sm">{shot.caption}</figcaption>}
      {!small && (
        <span className="px-1 text-[12px] text-muted">
          {pair.nameOf(shot.userId)} · {formatTime(new Date(shot.createdAt))}
        </span>
      )}
    </figure>
  )
}

/** Прошлый день: два квадрата рядом, закрытый - замком. */
function PastDay({ day, pair, urls, onView }: { day: ShotDay; pair: Pair; urls: Record<string, string>; onView: (s: Shot) => void }) {
  const t = useT()
  const slot = (userId: string) => {
    const shot = day.shots.find((s) => s.userId === userId)
    if (shot) return <ShotCard shot={shot} sentAt={day.sentAt} pair={pair} url={urls[shot.thumbPath]} onView={onView} small />
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-raised text-muted">
        {day.posted.includes(userId) ? <Lock size={18} aria-label={t('sh.locked')} /> : <Clock size={18} aria-label={t('sh.missed')} />}
      </div>
    )
  }
  return (
    <Card className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{formatDayLabel(day.day)}</p>
        <p className="text-[13px] text-muted">{t('sh.signalAt', { time: formatTime(new Date(day.sentAt)) })}</p>
      </div>
      <div className="grid w-40 shrink-0 grid-cols-2 gap-2">
        {slot(pair.userId)}
        {slot(pair.partnerId)}
      </div>
    </Card>
  )
}

/**
 * Кнопка «Снять»: камера телефона сразу (capture), потом превью с подписью
 * и отправка. На компьютере тот же input открывает выбор файла.
 */
function Capture({ day, pair }: { day: string; pair: Pair }) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  const send = useSendShot()
  const burst = useBurst()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const close = () => {
    setFile(null)
    setPreview(null)
    setCaption('')
    setError(null)
  }

  return (
    <>
      <Button className="mt-4 w-full" onClick={() => input.current?.click()}>
        <Camera size={19} aria-hidden />
        {t('sh.take')}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setFile(f)
          setPreview(URL.createObjectURL(f))
        }}
      />
      {file && preview && (
        <Sheet open onClose={close} title={t('nav.shots')}>
          <div className="flex flex-col gap-4">
            <img src={preview} alt="" className="max-h-[40vh] w-full rounded-2xl bg-raised object-contain" />
            <Field
              label={t('sh.caption')}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={140}
              placeholder={t('sh.captionHint')}
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button
              loading={send.isPending}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                send.mutate(
                  { userId: pair.userId, day, file, caption },
                  {
                    onSuccess: () => {
                      burst({ x: r.left + r.width / 2, y: r.top }, 'hearts')
                      close()
                    },
                    onError: (err) => setError(err.message),
                  },
                )
              }}
            >
              <Send size={18} aria-hidden />
              {t('sh.send')}
            </Button>
          </div>
        </Sheet>
      )}
    </>
  )
}
