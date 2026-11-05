// Обход всех экранов: скриншот и автоматические проверки на каждом.
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
// node walk.mjs <base> <outDir> [light|dark] [width] [routeFilter]
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire(process.env.HOME + '/.claude/skills/playwright-skill/')
const { chromium } = require('playwright')
const [base, outDir, scheme = 'light', widthArg = '390', filter = ''] = process.argv.slice(2)
const ENV = process.env.QA_ENV ?? `${ROOT}/.env.demo`
const pin = (readFileSync(ENV, 'utf8').match(new RegExp(`^${process.env.QA_PIN ?? 'LOVE_PIN_BIKOSH'}=(.*)$`, 'm'))?.[1] ?? '').replace(/["'\s]/g, '')
const ROUTES = ['/today','/more','/diary','/checkin','/profile','/question','/shots','/voice','/meetings','/memories','/story','/ideas','/places','/quiz','/watch','/challenges','/savings','/topics','/pulse','/pause','/agreements','/prep','/pregnancy','/names','/tasks','/foods','/foods/new','/cycle','/cycle/report','/cycle/library','/dates','/wishlist','/health','/week','/year','/notifications','/month']
mkdirSync(outDir, { recursive: true })
const width = Number(widthArg)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: scheme, reducedMotion: process.env.QA_REDUCED ? 'reduce' : 'no-preference', contrast: process.env.QA_CONTRAST ? 'more' : 'no-preference', locale: 'ru-RU', timezoneId: 'Asia/Almaty', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })
const page = await ctx.newPage()
let current = ''
const problems = []
page.on('pageerror', (e) => problems.push({ route: current, kind: 'pageerror', detail: e.message.slice(0, 200) }))
page.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap|Failed to load resource/.test(m.text())) problems.push({ route: current, kind: 'console', detail: m.text().slice(0, 200) }) })
await page.goto(base + '/today')
await page.waitForTimeout(800)
const pad = page.getByRole('button', { name: '1', exact: true })
if (!(await pad.count())) await page.getByRole('button').first().click()
await page.waitForTimeout(400)
for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
await page.waitForTimeout(2500)

const audit = () => {
  const out = { overflow: document.documentElement.scrollWidth - innerWidth, small: [], clipped: [], offscreen: [], emptyButtons: [], h: document.documentElement.scrollHeight }
  const hasHit = (el) => { const a = getComputedStyle(el, '::after'); return a.content !== 'none' && parseFloat(a.top) < 0 }
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 34)
  for (const el of document.querySelectorAll('a[href],button,input,select,textarea,[role=button],[role=switch],[role=tab]')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none' || el.closest('.leaflet-control-attribution')) continue
    if (el.disabled) continue
    if (r.left < -1 || r.right > innerWidth + 1) { if (!el.closest('[class*=overflow-x]')) out.offscreen.push(name(el)) }
    if (Math.min(r.width, r.height) < 40 && el.tagName !== 'INPUT' && !hasHit(el)) {
      const isInlineLink = el.tagName === 'A' && s.display === 'inline'
      if (!isInlineLink) out.small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    if (!name(el) && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && el.tagName !== 'SELECT') out.emptyButtons.push(el.outerHTML.slice(0, 80))
  }
  for (const el of document.querySelectorAll('main *, header *')) {
    if (el.children.length) continue
    const s = getComputedStyle(el)
    if (!el.closest('.sr-only') && s.overflow === 'hidden' && !s.textOverflow.includes('ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim()) out.clipped.push(el.textContent.trim().slice(0, 40))
  }
  return out
}
const rows = []
for (const route of ROUTES.filter((r) => r.includes(filter))) {
  current = route
  await page.goto(base + route, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(Number(process.env.QA_WAIT ?? 1300))
  const file = route.slice(1).replace(/\//g, '-')
  await page.screenshot({ path: `${outDir}/${file}.png` })
  const a = await page.evaluate(audit)
  rows.push({ route, ...a })
}
await browser.close()
const summary = rows.map((r) => {
  const bad = []
  if (r.overflow > 0) bad.push(`ПЕРЕПОЛНЕНИЕ +${r.overflow}px`)
  if (r.offscreen.length) bad.push(`за экраном: ${[...new Set(r.offscreen)].slice(0, 4).join(' | ')}`)
  if (r.small.length) bad.push(`мелкие цели (${r.small.length}): ${[...new Set(r.small)].slice(0, 5).join(' | ')}`)
  if (r.clipped.length) bad.push(`обрезано: ${[...new Set(r.clipped)].slice(0, 3).join(' | ')}`)
  if (r.emptyButtons.length) bad.push(`кнопки без имени: ${r.emptyButtons.length}`)
  return `${r.route.padEnd(16)} ${bad.join(' ; ') || 'ok'}`
})
const text = summary.join('\n') + '\n\nОшибки страницы:\n' + (problems.map((p) => `${p.route} ${p.kind}: ${p.detail}`).join('\n') || 'нет') + '\n'
writeFileSync(`${outDir}/report.txt`, text)
console.log(text)
