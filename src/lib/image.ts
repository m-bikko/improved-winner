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

import { tr } from '@/lib/i18n'
import { activeLocale } from '@/lib/i18n/lang'

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
    throw new Error(tr('img.notImage'))
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
  maxBytes: number = MAX_BYTES,
  steps: readonly number[] = QUALITY_STEPS,
): Promise<{ blob: Blob; extension: 'webp' | 'jpg' }> {
  for (const quality of steps) {
    const blob = await encode(canvas, 'image/webp', quality)
    if (blob && blob.type === 'image/webp') {
      if (blob.size <= maxBytes) return { blob, extension: 'webp' }
      continue
    }
    const jpeg = await encode(canvas, 'image/jpeg', quality)
    if (jpeg && jpeg.size <= maxBytes) return { blob: jpeg, extension: 'jpg' }
  }

  // Ни одно качество не влезло - редкость, но отдать что-то надо.
  // Берём самое низкое: лучше зернистая картинка, чем отказ загрузить.
  const webp = await encode(canvas, 'image/webp', 0.35)
  const fallback = webp && webp.type === 'image/webp' ? webp : await encode(canvas, 'image/jpeg', 0.35)
  if (!fallback) throw new Error(tr('img.compressFailed'))
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
  if (!ctx) throw new Error(tr('img.noCanvas'))
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
    if (!ctx) throw new Error(tr('img.noCanvas'))
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)

    const { blob, extension } = await encodeWithinBudget(canvas)
    return { blob, extension, ...size }
  } finally {
    bitmap.close()
  }
}

// ---------------------------------------------------------------------------
// Фотографии воспоминаний.
//
// В отличие от продуктов, снимок здесь рассматривают - во весь экран, двумя
// пальцами. Поэтому размеров три, и каждый грузится только тогда, когда нужен:
//
//   полный   1600 px, до 380 КБ  - только в просмотре во весь экран;
//   превью    640 px, до 70 КБ   - в ленте: плитка мозаики на телефоне
//                                   с тройной плотностью уже не просит больше;
//   заглушка   16 px, ~0.5 КБ    - data URL прямо в строке базы: лента
//                                   рисуется размытыми пятнами нужных
//                                   пропорций до первого запроса к хранилищу.
//
// Снимок с телефона 3-8 МБ превращается в 200-400 КБ на всё вместе.

const MEMORY_FULL = { side: 1600, bytes: 380 * 1024, steps: [0.82, 0.74, 0.66, 0.58, 0.5] } as const
const MEMORY_THUMB = { side: 640, bytes: 70 * 1024, steps: [0.74, 0.64, 0.55, 0.46] } as const
const PLACEHOLDER_SIDE = 16

export type MemoryImage = {
  full: PreparedImage
  thumb: PreparedImage
  /** data URL заглушки, ~0.5 КБ. */
  placeholder: string
}

function scaleTo(width: number, height: number, side: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= side) return { width, height }
  const k = side / longest
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

function drawScaled(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(tr('img.noCanvas'))
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return canvas
}

/**
 * Три размера из одного снимка.
 *
 * Каждый следующий рисуется из предыдущего, а не из оригинала: уменьшение
 * 4032 → 640 за один шаг даёт муар на мелких деталях (браузер берёт
 * не все пиксели), ступенями - заметно чище. И быстрее: оригинал
 * декодируется один раз.
 */
export async function prepareMemoryImage(file: File): Promise<MemoryImage> {
  const bitmap = await loadBitmap(file)
  try {
    const fullSize = scaleTo(bitmap.width, bitmap.height, MEMORY_FULL.side)
    const fullCanvas = drawScaled(bitmap, fullSize.width, fullSize.height)
    const full = await encodeWithinBudget(fullCanvas, MEMORY_FULL.bytes, MEMORY_FULL.steps)

    const thumbSize = scaleTo(fullSize.width, fullSize.height, MEMORY_THUMB.side)
    const thumbCanvas = drawScaled(fullCanvas, thumbSize.width, thumbSize.height)
    const thumb = await encodeWithinBudget(thumbCanvas, MEMORY_THUMB.bytes, MEMORY_THUMB.steps)

    const tiny = scaleTo(thumbSize.width, thumbSize.height, PLACEHOLDER_SIDE)
    const tinyCanvas = drawScaled(thumbCanvas, tiny.width, tiny.height)
    // Как и у больших размеров, проверяем фактический тип: без WebP браузер
    // молча отдал бы PNG, а он у фото в разы тяжелее
    const webp = tinyCanvas.toDataURL('image/webp', 0.5)
    const placeholder = webp.startsWith('data:image/webp') ? webp : tinyCanvas.toDataURL('image/jpeg', 0.5)

    return {
      full: { ...full, ...fullSize },
      thumb: { ...thumb, ...thumbSize },
      placeholder,
    }
  } finally {
    bitmap.close()
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${tr('unit.byte')}`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${tr('unit.kb')}`
  // Десятичный знак языка: «1,5 МБ», а не «1.5 МБ»
  const mb = new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))
  return `${mb} ${tr('unit.mb')}`
}
