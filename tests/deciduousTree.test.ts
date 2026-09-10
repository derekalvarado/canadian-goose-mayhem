import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DeciduousTreeView } from "../src/game/DeciduousTreeView.ts";
import { createWorldAssetView } from "../src/game/PlazaWorld.ts";
import { OcclusionFadeGroupRegistry } from "../src/game/OcclusionFadeGroups.ts";
import { getWorldAsset } from "../src/game/worldAssets.ts";
import { CANONICAL_WORLD_LAYOUT, cloneWorldLayout, createInstance, getWorldArea, serializeWorldLayout, validateWorldLayout } from "../src/game/worldLayout.ts";
import { isWorldAreaPlayable } from "../src/game/worldLevel.ts";

test("tree GLB preserves scale, ground pivot, simple geometry, and independent preview materials", async () => {
  const bytes = await readFile(new URL("../assets/props/deciduous_tree.glb", import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const preview = new DeciduousTreeView(async () => gltf.scene);
  const placed = new DeciduousTreeView(async () => gltf.scene);
  const groups = new OcclusionFadeGroupRegistry();
  const registered = groups.register("test.tree", placed);
  preview.userData.editorIgnore = true;
  preview.traverse((object) => {
    object.userData.editorIgnore = true;
    if (object instanceof THREE.Mesh) {
      object.material = object.material.clone();
      object.material.transparent = true;
      object.material.opacity = 0.45;
    }
  });
  await Promise.all([preview.ready, placed.ready]);
  const bounds = new THREE.Box3().setFromObject(placed);
  assert.ok(Math.abs(bounds.max.y - 10) < 1e-5);
  assert.ok(Math.abs(bounds.min.y) < 1e-5);
  assert.deepEqual(placed.position.toArray(), [0, 0, 0]);
  const asset = getWorldAsset("nature.deciduous-tree")!;
  assert.ok(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) <= asset.halfWidth);
  assert.ok(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) <= asset.halfDepth);
  let triangles = 0;
  placed.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    assert.ok(registered.meshes.includes(object));
    triangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3;
    assert.ok(object.material instanceof THREE.MeshToonMaterial);
    assert.equal(object.material.opacity, 1);
    assert.equal(object.material.map, null);
  });
  assert.ok(triangles > 2000 && triangles < 18000);
  preview.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    assert.equal(object.material.opacity, 0.45);
    assert.equal(object.castShadow, false);
    assert.equal(object.userData.editorIgnore, true);
  });
  const trunk = placed.children.find((object) => object.name === "Deciduous trunk")!;
  const trunkBounds = new THREE.Box3().setFromObject(trunk);
  assert.ok(Math.abs(trunkBounds.min.x + trunkBounds.max.x) < 0.2);
});

test("tree placements round-trip and only their trunks block the goose", () => {
  const world = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  const area = getWorldArea(world);
  area.instances = area.instances.filter((item) => item.assetId === "plaza.paving-base");
  const item = createInstance(area, "nature.deciduous-tree", "test.tree", 2, 3);
  item.transform.rotationY = Math.PI / 2;
  const restored = getWorldArea(validateWorldLayout(JSON.parse(serializeWorldLayout(world))));
  assert.deepEqual(restored.instances.find((entry) => entry.id === item.id), item);
  assert.equal(isWorldAreaPlayable(restored, 2, 3), false);
  assert.equal(isWorldAreaPlayable(restored, 2.6, 3), false);
  assert.equal(isWorldAreaPlayable(restored, 3.5, 3), true);
  const groups = new OcclusionFadeGroupRegistry();
  assert.ok(createWorldAssetView(item.assetId, groups, item.id) instanceof DeciduousTreeView);
  assert.ok(groups.groupById(item.id));
});
