/**
 * Проверка кадрирования 1:1.
 *
 *   pnpm tsx scripts/check-crop.ts
 *
 * Ошибка тут не падает, а тихо портит результат: кадр, уехавший за край,
 * браузер дорисует прозрачным, и в углу картинки окажется дыра, которую
 * увидишь уже в готовом файле. Или наоборот - палец тянет картинку,
 * а она едет вдвое быстрее, и поймать нужное место невозможно.
 *
 * Ни база, ни сеть тут не нужны: это чистая арифметика.
 */
import { sourcePerScreenPx, squareCrop } from '../src/lib/image.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.001

// Горизонтальный снимок 4000x3000, кадр по центру
const W = 4000
const H = 3000
const middle = { x: W / 2, y: H / 2 }

let c = squareCrop(W, H, middle, 1)
check(
  near(c.side, H) && near(c.y, 0) && near(c.x, 500),
  'Кратность 1 вписывает квадрат по короткой стороне',
  `сторона ${c.side}, x ${c.x}, y ${c.y} - по высоте целиком, по ширине по центру`,
)

c = squareCrop(W, H, middle, 2)
check(
  near(c.side, H / 2) && near(c.x, W / 2 - H / 4) && near(c.y, H / 4),
  'Двукратное приближение вдвое уменьшает сторону',
  `сторона ${c.side} при высоте ${H}`,
)

// Уводим центр далеко за левый верхний угол
c = squareCrop(W, H, { x: -9999, y: -9999 }, 1)
check(
  near(c.x, 0) && near(c.y, 0),
  'Кадр не уезжает за левый верхний угол',
  `x ${c.x}, y ${c.y}`,
)

c = squareCrop(W, H, { x: 99999, y: 99999 }, 1)
check(
  near(c.x, W - c.side) && near(c.y, H - c.side),
  'Кадр не уезжает за правый нижний угол',
  `x ${c.x} при пределе ${W - c.side}, y ${c.y} при пределе ${H - c.side}`,
)

// Полный обход: кадр обязан лежать внутри картинки при любых входных данных
let outside = 0
for (const zoom of [1, 1.3, 2, 3.7, 4]) {
  for (const cx of [-5000, 0, 137, W / 2, W, 90000]) {
    for (const cy of [-5000, 0, 42, H / 2, H, 90000]) {
      const r = squareCrop(W, H, { x: cx, y: cy }, zoom)
      if (r.x < -0.001 || r.y < -0.001 || r.x + r.side > W + 0.001 || r.y + r.side > H + 0.001) {
        outside++
      }
    }
  }
}
check(outside === 0, 'Кадр всегда внутри картинки', `проверено 150 сочетаний, за краем ${outside}`)

// Отдалять некуда: короткая сторона это предел
check(
  near(squareCrop(W, H, middle, 0.2).side, H),
  'Кратность меньше единицы не растягивает кадр',
  'больше короткой стороны из картинки не вырезать',
)

// Вертикальный снимок - короткая сторона теперь ширина
c = squareCrop(3000, 4000, { x: 1500, y: 2000 }, 1)
check(
  near(c.side, 3000) && near(c.x, 0) && near(c.y, 500),
  'Вертикальный снимок кадрируется по ширине',
  `сторона ${c.side}, x ${c.x}, y ${c.y}`,
)

// Квадратный исходник при кратности 1 - это он сам
c = squareCrop(800, 800, { x: 400, y: 400 }, 1)
check(
  near(c.side, 800) && near(c.x, 0) && near(c.y, 0),
  'Квадрат остаётся собой',
  `${c.side}x${c.side} из 800x800`,
)

// Палец должен двигать картинку ровно за собой
const box = 300
const step1 = sourcePerScreenPx(W, H, 1, box)
const step2 = sourcePerScreenPx(W, H, 2, box)
check(
  near(step1, H / box) && near(step2, step1 / 2),
  'Приближение замедляет перетаскивание во столько же раз',
  `на кратности 1 пиксель экрана это ${step1.toFixed(2)} пикселя исходника, на 2 - ${step2.toFixed(2)}`,
)

// Сдвиг на всю ширину кадра при кратности 1 обязан дойти ровно до края
const perPx = sourcePerScreenPx(W, H, 1, box)
const moved = squareCrop(W, H, { x: W / 2 - box * perPx, y: H / 2 }, 1)
check(
  near(moved.x, 0),
  'Протянув кадр на его ширину, упираемся ровно в край',
  `x ${moved.x} - ни зазора, ни выхода за край`,
)

console.log(failed === 0 ? '\nКадрирование верно.' : `\nПровалено: ${failed}`)
if (failed > 0) process.exit(1)
