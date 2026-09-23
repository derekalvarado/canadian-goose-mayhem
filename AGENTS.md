# Repository guidance for AI agents

This file is the shared instructions file for all AI coding agents working in
this repository (Claude, Codex, Gemini, etc.), not just one vendor's tool.

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
