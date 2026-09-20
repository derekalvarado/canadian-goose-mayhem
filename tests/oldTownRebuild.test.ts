import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Building1View } from "../src/game/Building1View.ts";
import { CANONICAL_WORLD_LAYOUT, cloneWorldLayout, getWorldArea, loadWorldLayout, loadPreviousWorldLayout, PRE_REBUILD_LAYOUT_STORAGE_KEY, WORLD_LAYOUT_STORAGE_KEY, saveWorldLayout } from "../src/game/worldLayout.ts";
import { createCentralPlazaRules, isWorldAreaPlayable } from "../src/game/worldLevel.ts";
import { getWorldAsset } from "../src/game/worldAssets.ts";

function memoryStore() {
  const values = new Map<string, string>();
  return { values, getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
}

test("square upgrade archives the previous draft, preserves other areas, and can be restored", () => {
  const store = memoryStore();
  const old = cloneWorldLayout(CANONICAL_WORLD_LAYOUT); old.canonicalRevision = 3;
  getWorldArea(old).instances.find(i => i.id === "plaza.goose-fountain")!.transform.x = -7;
  old.areas.push({ id: "custom-garden", label: "My garden", chunks: [], instances: [] });
  saveWorldLayout(old, store);
  const updated = loadWorldLayout(store);
  assert.equal(updated.canonicalRevision, 4);
  assert.equal(getWorldArea(updated).instances.find(i => i.id === "plaza.goose-fountain")!.transform.x, -16);
  assert.deepEqual(updated.areas[1], old.areas[1]);
  const backup = store.getItem(PRE_REBUILD_LAYOUT_STORAGE_KEY);
  assert.ok(backup);
  assert.equal(JSON.parse(backup).areas[0].instances.find((i: {id: string}) => i.id === "plaza.goose-fountain").transform.x, -7);
  loadWorldLayout(store);
  assert.equal(store.getItem(PRE_REBUILD_LAYOUT_STORAGE_KEY), backup);
  const restored = loadPreviousWorldLayout(store)!;
  saveWorldLayout(restored, store);
  assert.equal(getWorldArea(loadWorldLayout(store)).instances.find(i => i.id === "plaza.goose-fountain")!.transform.x, -7);
});

test("a full storage device cannot discard the user's previous layout", () => {
  const old = cloneWorldLayout(CANONICAL_WORLD_LAYOUT); old.canonicalRevision = 3;
  const store = { getItem: (k: string) => k === WORLD_LAYOUT_STORAGE_KEY ? JSON.stringify(old) : null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
  assert.deepEqual(loadWorldLayout(store), old);
});

test("new square has continuous routes from its entrance to the fountain, event space, and patios", () => {
  const area = getWorldArea(CANONICAL_WORLD_LAYOUT);
  const rules = createCentralPlazaRules(area);
  assert.ok(isWorldAreaPlayable(area, rules.spawn.x, rules.spawn.z));
  const fountain = area.instances.find(i => i.id === "plaza.goose-fountain")!;
  assert.ok(Math.hypot(rules.spawn.x - fountain.transform.x, rules.spawn.z - fountain.transform.z) > 6);
  const visited = new Set<string>();
  const queue = [[rules.spawn.x, rules.spawn.z]];
  const key = (x: number, z: number) => `${x},${z}`;
  visited.add(key(...queue[0] as [number, number]));
  for (let index = 0; index < queue.length; index++) {
    const [x, z] = queue[index];
    for (const [nx, nz] of [[x+1,z],[x-1,z],[x,z+1],[x,z-1]]) {
      if(nx < -37 || nx > 32 || nz < -15 || nz > 29 || visited.has(key(nx,nz)) || !isWorldAreaPlayable(area,nx,nz)) continue;
      visited.add(key(nx,nz)); queue.push([nx,nz]);
    }
  }
  for(const [x,z] of [[-20,-1],[-3,0],[16,0],[7,-12],[7,12],[-34,10]]) assert.ok(visited.has(key(x,z)), `Unreachable destination ${x},${z}`);
  for(const item of area.instances.filter(i => i.assetId.startsWith("street.building") || i.assetId === "oldtown.flower-bed")) {
    assert.equal(isWorldAreaPlayable(area,item.transform.x,item.transform.z),false,`${item.id} must block movement`);
  }
});

test("all four storefront variants load with toon materials, correct footprint, and independent geometry", async () => {
  for (let variant = 2; variant <= 5; variant++) {
    const bytes = await readFile(new URL(`../assets/props/building${variant}.glb`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    const view = new Building1View(async () => gltf.scene, variant);
    await view.ready;
    const bounds = new THREE.Box3().setFromObject(view);
    const asset = getWorldAsset(`street.building${variant}`)!;
    assert.ok(bounds.max.y > 8 && bounds.max.y < 9.5);
    assert.ok(Math.abs(bounds.min.y) < 1e-5);
    assert.ok(Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x)) <= asset.halfWidth + 1e-5);
    assert.ok(Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z)) <= asset.halfDepth + 1e-5);
    view.traverse(o => { if (o instanceof THREE.Mesh) assert.ok(o.material instanceof THREE.MeshToonMaterial); });
  }
});
