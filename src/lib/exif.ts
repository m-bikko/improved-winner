/**
 * Дата съёмки из EXIF - чтобы воспоминание само встало на свой день.
 *
 * Читается ДО перекодирования: холст выбрасывает EXIF целиком (это и нужно -
 * вместе с ним уходят координаты съёмки), и после него даты уже нет.
 *
 * Только JPEG. iPhone при выборе фото из галереи по умолчанию отдаёт JPEG
 * (HEIC перекодируется в «наиболее совместимый» формат), Android - тоже.
 * Для остального вернётся null, и дату человек выберет сам.
 *
 * Разбор ручной и маленький: нужна одна строка из одного тега, а библиотека
 * EXIF на сотню килобайт ради неё - перебор. Каждое чтение проверяет
 * границы: битый файл должен давать null, а не исключение.
 */

/** Сколько читать с начала файла: APP1 с EXIF стоит в самом начале. */
const HEAD_BYTES = 256 * 1024

const TAG_DATETIME = 0x0132
const TAG_EXIF_IFD = 0x8769
const TAG_DATETIME_ORIGINAL = 0x9003

export async function readExifDate(file: Blob): Promise<string | null> {
  try {
    const buffer = await file.slice(0, HEAD_BYTES).arrayBuffer()
    return exifDateFrom(new DataView(buffer))
  } catch {
    return null
  }
}

/** Чистая функция над байтами - её и проверяет check-memories. */
export function exifDateFrom(view: DataView): string | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null
    const marker = view.getUint8(offset + 1)
    const size = view.getUint16(offset + 2)
    // Начало сжатых данных - дальше маркеров с метаданными не будет
    if (marker === 0xda) return null
    if (marker === 0xe1 && isExifHeader(view, offset + 4)) {
      return fromTiff(view, offset + 10, offset + 2 + size)
    }
    offset += 2 + size
  }
  return null
}

function isExifHeader(view: DataView, at: number): boolean {
  if (at + 6 > view.byteLength) return false
  // "Exif\0\0"
  return (
    view.getUint8(at) === 0x45 &&
    view.getUint8(at + 1) === 0x78 &&
    view.getUint8(at + 2) === 0x69 &&
    view.getUint8(at + 3) === 0x66 &&
    view.getUint8(at + 4) === 0 &&
    view.getUint8(at + 5) === 0
  )
}

function fromTiff(view: DataView, tiff: number, end: number): string | null {
  const limit = Math.min(end, view.byteLength)
  if (tiff + 8 > limit) return null
  const order = view.getUint16(tiff)
  const little = order === 0x4949
  if (!little && order !== 0x4d4d) return null

  const u16 = (at: number) => (at + 2 <= limit ? view.getUint16(at, little) : null)
  const u32 = (at: number) => (at + 4 <= limit ? view.getUint32(at, little) : null)

  /** Значение тега в IFD: число (для указателя) или строка (для даты). */
  const findTag = (ifd: number, tag: number): number | null => {
    const count = u16(ifd)
    if (count === null) return null
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12
      if (u16(entry) === tag) return entry
    }
    return null
  }

  const readAscii = (entry: number): string | null => {
    const length = u32(entry + 4)
    if (length === null || length < 19) return null
    // Строка длиннее четырёх байт лежит по смещению, а не в самой записи
    const at = length > 4 ? u32(entry + 8) : null
    if (at === null) return null
    const start = tiff + at
    if (start + 19 > limit) return null
    let text = ''
    for (let i = 0; i < 19; i++) text += String.fromCharCode(view.getUint8(start + i))
    return text
  }

  const ifd0Offset = u32(tiff + 4)
  if (ifd0Offset === null) return null
  const ifd0 = tiff + ifd0Offset

  // Сначала момент съёмки из Exif IFD - он не меняется при редактировании.
  // DateTime в IFD0 - запасной: его переписывает любой редактор
  let raw: string | null = null
  const exifPointer = findTag(ifd0, TAG_EXIF_IFD)
  if (exifPointer !== null) {
    const exifOffset = u32(exifPointer + 8)
    if (exifOffset !== null) {
      const entry = findTag(tiff + exifOffset, TAG_DATETIME_ORIGINAL)
      if (entry !== null) raw = readAscii(entry)
    }
  }
  if (raw === null) {
    const entry = findTag(ifd0, TAG_DATETIME)
    if (entry !== null) raw = readAscii(entry)
  }
  return raw === null ? null : toIsoDate(raw)
}

/** "2026:09:30 07:29:00" → "2026-09-30". Пустые нули камеры - null. */
function toIsoDate(raw: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(raw)
  if (!m) return null
  const [, y, mo, d] = m
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${y}-${mo}-${d}`
}
