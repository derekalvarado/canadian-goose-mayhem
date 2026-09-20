import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TrashCanView } from "../src/game/TrashCanView.ts";
import { createWorldAssetView } from "../src/game/PlazaWorld.ts";
import { OcclusionFadeGroupRegistry } from "../src/game/OcclusionFadeGroups.ts";
import { CANONICAL_WORLD_LAYOUT, cloneWorldLayout, createInstance, getWorldArea, serializeWorldLayout, validateWorldLayout } from "../src/game/worldLayout.ts";
import { isWorldAreaPlayable } from "../src/game/worldLevel.ts";

test("trash can GLB retains its size and preview materials do not leak into placements", async () => {
  const bytes = await readFile(new URL("../assets/props/trash_can.glb", import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const loader = async () => gltf.scene;
  const preview = new TrashCanView(loader);
  preview.userData.editorIgnore = true;
  const placed = new TrashCanView(loader);
  await Promise.all([preview.ready, placed.ready]);
  const bounds = new THREE.Box3().setFromObject(placed);
  assert.ok(Math.abs(bounds.max.y - 1.3) < 1e-6);
  assert.equal(bounds.min.y, 0);
  assert.ok(Math.abs(bounds.min.x + bounds.max.x) < 1e-6);
  for (const [view, opacity] of [[preview, 0.45], [placed, 1]] as const) {
    let count = 0;
    view.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      count++;
      for (const material of [object.material].flat()) {
        assert.ok(material instanceof THREE.MeshToonMaterial);
        assert.equal(material.opacity, opacity);
      }
    });
    assert.ok(count > 0);
  }
});

test("editor trash can placement round-trips and blocks movement at its authored position", () => {
  const world = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  const area = getWorldArea(world);
  area.instances = area.instances.filter((item) => item.assetId === "plaza.paving-base");
  assert.equal(isWorldAreaPlayable(area, 2, 3), true);
  const item = createInstance(area, "street.trash-can", "test.bin", 2, 3);
  item.transform.rotationY = Math.PI / 2;
  const restored = getWorldArea(validateWorldLayout(JSON.parse(serializeWorldLayout(world))));
  assert.deepEqual(restored.instances.find((entry) => entry.id === item.id), item);
  assert.equal(isWorldAreaPlayable(restored, 2, 3), false);
  assert.equal(isWorldAreaPlayable(restored, 3, 3), true);
  assert.ok(createWorldAssetView(item.assetId, new OcclusionFadeGroupRegistry()) instanceof TrashCanView);
});
