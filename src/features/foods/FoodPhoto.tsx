import { useT } from '@/lib/i18n'
import { useRef, useState } from 'react'
import { Camera, ImageOff, LoaderCircle, Trash2 } from 'lucide-react'
import { formatBytes } from '@/lib/image'
import { Button } from '@/ui/Button'
import { useFoodPhotoUrls, useRemoveFoodPhoto, useUploadFoodPhoto } from './api'

/**
 * Загрузка фотографии продукта.
 *
 * Кнопка появляется только у сохранённого продукта: путь в хранилище строится
 * от его id, а до сохранения id ещё нет. Иначе пришлось бы держать файл
 * в памяти и досылать после сохранения - лишняя ветка ради редкого сценария.
 */
export function FoodPhotoEditor({
  foodId,
  imagePath,
}: {
  foodId: string | undefined
  imagePath: string | null
}) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploadFoodPhoto()
  const remove = useRemoveFoodPhoto()
  const [error, setError] = useState<string | null>(null)
  const [savedSize, setSavedSize] = useState<{ from: number; to: number } | null>(null)

  const urls = useFoodPhotoUrls(imagePath ? [imagePath] : [])
  const url = imagePath ? urls.data?.[imagePath] : undefined

  if (!foodId) {
    return (
      <p className="rounded-xl bg-raised px-4 py-3 text-sm text-muted">
        {t('food.photoAfterSave')}
      </p>
    )
  }

  const pick = async (file: File) => {
    setError(null)
    setSavedSize(null)
    try {
      const result = await upload.mutateAsync({ foodId, file, previousPath: imagePath })
      setSavedSize({ from: file.size, to: result.bytes })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t('food.photo')}</p>

      <div className="flex items-center gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-raised ring-1 ring-line">
          {upload.isPending ? (
            <LoaderCircle size={20} className="animate-spin text-muted" aria-hidden />
          ) : url ? (
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <ImageOff size={20} className="text-muted" aria-hidden />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Button variant="secondary" onClick={() => input.current?.click()} loading={upload.isPending}>
            <Camera size={18} aria-hidden />
            {t(imagePath ? 'food.replacePhoto' : 'food.addPhoto')}
          </Button>

          {imagePath && (
            <button
              type="button"
              onClick={() => void remove.mutateAsync({ foodId, path: imagePath })}
              className="flex items-center gap-1.5 self-start px-1 py-1 text-sm text-muted"
            >
              <Trash2 size={15} aria-hidden />
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>

      {savedSize && (
        <p className="text-xs text-muted">
          {t('food.shrunk', {
            from: formatBytes(savedSize.from),
            to: formatBytes(savedSize.to),
          })}
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Сбрасываем значение, иначе повторный выбор того же файла
          // не вызовет change и «замена» ничего не сделает
          e.target.value = ''
          if (file) void pick(file)
        }}
      />
    </div>
  )
}

/** Квадратное превью для списков. */
export function FoodThumb({ url, size = 40 }: { url: string | undefined; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-raised"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <ImageOff size={size * 0.4} className="text-muted/60" aria-hidden />
      )}
    </span>
  )
}
