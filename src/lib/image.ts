/**
 * Подготовка фотографии продукта к загрузке.
 *
 * Фотография с телефона это 3–8 МБ. Хранить такое незачем: снимок нужен, чтобы
 * узнать банку на полке, а не рассматривать её. Поэтому картинка ужимается
 * до 512 пикселей по длинной стороне и кодируется в WebP — выходит ~40–80 КБ,
 * то есть в полсотни раз меньше оригинала.
 *
 * Перекодирование заодно выбрасывает EXIF. Это важнее, чем кажется: телефоны
 * пишут туда координаты съёмки, и без перекодирования GPS точки, где вы
 * фотографировали свой холодильник, уезжали бы в хранилище вместе с картинкой.
 */

/** Длинная сторона. 512 хватает карточке на экране с тройной плотностью. */
const MAX_SIDE = 512

/** Потолок результата. Дальше качество снижается, пока не уложимся. */
const MAX_BYTES = 110 * 1024

/** Пробуем по убыванию: первое, что влезло в потолок, и берём. */
const QUALITY_STEPS = [0.72, 0.6, 0.5, 0.42] as const

export type PreparedImage = {
  blob: Blob
  /** Расширение под фактический тип: webp там, где браузер умеет, иначе jpeg. */
  extension: 'webp' | 'jpg'
  width: number
  height: number
}

function targetSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  // Не увеличиваем: растянутая маленькая картинка это те же данные, только тяжелее
  if (longest <= MAX_SIDE) return { width, height }
  const scale = MAX_SIDE / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Это не изображение')
  }

  // imageOrientation: 'from-image' разворачивает снимок по EXIF. Без этого
  // фотографии с телефона лежат на боку — камера пишет ориентацию в метаданные,
  // а не в сами пиксели.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

  try {
    const size = targetSize(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Браузер не дал холст для обработки картинки')
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)

    for (const quality of QUALITY_STEPS) {
      const blob = await encode(canvas, 'image/webp', quality)
      // Браузер без поддержки WebP в toBlob молча отдаёт PNG — а PNG для
      // фотографии это мегабайты. Поэтому проверяем фактический тип, а не
      // надеемся на запрошенный.
      if (blob && blob.type === 'image/webp') {
        if (blob.size <= MAX_BYTES) return { blob, extension: 'webp', ...size }
        continue
      }

      const jpeg = await encode(canvas, 'image/jpeg', quality)
      if (jpeg && jpeg.size <= MAX_BYTES) return { blob: jpeg, extension: 'jpg', ...size }
    }

    // Ни одно качество не влезло — редкость, но отдать что-то надо.
    // Берём самое низкое: лучше зернистая картинка, чем отказ загрузить.
    const fallback =
      (await encode(canvas, 'image/webp', 0.35)) ?? (await encode(canvas, 'image/jpeg', 0.35))
    if (!fallback) throw new Error('Не удалось сжать изображение')
    return {
      blob: fallback,
      extension: fallback.type === 'image/webp' ? 'webp' : 'jpg',
      ...size,
    }
  } finally {
    bitmap.close()
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}
