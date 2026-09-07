# Goose Game 2 — Old Town Square

The first playable slice is a browser-based 3D interpretation of the central plaza
in Fort Collins' Old Town Square. You control an original, cel-shaded Canada goose
among the goose fountain, splash pad, children's play area, pavilion, storefronts,
patios, planters, and string lights. Finding the fountain crosses off the current
exploration objective while leaving the square open for wandering.

The intended game is an interconnected social-stealth sandbox. Read the
[game architecture and development sequence](docs/game-architecture.md) before
adding mechanics or neighborhoods. It specifies shared object interactions,
recoverable human reactions, independent objectives, and awareness-driven music.
Those systems are the next milestones; the current plaza is still a movement and
environment slice with session-only progress.

## Play locally

```bash
npm install
npm run dev
```

Open the local URL Vite prints in a browser.

## Arrange the plaza

Open the same local URL with `?edit` at the end (for example,
`http://localhost:5173/?edit`) to enter the in-game world builder. The fountain,
splash pad, play area, pavilion stage, and each complete table-and-chair set can be
moved or rotated. Changes snap to a grid and save automatically in this browser;
normal play mode uses the saved arrangement too.

Use **Export layout** to download the complete, versioned plaza definition. That
file contains every editable group's stable ID, label, position in meters, and Y
rotation, so it can be attached to a future Codex request and made permanent by
replacing `src/game/content/plaza-layout.json`. **Import layout** restores an
exported arrangement, and **Reset defaults** clears the browser draft and returns
to the checked-in canonical layout.

## Controls

- Move: `WASD`, arrow keys, or the controller left stick
- Hurry: `Shift` or the right trigger
- Honk: `Space` or the controller south face button

The camera automatically follows the goose from a fixed diagonal, top-down angle.

## Project layout

- `src/game/Game.ts` — presentation loop, camera, and input/simulation wiring
- `src/game/simulation/Simulation.ts` — fixed-step gameplay state and typed commands/events
- `src/game/simulation/Objectives.ts` — independent outcome-based task completion
- `src/game/simulation/plaza.ts` — active plaza rules and objective definition
- `src/game/GameAudio.ts` — browser audio output, separate from gameplay decisions
- `src/game/Goose.ts` — original procedural Canada goose model and animation
- `src/game/WorldView.ts` — renders a selected authored world area from reusable asset instances
- `src/game/WorldEditor.ts` — in-game multi-area world-building tools and asset placement workflow
- `src/game/worldAssets.ts` — source-owned catalog of render, collision, and occlusion metadata
- `src/game/worldLayout.ts` — sparse 64 m chunk documents, playable regions, browser drafts, import/export, and plaza migration
- `src/game/worldLevel.ts` — renderer-independent collision, chunk, and stepped-surface queries for placed catalog assets
- `src/game/PlazaWorld.ts` — procedural asset-view factories retained by the world catalog
- `src/game/ForestWorld.ts` — earlier forest presentation retained as a reference
- `src/game/InputController.ts` — keyboard and standard gamepad input
- `src/game/plazaLevel.ts` — shared plaza bounds, landmark placement, and collision
- `src/game/plazaLayout.ts` — legacy PlazaEditor document validation used for automatic migration
- `src/game/content/plaza-layout.json` — legacy canonical plaza arrangement migrated into the world document
- `src/game/level.ts` — earlier forest bounds and collision helpers
- `src/game/toonMaterial.ts` — shared three-band material for all characters and solid props
- `src/game/palette.ts` — canonical named colors shared by the 3D scene
- `tests/plazaLevel.test.ts` — active plaza boundary and landmark tests
- `tests/level.test.ts` — retained forest boundary and trail tests
- `tests/simulation.test.ts` — timing, input edges, independent objectives, pause/reset, and backtracking

Run `npm test` for headless gameplay checks and `npm run build` for TypeScript and
the production bundle. The headless tests use Node's TypeScript stripping; use
Node 22.18+ or a newer version supported by the installed Vite release.

## Color palette

The art direction uses a restrained, cel-shaded storybook palette: sage lawns and
layered bottle greens, warm taupe paths and wood, a brown Canada goose with a
black head and white chinstrap, plus brick red, navy, cream, and sunlight accents. Scene colors are
defined in `src/game/palette.ts`; matching HUD tokens live at the top of
`src/style.css`. Add new colors there instead of embedding values in components.

The earlier Godot experiment remains in `scenes/` and `scripts/`, and the original 2D Phaser prototype remains in `legacy/phaser-prototype/` for reference.

## Cel-shaded art and future characters

Keep models and animation in 3D. Use smooth, simple silhouettes and broad color
markings, with no individual feather meshes or surface micro-detail. The goose's
wings and tail are single forms; its white chinstrap lies against the head.

Use `toonMaterial()` for every solid mesh, including future homes, trash cans,
and characters. Imported models should have their materials replaced with this
factory while retaining their skeleton, morph targets, and animation clips.
Instanced props use a white base material with per-instance palette colors.
Use flat normals for deliberate rock/building planes and smooth normals for
rounded bodies and foliage; cel shading does not require faceting every model.

New stylized cel-shaded assets should aim for a roughly 6/10 detail tier:
clear silhouettes, modest construction or material cues, and a few layered
forms that make the object recognizable at play distance. Avoid primitive-only
models and photorealism; detail should support the established storybook style
without becoming surface micro-detail.

The nearest-filtered three-step ramp is paired with a neutral ambient light
(55%) and a single directional sun (45%). The brightest band retains the palette
color, with two darker tones defining volume. Keep `NoToneMapping` and crisp cast
shadows. Avoid hemisphere/fill lights, bloom, fog, glossy materials, and additive
glows: these reintroduce gradients or wash out the color blocks. Animated character
parts cast shadows onto the world but do not receive tiny self-shadow seams.
