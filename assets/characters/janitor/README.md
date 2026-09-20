# Street janitor

`models/janitor-street-sweeper.glb` is the runtime model for the central-plaza
janitor. It uses rounded, smooth-normal forms, a shaped vest, simple pockets,
and palette colors without textures. The broom is no longer part of this model.

Regenerate it with:

```sh
npm run assets:janitor
```

The editable geometry, skin weights, and sample clips live in
`src/game/JanitorModel.ts`; `scripts/generate-janitor-glb.mjs` exports them.
Requires Node 22.18+ (the same requirement as the game's headless tests).

## Rig and animation

The GLB contains an 18-bone skeleton: root → hips → spine → chest → neck → head,
two shoulder/elbow/wrist chains, and two hip/knee/ankle chains. Vertices blend
between joints around the elbows, knees, and torso. Cap and face follow the head;
boots follow the legs. The model is Y-up, faces -Z, stands about 2.59 metres tall,
and has its origin on the ground between the feet.

The `idle`, `walk`, and `look` clips are exported with the skeleton. `JanitorView`
preserves the skin, clones bones per instance, converts materials with the shared
toon factory, and plays a subtle idle in the game. After `await view.ready`, use
`view.playAnimation("walk")` or `view.playAnimation("look")`; the view crossfades.
`WorldView.updatePresentation(delta)` advances the mixer, including pause handling.
The walk is a basic in-place rig demonstration, not a polished locomotion cycle.
No NPC routine, pathfinding, or gameplay movement has been added.

For hand-authored animation, import the GLB into Blender and animate its existing
armature. Author separate actions, export those actions with the mesh and skin,
and retain the bone/material names. The generated source remains authoritative:
save edited Blender work separately and do not regenerate over a hand-edited GLB.

Both wrists have empty `left_hand_socket` / `right_hand_socket` nodes, exposed by
`view.getHandSocket(side)`. A separately loaded broom can attach there for display.
Future ownership, pick-up, and drop rules must remain in the simulation; parenting
a visual prop to a wrist alone does not implement those gameplay actions. A
two-handed sweeping clip will also need the second hand aligned to the handle.

## Visual inspection

Run `npm run dev` and open `/assets/characters/janitor/preview.html`. The page loads
the actual runtime GLB and toon loader, with four 45° downward views, clip buttons,
a pause button, and a skeleton overlay. This is a development preview, not a game
route or production build entry.

The approved 2D angle sheet remains in `concepts/characters/janitor/` as the
visual reference.
