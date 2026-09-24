# Repository guidance for AI agents

This file is the shared instructions file for all AI coding agents working in
this repository (Claude, Codex, Gemini, etc.), not just one vendor's tool.

## Working with the owner

The owner is not a programmer and cannot debug or fix the code on their own.

- Report results in plain language: what changed in the game, what to look at,
  and anything they need to decide. Keep it short.
- Do not explain how things work under the hood (file internals, math, rendering
  or export pipelines, test mechanics) unless they ask.
- If something is broken or risky, say so plainly and propose the fix, rather
  than explaining the mechanism and leaving them to act on it.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start the Vite dev server; `npm run dev:lan` binds `0.0.0.0` for testing from another device on the LAN
- `npm run build` — type-check (`tsc`), produce the production bundle, then inject the offline precache manifest
- `npm test` — run all headless gameplay tests (`node --test --experimental-strip-types tests/*.test.ts`); requires Node 22.18+
- `node --test --experimental-strip-types tests/simulation.test.ts` — run a single test file the same way
- `npm run assets:goose` / `assets:goose:author` — export the goose glTF from the Blender source (`--author` also regenerates authoring artifacts)
- `npm run assets:janitor` / `assets:kids` — regenerate procedural janitor/splash-kid glTF assets from their generator scripts

There is no separate lint script; `tsc` (run via `npm run build`) is the type-checking gate.

## Architecture

- `src/game/simulation/` is the authoritative gameplay layer: fixed-step state, typed commands/events, and objectives. It has no DOM, Three.js, or audio dependencies — see the rules below.
- `src/game/Game.ts` is the presentation loop that wires input, camera, and rendering to the simulation; it does not decide gameplay outcomes.
- World content is data-driven: `src/game/worldAssets.ts` (catalog of render/collision/occlusion metadata), `src/game/worldLayout.ts` (chunked area documents, browser drafts, import/export), and `src/game/worldLevel.ts` (renderer-independent collision/chunk queries) work together; `src/game/WorldView.ts` renders an authored area and `src/game/WorldEditor.ts` is the in-game builder (`?edit`).
- `src/game/content/plaza-layout.json` and `src/game/plazaLayout.ts`/`plazaLevel.ts` are the legacy plaza-only layout format, retained for automatic migration into the newer world-document format.
- `legacy/phaser-prototype/` (2D) and `scenes/`/`scripts/` (Godot) are earlier prototypes kept for reference only — the active game is the Three.js code under `src/`.
- Full project layout and per-file descriptions are in [README.md](README.md#project-layout).

## Gameplay development rules

Read `docs/game-architecture.md` before changing gameplay or adding areas. It is
the project's development direction and distinguishes implemented systems from
future acceptance gates.

- Keep one fixed gameplay step. Route input through commands and emit events only
  for resolved actions. Keep presentation events separate from durable world facts.
- Use independent outcome-based objectives with stable IDs. Do not make a linear
  mission index, end play at an area boundary, or erase progress on being caught.
- Add objects with shared affordances and persistent identity. Humans and the goose
  must use the same interaction rules; crossing neighborhoods must preserve items.
- Human AI acts on perception and remembered observations, not knowledge of hidden
  live positions. Setbacks are non-violent and recoverable.
- Keep traversal, sight blocking, hearing, and cover distinct. Shared authored data
  must keep visual obstacles consistent with their gameplay behavior.
- Follow the garden milestones before expanding the village. Do not claim future
  physics, NPC, music, or persistence capabilities are already implemented.
- Preserve the cel-shaded art direction in README.md and use the shared palette and
  toon material factory for visual additions.
- Run `npm test` and `npm run build` for gameplay changes. Add behavioral regression
  coverage for new gameplay invariants; do not require browser UI to test rules.
- Write tests only for logic: rules, behavior, state changes, and calculations.
  Do not write tests that pin constants or tuning values, or that check where an
  asset sits in the world or how big it is; check those by looking in the browser.

## Adding a world asset

Follow this checklist for each new prop, landmark, or building (see
`src/game/GasMeterBankView.ts` and the `oldtown.gas-meter-bank` entries for a
worked example).

1. **Model.** Prefer a procedural Three.js builder in its own
   `src/game/<Name>View.ts` that returns a `THREE.Group`, built only from
   `toonMaterial()` meshes. Use a GLB under `assets/props/` loaded like
   `TrashCanView.ts` only when the shape needs Blender; convert its materials to
   toon materials by name. Model in meters, ground at `y = 0`, and face local `+z`
   away from any wall it mounts against.
2. **Colors.** Add a named group to `src/game/palette.ts`; never hard-code hex
   colors in the builder.
3. **Catalog.** Add an entry to `WORLD_ASSETS` in `src/game/worldAssets.ts` with a
   stable `<area>.<name>` ID, category, `halfWidth`/`halfDepth` that enclose the
   mesh, colliders that match what the goose should bump into, and
   `occludesCamera` for anything tall. Characters usually set `warnForOverlap:
   false`, so the editor won't flag them standing inside furniture — check by hand.
4. **Renderer.** Add a `case` for the ID in `createWorldAssetView` in
   `src/game/PlazaWorld.ts`.
5. **Placement.** Insert the instance into `src/game/content/world-layout.json`
   by editing the text (re-serializing the file reformats the coffee-shop area).
   Keep it on paving inside a playable chunk; `generate-old-town-layout.mjs` is
   stale, so do not regenerate from it.
6. **Existing drafts.** Bump `canonicalRevision` in the JSON and add a
   `*_CONTENT_REVISION` constant plus an `add<Name>Content` step in
   `src/game/worldLayout.ts` (chained outermost in `loadWorldLayout`) that adds the
   instance once to older browser drafts. The same pattern covers renaming or
   restructuring existing instances, not just additions (see
   `renameNorthSouthRows`). A saved draft always wins over canonical, so editing
   the JSON alone won't change an already-open editor tab until its draft
   migrates past the new revision. Update tests that assert the latest
   revision. Parallel asset branches will collide on this number; renumber when
   merging.
7. **Tests.** Test logic only (see the testing rule above). If you added a draft
   upgrade, check in `tests/oldTownRebuild.test.ts` that it adds the instance once
   without disturbing edits. To test collision behavior (where the goose is
   blocked, `resolveWorldAreaMovement`), place the asset in a test-built area
   rather than the canonical layout. Do not add tests for its bounds, footprint,
   or collider placement, and never assert where things sit in
   `world-layout.json` (no hard-coded coordinates, routes, or "does not overlap
   its neighbours" checks): the layout is still being arranged in the editor, so
   check placement by eye in step 8. When a behavioral test needs a placed
   object, read its position from the layout.
8. **Look at it.** Run `npm test` and `npm run build`, then view it in the browser:
   `?overview&dev&start=old-town-square.central-plaza` for placement, and a
   temporary close-up page that imports the builder for detail (delete it before
   committing). If the dev server redirects every page to the game, unregister the
   offline service worker in that browser first.

## Prototyping character animation

Iterate on character clips and character meshes in a lab page before changing what
the game plays. The janitor lab (`/assets/characters/janitor/anim-lab.html`, source in
`src/dev/janitorLab/`) is the reference implementation; the goose has its own
`?animation` studio. Give other characters a lab in the same shape when they need
animation work.

1. **Build from source, not the export.** A lab builds the rig from the character's
   `*Model.ts` so edits hot-reload in about a second with no `npm run assets:*` step.
   Keep lab code under `src/dev/` so `tsc` checks it; it is not a production entry.
2. **Compare side by side.** Show 2–3 variants next to the clip the game ships
   today, each with a game-camera view plus orthographic side and front views, frame
   stepping, slow motion, and a treadmill floor at the clip's travel speed so foot
   sliding is visible. Label each variant with what it is trying so the user can
   give feedback by name ("A's bounce with C's arms").
3. **The user picks.** Present options and let the user choose and refine them;
   do not ship a clip they have not seen in the lab.
4. **Port, then keep the lab honest.** Move the chosen clip into the model's clip
   list, regenerate the GLB, and point the lab's "In game" cards at the exported
   clips so later variants are compared against what actually ships.
5. **Match locomotion to gameplay speed.** Walk-type clips must be generated for the
   speed the simulation moves the character at (e.g. `walkSpeed`/`jogSpeed` in
   `src/game/worldLevel.ts`); change the style and the speed together, never one
   alone. Gait styles with leg IK live in `src/game/janitorGaits.ts`.
6. **Respect the rig's joint directions.** For the humanoid rigs, forward is `-Z`:
   `+x` swings a hanging limb forward and leans the spine/neck/head back, knees bend
   with `-x`, elbows bend with `+x`, `+y` turns toward the character's left. Probe
   an unfamiliar rig with a one-joint test pose in the lab before authoring clips,
   and keep a regression test like the janitor's hyperextension check.
7. **Close-up checks.** Lab pages accept `?group=<tab>&zoom&paused` so a specific
   view can be opened in a separate tab without disturbing the user's saved settings.
