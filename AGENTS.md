# Gameplay development rules

Read `docs/game-architecture.md` before changing gameplay or adding areas. It is
the project's development direction and distinguishes implemented systems from
future acceptance gates.

- Work in the active `src/` browser game; Godot and Phaser folders are references.
- Gameplay state and rules belong in `src/game/simulation/`, without DOM, Three.js,
  or audio dependencies. Rendering reflects state; it does not decide outcomes.
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
