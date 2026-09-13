import { useEffect, useRef, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'

/**
 * Умеет ли браузер распознавать коды сам.
 *
 * `BarcodeDetector` есть в Chromium и нет в Safari, то есть на айфоне
 * камеры тут не будет. Альтернатива - вшить декодер на wasm, а это лишние
 * сотни килобайт в бандле, который собирается одним куском; решение того
 * стоит не всегда, и принимать его молча нельзя.
 *
 * Поэтому ручной ввод цифр доступен ВСЕГДА, а не только как запасной путь:
 * тринадцать цифр с упаковки вводятся за двадцать секунд, и это работает
 * на любом устройстве.
 */
function detectorAvailable(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

type Detector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

type Ctor = new (options: { formats: string[] }) => Detector

/**
 * Сканирование штрихкода.
 *
 * Смысл не в камере, а в том, что после ПЕРВОГО распознавания продукт
 * становится своим: код сохраняется рядом с ним, и во второй раз он находится
 * в собственной базе - мгновенно, без сети и без чужого сервиса. Внешний
 * справочник нужен ровно один раз на продукт.
 */
export function BarcodeScanner({
  open,
  onClose,
  onCode,
}: {
  open: boolean
  onClose: () => void
  onCode: (code: string) => void
}) {
  const t = useT()
  const [manual, setManual] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const canScan = detectorAvailable()

  useEffect(() => {
    if (!open || !canScan) return
    let stream: MediaStream | null = null
    let stopped = false

    const run = async (): Promise<void> => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (stopped) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        const el = videoRef.current
        if (el) {
          el.srcObject = stream
          await el.play()
        }

        const Detector = (window as unknown as { BarcodeDetector: Ctor }).BarcodeDetector
        const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })

        const tick = async (): Promise<void> => {
          if (stopped || !videoRef.current) return
          try {
            const found = await detector.detect(videoRef.current)
            const code = found[0]?.rawValue
            if (code !== undefined && /^[0-9]{8,14}$/.test(code)) {
              onCode(code)
              return
            }
          } catch {
            // Один неудачный кадр - не повод останавливать съёмку
          }
          setTimeout(() => void tick(), 300)
        }
        void tick()
      } catch (e) {
        setCamError(e instanceof Error ? e.message : String(e))
      }
    }

    void run()
    return () => {
      stopped = true
      // Камеру обязательно гасим: иначе индикатор остаётся гореть
      // и после закрытия шторки
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [open, canScan, onCode])

  if (!open) return null

  const digits = manual.replace(/\D/g, '')
  const ready = digits.length >= 8 && digits.length <= 14

  return (
    <Sheet open onClose={onClose} title={t('scan.title')}>
      <div className="flex flex-col gap-4">
        {canScan && camError === null && (
          <div className="overflow-hidden rounded-xl bg-ink/90">
            {/* playsInline обязателен: без него iOS открывает видео
                во весь экран своим проигрывателем */}
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-56 w-full object-cover"
              aria-label={t('scan.camera')}
            />
          </div>
        )}

        {!canScan && <p className="text-sm text-muted">{t('scan.noCamera')}</p>}
        {camError !== null && <p className="text-sm text-danger">{camError}</p>}

        <Field
          label={t('scan.manual')}
          value={manual}
          inputMode="numeric"
          placeholder="4600000000000"
          onChange={(e) => setManual(e.target.value.replace(/\D/g, '').slice(0, 14))}
        />

        <Button disabled={!ready} onClick={() => onCode(digits)}>
          <ScanLine size={18} aria-hidden />
          {t('scan.find')}
        </Button>

        <p className="text-xs text-muted">{t('scan.privacy')}</p>
      </div>
    </Sheet>
  )
}
