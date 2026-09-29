---
workflow: general-video
flow: automation
storyboard: no
message: "Общее у двоих живёт в пересечении: «Тандем», рассказанный как моушн-шоурил"
destination: reels-tiktok-stories
aspect: 1080x1920
language: ru
audience: "арт-директора и рекрутеры; подписчики в сторис; пары"
length: 45s
angle: showreel
narration: no
---

## Intent

User's words, after the 25 s 16:9 cut (../tandem-showreel): «У нас ведь есть еще функции.
Добавь их, можешь увеличить до 45 секунда, и сделай в формате для сторис».

Same concept «Пересечение» (see ../tandem-showreel/BRIEF.md): two rings «я» (rose) and «ты»
(sky) are the atom; their white lens is the portal; they lock into the real app mark at the
end. Now two acts over 45 s, 9:16:

- Act 1 (the drop at 3.93): hook · Думаю о тебе · Как ты · Дневник · Как решили.
- Act 2 (the drop again at 19.67 - the bed repeats the drop): Задачи · Цикл · Вишлист ·
  Письма в будущее · «И ещё» montage (Спасибо, вес и состав тела, штрихкод, год в цифрах,
  три языка, Telegram) · finale (годовщина → mark lockup on the final hit 43.28).

## Assets

- Shared with ../tandem-showreel: fonts (Nunito variable, Cormorant Garamond Italic,
  IBM Plex Mono - all cyrillic-ext), brand mark (public/favicon.svg), bundled SFX.
- assets/bgm/showreel-bed.wav - uqr-showreel catalog track (122 BPM): intro 2 bars, energy
  bars 0-7, splice back to bar 0 (the drop replays at 19.67), bars 0-11, crash tail. 45.0 s.

## Customizations

- Beat-locked: every scene is two bars (3.934 s); cuts on downbeats.
- Current: UP (vertical). Z-push into the lens (act 1) and at the re-drop (act 2);
  inverse zoom-through into the finale.
- No HUD: the Stories UI owns the top and bottom edges. Key content inside y 260-1560,
  108 px side margins.

## Notes

- Demo values only, no real names or personal data (rings are «я» and «ты»).
- Copy only from the app's own strings (src/lib/i18n/ru.ts).

## Rebuild the media (not in git - licensed for use inside the video only)

```bash
# SFX: the media-use skill's bundled library
mkdir -p assets/sfx && for s in whoosh whoosh-short whoosh-cinematic pop click-soft sparkle impact-bass-1 impact-bass-2 riser chime key-press ping typing; do cp ~/.claude/skills/media-use/audio/assets/sfx/$s.mp3 assets/sfx/; done
# Bed: HeyGen catalog track from ../../../user-qr/videos/uqr-showreel/assets/bgm/track.mp3 (122 BPM)
mkdir -p assets/bgm && cp <track.mp3> assets/bgm/track.mp3
ffmpeg -y -i assets/bgm/track.mp3 -filter_complex "[0:a]atrim=start=3.946:end=23.618,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.12[a];[0:a]atrim=start=7.880:end=33.300,asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=0.025:c1=tri:c2=tri,afade=t=out:st=43.9:d=1.1,apad=whole_dur=45,atrim=0:45[out]" -map "[out]" -ar 48000 -ac 2 assets/bgm/showreel-bed.wav
```
