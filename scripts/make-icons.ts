/**
 * Генерирует знак приложения: public/favicon.svg и PNG-иконки.
 *
 *   pnpm tsx scripts/make-icons.ts
 *
 * Запускается редко — только когда меняется сам знак. Результат лежит
 * в public/ и коммитится: собирать иконки на каждом деплое незачем.
 *
 * favicon.svg пишется этим же скриптом, а не правится руками: раньше контур
 * был продублирован здесь и в файле, и разъехаться они могли молча.
 *
 * Три размера не от любви к круглым числам:
 *   192/512 — то, что требует манифест для установки на Android;
 *   maskable — Android обрезает иконку под форму системы, поэтому рисунок
 *              внутри ужат до безопасной зоны (66% ширины);
 *   apple-touch — iOS не читает manifest.icons и берёт только этот файл,
 *              причём без прозрачности: фон обязан быть залит.
 *
 * Названия в знаке нет намеренно: имя приложения настраивается сборкой
 * (VITE_PUBLIC_APP_NAME), и надпись на иконке пришлось бы перерисовывать
 * вместе с ним.
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')

const ACCENT = '#b4485f'

/**
 * Два сцепленных круга в поле 64×64 — «тандем», двое вместе.
 *
 * Пересечение залито: без него два контура читаются как просто два кружка,
 * а с ним — как связка. Заливка сделана clip-path'ом от левого круга, чтобы
 * не считать руками координаты линзы и не расходиться с контурами.
 *
 * `id` уникален на файл: в одном документе несколько знаков не бывает,
 * но пусть попытка вставить их рядом не ломала бы отсечение.
 */
function mark(id: string): string {
  return `<g fill="none" stroke="#fff" stroke-width="5.5">
    <defs><clipPath id="${id}"><circle cx="22" cy="32" r="12"/></clipPath></defs>
    <circle cx="42" cy="32" r="12" fill="#fff" stroke="none" clip-path="url(#${id})"/>
    <circle cx="22" cy="32" r="12"/>
    <circle cx="42" cy="32" r="12"/>
  </g>`
}

function iconSvg(size: number, inset: number, id: string): string {
  const scale = inset / 64
  const offset = (size - 64 * scale) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${ACCENT}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${mark(id)}</g>
</svg>`
}

/** Скруглённый квадрат — favicon показывается на своей подложке во вкладке. */
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Знак приложения">
  <rect width="64" height="64" rx="14" fill="${ACCENT}"/>
  ${mark('favicon-link')}
</svg>
`

const TARGETS = [
  // размер, доля рисунка от полотна, имя файла
  { size: 192, inset: 128, name: 'icon-192.png' },
  { size: 512, inset: 340, name: 'icon-512.png' },
  // Безопасная зона maskable: рисунок укладывается в центральные 66%
  { size: 512, inset: 250, name: 'icon-maskable-512.png' },
  { size: 180, inset: 120, name: 'apple-touch-icon.png' },
] as const

async function main(): Promise<void> {
  await writeFile(join(PUBLIC, 'favicon.svg'), FAVICON)
  console.log('  favicon.svg')

  for (const target of TARGETS) {
    const svg = iconSvg(target.size, target.inset, `m${target.size}-${target.inset}`)
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    await writeFile(join(PUBLIC, target.name), png)
    console.log(`  ${target.name}  ${target.size}×${target.size}`)
  }
  console.log('\nЗнак готов.')
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
