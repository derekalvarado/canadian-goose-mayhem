# Canada goose

`goose.blend` is the editable Blender source for the player character.
`models/canada-goose.glb` is the compact runtime export loaded by the browser game.
The model is meter-scale, Y-up, faces -Z, and has a ground-level origin.

The armature has six neck joints plus head, bill, wing, wing-tip, leg, body, and
chest controls. The GLB contains `idle`, `walk`, `hurry`, `honk`, `wings_spread`,
and `aggressive` clips. Held poses begin in the neutral bind pose so the runtime
can play them forward while pressed and backward when released.

Regenerate the recipe and refresh the Blender source with:

```sh
npm run assets:goose
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/import-goose-blend.py
```

For hand-authored revisions, edit `goose.blend`, preserve bone/material/clip names,
and export to `models/canada-goose.glb` with animations, skinning, and morph targets
enabled. Do not rerun the import step over hand-edited Blender work.
