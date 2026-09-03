# Goose Game 2 — The Bramble

The first playable slice is a browser-based 3D forest level. You control an original, high-detail Canada goose through a confined woodland clearing and leave through the north trail.

## Play locally

```bash
npm install
npm run dev
```

Open the local URL Vite prints in a browser.

## Controls

- Move: `WASD`, arrow keys, or the controller left stick
- Hurry: `Shift` or the right trigger
- Honk: `Space` or the controller south face button
- Rotate camera: `Q` / `E` or the controller right stick

## Project layout

- `src/game/Game.ts` — render loop, camera, movement, state, and audio
- `src/game/Goose.ts` — original procedural Canada goose model and animation
- `src/game/ForestWorld.ts` — forest, trail, lighting, props, and atmosphere
- `src/game/InputController.ts` — keyboard and standard gamepad input
- `src/game/level.ts` — level bounds and collision helpers
- `tests/level.test.ts` — deterministic boundary and trail tests

The earlier Godot experiment remains in `scenes/` and `scripts/`, and the original 2D Phaser prototype remains in `legacy/phaser-prototype/` for reference.
