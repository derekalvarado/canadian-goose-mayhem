# Props

Add production-ready prop assets here as they are approved. Create a setting
subfolder such as `street/`, `garden/`, or `plaza/` when its first prop is ready.

Each prop should retain an editable source or reproducible recipe alongside its
runtime GLB, and its collision and interaction data belong in the game content —
not in the model file.

## Deciduous tree

`deciduous_tree.glb` matches the far-left green tree in the Parks & Nature row of
`concepts/asset-concepts.png`: rounded muted-green canopy with distinct overlapping leaf tufts and a chunky
brown forked trunk. Height is 10 m, with a ground-level origin centered on the trunk (glTF Y-up).
The asset uses 8,692 triangles, two rough nonmetallic materials, and no textures.
Runtime rendering uses the shared toon factory and palette. Find **Deciduous tree**
under **planting** in the world editor; its stable ID is `nature.deciduous-tree`.
Only the trunk blocks movement; camera fading applies to the complete tree.

Rebuild from the repository root with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/props/build_deciduous_tree.py
```

The recipe writes the GLB alongside itself and a preview to
`/private/tmp/deciduous_tree_preview.png`.
