import { useCallback, useEffect, useRef, useState } from 'react'

/** Две минуты: дольше - уже не записка, а звонок. Потолок держит и база. */
export const MAX_MS = 120_000
/** Столбиков в огибающей - столько рисует пузырь записки. */
export const BARS = 48

export type Recording = { blob: Blob; durationMs: number; peaks: number[]; mime: string }

/**
 * Формат записи - первый, который умеет браузер. iPhone пишет mp4 (AAC),
 * Chrome и Android - webm (Opus). Оба играются на обеих платформах
 * современными браузерами; бакет принимает оба.
 */
function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/aac'].find((m) => MediaRecorder.isTypeSupported(m))
}

export function recordingSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
}

/** Сжать ряд уровней в BARS столбиков 0..100 - максимумом по окну. */
export function toPeaks(levels: readonly number[], bars = BARS): number[] {
  if (levels.length === 0) return [0]
  const out: number[] = []
  const step = levels.length / bars
  for (let i = 0; i < Math.min(bars, levels.length); i++) {
    const from = Math.floor(i * step)
    const to = Math.max(from + 1, Math.floor((i + 1) * step))
    out.push(Math.round(Math.min(100, Math.max(...levels.slice(from, to)))))
  }
  return out
}

/**
 * Запись с микрофона: старт, стоп, живой уровень для анимации и огибающая
 * для пузыря. 32 кбит/с - речь звучит чисто, две минуты весят около 500 КБ.
 */
export function useRecorder() {
  const [state, setState] = useState<'idle' | 'recording'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<'denied' | 'unsupported' | null>(null)
  const parts = useRef<{
    recorder: MediaRecorder
    stream: MediaStream
    ctx: AudioContext
    chunks: Blob[]
    levels: number[]
    started: number
    timer: number
  } | null>(null)

  const cleanup = useCallback(() => {
    const p = parts.current
    if (!p) return
    window.clearInterval(p.timer)
    p.stream.getTracks().forEach((t) => t.stop())
    void p.ctx.close().catch(() => {})
    parts.current = null
    setState('idle')
    setLevel(0)
  }, [])

  useEffect(() => cleanup, [cleanup])

  /** Остановить. Результат придёт в onDone, переданный в start. */
  const stop = useCallback(() => {
    const p = parts.current
    if (p && p.recorder.state !== 'inactive') p.recorder.stop()
  }, [])

  /**
   * Начать. onDone получит запись при любой остановке - и кнопкой,
   * и по потолку в две минуты; короче полсекунды - null (случайное касание).
   */
  const start = useCallback(async (onDone: (r: Recording | null) => void) => {
    setError(null)
    const mime = pickMime()
    if (!recordingSupported() || !mime) {
      setError('unsupported')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      setError('denied')
      return
    }
    const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32_000 })
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    const chunks: Blob[] = []
    const levels: number[] = []
    const started = Date.now()

    // Уровень - RMS сигнала раз в 100 мс, растянутый так, чтобы обычная
    // речь занимала середину шкалы, а не прижималась к низу
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += ((v - 128) / 128) ** 2
      const rms = Math.sqrt(sum / buf.length)
      const value = Math.min(100, Math.round(Math.sqrt(rms) * 160))
      levels.push(value)
      setLevel(value)
      const ms = Date.now() - started
      setElapsed(ms)
      if (ms >= MAX_MS && recorder.state === 'recording') recorder.stop()
    }, 100)

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    recorder.onstop = () => {
      const durationMs = Math.min(Date.now() - started, MAX_MS)
      const blob = new Blob(chunks, { type: recorder.mimeType || mime })
      cleanup()
      onDone(durationMs < 500 ? null : { blob, durationMs, peaks: toPeaks(levels), mime: blob.type })
    }

    parts.current = { recorder, stream, ctx, chunks, levels, started, timer }
    recorder.start(250)
    setElapsed(0)
    setState('recording')
  }, [cleanup])

  return { state, elapsed, level, error, start, stop }
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
