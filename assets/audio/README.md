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

## Goose footstep

- Runtime files: `public/audio/footsteps/goose-footstep-pat{1,2,3,4}.mp3`
  (4 isolated hits, picked at random each step to avoid an obviously looping
  sound)
- Archived source: `source/jelloapocalypse-soft-hand-impacts/soft-hand-impacts-preview.mp3`
  (the low-quality preview stream; the sounds were sourced without a
  Freesound login, so this is not the original 48kHz/24-bit upload)
- Description: "Soft Hand Impacts" — a 32-second sheet of many isolated palm
  taps, described by the author as "not quite as light as a pat, not quite
  as hard as a slap"; each runtime file is a single ~0.4s hit sliced out of it
- Author: JelloApocalypse
- Source: https://freesound.org/people/JelloApocalypse/sounds/802602/
- License: CC0 (public domain dedication, no attribution required)

Each runtime file is sliced from one hit in the source sheet, then has sub-60Hz
rumble removed, loudness normalized (`dynaudnorm`), a short fade-in/out added,
and is converted to mono MP3. `GameAudio.playFootstep()`
(`src/game/GameAudio.ts`) picks a random variant each step and applies a light
pitch wobble (0.96–1.04x) on top for extra variety.

Playback timing within the gait cycle — i.e. how well the sound lines up with
the visible foot-plant — is tuned separately via `FOOTSTEP_TUNING.phaseOffset`
in `src/game/GooseAnimation.ts`. Load the game with `?dev` in the URL for a
live on-screen slider for that offset while the goose walks.
