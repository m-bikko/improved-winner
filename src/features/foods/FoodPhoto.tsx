import { useT } from '@/lib/i18n'
import { useRef, useState } from 'react'
import { Apple, Camera, CookingPot, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react'
import { formatBytes } from '@/lib/image'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { useFoodPhotoUrls, useRemoveFoodPhoto, useUploadFoodPhoto } from './api'
import type { FoodKind } from './types'

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
      <Card as="section" className="flex items-center gap-3 p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-raised text-muted">
          <ImagePlus size={20} aria-hidden />
        </span>
        <p className="min-w-0 flex-1 text-sm text-muted">{t('food.photoAfterSave')}</p>
      </Card>
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
    <Card as="section" className="flex flex-col gap-3 p-4">
      <h2 className="font-display text-[17px] font-bold">{t('food.photo')}</h2>

      <div className="flex items-center gap-4">
        {/* Превью - кнопкой: по крупному квадрату попасть легче, чем по надписи */}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={upload.isPending}
          aria-label={t(imagePath ? 'food.replacePhoto' : 'food.addPhoto')}
          className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-raised
                     text-muted transition-transform active:scale-95"
        >
          {upload.isPending ? (
            <LoaderCircle size={22} className="animate-spin" aria-hidden />
          ) : url ? (
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus size={24} aria-hidden />
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Button
            variant="soft"
            className="min-h-11 px-4 text-[15px]"
            onClick={() => input.current?.click()}
            loading={upload.isPending}
          >
            <Camera size={18} aria-hidden />
            {t(imagePath ? 'food.replacePhoto' : 'food.addPhoto')}
          </Button>

          {imagePath && (
            <Button
              variant="danger"
              className="min-h-11 px-4 text-[15px]"
              loading={remove.isPending}
              onClick={() => void remove.mutateAsync({ foodId, path: imagePath })}
            >
              <Trash2 size={17} aria-hidden />
              {t('common.delete')}
            </Button>
          )}
        </div>
      </div>

      {savedSize && (
        <p className="text-[13px] text-muted">
          {t('food.shrunk', {
            from: formatBytes(savedSize.from),
            to: formatBytes(savedSize.to),
          })}
        </p>
      )}
      {error && <p className="text-[13px] text-danger">{error}</p>}

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
    </Card>
  )
}

/**
 * Квадратное превью для списков.
 *
 * Без фото - значок вида записи, а не «картинки нет»: у большинства продуктов
 * фото нет вовсе, и колонка перечёркнутых картинок читалась как поломка.
 * Подложка нейтральная, а не зелёная: настоящие фотографии должны
 * выделяться среди заглушек, а не тонуть в тридцати одинаковых значках.
 */
export function FoodThumb({
  url,
  size = 44,
  kind = 'product',
}: {
  url: string | undefined
  size?: number
  kind?: FoodKind | undefined
}) {
  const Icon = kind === 'dish' ? CookingPot : Apple
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-raised"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <Icon size={Math.round(size * 0.42)} className="text-muted/70" />
      )}
    </span>
  )
}
