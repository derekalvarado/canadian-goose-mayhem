# Audio sources

## Canada goose honk

- Runtime file: `public/audio/canada-goose-honk.mp3`
- Archived source: `source/Branta_canadensis.ogg`
- Description: Call of the Canada Goose (*Branta canadensis*)
- Source: National Park Service, mirrored by Wikimedia Commons
- Source page: https://commons.wikimedia.org/wiki/File:Branta_canadensis.ogg
- License: Public domain in the United States (work of a U.S. National Park Service employee)

The runtime file takes the opening call from the 3.1-second source, converts it to
mono MP3, normalizes its level, removes sub-bass rumble, and adds short edge fades.

## Guitar drag scrape

- Runtime file: `public/audio/guitar/guitar-drag-loop.wav`, looped by
  `GameAudio.setScrape()` (`src/game/GameAudio.ts`) while a goose drags the guitar
- Archived source: `source/stick-dragged/stick-dragged-preview.mp3`
  (the high-quality preview stream; sourced without a Freesound login, so this
  is not the original upload)
- Description: "Stick Dragged" — a wooden stick dragged on a concrete floor,
  fast and slow, loud and soft
- Author: 190129_Tristan_Woolmington
- Source: https://freesound.org/people/190129_Tristan_Woolmington/sounds/492474/
- License: CC0 (public domain dedication, no attribution required)

The runtime file takes the steady fast drag at 31.4–35.1s, removes sub-70Hz
rumble, crossfades its last 0.35s into its start so it loops seamlessly, raises
the level with a limiter, and is saved as mono 32kHz WAV (MP3 adds silence at
the ends, which would click at every loop). `setScrape()` starts each drag at a
random point in the loop with a small pitch change, and its loudness follows
the goose's distance and dragging speed. To sound like a hollow guitar body
rather than a stick, it boosts the body's two resonances (105Hz and 230Hz),
softens the hiss, and feeds a 4.5ms echo back on itself (the inside of the box).

## Street musician's tune

- Runtime file: `public/audio/guitar/street-guitar-loop.wav`, looped by
  `GameAudio.setStreetMusic()` (`src/game/GameAudio.ts`) while the musician plays
- Archived source: `source/garuda-guitar-melody-2/guitar-melody-2-preview.mp3`
  (the high-quality preview stream; sourced without a Freesound login, so this
  is not the original upload)
- Description: "acoustic guitar melody #2 d-dur" — a fingerpicked acoustic
  guitar melody in D major, field-recorded with a Zoom H2n
- Author: Garuda1982
- Source: https://freesound.org/people/Garuda1982/sounds/462723/
- License: CC0 (public domain dedication, no attribution required)

The runtime file mixes the stereo source down to mono, removes sub-60Hz rumble,
and plays from the first note (0.38s) to 29.6s, partway through the final
chord's ring-out. The rest of that ring-out (29.6–31.3s, faded out) is mixed
over the loop's start, so the last chord rings on as the tune begins again and
the loop has no gap. Saved as mono 24kHz WAV (MP3 adds silence at the ends,
which would click at every loop).

## Goose footstep

- Runtime file (currently used): `public/audio/footsteps/goose-footstep-pat1.mp3`,
  pinned in `GameAudio.playFootstep()` (`src/game/GameAudio.ts`) while its
  timing/tone is still being evaluated. `pat2`–`pat4` sit alongside it, unused
  for now.
- Unused library for future surface variants: `public/audio/footsteps/hand-impacts/`
  (`goose-footstep-hit01.mp3`–`hit42.mp3`, not wired into the game) — every
  usable isolated hit sliced from the same source sheet, for picking different
  sounds per surface (grass, wood, stone, puddle, etc.) later. Durations vary
  (0.15–0.44s) because later hits in the source were recorded closer together,
  leaving less room per hit before the next one starts.
- Archived source: `source/jelloapocalypse-soft-hand-impacts/soft-hand-impacts-preview.mp3`
  (the low-quality preview stream; the sounds were sourced without a
  Freesound login, so this is not the original 48kHz/24-bit upload)
- Description: "Soft Hand Impacts" — a 32-second sheet of many isolated palm
  taps, described by the author as "not quite as light as a pat, not quite
  as hard as a slap"
- Author: JelloApocalypse
- Source: https://freesound.org/people/JelloApocalypse/sounds/802602/
- License: CC0 (public domain dedication, no attribution required)

Every runtime/library file is sliced from one hit in the source sheet, then has
sub-60Hz rumble removed, loudness normalized (`dynaudnorm`), a short
fade-in/out added, and is converted to mono MP3.
`GameAudio.playFootstep()` applies a light pitch wobble (0.96–1.04x) on top of
whichever sample(s) it plays, for extra variety.

Playback timing within the gait cycle — i.e. how well the sound lines up with
the visible foot-plant — and the gait's overall step cadence are tuned via
`footstepPhaseOffset` and `gaitCadenceScale` in the `GOOSE_ANIMATION` constants
in `src/game/GooseAnimation.ts`.
