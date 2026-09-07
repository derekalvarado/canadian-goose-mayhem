# Goose Game Development Roadmap

Updated September 7, 2026. This note summarizes the design and development discussion so far. It is a planning document; no gameplay implementation is implied by the ideas below.

## Core direction

Build a small, single-player, browser-based social-stealth sandbox about physical comedy: the player observes routines, creates distractions, manipulates objects, provokes readable reactions, and completes independent objectives as a mischievous animal.

The fastest development strategy is the game-development equivalent of painting a base coat before adding details: build one small, ugly but complete **graybox vertical slice** before expanding the world, polishing every character, or supporting additional platforms.

## Current project state

- The active runtime is the TypeScript/Three.js browser game in `src/`.
- Gameplay state is separated into `src/game/simulation/`; rendering and camera behavior live in the presentation layer.
- The simulation already uses a fixed gameplay step, commands, resolved events, independent objectives, stable world IDs, and renderer-independent movement rules.
- The current world is one central plaza with about 28 authored instances and four playable chunks.
- The repository is small: roughly 4,900 lines of TypeScript across 27 source files.
- The current built browser output is roughly 648 KB uncompressed and contains no external 3D, texture, or music asset library yet.
- The current game has one goose, simple movement/collision constraints, one objective, and no NPCs, rigid-body physics, runtime area streaming, save/load, or multiplayer.

## Recommended first playable slice

Create one compact garden or courtyard containing:

- One player goose
- One gardener with a small routine
- One carryable or movable object
- One destination/container/objective target
- One bush or other hiding place
- One fence or gate
- A short route with at least one corner

The first slice should prove this loop:

```text
observe a routine
  -> create a distraction
  -> manipulate an object
  -> provoke a reaction
  -> exploit the opening
  -> complete an objective
```

The player should be able to get caught once, recover, and continue. Catching the player must not erase completed objectives, reset the whole neighborhood, or permanently strand an essential item.

## Development order

### 1. Define the first mischief scenario

Choose one concrete situation to prove, such as moving a gardener's watering can, stealing a hat, or luring the gardener away from a gate. This keeps the first prototype focused.

### 2. Graybox the space

Use primitive shapes and placeholder materials. Establish scale, traversal, camera visibility, and the basic route before making buildings or props attractive.

### 3. Build a narrow physics spike

Do not build a general physics sandbox first. Prove only the interactions the slice needs: carrying around a corner, moving through a narrow gate, dropping an object, throwing or nudging it, and recovering it after a shoo reaction.

The physics system should remain behind a simulation adapter. Three.js meshes display physics results; they do not decide gameplay outcomes.

### 4. Add one readable NPC

Start with a small state machine:

```text
routine -> notice -> investigate -> shoo/chase or retrieve -> search -> return
```

The NPC should use perception and remembered observations rather than knowing the goose's hidden live position. Vision, hearing, occlusion, movement collision, and cover should remain separate concepts.

### 5. Add three independent objectives

Objectives should verify outcomes rather than require a single button sequence. Test that they can be completed in different orders and that progress remains after being caught.

### 6. Playtest the graybox

Before polishing, verify that a new player can understand the space, discover the interaction, understand the NPC reaction, recover from failure, and find at least two plausible approaches.

### 7. Polish the proven slice

Only after the loop works should the project receive final character models, animation polish, sound, camera zones, detailed buildings, transitions, and visual effects.

### 8. Expand deliberately

Add another garden, interior, animal, or NPC only when the previous slice is stable and teaches something new. Reuse systems and content definitions rather than duplicating area-specific rules.

## Scene and area transitions

An interior such as a coffee shop can be treated as a new area or level presentation:

```text
doorway trigger
  -> fade out
  -> preserve simulation state
  -> replace or load the visible area group
  -> reposition the player and camera
  -> fade in
```

The simulation should preserve the player, carried objects, objectives, NPC facts, and persistent world state. Only the visible area needs to be swapped or streamed. A backend is not required for this.

The existing logical chunk concept can later support runtime loading, but true streaming should wait until asset size or performance measurements justify it.

## Characters and animation

Character selection can eventually use stable IDs such as `goose`, `pigeon`, and `rat`. The initial version should keep the characters mechanically similar and vary appearance first. Distinct abilities should be added only when the level and simulation support them.

Animation should be layered:

```text
base: idle / walk / hurry
overlay: flap / hiss / alert
head: look / peck / honk
action: reach / grasp / carry / drop
```

The simulation decides what happened. The animation system decides how it looks. Object pickup, for example, must be resolved by the simulation before the object attaches visually to a grip point.

The current goose is assembled from separate Three.js groups, so simple procedural animation can continue during prototyping. A rigged model with authored clips becomes worthwhile when the action library grows.

## Useful development tools

### Character laboratory

Create a small preview environment for testing each character's idle, walk, hurry, turn, flap, hiss, pickup, and startled states with collider and scale overlays. This is more valuable early on than producing final art for a large world.

### Asset pipeline

Recommended workflow:

```text
AI concept or rough model
  -> Blender cleanup and stylization
  -> GLB/glTF export
  -> gameplay metadata and simple colliders
  -> custom world editor placement
  -> browser runtime
```

Blender is the main recommendation for modeling, rigging, animation, and glTF/GLB export. Blockbench is useful for simple low-poly props. Meshy and Tripo can provide AI-generated starting meshes, textures, rough characters, and animation experiments, but generated assets still need cleanup, consistent styling, scale checks, and manually authored gameplay colliders.

- [Blender](https://www.blender.org/)
- [Blockbench](https://blockbench.net/)
- [Meshy documentation](https://docs.meshy.ai/en)
- [Tripo Developers](https://developers.tripo3d.ai/)

The custom world editor remains valuable because it understands stable IDs, areas, chunks, gameplay colliders, camera occlusion, and object metadata. Generic 3D editors do not know those rules.

## Platform and networking scope

These are later concerns, not first-slice requirements:

- Mobile: add touch controls that produce the same input frame as keyboard/gamepad input.
- Nintendo Switch: the browser build cannot simply run on the console; a native port and Nintendo developer access would be required.
- Local multiplayer: use a host-authoritative simulation with clients sending commands and receiving snapshots/events. This requires stable multi-player entities and networking, but not necessarily a cloud backend.
- Backend services: only needed for features such as online multiplayer, cloud saves, accounts, leaderboards, or shared persistent worlds.
- Editor distribution: split the editor into a development build or separate tool so it is not shipped with the game.

Do not build these systems until the single-player garden loop is compelling.

## Architecture principles to preserve

- Keep gameplay state and rules in the simulation, without DOM, Three.js, or audio dependencies.
- Keep one fixed gameplay step.
- Route inputs through commands and emit events only for resolved actions.
- Keep durable world facts separate from disposable presentation events.
- Use stable IDs for players, NPCs, props, areas, and objectives.
- Let humans and the goose use shared interaction rules.
- Keep perception based on what an NPC can see or hear and what it remembers.
- Keep traversal, sight blocking, hearing, and cover distinct.
- Let renderer views reflect state; do not let animation callbacks decide outcomes.
- Add systems only when a real slice mechanic requires them.

## Decision gates

Do not expand to a larger village until the first garden can answer “yes” to these questions:

1. Is the core mischief loop understandable without explanation?
2. Does the NPC reaction feel readable and funny?
3. Can the player recover from being caught?
4. Can the objective be completed in more than one plausible way?
5. Does the graybox remain enjoyable before final art?

If any answer is “no,” improve the small slice instead of adding more content or technology.
