import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { OcclusionFadeGroupRegistry } from "../src/game/OcclusionFadeGroups.ts";
import { createWorldAssetView, SplashPadView } from "../src/game/PlazaWorld.ts";
import { PALETTE } from "../src/game/palette.ts";
import { getWorldAsset, WORLD_ASSETS } from "../src/game/worldAssets.ts";
import { addWorldArea, CANONICAL_WORLD_LAYOUT, cloneWorldLayout, createInstance, toggleWorldChunkPlayable, worldChunkCoordinates } from "../src/game/worldLayout.ts";
import { isWorldAreaPlayable, resolveWorldAreaMovement } from "../src/game/worldLevel.ts";

test("the corner market building is a detailed catalog asset with matching solid footprint", () => {
  const asset = getWorldAsset("plaza.corner-market-building");
  assert.ok(asset);
  assert.equal(asset.category, "architecture");
  assert.deepEqual(asset.colliders, [{ shape: "box", x: 0, z: 0, halfWidth: 7.25, halfDepth: 6.1 }]);
  assert.equal(asset.occludesCamera, true);

  const groups = new OcclusionFadeGroupRegistry();
  const view = createWorldAssetView(asset.assetId, groups, "test.corner-market");
  const meshes: THREE.Mesh[] = [];
  view.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
  assert.ok(meshes.length > 100, `expected a richly modeled building, found ${meshes.length} meshes`);
  assert.ok(groups.groupById("test.corner-market"));
});

test("the large paving patch has four times the surface area of the standard patch", () => {
  const standard = getWorldAsset("plaza.paving-patch");
  const large = getWorldAsset("plaza.paving-patch-large");
  assert.ok(standard && large);
  assert.equal(large.label, "Large paving patch");
  assert.equal((large.halfWidth * 2) * (large.halfDepth * 2), (standard.halfWidth * 2) * (standard.halfDepth * 2) * 4);

  const view = createWorldAssetView(large.assetId, new OcclusionFadeGroupRegistry(), "test.large-patch");
  const bounds = new THREE.Box3().setFromObject(view);
  assert.ok(bounds.max.x - bounds.min.x >= 16 && bounds.max.x - bounds.min.x < 16.5);
  assert.ok(bounds.max.z - bounds.min.z >= 16 && bounds.max.z - bounds.min.z < 16.5);
});

test("each planter asset renders independently", () => {
  const planterIds = ["plaza.planter-east-north", "plaza.planter-east-south", "plaza.planter-south"];
  for (const assetId of planterIds) {
    const view = createWorldAssetView(assetId, new OcclusionFadeGroupRegistry(), `test.${assetId}`);
    let meshCount = 0;
    view.traverse((object) => { if (object instanceof THREE.Mesh) meshCount += 1; });
    assert.ok(meshCount > 1, `${assetId} should have planter and planting meshes`);
  }
});

test("the street janitor remains a non-blocking presentation asset", () => {
  const asset = WORLD_ASSETS.find((entry) => entry.assetId === "plaza.street-janitor");
  assert.ok(asset);
  assert.equal(asset.category, "character");
  assert.deepEqual(asset.colliders, []);

  const view = createWorldAssetView(asset.assetId, new OcclusionFadeGroupRegistry(), "test.street-janitor");
  assert.equal(view.userData.assetRole, "rigged-character");
  assert.equal(view.userData.gameplayState, "none");
  assert.equal(view.userData.visualDetailTier, 3);
});

test("visual detail landmarks keep their authored construction relationships", () => {
  const corner = createWorldAssetView("plaza.corner-market-building", new OcclusionFadeGroupRegistry(), "test.corner");
  const ledges: THREE.Mesh[] = [];
  const upperWindows: THREE.Group[] = [];
  corner.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData.assetRole === "window-ledge") ledges.push(object);
    if (object instanceof THREE.Group && object.userData.assetRole === "window" && object.userData.windowCenterY === 5.05) upperWindows.push(object);
  });
  assert.equal(ledges.length, 2);
  assert.equal(upperWindows.length, 8);
  const ledgeTop = ledges.map((ledge) => ledge.position.y + (ledge.geometry as THREE.BoxGeometry).parameters.height / 2);
  const windowBottom = 5.05 - 1.85 / 2;
  assert.ok(ledgeTop.every((top) => top < windowBottom && windowBottom - top < 0.1), "the ledge sits just below, without intersecting, the upper windows");

  const playArea = createWorldAssetView("plaza.play-area", new OcclusionFadeGroupRegistry(), "test.play-area");
  let bear: THREE.Group | undefined;
  let fish: THREE.Group | undefined;
  playArea.traverse((object) => {
    if (!(object instanceof THREE.Group)) return;
    if (object.userData.playSculpture === "bear") bear = object;
    if (object.userData.playSculpture === "fish") fish = object;
  });
  assert.ok(bear && fish);
  const bearBounds = new THREE.Box3().setFromObject(bear);
  const fishBounds = new THREE.Box3().setFromObject(fish);
  const bearSize = bearBounds.getSize(new THREE.Vector3());
  const fishSize = fishBounds.getSize(new THREE.Vector3());
  assert.ok(Math.max(bearSize.x, bearSize.y, bearSize.z) >= Math.max(fishSize.x, fishSize.y, fishSize.z) * 1.75, "bear should read as about twice the size of fish");
});

test("the splash pad uses pavers and nozzle dots instead of spike geometry", () => {
  const view = createWorldAssetView("plaza.splash-pad", new OcclusionFadeGroupRegistry(), "test.splash-pad");
  assert.ok(view instanceof SplashPadView);
  const nozzles: THREE.Object3D[] = [];
  const cones: THREE.Object3D[] = [];
  view.traverse((object) => {
    if (object.userData.splashPadNozzle) nozzles.push(object);
    if (object instanceof THREE.Mesh && object.geometry instanceof THREE.ConeGeometry) cones.push(object);
  });
  assert.equal(nozzles.length, 12);
  assert.equal(cones.length, 0);
});

test("cleanup props are reusable toon-shaded assets and the picker has its authored visual parts", () => {
  for (const assetId of ["prop.trash-bag", "prop.litter-picker", "litter.chip-bag", "litter.crumpled-paper", "litter.food-tray"]) {
    const asset = getWorldAsset(assetId);
    assert.ok(asset?.carryable);
    const view = createWorldAssetView(assetId, new OcclusionFadeGroupRegistry(), `test.${assetId}`);
    const meshes: THREE.Mesh[] = [];
    view.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
    assert.ok(meshes.length > 0);
    assert.ok(meshes.every((mesh) => mesh.material instanceof THREE.MeshToonMaterial));
  }
  const picker = createWorldAssetView("prop.litter-picker", new OcclusionFadeGroupRegistry(), "test.picker");
  const colors = new Set<number>();
  picker.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshToonMaterial) colors.add(object.material.color.getHex());
  });
  assert.ok(colors.has(PALETTE.workwear.reflective), "picker has a light-gray shaft");
  assert.ok(colors.has(PALETTE.plaza.iron), "picker has a dark grip and jaw");
  assert.ok(colors.has(PALETTE.plaza.awningBlue), "picker has blue trigger accents");
});

test("the gas meter bank is a solid wall prop placed against the southeast storefront", () => {
  const asset = getWorldAsset("oldtown.gas-meter-bank");
  assert.ok(asset);
  assert.equal(asset.category, "prop");
  assert.ok(asset.colliders.length > 0);
  for (const collider of asset.colliders) {
    assert.ok(Math.abs(collider.x) + (collider.halfWidth ?? 0) <= asset.halfWidth + 1e-9);
    assert.ok(Math.abs(collider.z) + (collider.halfDepth ?? 0) <= asset.halfDepth + 1e-9);
  }

  const view = createWorldAssetView(asset.assetId, new OcclusionFadeGroupRegistry(), "test.gas-meters");
  const bounds = new THREE.Box3().setFromObject(view);
  assert.ok(bounds.max.x - bounds.min.x <= asset.halfWidth * 2 + 0.05);
  assert.ok(bounds.max.z - bounds.min.z <= asset.halfDepth * 2 + 0.05);
  assert.ok(bounds.min.y > -0.05 && bounds.max.y < 1.8);
});

test("coffee shop chairs stand on four legs and the square tables fit their footprints", () => {
  const chair = createWorldAssetView("coffee.chair", new OcclusionFadeGroupRegistry(), "test.chair");
  const feet = new Set<string>();
  chair.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.min.y > 0.01) return;
    const center = bounds.getCenter(new THREE.Vector3());
    feet.add(`${Math.sign(center.x)},${Math.sign(center.z)}`);
  });
  assert.deepEqual([...feet].sort(), ["-1,-1", "-1,1", "1,-1", "1,1"], "a leg should reach the floor at every corner");

  for (const assetId of ["coffee.chair", "coffee.table"]) {
    const asset = getWorldAsset(assetId);
    assert.ok(asset);
    const bounds = new THREE.Box3().setFromObject(createWorldAssetView(assetId, new OcclusionFadeGroupRegistry(), `test.${assetId}`));
    assert.ok(bounds.max.x <= asset.halfWidth + 0.01 && bounds.min.x >= -asset.halfWidth - 0.01, `${assetId} width`);
    assert.ok(bounds.max.z <= asset.halfDepth + 0.01 && bounds.min.z >= -asset.halfDepth - 0.01, `${assetId} depth`);
    assert.ok(bounds.min.y > -0.01, `${assetId} stands on the floor`);
  }
});

test("plaza bistro sets pair a square folding table with two facing chairs inside their footprint", () => {
  const asset = getWorldAsset("plaza.cafe-table-set");
  assert.ok(asset);
  const view = createWorldAssetView("plaza.cafe-table-set", new OcclusionFadeGroupRegistry(), "test.bistro");
  const chairs: THREE.Object3D[] = [];
  view.traverse((object) => { if (object.name === "plaza folding bistro chair") chairs.push(object); });
  assert.equal(chairs.length, 2);
  assert.ok(chairs[0].position.x * chairs[1].position.x < 0, "chairs sit on opposite sides of the table");

  const bounds = new THREE.Box3().setFromObject(view);
  assert.ok(bounds.max.x <= asset.halfWidth + 0.01 && bounds.min.x >= -asset.halfWidth - 0.01, "width");
  assert.ok(bounds.max.z <= asset.halfDepth + 0.01 && bounds.min.z >= -asset.halfDepth - 0.01, "depth");
  assert.ok(bounds.min.y > -0.03 && bounds.max.y < 1.1, "height");
});

test("CooperSmith's pub keeps its tapered block, pergola and umbrella patio inside the catalog footprint", () => {
  const asset = getWorldAsset("oldtown.coopersmith-pub");
  assert.ok(asset);
  assert.equal(asset.category, "architecture");
  assert.equal(asset.occludesCamera, true);
  for (const collider of asset.colliders) {
    const halfX = collider.shape === "circle" ? collider.radius ?? 0 : collider.halfWidth ?? 0;
    const halfZ = collider.shape === "circle" ? collider.radius ?? 0 : collider.halfDepth ?? 0;
    assert.ok(Math.abs(collider.x) + halfX <= asset.halfWidth + 1e-9, `collider at ${collider.x},${collider.z} width`);
    assert.ok(Math.abs(collider.z) + halfZ <= asset.halfDepth + 1e-9, `collider at ${collider.x},${collider.z} depth`);
  }

  const groups = new OcclusionFadeGroupRegistry();
  const view = createWorldAssetView(asset.assetId, groups, "test.coopersmith");
  assert.ok(groups.groupById("test.coopersmith"));
  const bounds = new THREE.Box3().setFromObject(view);
  assert.ok(bounds.min.x >= -asset.halfWidth - 0.01 && bounds.max.x <= asset.halfWidth + 0.01, `width ${bounds.min.x}..${bounds.max.x}`);
  assert.ok(bounds.min.z >= -asset.halfDepth - 0.01 && bounds.max.z <= asset.halfDepth + 0.01, `depth ${bounds.min.z}..${bounds.max.z}`);
  assert.ok(bounds.min.y > -0.01 && bounds.max.y > 8.5 && bounds.max.y < 10.5, `height ${bounds.max.y}`);

  let umbrellas = 0;
  view.traverse((object) => { if (object.name === "CooperSmith's black patio umbrella") umbrellas += 1; });
  assert.equal(umbrellas, 7);
});

test("the goose walks into CooperSmith's patio through its gate but not through the fence or brick", () => {
  const world = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  const area = addWorldArea(world, "pub-test", "Pub test");
  const [ox, oz] = [20, 20];
  createInstance(area, "plaza.paving-base", "pub-test.paving", ox, oz);
  createInstance(area, "oldtown.coopersmith-pub", "pub-test.pub", ox, oz);
  const chunk = worldChunkCoordinates(ox, oz);
  toggleWorldChunkPlayable(area, chunk.x, chunk.z);
  const walkable = (x: number, z: number) => isWorldAreaPlayable(area, ox + x, oz + z);

  assert.equal(walkable(-8, 0), true, "open paving beside the long side wall");
  assert.equal(walkable(-5.2, -4), false, "the long side wall blocks");
  assert.equal(walkable(2.49, 4.15), false, "the diagonal facade blocks just in front of its face");
  assert.equal(walkable(3.03, 4.73), true, "the goose can walk along the diagonal facade");
  assert.equal(walkable(-3.15, 8.1), true, "the goose can stand at the square-end door");
  assert.equal(walkable(1.4, 10.6), false, "the front fence blocks");
  assert.equal(walkable(1.9, 9.6), true, "there is room between the umbrella tables");

  // Walk from outside the gate into the patio: x steps through the gap in the left run.
  const position = { x: ox - 7, y: 0, z: oz + 8.15 };
  for (let i = 0; i < 20; i++) resolveWorldAreaMovement(area, position, { x: position.x + 0.1, y: 0, z: position.z }, position);
  assert.ok(position.x > ox - 5.5, `the gate lets the goose in (reached x ${position.x - ox})`);
  const blocked = { x: ox - 7, y: 0, z: oz + 9 };
  for (let i = 0; i < 20; i++) resolveWorldAreaMovement(area, blocked, { x: blocked.x + 0.1, y: 0, z: blocked.z }, blocked);
  assert.ok(blocked.x < ox - 5.9 - 0.3, "the fence beside the gate stops the goose");
});
