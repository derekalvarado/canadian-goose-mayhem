# Props

Add production-ready prop assets here as they are approved. Create a setting
subfolder such as `street/`, `garden/`, or `plaza/` when its first prop is ready.

Each prop should retain an editable source or reproducible recipe alongside its
runtime GLB, and its collision and interaction data belong in the game content —
not in the model file.

## Deciduous tree

`deciduous_tree.glb`, `deciduous_tree_2.glb`, and `deciduous_tree_3.glb` form a
coordinated set based on the far-left green tree in the Parks & Nature row of
`concepts/asset-concepts.png`. Each has three or four separated, softly faceted
muted-green crowns supported by a continuous, tapered, bending trunk and visible
forks. All are 10 m tall with a ground-level origin centered on the trunk (glTF
Y-up), two rough nonmetallic materials, and no textures. A stable hash of each
world instance ID selects its presentation variant, so trees vary without changing
after reloads or adding presentation state to the world layout.
Runtime rendering uses the shared toon factory and palette. Find **Deciduous tree**
under **planting** in the world editor; its stable ID is `nature.deciduous-tree`.
Only the trunk blocks movement; camera fading applies to the complete tree.

Rebuild from the repository root with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/props/build_deciduous_tree.py
```

The recipe writes all three GLBs alongside itself and a comparison preview to
`/private/tmp/deciduous_tree_preview.png`.

## Building 1

`building1.glb` reproduces the leftmost building in the Buildings row of
`concepts/asset-concepts.png`: terracotta brick, four recessed arched upper windows
with cream lintels and sills, green shop awning, glazed storefront, and a flat
parapet roof. Its overall dimensions are **6.9 m wide × 6.9 m deep × 9.2 m tall**.
The origin is at ground center, glTF Y-up; the storefront faces +Z. It is an
exterior-only static asset with eight texture-free materials, converted to the
shared palette and toon materials at runtime.

Choose **Building 1 — arched brick storefront** under **architecture** in the world
editor (stable ID `street.building1`). Its solid footprint blocks movement and the
whole building participates in camera fading. Existing layouts are unchanged.

Rebuild the GLB and `/private/tmp/building1_preview.png` from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/props/build_building1.py
```

## Building variations 2–5

Companion exterior assets share Building 1's terracotta, limestone, blue-gray
windows, and sage palette, with distinct silhouettes and facade arrangements:

| Asset | Features | Width × depth × height |
| --- | --- | --- |
| `building2.glb` | Café, three broad arched windows, striped cream/sage awning, raised parapet crest | 6.90 × 6.93 × 8.75 m |
| `building3.glb` | Lighter terracotta shop, six paired arches, inset signboard, no awning | 6.90 × 6.59 × 8.80 m |
| `building4.glb` | Broad brick arcade, arched ground-floor glazing, small entrance canopy, corbel cornice | 7.70 × 6.93 × 8.40 m |
| `building5.glb` | Sage townhouse, two upper window rows, ground-floor shutters, doorstep, no awnings | 6.30 × 6.91 × 9.38 m |

Dimensions include projecting trim and canopies. All four have a ground-level
origin centered on the main shell, glTF Y-up, and front +Z. They contain only
flat-shaded meshes and rough, texture-free materials with the same material names
as Building 1. The signboard is blank for future shop signage. All four are available in the world editor under **architecture**, with stable
IDs `street.building2` through `street.building5`, collision footprints and shared
toon materials.

Rebuild all four and render a comparison of the actual exports (left to right,
Buildings 2–5) to `/private/tmp/building_variations_preview.png`:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/props/build_building_variations.py
```
