import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { OcclusionFadeGroupRegistry } from "../src/game/OcclusionFadeGroups.ts";
import { createWorldAssetView, SplashPadView } from "../src/game/PlazaWorld.ts";
import { PALETTE } from "../src/game/palette.ts";
import { getWorldAsset, WORLD_ASSETS } from "../src/game/worldAssets.ts";

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
