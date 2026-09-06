import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { OcclusionFadeGroupRegistry } from "../src/game/OcclusionFadeGroups.ts";
import { createWorldAssetView } from "../src/game/PlazaWorld.ts";
import { getWorldAsset } from "../src/game/worldAssets.ts";

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
