import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { haptic } from '@/lib/haptics'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Smartphone } from 'lucide-react'
import { dynamicKey, useT } from '@/lib/i18n'
import { Card } from '@/ui/Card'
import { Sparkles } from '@/ui/Sparkles'
import type { CycleDay } from './cycle'
import { createBubbleRenderer, type BubbleRenderer } from './bubbleGl'
import { ENERGY, PHRASES, bubbleMood, bubblePalette, phraseIndex, type BubbleMood, type Palette } from './bubbleMood'

/** Размер холста в CSS-пикселях: пузырёк плюс место на прыжки, свечение и тень. */
const SIZE = 260
/** Радиус пузырька в долях половины холста - тот же, что в шейдере. */
const RADIUS = 0.6
/** Дальше центра пузырёк не уходит, как его ни тяни. */
const REACH = 0.3

type Vec = [number, number]

type PermissionApi = { requestPermission?: () => Promise<string> }

/** iOS отдаёт наклон только после явного разрешения, и спросить можно только по нажатию. */
function motionNeedsPermission(): boolean {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return false
  return typeof (DeviceOrientationEvent as unknown as PermissionApi).requestPermission === 'function'
}

async function requestMotion(): Promise<void> {
  const apis = [
    typeof DeviceOrientationEvent === 'undefined' ? null : (DeviceOrientationEvent as unknown as PermissionApi),
    typeof DeviceMotionEvent === 'undefined' ? null : (DeviceMotionEvent as unknown as PermissionApi),
  ]
  await Promise.all(
    apis.map((api) => (api?.requestPermission ? api.requestPermission().catch(() => 'denied') : null)),
  )
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * Пузырёк настроения на экране цикла.
 *
 * Цвет меняется по дням цикла, лицо - по настроению, а в фертильное окно
 * он говорит прямо: сейчас благоприятные дни, если вы планируете ребёнка.
 *
 * Живой по-настоящему: пружина держит его у центра, наклон телефона
 * скатывает в сторону, встряска раскачивает, палец продавливает и тянет,
 * а жидкость внутри плещется с опозданием. Вся физика - в одном цикле
 * requestAnimationFrame и пишет прямо в uniform'ы и стиль лица, без
 * перерисовки React: шестьдесят рендеров компонента в секунду посадили бы
 * батарею быстрее, чем сам шейдер.
 *
 * Анимация стоит, когда пузырька не видно: экран прокручен или приложение
 * свёрнуто. При «уменьшить движение» - один неподвижный кадр.
 */
export function CycleBubble({ state, today }: { state: CycleDay; today: string }) {
  const t = useT()
  const reduced = useReducedMotion() ?? false
  const mood = bubbleMood(state, today)
  const palette = useMemo(() => bubblePalette(state, today), [state, today])
  const fertile = mood === 'radiant' || mood === 'peak'

  const [phrase, setPhrase] = useState(() => phraseIndex(mood, state.day))
  useEffect(() => setPhrase(phraseIndex(mood, state.day)), [mood, state.day])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const faceRef = useRef<HTMLDivElement>(null)
  const pupilsRef = useRef<SVGGElement>(null)
  const [fallback, setFallback] = useState(false)
  const [touched, setTouched] = useState(false)
  // Кнопка «оживить» нужна, только пока наклон не пришёл ни разу и система
  // требует разрешения. Как только пришло первое событие - кнопка исчезает
  const [motionLive, setMotionLive] = useState(false)
  const askMotion = motionNeedsPermission() && !motionLive

  // Изменяемое состояние физики. Ref, а не state: его пишут обработчики
  // касаний и датчиков и читает цикл кадров
  const sim = useRef({
    pos: [0, 0] as Vec,
    vel: [0, 0] as Vec,
    tilt: [0, 0] as Vec,
    drag: null as Vec | null,
    slosh: [0, 0] as Vec,
    sloshVel: [0, 0] as Vec,
    energy: 0,
    angle: 0,
    dent: [0, 1, 0] as [number, number, number],
    baseBeta: null as number | null,
  })
  const paletteRef = useRef<Palette>(palette)
  paletteRef.current = palette
  const moodRef = useRef<BubbleMood>(mood)
  moodRef.current = mood
  // Перерисовать неподвижный кадр: при «уменьшить движение» цикла кадров нет,
  // а цвет дня всё равно должен смениться
  const redrawRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer: BubbleRenderer | null = fallback ? null : createBubbleRenderer(canvas)
    if (!renderer && !fallback) {
      setFallback(true)
      return
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    renderer?.resize(Math.round(SIZE * dpr), Math.round(SIZE * dpr))

    let frame = 0
    let last = performance.now()
    let running = false
    let onScreen = true
    const started = last
    const s = sim.current

    const step = (dt: number, time: number): void => {
      const energy = ENERGY[moodRef.current]
      // Цель: палец, если тянут, иначе наклон плюс лёгкое парение
      const float = reduced ? 0 : Math.sin(time * 1.1 * energy.speed) * 0.016
      const target: Vec = s.drag ?? [s.tilt[0], s.tilt[1] + float]
      // Недодемпфированная пружина: отпущенный пузырёк проскакивает центр
      // и пару раз качается - так ведёт себя всё упругое
      const k = s.drag ? 170 : 62
      const c = s.drag ? 17 : 6.2
      for (let i = 0; i < 2; i++) {
        const ax = (target[0] - s.pos[0]) * k - s.vel[0] * c
        const ay = (target[1] - s.pos[1]) * k - s.vel[1] * c
        s.vel[0] = clamp(s.vel[0] + ax * dt, -4, 4)
        s.vel[1] = clamp(s.vel[1] + ay * dt, -4, 4)
        s.pos[0] = clamp(s.pos[0] + s.vel[0] * dt, -REACH, REACH)
        s.pos[1] = clamp(s.pos[1] + s.vel[1] * dt, -REACH, REACH)
      }
      // Жидкость догоняет оболочку на своей, более мягкой пружине
      const sx = (s.pos[0] - s.slosh[0]) * 26 - s.sloshVel[0] * 3.2
      const sy = (s.pos[1] - s.slosh[1]) * 26 - s.sloshVel[1] * 3.2
      s.sloshVel[0] += sx * dt
      s.sloshVel[1] += sy * dt
      s.slosh[0] += s.sloshVel[0] * dt
      s.slosh[1] += s.sloshVel[1] * dt

      const speed = Math.hypot(s.vel[0], s.vel[1])
      if (speed > 0.03) s.angle = Math.atan2(s.vel[1], s.vel[0])
      s.energy = s.energy * Math.exp(-dt * 1.7) + speed * dt * 2.2
      s.dent[2] *= Math.exp(-dt * 5.5)
    }

    const draw = (time: number): void => {
      const energy = ENERGY[moodRef.current]
      const speed = Math.hypot(s.vel[0], s.vel[1])
      const stretch = Math.min(speed * 0.45, 0.2)
      const sx = 1 + stretch
      const sy = 1 / (1 + stretch * 0.85)
      const colors = paletteRef.current

      renderer?.draw({
        time: time * energy.speed,
        offset: s.pos,
        stretch: [sx, sy],
        angle: s.angle,
        wobble: energy.wobble * (1 + Math.min(s.energy, 1.2) * 5),
        slosh: [(s.slosh[0] - s.pos[0]) * 1.8, (s.slosh[1] - s.pos[1]) * 1.8],
        dent: s.dent,
        colors,
        glow: energy.glow,
        shadow: 0.22,
      })

      // Лицо едет вместе с оболочкой и так же сплющивается. Координаты
      // шейдера - вверх по y, у CSS - вниз
      const half = SIZE / 2
      const face = faceRef.current
      if (face) {
        const deg = (s.angle * 180) / Math.PI
        face.style.transform =
          `translate(${s.pos[0] * half}px, ${-s.pos[1] * half}px) ` +
          `rotate(${-deg}deg) scale(${sx}, ${sy}) rotate(${deg}deg)`
        if (fallback) {
          face.style.setProperty('--b1', rgb(colors[0]))
          face.style.setProperty('--b2', rgb(colors[1]))
          face.style.setProperty('--b3', rgb(colors[2]))
        }
      }
      // Глаза смотрят туда, куда пузырёк клонят
      const pupils = pupilsRef.current
      if (pupils) {
        const look = s.drag ?? s.tilt
        pupils.setAttribute(
          'transform',
          `translate(${clamp(look[0] * 12, -2.6, 2.6)} ${clamp(-look[1] * 12, -2.2, 2.2)})`,
        )
      }
    }

    const tick = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 1 / 30) / 2
      last = now
      step(dt, (now - started) / 1000)
      draw((now - started) / 1000)
      frame = requestAnimationFrame(tick)
    }

    const sync = (): void => {
      const shouldRun = !reduced && onScreen && document.visibilityState === 'visible'
      if (shouldRun && !running) {
        running = true
        last = performance.now()
        frame = requestAnimationFrame(tick)
      } else if (!shouldRun && running) {
        running = false
        cancelAnimationFrame(frame)
      }
    }

    draw(0)
    redrawRef.current = () => draw(1.5)
    const observer = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting)
      sync()
    })
    observer.observe(canvas)
    document.addEventListener('visibilitychange', sync)

    // Наклон - через ориентацию, а не через ускорение с гравитацией: у iOS
    // и Android знаки последнего разные, а углы одинаковые. Нулевой наклон
    // медленно подстраивается под то, как телефон держат, - иначе пузырёк
    // всё время лежал бы у нижнего края
    const onOrientation = (e: DeviceOrientationEvent): void => {
      if (e.gamma === null || e.beta === null) return
      setMotionLive(true)
      s.baseBeta = s.baseBeta === null ? e.beta : s.baseBeta + (e.beta - s.baseBeta) * 0.006
      s.tilt = [
        clamp(e.gamma / 38, -1, 1) * 0.24,
        clamp(-(e.beta - s.baseBeta) / 38, -1, 1) * 0.24,
      ]
    }
    // Встряска: пузырёк по инерции отстаёт от движения телефона
    const onMotion = (e: DeviceMotionEvent): void => {
      const a = e.acceleration
      if (!a || a.x === null || a.y === null) return
      const mag = Math.hypot(a.x, a.y, a.z ?? 0)
      if (mag < 1.2) return
      s.vel[0] = clamp(s.vel[0] - a.x * 0.018, -4, 4)
      s.vel[1] = clamp(s.vel[1] - a.y * 0.018, -4, 4)
      s.energy = Math.min(s.energy + mag * 0.012, 1.5)
    }
    window.addEventListener('deviceorientation', onOrientation)
    window.addEventListener('devicemotion', onMotion)

    return () => {
      redrawRef.current = null
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('deviceorientation', onOrientation)
      window.removeEventListener('devicemotion', onMotion)
      renderer?.dispose()
    }
  }, [reduced, fallback])

  // Неподвижный кадр при «уменьшить движение» тоже должен знать про смену цвета
  useEffect(() => {
    if (reduced) redrawRef.current?.()
  }, [reduced, palette, mood])

  // --- Палец ---------------------------------------------------------------
  const press = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)

  const toBubble = (e: React.PointerEvent<HTMLCanvasElement>): Vec => {
    const r = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2]
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    setTouched(true)
    if (motionNeedsPermission()) void requestMotion()
    const s = sim.current
    const p = toBubble(e)
    const rel: Vec = [p[0] - s.pos[0], p[1] - s.pos[1]]
    const dist = Math.hypot(rel[0], rel[1])
    if (dist > RADIUS * 1.15) return
    // Ткнули - оболочка продавливается под пальцем и отскакивает от него
    const dir: Vec = dist > 0.001 ? [rel[0] / dist, rel[1] / dist] : [0, -1]
    s.dent = [dir[0], dir[1], 1]
    s.vel[0] -= dir[0] * 0.9
    s.vel[1] -= dir[1] * 0.9
    s.energy = Math.min(s.energy + 0.5, 1.5)
    haptic('tick')
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const p = press.current
    if (!p || p.id !== e.pointerId) return
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) p.moved = true
    if (!p.moved) return
    const at = toBubble(e)
    const len = Math.hypot(at[0], at[1])
    const k = len > REACH ? REACH / len : 1
    sim.current.drag = [at[0] * k, at[1] * k]
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const p = press.current
    if (!p || p.id !== e.pointerId) return
    press.current = null
    sim.current.drag = null
    // Короткое касание - пузырёк говорит следующую фразу
    if (!p.moved && e.type === 'pointerup') setPhrase((n) => (n + 1) % PHRASES[mood])
  }

  const title = t(dynamicKey('bubble.title', mood))
  const text = t(dynamicKey(`bubble.${mood}`, String(phrase)))

  const stage = (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      {/* Холст остаётся и без WebGL: на нём ловятся касания, а рисует тогда
          запасной пузырёк из градиентов под лицом */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t('bubble.aria', { mood: title })}
        className="absolute inset-0 z-10 size-full touch-pan-y select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div
        ref={faceRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center will-change-transform"
        style={
          fallback
            ? ({ '--b1': rgb(palette[0]), '--b2': rgb(palette[1]), '--b3': rgb(palette[2]) } as CSSProperties)
            : undefined
        }
      >
        {fallback && (
          <span
            className="absolute rounded-full"
            style={{
              width: SIZE * RADIUS,
              height: SIZE * RADIUS,
              background:
                'radial-gradient(circle at 34% 28%, rgb(255 255 255 / 0.75), transparent 22%),' +
                'radial-gradient(circle at 60% 70%, var(--b3), transparent 55%),' +
                'radial-gradient(circle at 40% 40%, var(--b2), var(--b1) 78%)',
              boxShadow: '0 18px 40px -18px var(--b1)',
            }}
          />
        )}
        {/* Звёзды - вокруг самого пузырька и летят вместе с ним */}
        {fertile ? (
          <Sparkles
            count={mood === 'peak' ? 8 : 6}
            colors={[rgb(palette[1]), 'var(--t-amber)', rgb(palette[2])]}
          >
            <Face mood={mood} pupilsRef={pupilsRef} />
          </Sparkles>
        ) : (
          <Face mood={mood} pupilsRef={pupilsRef} />
        )}
      </div>
    </div>
  )

  return (
    <Card as="section" className="relative overflow-hidden px-4 pt-2 pb-4">
      {/* Подсветка карточки в тон пузырька - он как будто светит на неё */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{
          background: `radial-gradient(70% 55% at 50% 38%, ${rgb(palette[1], 0.16)}, transparent 70%)`,
        }}
      />

      {stage}

      <Speech title={title} color={rgb(palette[1])}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={`${mood}-${phrase}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="text-[15px] leading-snug"
          >
            {text}
          </motion.p>
        </AnimatePresence>
        {fertile && (
          <p className="mt-2 text-xs text-muted">
            {t(state.basis === 'lh' ? 'bubble.fertileNoteLh' : 'bubble.fertileNote')}
          </p>
        )}
      </Speech>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {askMotion && (
          <button
            type="button"
            onClick={() => void requestMotion()}
            className="relative flex items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5 text-sm
                       font-semibold text-accent-soft-ink transition-transform active:scale-95"
          >
            <Smartphone size={15} aria-hidden />
            {t('bubble.motion')}
          </button>
        )}
        {!touched && !reduced && <p className="relative text-xs text-muted">{t('bubble.hint')}</p>}
      </div>
    </Card>
  )
}

function rgb(c: readonly [number, number, number], alpha = 1): string {
  const [r, g, b] = c.map((v) => Math.round(v * 255))
  return alpha === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`
}

function Speech({ title, color, children }: { title: string; color: string; children: ReactNode }) {
  return (
    <div className="relative mx-auto -mt-3 max-w-sm rounded-3xl bg-raised/80 px-4 pt-3 pb-3.5 text-center">
      {/* Хвостик облачка - к пузырьку */}
      <span aria-hidden className="absolute -top-1.5 left-1/2 size-4 -translate-x-1/2 rotate-45 rounded-[3px] bg-raised/80" />
      <p className="relative flex items-center justify-center gap-2 font-display text-[17px] font-extrabold">
        <span aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />
        {title}
      </p>
      <div className="relative mt-1">{children}</div>
    </div>
  )
}

const INK = 'rgb(52 18 38 / 0.86)'

/**
 * Лицо пузырька. Пять выражений на семь настроений: у окна и дня
 * овуляции оно одно на двоих, только в пик глаза - сердечками.
 */
function Face({ mood, pupilsRef }: { mood: BubbleMood; pupilsRef: React.RefObject<SVGGElement | null> }) {
  const d = SIZE * RADIUS
  const blush = mood !== 'sensitive' && mood !== 'waiting' && mood !== 'calm'
  const stroke = { stroke: INK, strokeWidth: 2.6, strokeLinecap: 'round' as const, fill: 'none' }

  const openEyes = (
    <g ref={pupilsRef}>
      {[-13, 13].map((x) => (
        <g key={x} className="bubble-blink" transform={`translate(${x} -2)`}>
          <ellipse rx={mood === 'sensitive' ? 4.2 : 4.6} ry={mood === 'sensitive' ? 5.2 : 5.8} fill={INK} />
          <circle cx={1.5} cy={-2.1} r={1.7} fill="#fff" />
          {mood === 'sensitive' && <circle cx={-1.4} cy={1.8} r={0.9} fill="#fff" opacity={0.85} />}
        </g>
      ))}
    </g>
  )

  let eyes: ReactNode
  let mouth: ReactNode
  let brows: ReactNode = null
  switch (mood) {
    case 'tender':
      eyes = [-13, 13].map((x) => <path key={x} d={`M${x - 5} -1 Q${x} 2.2 ${x + 5} -1`} {...stroke} />)
      mouth = <ellipse cx={0} cy={12} rx={2.6} ry={2} fill={INK} />
      break
    case 'rising':
      eyes = openEyes
      mouth = <path d="M-7 9 Q0 16 7 9" {...stroke} />
      break
    case 'radiant':
    case 'peak':
      eyes =
        mood === 'peak'
          ? [-13, 13].map((x) => (
              <path
                key={x}
                transform={`translate(${x} -2) scale(0.55)`}
                d="M0 6 C-11 -2 -8 -11 0 -5 C8 -11 11 -2 0 6 Z"
                fill={INK}
              />
            ))
          : [-13, 13].map((x) => <path key={x} d={`M${x - 5} 1 Q${x} -6 ${x + 5} 1`} {...stroke} />)
      mouth = (
        <g>
          <path d="M-8 8 Q0 20 8 8 Z" fill={INK} />
          <ellipse cx={0} cy={14.2} rx={3.4} ry={1.8} fill="#ff7a98" />
        </g>
      )
      break
    case 'calm':
      eyes = [-13, 13].map((x) => <path key={x} d={`M${x - 5} -2 Q${x} 3.5 ${x + 5} -2`} {...stroke} />)
      mouth = <path d="M-5 10 Q0 14 5 10" {...stroke} />
      break
    case 'sensitive':
      eyes = openEyes
      brows = (
        <g>
          <path d="M-18 -11 L-9 -14" {...stroke} strokeWidth={2.2} />
          <path d="M18 -11 L9 -14" {...stroke} strokeWidth={2.2} />
        </g>
      )
      mouth = <path d="M-7 13 Q-3.5 10 0 13 Q3.5 16 7 13" {...stroke} strokeWidth={2.3} />
      break
    case 'waiting':
      eyes = openEyes
      mouth = <ellipse cx={0} cy={12} rx={2.4} ry={3} fill={INK} />
      break
  }

  return (
    <svg viewBox="-50 -50 100 100" width={d} height={d} className="relative overflow-visible">
      <g transform="translate(0 5)">
        {blush && (
          <g fill="#ff5d85" opacity={0.32}>
            <ellipse cx={-21} cy={7} rx={5.5} ry={3.2} />
            <ellipse cx={21} cy={7} rx={5.5} ry={3.2} />
          </g>
        )}
        {brows}
        {eyes}
        {mouth}
      </g>
    </svg>
  )
}
