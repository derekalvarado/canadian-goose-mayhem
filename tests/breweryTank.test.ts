import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BreweryTankView } from "../src/game/BreweryTankView.ts";
import { createWorldAssetView } from "../src/game/PlazaWorld.ts";
import { OcclusionFadeGroupRegistry } from "../src/game/OcclusionFadeGroups.ts";
import { CANONICAL_WORLD_LAYOUT, cloneWorldLayout, createInstance, getWorldArea, loadWorldLayout, saveWorldLayout, serializeWorldLayout, validateWorldLayout } from "../src/game/worldLayout.ts";
import { isWorldAreaPlayable } from "../src/game/worldLevel.ts";

async function loadTank(): Promise<() => Promise<THREE.Group>> {
  const bytes = await readFile(new URL("../assets/props/brewery_tank.glb", import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  return async () => gltf.scene;
}

test("brewery tank GLB keeps its authored scale and every material reaches a view mesh", async () => {
  const view = new BreweryTankView(await loadTank());
  await view.ready;
  const bounds = new THREE.Box3().setFromObject(view);
  assert.ok(Math.abs(bounds.max.y - 8.4) < 1e-4);
  assert.ok(Math.abs(bounds.min.y) < 1e-4);
  assert.ok(Math.abs(bounds.min.x + bounds.max.x) < 1e-4);
  assert.ok(bounds.max.x < 2.5 && bounds.max.z < 2.5);
  let painted = 0;
  view.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    assert.ok(object.material instanceof THREE.MeshToonMaterial);
    assert.ok(object.geometry.getAttribute("position").count > 0, `${object.name} has no geometry`);
    painted++;
  });
  assert.equal(painted, 17);
});

test("editor brewery tank placement round-trips, blocks movement, and fades as one unit", async () => {
  const world = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  const area = getWorldArea(world);
  area.instances = area.instances.filter((item) => item.assetId === "plaza.paving-base");
  assert.equal(isWorldAreaPlayable(area, 2, 3), true);
  const item = createInstance(area, "oldtown.brewery-tank", "test.tank", 2, 3);
  item.transform.rotationY = Math.PI / 2;
  const restored = getWorldArea(validateWorldLayout(JSON.parse(serializeWorldLayout(world))));
  assert.deepEqual(restored.instances.find((entry) => entry.id === item.id), item);
  assert.equal(isWorldAreaPlayable(restored, 2, 3), false);
  assert.equal(isWorldAreaPlayable(restored, 3, 5), false);
  assert.equal(isWorldAreaPlayable(restored, 7, 3), true);

  const groups = new OcclusionFadeGroupRegistry();
  const view = createWorldAssetView(item.assetId, groups, item.id);
  assert.ok(view instanceof BreweryTankView);
  assert.equal(groups.groupById(item.id)?.meshes.length, 17);
});

test("the canonical square ships a brewery tank and older drafts gain it once", () => {
  const placed = getWorldArea(CANONICAL_WORLD_LAYOUT).instances.filter((item) => item.assetId === "oldtown.brewery-tank");
  assert.equal(placed.length, 1);
  assert.equal(isWorldAreaPlayable(getWorldArea(CANONICAL_WORLD_LAYOUT), placed[0].transform.x, placed[0].transform.z), false);

  const values = new Map<string, string>();
  const store = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const authored = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  authored.canonicalRevision = 12;
  const area = getWorldArea(authored);
  area.instances = area.instances.filter((item) => item.assetId !== "oldtown.brewery-tank");
  area.instances.find((item) => item.id === "plaza.goose-fountain")!.transform.x = -14.25;
  saveWorldLayout(authored, store);

  const upgraded = getWorldArea(loadWorldLayout(store));
  assert.equal(upgraded.instances.filter((item) => item.assetId === "oldtown.brewery-tank").length, 1);
  assert.equal(upgraded.instances.find((item) => item.id === "plaza.goose-fountain")?.transform.x, -14.25);
  assert.equal(getWorldArea(loadWorldLayout(store)).instances.filter((item) => item.assetId === "oldtown.brewery-tank").length, 1);
});
