# Goose Game 2 — Old Town Square

The first playable slice is a browser-based 3D interpretation of Fort Collins' Old
Town Square. You control an original, cel-shaded Canada goose among the coffee-shop
graybox and the central plaza. The coffee shop is the temporary default start
location while the interior is being developed; gameplay objectives will arrive with
later mechanics.

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

To test from another device on the same network, run `npm run dev:lan` and open
the Network URL Vite prints on that device.

The app installs a service worker and caches the game shell, bundles, models,
audio, and public assets. After opening the game once while online, it can launch
and keep running without a network connection; the development origin also
caches files as they load so it can fall back when Vite becomes unreachable. A
phone must use HTTPS (or localhost) for service workers; plain HTTP LAN IPs
cannot provide this browser guarantee.

### Dev mode and start areas

The normal URL always starts in the coffee shop. Add `?dev` to turn on dev mode,
which shows a "DEV START · <area>" badge and lets `start=<area>` choose where the goose
begins:

```text
http://localhost:5173/?dev&start=old-town-square.central-plaza
```

| Area | `start` value |
| --- | --- |
| Coffee shop interior (default) | `old-town-square.coffee-shop` (or the shorthand `coffee-shop`) |
| Old Town Square plaza | `old-town-square.central-plaza` |

`start` is ignored without `?dev`, and an unknown area falls back to the coffee
shop. Combine it with `?overview` for an orbitable view of that area, or with
`?edit` to open the world builder there (for example,
`?overview&dev&start=old-town-square.central-plaza`).

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

The editor also supports laptop-friendly keyboard controls. Press **?** or **F1**
to open the shortcut drawer. Hold `WASD` to fly the camera, use `Space`/`Shift`
to move up/down, hold `IJKL` to orbit, and hold `U`/`O` to zoom out/in. `H`
focuses the selected object, the arrow keys move it, `Q`/`E` rotate it, and `Tab` cycles through
objects. While placing an asset, **Enter** places it at the camera focus;
**Shift+Enter** keeps placing. **Home** resets the view, **R** rotates the
placement preview, and **Esc** cancels placement.

## Controls

- Move: `WASD`, arrow keys, or the controller left stick
- Hurry: `Shift` or the right trigger
- Honk: `Space` or the controller south face button
- Spread wings while held: `Q` or the controller west face button
- Lower into a threat posture while held: `E` or the controller north face button

On touch-first devices, play in landscape with the floating left-side joystick
(18 px dead zone, 86 px full deflection); push past 62 CSS pixels to hurry (it
releases below 52 pixels) and use the separate right-side **Honk**, **Wings**, and
**Threat** buttons. Wings and Threat remain posed only while their buttons are
held. The Settings button offers touch controls Auto, Show, or Hide; this
preference is local to the browser, not a game save. Portrait pauses
only on coarse-pointer touch devices, so a narrow desktop window remains playable.
Fullscreen is offered where the browser permits it; mobile browsers may require the
Fullscreen button's direct tap and may decline the request.

## Install on iPhone or iPad

For a true app-like view without Safari's address bar, open the game in Safari,
tap **Share**, choose **Add to Home Screen**, then launch it from the Goose Game 2
Home Screen icon. The included web-app manifest requests standalone landscape
presentation; Safari's address bar cannot be removed reliably from an ordinary
browser tab.

The camera follows the goose from above. In areas with an authored camera track, it rides a hand-drawn path in the sky and swings around corners as the goose moves; other areas use a fixed diagonal angle. When the janitor comes near, the camera widens its aim to keep both in the shot. Tracks are edited in the world builder (`?edit` → **Edit camera track**).

## Project layout

- `src/game/Game.ts` — presentation loop, camera, and input/simulation wiring
- `src/game/cameraTrack.ts` — authored sky camera tracks: smoothing, nearest-point riding, and far-goose lean-in
- `src/game/cameraFraming.ts` — widens the camera's aim to fit a nearby important character in the shot
- `src/game/controlHeading.ts` — keeps a held movement direction steady while the camera swings
- `src/game/simulation/Simulation.ts` — fixed-step gameplay state and typed commands/events
- `src/game/simulation/Objectives.ts` — independent outcome-based task completion
- `src/game/simulation/plaza.ts` — active plaza movement rules
- `src/game/GameAudio.ts` — browser audio output, separate from gameplay decisions
- `src/game/Goose.ts` — runtime loader, layered clips, and head tracking for the rigged Canada goose
- `src/game/GooseAnimation.ts` — presentation-only gait phase and blend state
- `src/game/GooseModel.ts` — bootstrap goose geometry and original prototype animation recipe
- `src/game/SplashKidModel.ts` — three soft, rounded splash-pad kids (Milo, June, Ari) with play/reaction clips
- `src/game/splashKidMoves.ts` — kid pose builders: contact-planted skips and gallops, splashes, flee runs, and crying
- `src/game/JanitorModel.ts` — procedural janitor mesh, rig, and exported clips
- `src/game/janitorGaits.ts` — knob-driven walk/chase gaits with leg IK that keeps stance feet planted
- `src/dev/animLab/` — shared runtime for the dev-only character animation labs
- `src/dev/janitorLab/`, `src/dev/kidLab/` — janitor and splash-kid lab variants and rig helpers
- `assets/characters/goose/goose-animated.blend` — current editable Blender character and animation source
- `src/game/WorldView.ts` — renders a selected authored world area from reusable asset instances
- `src/game/WorldEditor.ts` — in-game multi-area world-building tools and asset placement workflow
- `src/game/CameraTrackEditor.ts` — world-builder mode for drawing, tuning, and previewing an area's camera track
- `src/game/editorCatalog.ts` — the editor's drag-and-drop asset catalog drawer with rendered thumbnails
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

Open `?animation` for the close-up goose movement studio: walk/hurry, threat/sneak,
wingbeats, honk/grab/startle, moving head target, slow motion, and frame stepping.
See the [goose authoring workflow](assets/characters/goose/README.md) for Blender
editing/export and the remaining limits of foot contact at the current game speed.

Open `/assets/characters/janitor/anim-lab.html` (with `npm run dev`) for the janitor
animation lab: clip variants side by side with the shipped clips, game-camera, side,
and front views, frame stepping, and a treadmill floor that shows foot sliding. It
builds the rig from source, so edits to `src/dev/janitorLab/variants.ts` or
`JanitorModel.ts` reload in about a second. Use `?group=chase&zoom` to open a tab
close up. `/assets/characters/kids/anim-lab.html` is the same lab for the splash-pad
kids. New character animation is prototyped in a lab like this before it ships;
see [AGENTS.md](AGENTS.md#prototyping-character-animation).

## Coffee shop graybox

The active browser game includes an early coffee-shop interior graybox based on the
reference floor plan: the front door is on the south wall, the counter runs along
the left wall, and five people are visual placeholders only. The coffee shop is now
the default start location and is connected to the leftmost storefront on the
south side of the plaza. Use `?dev&start=coffee-shop` or simply open the normal
URL to start there. Use `?dev&start=old-town-square.central-plaza` to test walking
through the plaza doorway. Use `?edit&dev&start=coffee-shop`
to inspect and reposition the authored shop instances in the world editor.

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

The shared lighting uses neutral ambient light (92%) and one directional sun
(8%), leaving only faint directional contrast and grounding shadows. The goose
uses a constant toon ramp for flat palette colors without body-shading bands.
Its torso, tail, neck, and head form one continuous Blender-authored surface;
folded wings are thin tapered blades, not attached ovoids. The white chinstrap
is a marking cut into that skin. Keep `NoToneMapping`. Avoid hemisphere/fill
lights, bloom, fog, glossy materials, and additive glows. Animated character
parts cast faint shadows onto the world but do not receive self-shadow seams.

## Photo-informed Old Town Square

The current square uses the approved muted-brick storefront style and a composition
informed by the DDA site plan and renovation photos. Open `?overview` for an orbitable
view of the complete square, with links to walking and editing modes. The editor
catalog includes all five GLB storefronts and the new landmark blocks and street
furniture. See [reconstruction references and approximations](docs/old-town-reconstruction.md).

Older browser drafts are archived before the new composition is loaded. Use
**Restore previous square** in the editor to recover one; other authored areas stay
intact. If browser storage cannot retain the backup, the previous draft stays active.
