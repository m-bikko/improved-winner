---
workflow: general-video
flow: automation
storyboard: no
message: "Общее у двоих живёт в пересечении: «Тандем», рассказанный как моушн-шоурил"
destination: youtube-embed
aspect: 1920x1080
language: ru
audience: "арт-директора и рекрутеры, смотрящие моушн-шоурил; вторично - пары"
length: 25s
angle: showreel
narration: no
---

## Intent

User's words: "make a dynamic 25-second motion graphics video of Tandem that shows what
an incredible motion designer you are, like it's your showreel for a résumé. go all out.
Сделай на русском". Subject is this repo's app «Тандем» (private PWA for two), right after
its mobile UI redesign (commit 758d049).

Concept «Пересечение». The app mark is two interlocking rings with the lens between them
filled white. Two rings - «Б» (rose) and «А» (sky), the couple's avatar tones - are the
atom of the whole reel: they fall in, collide, orbit, and the lens where they overlap is
the portal the camera dives through into each scene. What two people share lives in the
intersection. Each scene is one app feature and one distinct motion family, so the reel
reads as range:

1. Hook - rings on spring physics, near miss, interlock, lens flash, wordmark.
2. «Думаю о тебе» - press physics on the heart button, radial ripple burst crossing to the other.
3. «Как ты» - 46 check-in states as a staggered chip cascade, both avatars pick.
4. «Дневник» - calorie ring draws on the beat, count-up, macro bars fill.
5. «Как решили» - topic messages alternate Б/А, then FLIP-collapse into one decision card.
6. Finale - «37 дней» odometer, rings return and lock into the real app mark, lockup.

Autonomous run: "go all out" treated as a just-build-it signal, as in the user's previous
showreels (uqr-showreel, beimbetkz-showreel).

## Assets

- Tandem mark geometry from public/favicon.svg (two r=12 rings at x=22/42, lens filled).
- Palette, copy and UI from the redesigned app: src/index.css tokens, src/lib/i18n/ru.ts
  strings (nudge, check-in states, meals, topic decision), Nunito variable from
  @fontsource-variable/nunito (cyrillic-ext).
- Real numbers seen in the app on 2026-09-29: 1248 / 2021 ккал, Б 122/149 Ж 24/85 У 145/166,
  «Начали встречаться - через 37 дней», 46 check-in states, streaks.

## Customizations

- Beat-locked edit on the music bed's bar grid; cuts land on downbeats.
- Persistent minimal showreel HUD (chapter number + name, progress) - hidden for the finale.
- Seams: Z-push dive through the lens (reserved vector, spent on "going inside the shared"),
  otherwise cut-the-curve LEFT; inverse zoom-through (ARRIVAL) into the finale.

## Notes

- Inferred, not stated: 16:9 1920×1080 (the same prompt produced 16:9 showreels twice;
  the Stories cut came as a separate follow-up); ~4 s per scene, one idea per scene - after
  the 15 s beimbetkz reel the user asked for "less dynamic and more understandable".
- Left behind deliberately: floating phone + feature list + "download" CTA; pink hearts wallpaper.
- No emoji; icons lucide-style inline SVG only. Copy only from the app's own strings.

## Rebuild the media (not in git - licensed for use inside the video only)

```bash
mkdir -p assets/sfx && for s in whoosh whoosh-short whoosh-cinematic pop click-soft sparkle impact-bass-1 impact-bass-2 riser chime key-press ping typing; do cp ~/.claude/skills/media-use/audio/assets/sfx/$s.mp3 assets/sfx/; done
mkdir -p assets/bgm && cp <track.mp3 from user-qr/videos/uqr-showreel/assets/bgm> assets/bgm/track.mp3
ffmpeg -y -i assets/bgm/track.mp3 -filter_complex "[0:a]atrim=start=3.946:end=15.748,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.12[a];[0:a]atrim=start=19.682:end=32.900,asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=0.025:c1=tri:c2=tri,afade=t=out:st=23.9:d=1.1,apad=whole_dur=25,atrim=0:25[out]" -map "[out]" -ar 48000 -ac 2 assets/bgm/showreel-bed.wav
```
