// Вход и режим повара на локальном стеке.
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
const require = createRequire(process.env.HOME + '/.claude/skills/playwright-skill/')
const { chromium } = require('playwright')
const base = 'http://localhost:5199', out = process.argv[2] ?? '/tmp/qa2'
mkdirSync(out, { recursive: true })
const env = readFileSync(`${ROOT}/.env.demo`, 'utf8')
const pin = (env.match(/^LOVE_PIN_BIKOSH=(.*)$/m)?.[1] ?? '').replace(/["'\s]/g, '')
const sql = (q) => execSync(`TANDEM_ENV_FILE=.env.demo npx tsx scripts/sql.ts ${JSON.stringify(q)}`, { cwd: ROOT, encoding: 'utf8' })
let passed = 0, failed = 0; const fails = []
const ok = (c, n, d = '') => { c ? passed++ : (failed++, fails.push(n)); console.log(`${c ? '  ok ' : 'FAIL '} ${n}${d ? '  - ' + d : ''}`) }
const browser = await chromium.launch()
const mk = async (extra = {}) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'ru-RU', timezoneId: 'Asia/Almaty', ...extra }); const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 160))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|tile\.openstreetmap/.test(m.text())) errors.push(m.text().slice(0, 160)) }); return { ctx, page, errors } }

console.log('# Вход')
{
  const { page, errors, ctx } = await mk()
  await page.goto(base + '/today'); await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}/login-who.png` })
  ok((await page.getByRole('button', { name: /Бикош/ }).count()) === 1, 'Экран выбора человека')
  await page.getByRole('button', { name: /Бикош/ }).click(); await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/login-pin.png` })
  const keys = await page.getByRole('button', { name: '5', exact: true }).boundingBox()
  ok(keys.width >= 60 && keys.height >= 60, 'Клавиши PIN большие', `${Math.round(keys.width)}x${Math.round(keys.height)}`)
  const wrong = pin.split('').map((d) => String((Number(d) + 1) % 10)).join('')
  for (const d of wrong) await page.getByRole('button', { name: d, exact: true }).click()
  await page.waitForTimeout(1200)
  ok((await page.getByRole('button', { name: '1', exact: true }).count()) === 1, 'Неверный PIN не пускает')
  await page.screenshot({ path: `${out}/login-wrong.png` })
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
  await page.waitForTimeout(2200)
  ok(page.url().includes('/today') && (await page.getByRole('navigation').count()) >= 1, 'Верный PIN пускает')
  // Выход из «Ещё» требует второго нажатия
  await page.goto(base + '/more'); await page.waitForTimeout(900)
  await page.getByRole('button', { name: 'Выйти' }).scrollIntoViewIfNeeded(); await page.getByRole('button', { name: 'Выйти' }).click(); await page.waitForTimeout(300)
  ok((await page.getByRole('button', { name: 'Нажми ещё раз' }).count()) === 1, 'Выход просит подтверждения')
  await page.getByRole('button', { name: 'Нажми ещё раз' }).click(); await page.waitForTimeout(1200)
  ok((await page.getByRole('button', { name: /Бикош/ }).count()) === 1, 'Выход возвращает на экран входа')
  ok(errors.length === 0, 'Вход без ошибок', errors.slice(0, 2).join(' | '))
  await ctx.close()
}

console.log('\n# Повар')
{
  execSync('TANDEM_ENV_FILE=.env.demo npx tsx scripts/bootstrap-cook.ts', { cwd: ROOT, stdio: 'ignore' })
  const owner = sql(`select p.user_id::text from public.profiles p where p.nickname='Алекс'`).match(/'([0-9a-f-]{36})'/)[1]
  const { createRequire: cr } = await import('node:module')
  const { Client } = cr(ROOT)('pg')
  const url = env.match(/^POSTGRES_URL_NON_POOLING=(.*)$/m)[1].replace(/["']/g, '')
  const db = new Client({ connectionString: url }); await db.connect()
  await db.query('begin'); await db.query(`select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)`, [owner]); await db.query('set local role authenticated')
  const secret = (await db.query('select public.cook_link_issue() as s')).rows[0].s
  await db.query('commit'); await db.end()
  const { page, errors, ctx } = await mk()
  await page.goto(`${base}/cook#${secret}`); await page.waitForTimeout(2500)
  ok(page.url().endsWith('/cook'), 'Секрет убран из адреса')
  await page.screenshot({ path: `${out}/cook-diary.png` })
  ok((await page.getByRole('navigation').getByRole('link', { name: /Дневник/ }).count()) >= 1 || (await page.getByRole('link', { name: /Дневник/ }).count()) >= 1, 'Вкладка «Дневник»')
  const add = page.getByRole('button', { name: 'Добавить' }).first(); await add.click(); await page.waitForTimeout(600)
  ok((await page.getByRole('dialog').count()) === 1, 'Повар открывает выбор продукта')
  await page.getByRole('dialog').getByRole('button').nth(1).click(); await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}/cook-portion.png` })
  await page.getByRole('dialog').getByRole('button', { name: 'Добавить' }).click(); await page.waitForTimeout(900)
  ok((await page.getByRole('dialog').count()) === 0, 'Запись повара добавлена')
  const n = sql(`select count(*) from public.diary_entries e join public.cooks c on c.user_id = e.created_by`)
  ok(!n.includes("'0'"), 'В базе есть запись от повара')
  // Своя запись: удаление со второго нажатия (отмены у повара нет)
  await page.locator('main').getByRole('button').filter({ hasText: /ккал/ }).first().click(); await page.waitForTimeout(600)
  const del = page.getByRole('dialog').getByRole('button', { name: 'Удалить' }); await del.click(); await page.waitForTimeout(250)
  ok((await page.getByRole('dialog').getByRole('button', { name: 'Нажми ещё раз' }).count()) === 1, 'Повар удаляет со второго нажатия')
  await page.getByRole('dialog').getByRole('button', { name: 'Нажми ещё раз' }).click(); await page.waitForTimeout(800)
  await page.getByRole('link', { name: 'Продукты' }).click(); await page.waitForTimeout(800)
  await page.screenshot({ path: `${out}/cook-foods.png` })
  const fab = page.locator('body > a.fixed, body > button.fixed').first()
  const fb = await fab.boundingBox()
  ok(fb && fb.y + fb.height < 844, 'Плавающая кнопка на экране', `${Math.round(fb?.y ?? 0)}`)
  ok(fb && 844 - (fb.y + fb.height) < 40, 'Без панели вкладок она у самого низа', `${Math.round(844 - (fb.y + fb.height))}`)
  await fab.click(); await page.waitForTimeout(700)
  ok(page.url().includes('/foods/new'), 'Новый продукт открывается')
  await page.screenshot({ path: `${out}/cook-food-new.png` })
  ok(errors.length === 0, 'Повар без ошибок', errors.slice(0, 2).join(' | '))
  await ctx.close()
}
await browser.close()
console.log(`\nПройдено ${passed}, провалено ${failed}${fails.length ? ':\n - ' + fails.join('\n - ') : ''}`)
