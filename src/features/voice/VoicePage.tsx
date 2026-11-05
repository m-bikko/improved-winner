import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { CheckCheck, Mic, Pause, Play, Send, Square, Trash2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { formatDayLabel, formatTime, toLocalISO } from '@/lib/date'
import { usePair, type Pair } from '@/features/profile/pair'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card } from '@/ui/Card'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { TONE_CLASS } from '@/ui/tones'
import { loadVoice, useDeleteVoice, useMarkListened, useSendVoice, useVoiceNotes, type VoiceNote } from './api'
import { BARS, MAX_MS, formatDuration, recordingSupported, useRecorder, type Recording } from './recorder'

/**
 * Голосовые записки.
 *
 * На расстоянии голос значит больше текста. Нажал - говоришь - нажал ещё раз,
 * послушал и отправил. Второму приходит уведомление; у своих записок видно,
 * прослушаны ли они. Звук до двух минут, ~500 КБ.
 */
export function VoicePage() {
  const t = useT()
  const pair = usePair()
  const notes = useVoiceNotes()

  if (notes.isError) return <ErrorState error={notes.error} onRetry={() => void notes.refetch()} />
  if (notes.isPending || pair.isPending) return <Loading />

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Recorder pair={pair} />
      {notes.data.length === 0 ? (
        <EmptyState icon={Mic} tone="violet" title={t('vc.emptyTitle')} hint={t('vc.emptyHint')} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {notes.data.map((n) => (
            <Bubble key={n.id} note={n} pair={pair} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Запись: большая кнопка, живые столбики громкости и таймер. После стопа -
 * прослушать перед отправкой или выбросить.
 */
function Recorder({ pair }: { pair: Pair }) {
  const t = useT()
  const rec = useRecorder()
  const send = useSendVoice()
  const burst = useBurst()
  const [draft, setDraft] = useState<Recording | null>(null)
  const [draftUrl, setDraftUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const live = useRef<number[]>([])
  const [, redraw] = useState(0)

  useEffect(() => {
    if (rec.state !== 'recording') return
    live.current = [...live.current, rec.level].slice(-BARS)
    redraw((n) => n + 1)
  }, [rec.level, rec.state])

  useEffect(() => () => {
    if (draftUrl) URL.revokeObjectURL(draftUrl)
  }, [draftUrl])

  const toggle = () => {
    setError(null)
    if (rec.state === 'recording') {
      rec.stop()
      return
    }
    live.current = []
    void rec.start((r) => {
      setDraft(r)
      setDraftUrl(r ? URL.createObjectURL(r.blob) : null)
    })
  }

  const discard = () => {
    setDraft(null)
    setDraftUrl(null)
  }

  const submit = (el: HTMLElement) => {
    if (!draft) return
    const r = el.getBoundingClientRect()
    send.mutate(
      { userId: pair.userId, rec: draft },
      {
        onSuccess: () => {
          burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 'hearts')
          discard()
        },
        onError: (e) => setError(e.message),
      },
    )
  }

  if (!recordingSupported()) {
    return <Card className="p-4 text-sm text-muted">{t('vc.unsupported')}</Card>
  }

  return (
    <Card className="flex flex-col items-center gap-4 p-5">
      {draft && draftUrl ? (
        <>
          <Player url={draftUrl} durationMs={draft.durationMs} peaks={draft.peaks} tone={pair.myTone} />
          <div className="flex w-full gap-2">
            <Button variant="secondary" onClick={discard} className="flex-1">
              <Trash2 size={18} aria-hidden />
              {t('vc.discard')}
            </Button>
            <Button onClick={(e) => submit(e.currentTarget)} loading={send.isPending} className="flex-1">
              <Send size={18} aria-hidden />
              {t('vc.send')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="font-display text-lg font-extrabold">
            {rec.state === 'recording' ? formatDuration(rec.elapsed) : t('vc.title')}
          </p>
          <div className="flex h-12 w-full items-center justify-center gap-[3px]" aria-hidden>
            {Array.from({ length: BARS }, (_, i) => live.current[i - (BARS - live.current.length)] ?? 0).map((v, i) => (
              <span
                key={i}
                className={`w-[3px] rounded-full transition-[height] duration-100 ${rec.state === 'recording' ? 'bg-accent' : 'bg-raised'}`}
                style={{ height: `${Math.max(8, v)}%` }}
              />
            ))}
          </div>
          <motion.button
            type="button"
            onClick={toggle}
            aria-label={rec.state === 'recording' ? t('vc.stop') : t('vc.record')}
            animate={rec.state === 'recording' ? { scale: [1, 1.06, 1] } : { scale: 1 }}
            transition={rec.state === 'recording' ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }}
            className={`flex size-20 items-center justify-center rounded-full shadow-float transition-colors ${
              rec.state === 'recording' ? 'bg-danger text-white' : 'bg-accent text-accent-ink'
            }`}
          >
            {rec.state === 'recording' ? <Square size={26} aria-hidden className="fill-current" /> : <Mic size={30} aria-hidden />}
          </motion.button>
          <p className="text-center text-[13px] text-muted">
            {rec.state === 'recording' ? t('vc.limit', { n: Math.round(MAX_MS / 60000) }) : t('vc.hint')}
          </p>
        </>
      )}
      {(error || rec.error) && (
        <p className="text-center text-sm text-danger">
          {error ?? (rec.error === 'denied' ? t('vc.micDenied') : t('vc.unsupported'))}
        </p>
      )}
    </Card>
  )
}

/** Проигрыватель с огибающей: сыгранная часть закрашивается цветом человека. */
function Player({
  url,
  durationMs,
  peaks,
  tone,
  onPlay,
}: {
  url: string | (() => Promise<string>)
  durationMs: number
  peaks: number[]
  tone: Pair['myTone']
  onPlay?: () => void
}) {
  const t = useT()
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () => () => {
      audio.current?.pause()
    },
    [],
  )

  const toggle = async () => {
    setError(null)
    if (playing) {
      audio.current?.pause()
      return
    }
    if (!audio.current) {
      setLoading(true)
      try {
        const src = typeof url === 'string' ? url : await url()
        const a = new Audio(src)
        a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0)
        a.onplay = () => setPlaying(true)
        a.onpause = () => setPlaying(false)
        a.onended = () => {
          setPlaying(false)
          setProgress(0)
        }
        audio.current = a
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
        return
      }
      setLoading(false)
    }
    try {
      await audio.current.play()
      onPlay?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex w-full items-center gap-3">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? t('vc.pause') : t('vc.play')}
        className={`flex size-11 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-90 ${TONE_CLASS[tone].solid} ${loading ? 'animate-pulse' : ''}`}
      >
        {playing ? <Pause size={20} aria-hidden className="fill-current" /> : <Play size={20} aria-hidden className="ml-0.5 fill-current" />}
      </button>
      <div className="flex h-9 min-w-0 flex-1 items-center gap-[2px]" aria-hidden>
        {peaks.map((p, i) => (
          <span
            key={i}
            className={`min-w-[2px] flex-1 rounded-full ${i / peaks.length < progress ? TONE_CLASS[tone].solid : 'bg-ink/15'}`}
            style={{ height: `${Math.max(10, p)}%` }}
          />
        ))}
      </div>
      <span className="shrink-0 text-[13px] text-muted tabular-nums">{formatDuration(durationMs)}</span>
      {error && <span className="sr-only">{error}</span>}
    </div>
  )
}

/**
 * Записка в ленте: свои справа, второго слева. У своих - прослушано ли,
 * у чужих непрослушанных - точка «новое». Прослушал - отметка уходит автору.
 */
function Bubble({ note, pair }: { note: VoiceNote; pair: Pair }) {
  const t = useT()
  const mine = note.authorId === pair.userId
  const listened = useMarkListened()
  const remove = useDeleteVoice()
  const tone = pair.toneOf(note.authorId)
  const at = new Date(note.createdAt)

  return (
    <li className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
      <Avatar name={pair.nameOf(note.authorId)} tone={tone} size="sm" />
      <Card className={`relative max-w-[85%] min-w-0 flex-1 p-3 ${mine ? 'rounded-br-lg' : 'rounded-bl-lg'}`}>
        {!mine && note.listenedAt === null && (
          <span aria-label={t('vc.new')} className="absolute -top-1 -right-1 size-3 rounded-full bg-accent ring-2 ring-surface" />
        )}
        <Player
          url={() => loadVoice(note.path)}
          durationMs={note.durationMs}
          peaks={note.peaks}
          tone={tone}
          onPlay={() => {
            if (!mine && note.listenedAt === null) listened.mutate(note.id)
          }}
        />
        <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[12px] text-muted">
          <span>
            {formatDayLabel(toLocalISO(at))}, {formatTime(at)}
          </span>
          {mine && (
            <>
              <CheckCheck size={14} aria-label={note.listenedAt ? t('vc.listened') : t('vc.sent')} className={note.listenedAt ? 'text-tone-green' : ''} />
              <button type="button" onClick={() => remove.mutate(note)} aria-label={t('common.delete')} className="ml-1 text-muted/70">
                <Trash2 size={13} aria-hidden />
              </button>
            </>
          )}
        </div>
      </Card>
    </li>
  )
}
