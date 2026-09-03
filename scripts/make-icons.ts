/**
 * Генерирует PNG-иконки приложения из SVG.
 *
 *   pnpm tsx scripts/make-icons.ts
 *
 * Запускается редко — только когда меняется сама иконка. Результат лежит
 * в public/ и коммитится: собирать иконки на каждом деплое незачем.
 *
 * Три размера не от любви к круглым числам:
 *   192/512 — то, что требует манифест для установки на Android;
 *   maskable — Android обрезает иконку под форму системы, поэтому рисунок
 *              внутри ужат до безопасной зоны (66% ширины), иначе у сердца
 *              отрежет края;
 *   apple-touch — iOS не читает manifest.icons и берёт только этот файл,
 *              причём без прозрачности: фон обязан быть залит.
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')

const ACCENT = '#b4485f'

function icon(size: number, inset: number): string {
  const scale = inset / 64
  const offset = (size - 64 * scale) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${ACCENT}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <path d="M32 50.5C32 50.5 11 37.2 11 24.2 11 17 16.6 11.5 23.4 11.5c4.2 0 7.2 2.1 8.6 4.6 1.4-2.5 4.4-4.6 8.6-4.6C47.4 11.5 53 17 53 24.2c0 13-21 26.3-21 26.3Z"
          fill="#fff"/>
  </g>
</svg>`
}

const TARGETS = [
  // размер, доля рисунка от полотна, имя файла
  { size: 192, inset: 128, name: 'icon-192.png' },
  { size: 512, inset: 340, name: 'icon-512.png' },
  // Безопасная зона maskable: рисунок укладывается в центральные 66%
  { size: 512, inset: 250, name: 'icon-maskable-512.png' },
  { size: 180, inset: 120, name: 'apple-touch-icon.png' },
] as const

async function main(): Promise<void> {
  for (const target of TARGETS) {
    const png = await sharp(Buffer.from(icon(target.size, target.inset))).png().toBuffer()
    await writeFile(join(PUBLIC, target.name), png)
    console.log(`  ${target.name}  ${target.size}×${target.size}`)
  }
  console.log('\nИконки готовы.')
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
