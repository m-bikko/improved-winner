import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ZoomIn } from 'lucide-react'
import { sourcePerScreenPx, squareCrop, type SquareCrop } from '@/lib/image'
import { Button } from './Button'

const MAX_ZOOM = 4

/**
 * Кадрирование в квадрат.
 *
 * Холст показывает РОВНО ТОТ ЖЕ прямоугольник исходника, который потом
 * уедет в файл: `drawImage` с одинаковыми sx/sy/sw/sh и на экране, и при
 * сохранении. Обычный путь - показать картинку тегом `img`, а резать
 * по отдельно посчитанным координатам - требует держать в согласии две
 * системы координат, и расходятся они молча: человек видит одно, получает
 * другое, и списать это можно только на «показалось».
 *
 * Состояние - центр кадра в пикселях ИСХОДНИКА и кратность приближения.
 * Не смещение в пикселях экрана: при изменении масштаба смещение пришлось бы
 * пересчитывать, а центр остаётся собой.
 */
export function SquareCropper({
  bitmap,
  busy,
  onConfirm,
  onCancel,
}: {
  bitmap: ImageBitmap
  busy: boolean
  onConfirm: (crop: SquareCrop) => void
  onCancel: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<number | null>(null)

  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState({ x: bitmap.width / 2, y: bitmap.height / 2 })

  /** Кадр в координатах исходника - и для показа, и для сохранения. */
  const crop = useCallback(
    (): SquareCrop => squareCrop(bitmap.width, bitmap.height, center, zoom),
    [bitmap.width, bitmap.height, center, zoom],
  )

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const box = el.clientWidth
    if (box === 0) return

    // Холст под плотность экрана: на телефоне без этого квадрат мылит
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    el.width = Math.round(box * dpr)
    el.height = Math.round(box * dpr)

    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingQuality = 'high'
    const c = crop()
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.drawImage(bitmap, c.x, c.y, c.side, c.side, 0, 0, el.width, el.height)
  }, [bitmap, crop])

  /** Сдвиг пальца по экрану - в пиксели исходника через текущий масштаб. */
  const panBy = (dx: number, dy: number) => {
    const perPx = sourcePerScreenPx(bitmap.width, bitmap.height, zoom, canvas.current?.clientWidth ?? 1)
    setCenter((c) => ({ x: c.x - dx * perPx, y: c.y - dy * perPx }))
  }

  const distance = (): number | null => {
    const [a, b] = [...pointers.current.values()]
    if (!a || !b) return null
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    pinch.current = distance()
  }

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const previous = pointers.current.get(e.pointerId)
    if (!previous) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size >= 2) {
      const now = distance()
      if (now !== null && pinch.current !== null && pinch.current > 0) {
        const ratio = now / pinch.current
        setZoom((z) => Math.min(Math.max(z * ratio, 1), MAX_ZOOM))
      }
      pinch.current = now
      return
    }

    panBy(e.clientX - previous.x, e.clientY - previous.y)
  }

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId)
    pinch.current = pointers.current.size >= 2 ? distance() : null
  }

  return (
    <div className="flex flex-col gap-4">
      <canvas
        ref={canvas}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => {
          setZoom((z) => Math.min(Math.max(z * (e.deltaY < 0 ? 1.1 : 0.9), 1), MAX_ZOOM))
        }}
        // touch-action: none - иначе браузер заберёт себе и перетаскивание,
        // и щипок, а до обработчиков доедут одиночные дёрганья
        className="aspect-square w-full touch-none rounded-xl bg-raised"
        aria-label="Кадрирование: тяните, чтобы сдвинуть, щипком меняйте масштаб"
      />

      <label className="flex items-center gap-3">
        <ZoomIn size={18} aria-hidden className="shrink-0 text-muted" />
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Масштаб"
          className="w-full accent-[var(--color-accent)]"
        />
      </label>

      <Button onClick={() => onConfirm(crop())} loading={busy}>
        <Check size={18} aria-hidden />
        Готово
      </Button>

      <button type="button" onClick={onCancel} className="text-sm text-muted underline">
        Отмена
      </button>
    </div>
  )
}
