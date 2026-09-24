# Canada goose

`goose-animated.blend` is the current editable Blender source for the player character.
`goose.blend` and its backup are preserved as the earlier source (including any manual edits).
`models/canada-goose.glb` is the compact runtime export loaded by the browser game.
The model is 0.95 meters tall, Y-up, faces -Z, and has a ground-level origin.

The 20-joint armature has six neck joints, head, bill, wing, wing-tip, leg,
independent foot, tail, body, and chest controls. Foot targets are baked in
armature space, keeping the stance foot level through body sway. Separate feet
avoid inheriting shin stretch/shear. All locomotion is in-place.

The GLB contains these stable animation names:

| Clips | Runtime behavior |
| --- | --- |
| `idle` | Breathing, small weight shifts, quiet glances |
| `walk`, `hurry`, `sneak` | Shared contact phase; speed-dependent blending and cadence |
| `honk`, `grab`, `spooked` | Additive one-shots triggered by resolved simulation events; includes recovery |
| `wings_spread`, `aggressive` | Neutral-to-held poses played forward/back on press/release |
| `wing_flap`, `wing_flutter` | Additive broad/quick wingbeat loops blended while wings are held |

`sneak` is the visual gait while moving in threat posture; it does not add a new
stealth mechanic. `grab` also provides a bill gesture on dropping. `spooked`
provides the existing non-violent shoo response, not a new caught mechanic.

Export the saved Blender source after hand editing:

```sh
npm run assets:goose
```

Set `BLENDER_PATH` if Blender is not installed at the standard macOS path or on
PATH. The export script uses Blender's Actions mode, skinning/morph support, and
60 FPS sampling. It exports the rig and skinned palette meshes, without scene props.
Keep names and neutral first/last poses for additive one-shots. Loop clips must
match at their first/last frame. Runtime converts named palette materials to toon.

To deliberately regenerate **all geometry and animation authoring** from the reproducible
Python recipe (replaces hand edits to `goose-animated.blend`):

```sh
npm run assets:goose:author
```

This creates a bootstrap rig with `GooseModel.ts` in a temporary directory,
then rebuilds the upper-body geometry using `scripts/sculpt-goose.py`: one closed
surface blends tail, torso, chest, neck, head, and upper bill. Thin tapered wings
and an articulated lower bill remain separate; the curved white chinstrap is
part of the shell rather than an attached patch. `scripts/animate-goose.py`
skins, animates, saves, and exports the result in Blender.
Each foot has a rounded three-lobed webbed fan, a flat sole, and one continuous
tapered ankle/shin surface. Skin weights transition gradually between the
independent foot control and leg, preserving level stance contacts.
The earlier `import-goose-blend.py` is a legacy import
utility; do not run it as part of the new workflow.

## Runtime and review

Open `?animation` on the dev server for the close-up movement studio. It uses the
production `Goose` view, with walk/run selection, turning, held poses, moving gaze
target, honk/grab/startle, slow motion, pause, and frame stepping. Drag to orbit.

Open `/assets/characters/goose/anim-lab.html` to compare walk variants side by
side against the exported clip, at the game's walking cadence and speed. It poses
the exported rig with a TypeScript port of `gait()` (`src/dev/gooseLab/gait.ts`);
variants are knob sets in `src/dev/gooseLab/variants.ts` and hot-reload on save.
Port a chosen variant's values into `scripts/animate-goose.py`, re-export, and
update `SHIPPED_WALK` so `tests/gooseLab.test.ts` keeps the port matching the GLB.

`GooseAnimation.ts` owns presentation blending. Gameplay retains its fixed step,
speed, heading, collision, and event ownership. The renderer interpolates adjacent
simulation transforms for smoother displays above 60 Hz. Head tracking glances at
nearby visible props/people inside the forward cone, otherwise follows turns.
Tracking never supplies knowledge or actions to NPCs. Animation code restores the
mixer's base rotations each frame before applying the head/turn offsets.

The authored stance phase has level foot contact and a lifted return arc. The
plaza's existing fast movement speeds are retained and cadence is bounded for
readability, so this is not world-space foot-lock IK: some ground sliding remains
at full movement speed, during direction changes, or on stepped surfaces. Future
speed/stride tuning should be evaluated alongside chase balance.

Movement reference: House House's [official launch trailer](https://www.youtube.com/watch?v=5OrLdnOUEkY)
linked from the [official game site](https://untitled.goose.game/). Reference
qualities are readable alternating feet, a relatively steady head above a
waddling body, long low threat posture, and broad wing gestures. All rigging and
clips here are original project assets, not extracted game animations.

Validation: `npm test` and `npm run build`. Headless tests load the actual GLB and
check gait closure/ground contact, bounded tracking without drift, additive
recovery, frame-rate-independent blends, and immutable interpolation samples.
