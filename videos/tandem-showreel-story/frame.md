---
name: Тандем - шоурил «Пересечение», сторис
unit: the frame - 1080×1920 (9:16), 30fps, 45.0s
principle: the app's own dark theme, pushed to cinema scale, laid out for Stories
---

# Design truth

Same brand as ../tandem-showreel/frame.md, re-laid for vertical. Every scene reads this
file; nothing invents colors.

## Colors

| Role | Hex | Note |
|---|---|---|
| canvas | `#121110` | the only background, every scene |
| canvas-deep | `#0d0c0b` | opaque stage ground |
| surface | `#1c1a18` | cards |
| raised | `#28241f` | chips, inputs, tracks, bubbles («ты») |
| line | `#312c27` | hairlines, 2px |
| ink | `#f3efe9` | primary text |
| muted | `#a39b92` | secondary text (6.9:1 on canvas) - never darker for text |
| accent | `#e5768c` | THE accent; accent text on dark ink `#1c1a17` |
| accent-soft | `#3a2228` bg / `#f4a3b3` text | soft buttons, italic serif lines |
| ring «я» | `#f28ca2` on `#3a1f27` | person one (rose) |
| ring «ты» | `#84b9ef` on `#1a2a3c` | person two (sky) |
| section tones (icons only) | tasks sky `#84b9ef`/`#1a2a3c`, cycle plum `#ec93bc`/`#381f2c`, wishlist orange `#f3a473`/`#3a2417`, dates/letters teal `#6fd1cb`/`#15302e`, topics indigo `#a0a8f2`/`#23253f`, diary amber `#efb35e`/`#382a15`, green `#80cf99`/`#193022`, slate `#aab3bf`/`#262a30` |
| data Б / Ж / У | `#2f7fd0` / `#c08000` / `#009c65` | never recolor |
| danger | `#f07a4a` | overdue, delay |
| mark | `#b4485f` + white rings | public/favicon.svg |
| glow | radial only: `rgba(229,118,140,.16)` rose, `rgba(132,185,239,.13)` sky | no linear gradients |

## Type

- **Nunito** (local variable 200-1000) - display, numbers, UI. Headlines 900, UI 700-800.
- **Cormorant Garamond Italic** 600 - the second voice, one short phrase per scene, `#f4a3b3`.
- **IBM Plex Mono 500** - small metadata only (weekday labels, timestamps).
- Sizes (vertical): headline 104-120px (max width 864px), italic line 84-96px, body 38-42px,
  UI text inside cards 34-44px, labels ≥ 26px. Nothing below 24px.
- Headline line-height ≥ 1.12 (tighter overlaps the next line's box - `check` fails it).

## Composition (Stories)

- Canvas 1080×1920. Side margins 108px. **Key content inside y 260-1560** - the Stories
  profile bar owns the top, the reply bar owns the bottom. Decoration may bleed anywhere.
- Default stack: headline block at top (y ≈ 300-640), the scene's object below
  (y ≈ 700-1500). Two focal points: the words and the thing.
- Background every scene: canvas + two radial glows (mark them `data-layout-allow-overflow`)
  + grain overlay 6% (SVG feTurbulence) + optional faint ring field (2px, 10% ink).
- Cards: radius 36-44px, bg surface, `box-shadow: inset 0 0 0 2px rgba(255,255,255,.06)`.

## The atom

Two rings, «я» rose and «ты» sky, stroke ≈ 0.4 × r, overlap like the app mark (center
distance 1.667 × r); their lens filled `#f3efe9`. They appear in scenes as cursors, avatars,
ripple sources.

## Motion rules that bit us (non-negotiable)

- Never GSAP `svgOrigin` / `transformOrigin` on SVG nodes - the sub-comp is not laid out when
  the timeline is built, origins come out shifted. Scale SVG nodes around a fixed point by
  writing their `transform` attribute from a proxy (`svgT` helper) or tween `attr: { r }`.
- Never measure the DOM (getBoundingClientRect, offsetWidth, getBBox). Author positions as
  constants; text widths measured offline if needed.
- Every tween seek-safe: `fromTo` with explicit from-state, `immediateRender: false` when
  re-owning a target; onUpdate reads proxies only. No Math.random / Date.now.
- No idle wobble: every second something meaningful is mid-flight; 0.3-0.75 s stillness
  before a scene's climax. Eases: power3/4, back.out(1.4-2.6); never bounce/elastic.
- Beats: 1 beat = 0.4918 s. Scene-local key moments land on beats (0.49, 0.98, 1.48,
  1.97 downbeat, 2.46, 2.95, 3.44). The scene's last ~0.35 s belongs to the exit seam.

## Don'ts

No emoji, no pink hearts wallpaper, no gradient text, no linear gradients on dark, no
floating phone mockup, no real names or personal data (demo values only).
