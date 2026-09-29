---
name: Тандем - шоурил «Пересечение»
unit: the frame - 1920×1080 (16:9), 30fps, 25.0s
principle: the app's own dark theme, pushed to cinema scale
---

# Design truth

Brand values come from the redesigned app (`src/index.css`, dark theme). Composition,
scale and motion are video-native. Every scene reads this file; nothing invents colors.

## Colors

| Role | Hex | Note |
|---|---|---|
| canvas | `#121110` | app `--c-bg` dark; the only background, every scene |
| canvas-deep | `#0d0c0b` | vignette edge / opaque stage ground |
| surface | `#1c1a18` | cards (app `--c-surface`) |
| raised | `#28241f` | chips, inputs, tracks |
| lifted | `#3b362f` | selected segment |
| line | `#312c27` | hairlines, 2px at video scale |
| ink | `#f3efe9` | primary text |
| muted | `#a39b92` | secondary text (6.9:1 on canvas) |
| accent | `#e5768c` | THE accent (app dark `--c-accent`); focal hits only |
| accent-soft | `#3a2228` / ink `#f4a3b3` | selected chip, soft buttons |
| ring «я» | `#f28ca2` on `#3a1f27` | app `tone-rose` - person one |
| ring «ты» | `#84b9ef` on `#1a2a3c` | app `tone-sky` - person two |
| mark | `#b4485f` + white rings | the real app icon (public/favicon.svg) |
| data Б / Ж / У | `#2f7fd0` / `#c08000` / `#009c65` | CVD-validated macro palette - never recolor |
| glow | `rgb(229 118 140 / .18)` rose, `rgb(132 185 239 / .14)` sky | radial only - no linear gradients on dark |

## Type

- **Nunito** (variable 200-1000, local, cyrillic-ext) - display, numbers, UI. 800-900 for
  headlines, 700 for UI labels. The app's own display face.
- **Cormorant Garamond Italic** (500-600) - the second voice: short poetic phrases
  («на двоих», «и не потеряли»). Serif against the rounded sans = the pair.
- **IBM Plex Mono 500** - HUD metadata only (chapter numbers, progress).
- Sizes: headline 96-150px, secondary 44-60px, UI inside mock cards 30-40px, HUD 22px.
  Nothing below 22px.

## Composition

- Title-safe 96px sides / 72px top-bottom. Headlines anchor LEFT (x = 150), UI object
  anchors RIGHT half - a split frame, two focal points. The hook and finale are the only
  centered frames (the mark is the subject).
- Background layer every scene: canvas + two radial glows (rose left-top, sky right-bottom)
  + a faint concentric-ring field (circles at 2px, 10-14% opacity) - the atom repeated as
  texture. Grain overlay 5%.
- Cards: radius 36-44px (app 24px scaled), shadow = none on dark; depth by surface step +
  inner 2px line `rgb(255 255 255 / .06)`.

## The atom

Two rings, stroke 14-18px, «я» rose and «ты» sky, overlapping like the app mark
(center distance = 1.667 × r). Their lens (intersection) is filled `#f3efe9` when locked.
The rings appear in every scene as a carrier: cursor pair, avatars, the ripple source,
the lock in the finale.

## Don'ts

No emoji, no pink hearts wallpaper, no gradient text, no linear gradients on the dark
canvas, no floating phone mockup, no real names or personal data (demo values only).
