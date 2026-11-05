// node sheet.mjs <dir> <out> a.png b.png ...  - контактный лист по 6 в ряд
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
const require = createRequire(ROOT)
const sharp = require('sharp')
const [dir, out, ...names] = process.argv.slice(2)
const W = 300, H = 650, GAP = 8, COLS = Number(process.env.COLS ?? 6)
const list = names.filter((n) => existsSync(`${dir}/${n}.png`))
const rows = Math.ceil(list.length / COLS)
const items = await Promise.all(list.map(async (n, i) => ({
  input: await sharp(`${dir}/${n}.png`).resize(W, H, { fit: 'cover', position: 'top' }).toBuffer(),
  left: (i % COLS) * (W + GAP), top: Math.floor(i / COLS) * (H + GAP),
})))
await sharp({ create: { width: COLS * (W + GAP) - GAP, height: rows * (H + GAP) - GAP, channels: 3, background: '#888' } }).composite(items).png().toFile(out)
