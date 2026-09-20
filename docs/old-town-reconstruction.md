# Old Town Square reconstruction

This is a playable, stylized interpretation of the modern pedestrian square,
using the approved Building 1 palette and visual detail. It is not a survey or a
photogrammetry reconstruction. Positions and heights are authored in meters.

## References inspected

- [DDA event site plan, 2024 application, page 6](https://downtownfortcollins.org/wp-content/uploads/2024/12/Event-App-2024-Revised-FINAL-WITH-MAPS.pdf): fountain at the approach end, oval central event space, stage at Walnut Street, two longitudinal planting/seating strips. The map itself is dated July 30, 2023. Temporary vendor tents are not part of this scene.
- [Confluence renovation photographs](https://www.thinkconfluence.com/what-we-do/authentic-placemaking/old-town-square-revitalization): brick storefronts, cream cornices, green awnings, glazed canopy, bronze goose fountain, bear play sculpture, banner poles and festoon lighting.
- [Downtown Fort Collins history of the square](https://downtownfortcollins.com/visit/old-town-square): modern plaza renovation and the fountain, splash pad, stage, lighting and fireplace.

Photos were used as visual references, not copied into model textures. Geometry,
sign panels, palette materials and placement data are locally authored.

## Composition and approximations

The long axis is game X; positive X leads to Walnut Street and the stage. This
is a convenient local coordinate frame rather than geographic north. The plan's
spatial relationships guide placement; the 44 × 36 m central paving and approach
extensions are compressed for the existing close-follow game camera.

The fountain is at (-16, -1), splash pad at (-3, 0), stage at (20, 0), with
individually authored trees and seating on both edges. The new starting point
(-24, -3) approaches the square without immediately satisfying the fountain goal.

Miller Block and CooperSmith's are photo-informed facade interpretations, not
measured replicas. Ten smaller facades reuse the five approved building models,
with varied window arrangements, awnings and rooflines. Exact tenant identities,
hidden elevations, tree counts and furnishings are approximated. Building heights
remain around 8–10.6 m. Plaza trees use the existing deciduous model at 72% scale.

The fireplace is unlit. Buildings are exterior-only and have solid footprints.
The stage is a visual landmark with a solid platform, not a new climbable mechanic.
Existing fountain, splash-pad animation, and play sculptures are retained.

## Editing and rebuilding

- Open `?overview` to orbit the entire scene, `?edit` to arrange it, or the base URL to walk it.
- The canonical composition is `src/game/content/world-layout.json` (revision 4).
- `node scripts/generate-old-town-layout.mjs` regenerates its 78 named instances.
- All storefront variants, landmark blocks, shade trees, benches, beds, banner lamps,
  festoon spans, oval paving band, fireplace and stage are in the editor catalog.
- `src/game/OldTownViews.ts` builds the procedural landmarks and street furniture;
  GLB storefronts use `Building1View` and the shared toon palette.

## Previous layouts

Before a pre-revision-4 browser draft is refreshed, it is archived under
`goose-game-2.world-layout.before-old-town.v4`. Other authored areas are preserved.
If archiving or saving fails, the old draft remains in use. The editor offers
**Restore previous square** when a valid archive exists; this restoration can be
undone, and deliberately restored/imported layouts are not immediately upgraded
again. The first archive is retained across subsequent loads and resets.

The source layout from before this work is also retained at
`docs/reference/old-town-layout-before-rebuild.json` for import through the editor.

## Validation

`tests/oldTownRebuild.test.ts` verifies route connectivity, blocked building/bed
footprints, valid spawn, retained draft recovery, quota-failure behavior, and the
four additional GLB dimensions/materials. Existing layout, editor, camera-fading,
and simulation checks remain part of `npm test`; `npm run build` validates the
production bundle. Browser views were inspected in overview, editor and play mode.
