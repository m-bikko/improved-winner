/**
 * Рисование пузырька на WebGL - без библиотек.
 *
 * Один полноэкранный треугольник и фрагментный шейдер: сфера считается
 * попиксельно. Три.js ради одного шара притащил бы полмегабайта, а здесь
 * вся сцена - это нормаль сферы, немного шума и три источника света.
 *
 * Из чего складывается «реалистичность»:
 * - объём: нормаль сферы, рассеянный свет сверху слева, затемнение к краю;
 * - жидкость внутри: два слоя шума в тонах фазы, которые текут и
 *   отстают от движения (плещутся), когда пузырёк дёргают;
 * - плёнка: радужная интерференция по краю, как у мыльного пузыря;
 * - блики: мягкое «окно» сверху, острая точка и отражённый свет снизу;
 * - каустика внутри у дна и тень на «полу», которая бледнеет, когда
 *   пузырёк подпрыгивает;
 * - край не круглый: он дышит шумом и продавливается там, где его тронули.
 */

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAGMENT = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uOffset;
uniform vec2 uStretch;
uniform float uAngle;
uniform float uWobble;
uniform vec2 uSlosh;
uniform vec3 uDent;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uGlow;
uniform float uShadow;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}

vec2 rot(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  float t = uTime;

  // Пространство пузырька: сдвиг, растяжение вдоль направления движения
  vec2 b = rot(uv - uOffset, -uAngle);
  b /= uStretch;
  b = rot(b, uAngle);

  float ang = atan(b.y, b.x);
  float r = length(b);

  // Край дышит: две гармоники и шум, амплитуда растёт от тряски
  float wob = uWobble * (
      0.016 * sin(3.0 * ang + t * 1.3)
    + 0.012 * sin(5.0 * ang - t * 1.9)
    + 0.018 * (noise(vec3(cos(ang) * 1.4 + t * 0.3, sin(ang) * 1.4, t * 0.45)) - 0.5));

  // Вмятина там, куда ткнули пальцем
  vec2 dentDir = normalize(uDent.xy + vec2(0.0001));
  float dentShape = exp(-pow(length(normalize(b + vec2(0.0001)) - dentDir) * 2.4, 2.0));
  float R = 0.6 * (1.0 + wob) - uDent.z * 0.09 * dentShape;
  float d = r / R;

  // Тень на «полу»: под пузырьком, бледнеет, когда он поднимается
  vec2 sh = (uv - vec2(uOffset.x * 0.7, -0.84)) / vec2(0.4 + uOffset.y * 0.08, 0.055);
  float shadow = exp(-dot(sh, sh) * 1.8) * uShadow * clamp(1.0 - uOffset.y * 1.6, 0.35, 1.4);

  // Свечение вокруг - узкое: широкий ореол делал пузырёк размытым пятном
  float outside = max(d - 1.0, 0.0);
  float glow = exp(-outside * 16.0) * uGlow * 0.3 * step(1.0, d);

  float aa = 2.0 / (uRes.y * R);
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);

  vec2 p = b / R;
  float z = sqrt(max(0.0, 1.0 - dot(p, p)));
  vec3 n = normalize(vec3(p, z));
  float fres = pow(1.0 - z, 2.0);
  vec3 V = vec3(0.0, 0.0, 1.0);
  // Отражённый луч - по нему «видно» окружение на поверхности
  vec3 Rv = reflect(-V, n);

  // Жидкость внутри: течёт сама и отстаёт от движения. Контраст выше,
  // чем кажется нужным: сквозь блики и плёнку мягкий узор пропадает
  vec2 q = p * 1.05 + uSlosh;
  float f1 = fbm(vec3(q * 1.7, t * 0.13));
  float f2 = fbm(vec3(q * 2.8 + 4.0, t * 0.2 + 3.0));
  vec3 inner = mix(uColA, uColB, smoothstep(0.28, 0.68, f1 + (q.y + 0.2) * 0.42));
  inner = mix(inner, uColC, smoothstep(0.5, 0.8, f2) * 0.8);
  // Свет рассеивается в толще - центр светлее, края глубже
  inner *= 0.7 + 0.45 * z;

  // Свет
  vec3 L = normalize(vec3(-0.45, 0.65, 0.62));
  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, normalize(L + V)), 0.0), 160.0);

  // Тонкая плёнка: толщина течёт шумом и тоньше к верху, как у мыльного
  // пузыря, по которому вода стекает вниз
  float thick = fbm(vec3(p * 1.6 + vec2(0.0, t * 0.05), t * 0.08)) * 1.6 - p.y * 0.35 + t * 0.025;
  vec3 irid = 0.5 + 0.5 * cos(6.28318 * (thick + vec3(0.0, 0.33, 0.67)));

  vec3 col = inner * (0.66 + 0.46 * diff);
  col = mix(col, irid * mix(uColC, vec3(1.0), 0.6), fres * 0.55 + 0.06);

  // Окружение в отражении: светлое небо сверху, тёмный пол снизу - этим
  // край и становится стеклянным, а не пластиковым
  float sky = smoothstep(-0.25, 0.45, Rv.y);
  col = mix(col, mix(uColA * 0.75, vec3(1.0), sky), fres * 0.38);

  // Окно с переплётом - главный признак настоящего пузыря. Считается
  // по отражённому лучу, поэтому само изгибается по сфере
  vec2 wb = (Rv.xy - vec2(-0.42, 0.48)) / vec2(0.34, 0.26);
  float pane = (1.0 - smoothstep(0.78, 1.0, abs(wb.x))) * (1.0 - smoothstep(0.72, 1.0, abs(wb.y)));
  float bars = smoothstep(0.035, 0.075, abs(wb.x)) * smoothstep(0.045, 0.09, abs(wb.y));
  float windowLight = pane * bars * smoothstep(0.1, 0.5, z);
  col = mix(col, vec3(1.0), windowLight * 0.62);

  // Слабое второе отражение снизу справа - свет, отражённый от пола
  vec2 wb2 = (Rv.xy - vec2(0.42, -0.5)) / vec2(0.2, 0.12);
  float pane2 = (1.0 - smoothstep(0.6, 1.0, length(wb2)));
  col += pane2 * 0.18 * mix(uColC, vec3(1.0), 0.5);

  col += spec * 1.2;

  // Светлая кромка по краю
  float rim = smoothstep(0.8, 0.97, d) * (1.0 - smoothstep(0.975, 1.0, d));
  col += rim * 0.35 * mix(uColC, vec3(1.0), 0.6);

  // Каустика: свет, собранный линзой, ярким серпом у дна
  float caus = smoothstep(0.42, 0.0, length((p - vec2(0.1, -0.62)) * vec2(0.9, 2.6)));
  col += caus * 0.3 * mix(uColC, vec3(1.0), 0.35);

  // Центр просвечивает, край плотнее - сквозь пузырёк видно карточку
  float alpha = inside * mix(0.8, 1.0, smoothstep(0.1, 0.8, fres + windowLight + rim + spec));
  vec3 outCol = col * alpha;
  float outA = alpha;

  float ga = glow * (1.0 - outA);
  outCol += uColB * ga;
  outA += ga;

  float sa = shadow * (1.0 - outA);
  outCol += vec3(0.16, 0.06, 0.1) * sa;
  outA += sa;

  gl_FragColor = vec4(outCol, outA);
}
`

export type BubbleFrame = {
  time: number
  offset: readonly [number, number]
  stretch: readonly [number, number]
  angle: number
  wobble: number
  slosh: readonly [number, number]
  dent: readonly [number, number, number]
  colors: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]]
  glow: number
  shadow: number
}

export type BubbleRenderer = {
  draw: (frame: BubbleFrame) => void
  resize: (width: number, height: number) => void
  dispose: () => void
}

const UNIFORMS = [
  'uRes', 'uTime', 'uOffset', 'uStretch', 'uAngle', 'uWobble', 'uSlosh',
  'uDent', 'uColA', 'uColB', 'uColC', 'uGlow', 'uShadow',
] as const
type UniformName = (typeof UNIFORMS)[number]

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Bubble shader:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

/**
 * Рендерер на холсте. `null` - WebGL недоступен, и вызывающий рисует
 * запасной пузырёк градиентами.
 */
export function createBubbleRenderer(canvas: HTMLCanvasElement): BubbleRenderer | null {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false })
  if (!gl) return null

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  if (!vs || !fs) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Bubble program:', gl.getProgramInfoLog(program))
    return null
  }
  gl.useProgram(program)

  // Один треугольник, накрывающий экран, - без шва по диагонали квадрата
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(program, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const loc = {} as Record<UniformName, WebGLUniformLocation | null>
  for (const name of UNIFORMS) loc[name] = gl.getUniformLocation(program, name)

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.clearColor(0, 0, 0, 0)

  return {
    resize: (width, height) => {
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
    },
    draw: (f) => {
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(loc.uRes, canvas.width, canvas.height)
      gl.uniform1f(loc.uTime, f.time)
      gl.uniform2f(loc.uOffset, f.offset[0], f.offset[1])
      gl.uniform2f(loc.uStretch, f.stretch[0], f.stretch[1])
      gl.uniform1f(loc.uAngle, f.angle)
      gl.uniform1f(loc.uWobble, f.wobble)
      gl.uniform2f(loc.uSlosh, f.slosh[0], f.slosh[1])
      gl.uniform3f(loc.uDent, f.dent[0], f.dent[1], f.dent[2])
      gl.uniform3f(loc.uColA, f.colors[0][0], f.colors[0][1], f.colors[0][2])
      gl.uniform3f(loc.uColB, f.colors[1][0], f.colors[1][1], f.colors[1][2])
      gl.uniform3f(loc.uColC, f.colors[2][0], f.colors[2][1], f.colors[2][2])
      gl.uniform1f(loc.uGlow, f.glow)
      gl.uniform1f(loc.uShadow, f.shadow)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose: () => {
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    },
  }
}
