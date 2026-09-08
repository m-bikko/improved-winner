/**
 * Подготовка фотографии продукта к загрузке.
 *
 * Фотография с телефона это 3-8 МБ. Хранить такое незачем: снимок нужен, чтобы
 * узнать банку на полке, а не рассматривать её. Поэтому картинка ужимается
 * до 512 пикселей по длинной стороне и кодируется в WebP - выходит ~40-80 КБ,
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

/**
 * Снимок с телефона, развёрнутый по EXIF.
 *
 * Вынесено отдельно, потому что кадрирование показывает ту же картинку
 * на экране, а потом режет её же. Разверни их по-разному - и человек получит
 * не тот кусок, который выбирал.
 */
export async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Это не изображение')
  }
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

/**
 * Кодирование холста с подбором качества.
 *
 * Пробуем WebP по убыванию, пока не влезем в потолок; при отсутствии
 * поддержки откатываемся на JPEG. Проверяем фактический тип блоба,
 * а не запрошенный: браузер без WebP молча отдаёт PNG, а PNG для
 * фотографии это мегабайты.
 */
async function encodeWithinBudget(
  canvas: HTMLCanvasElement,
): Promise<{ blob: Blob; extension: 'webp' | 'jpg' }> {
  for (const quality of QUALITY_STEPS) {
    const blob = await encode(canvas, 'image/webp', quality)
    if (blob && blob.type === 'image/webp') {
      if (blob.size <= MAX_BYTES) return { blob, extension: 'webp' }
      continue
    }
    const jpeg = await encode(canvas, 'image/jpeg', quality)
    if (jpeg && jpeg.size <= MAX_BYTES) return { blob: jpeg, extension: 'jpg' }
  }

  // Ни одно качество не влезло - редкость, но отдать что-то надо.
  // Берём самое низкое: лучше зернистая картинка, чем отказ загрузить.
  const fallback =
    (await encode(canvas, 'image/webp', 0.35)) ?? (await encode(canvas, 'image/jpeg', 0.35))
  if (!fallback) throw new Error('Не удалось сжать изображение')
  return { blob: fallback, extension: fallback.type === 'image/webp' ? 'webp' : 'jpg' }
}

/** Квадрат в координатах исходной картинки. */
export type SquareCrop = { x: number; y: number; side: number }

/**
 * Кадр по центру и кратности приближения.
 *
 * Чистая функция, а не метод компонента, потому что ошибиться тут легко,
 * а увидеть ошибку - нет: кадр, уехавший за край, браузер дорисует прозрачным,
 * и в углу картинки окажется дыра, которую заметишь уже в готовом файле.
 *
 * Кратность 1 - это вписанный квадрат по короткой стороне: больше из картинки
 * всё равно не вырезать, поэтому отдалять некуда.
 */
export function squareCrop(
  imageWidth: number,
  imageHeight: number,
  center: { x: number; y: number },
  zoom: number,
): SquareCrop {
  const side = Math.min(imageWidth, imageHeight) / Math.max(zoom, 1)
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max)
  return {
    x: clamp(center.x - side / 2, imageWidth - side),
    y: clamp(center.y - side / 2, imageHeight - side),
    side,
  }
}

/**
 * Сколько пикселей исходника приходится на пиксель экрана.
 *
 * Нужно, чтобы палец двигал картинку ровно за собой: при десятикратном
 * приближении тот же сдвиг пальца обязан смещать кадр вдесятеро меньше.
 */
export function sourcePerScreenPx(
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  boxPx: number,
): number {
  return Math.min(imageWidth, imageHeight) / Math.max(zoom, 1) / Math.max(boxPx, 1)
}

/**
 * Вырезает квадрат и кодирует его.
 *
 * Сторона не растягивается вверх: если человек приблизил так, что в кадр
 * попало 200 пикселей исходника, честнее отдать 200, чем растянуть их
 * до 512 и сделать вид, что картинка чёткая.
 */
export async function prepareSquare(bitmap: ImageBitmap, crop: SquareCrop): Promise<PreparedImage> {
  const side = Math.min(Math.round(crop.side), MAX_SIDE)
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Браузер не дал холст для обработки картинки')
  ctx.drawImage(bitmap, crop.x, crop.y, crop.side, crop.side, 0, 0, side, side)

  const { blob, extension } = await encodeWithinBudget(canvas)
  return { blob, extension, width: side, height: side }
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file)

  try {
    const size = targetSize(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Браузер не дал холст для обработки картинки')
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)

    const { blob, extension } = await encodeWithinBudget(canvas)
    return { blob, extension, ...size }
  } finally {
    bitmap.close()
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}
