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
  assert.equal(updated.canonicalRevision, 18);
  const canonicalFountain = getWorldArea(CANONICAL_WORLD_LAYOUT).instances.find(i => i.id === "plaza.goose-fountain")!;
  assert.equal(getWorldArea(updated).instances.find(i => i.id === "plaza.goose-fountain")!.transform.x, canonicalFountain.transform.x);
  assert.deepEqual(updated.areas[1], { ...old.areas[1], controlLinks: [] });
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

test("the gameplay content update preserves authored edits and is saved once", () => {
  const store = memoryStore();
  const authored = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  authored.canonicalRevision = 4;
  const area = getWorldArea(authored);
  area.instances = area.instances.filter((item) => !["plaza.splash-faucet", "plaza.beer-can", "plaza.shop-entrance"].includes(item.id));
  area.controlLinks = [];
  area.instances.find((item) => item.id === "plaza.goose-fountain")!.transform.x = -14.25;
  saveWorldLayout(authored, store);

  const updated = loadWorldLayout(store);
  assert.equal(updated.canonicalRevision, 18);
  assert.equal(getWorldArea(updated).instances.find((item) => item.id === "plaza.goose-fountain")?.transform.x, -14.25);
  assert.ok(getWorldArea(updated).instances.some((item) => item.id === "plaza.splash-faucet"));
  assert.deepEqual(getWorldArea(updated).controlLinks, [{ controllerId: "plaza.splash-faucet", targetId: "plaza.splash-pad" }]);
  assert.equal(JSON.parse(store.getItem(WORLD_LAYOUT_STORAGE_KEY)!).canonicalRevision, 18);
  assert.equal(getWorldArea(updated).instances.filter((item) => item.assetId.startsWith("plaza.splash-kid-")).length, 3);
  assert.equal(getWorldArea(updated).instances.filter((item) => getWorldAsset(item.assetId)?.cleanupRole === "litter").length, 3);
  assert.equal(getWorldArea(updated).instances.filter((item) => ["trash-bag", "litter-picker"].includes(getWorldAsset(item.assetId)?.cleanupRole ?? "")).length, 2);
});

test("a failed gameplay update leaves the stored authored revision untouched", () => {
  const authored = cloneWorldLayout(CANONICAL_WORLD_LAYOUT); authored.canonicalRevision = 4;
  const area = getWorldArea(authored);
  area.instances = area.instances.filter((item) => item.id !== "plaza.splash-faucet"); area.controlLinks = [];
  const raw = JSON.stringify(authored);
  const store = { getItem: (key: string) => key === WORLD_LAYOUT_STORAGE_KEY ? raw : null,
    setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
  assert.deepEqual(loadWorldLayout(store), authored);
});

test("canonical plaza authors one cleanup tool set and three persistent litter identities", () => {
  const area = getWorldArea(CANONICAL_WORLD_LAYOUT);
  const rules = createCentralPlazaRules(area);
  const byRole = (role: string) => rules.entities?.filter((entity) => entity.cleanup?.role === role) ?? [];
  assert.deepEqual(byRole("trash-can").map((entity) => entity.id), ["oldtown.bin-0", "oldtown.bin-1", "oldtown.bin-2", "oldtown.bin-3"]);
  assert.deepEqual(byRole("litter").map((entity) => entity.id).sort(), [
    "plaza.litter-chip-bag", "plaza.litter-crumpled-paper", "plaza.litter-food-tray",
  ]);
  assert.equal(byRole("trash-bag").length, 1);
  assert.equal(byRole("litter-picker").length, 1);
  assert.ok(rules.janitor?.cleanup);
  for (const entity of byRole("litter")) assert.equal(isWorldAreaPlayable(area, entity.position.x, entity.position.z), true);
});

test("drafts saved before the plaza rows were renamed gain the southwest/northeast ids and labels", () => {
  const store = memoryStore();
  const old = cloneWorldLayout(CANONICAL_WORLD_LAYOUT); old.canonicalRevision = 15;
  const plaza = getWorldArea(old);
  for (const item of plaza.instances) {
    if (item.id.includes(".southwest.")) item.id = item.id.replace(".southwest.", ".north.");
    else if (item.id.includes(".northeast.")) item.id = item.id.replace(".northeast.", ".south.");
    if (item.label.startsWith("Southwest storefront")) item.label = item.label.replace("Southwest storefront", "North storefront");
    else if (item.label.startsWith("Northeast storefront")) item.label = item.label.replace("Northeast storefront", "South storefront");
  }
  saveWorldLayout(old, store);
  const updated = loadWorldLayout(store);
  assert.equal(updated.canonicalRevision, 18);
  const updatedPlaza = getWorldArea(updated);
  assert.equal(updatedPlaza.instances.some((item) => item.id.includes(".north.") || item.id.includes(".south.")), false);
  assert.equal(updatedPlaza.instances.find((item) => item.id === "oldtown.southwest.shop-0")?.label, "Southwest storefront 1");
  assert.equal(updatedPlaza.instances.find((item) => item.id === "oldtown.northeast.shop-0")?.label, "Northeast storefront 1");
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


test("drafts saved before the tapered CooperSmith's pub swap the placeholder block once, keeping other edits", () => {
  const store = memoryStore();
  const old = cloneWorldLayout(CANONICAL_WORLD_LAYOUT); old.canonicalRevision = 16;
  const plaza = getWorldArea(old);
  const pub = plaza.instances.find((item) => item.id === "oldtown.coopersmith")!;
  Object.assign(pub, { assetId: "oldtown.coopersmith-block", label: "CooperSmith’s block (photo interpretation)", transform: { x: -32, y: 0, z: 14.75, rotationY: 2.53 } });
  plaza.instances.find((item) => item.id === "plaza.goose-fountain")!.transform.x = -14.25;
  saveWorldLayout(old, store);

  const updated = getWorldArea(loadWorldLayout(store));
  const canonical = getWorldArea(CANONICAL_WORLD_LAYOUT).instances.find((item) => item.id === "oldtown.coopersmith")!;
  const swapped = updated.instances.filter((item) => item.id === "oldtown.coopersmith");
  assert.equal(swapped.length, 1);
  assert.equal(swapped[0].assetId, "oldtown.coopersmith-pub");
  assert.deepEqual(swapped[0].transform, canonical.transform);
  assert.equal(updated.instances.some((item) => item.assetId === "oldtown.coopersmith-block"), false);
  assert.equal(updated.instances.find((item) => item.id === "plaza.goose-fountain")!.transform.x, -14.25);
  assert.equal(JSON.parse(store.getItem(WORLD_LAYOUT_STORAGE_KEY)!).canonicalRevision, 18);
});

test("drafts saved before the latest plaza arrangement update untouched placements and remove retired defaults", () => {
  const store = memoryStore();
  const old = cloneWorldLayout(CANONICAL_WORLD_LAYOUT); old.canonicalRevision = 17;
  const plaza = getWorldArea(old);
  plaza.instances.find((item) => item.id === "plaza.paving")!.transform = { x: 0, y: 0, z: 0, rotationY: 0 };
  plaza.instances.find((item) => item.id === "plaza.goose-fountain")!.transform = { x: -14.25, y: 0, z: -1, rotationY: 0 };
  plaza.instances.find((item) => item.id === "plaza.pavilion-stage")!.transform = { x: 20, y: 0, z: 0, rotationY: -Math.PI / 2 };
  plaza.instances.find((item) => item.id === "oldtown.coopersmith")!.transform.rotationY = 1.7808;
  plaza.instances.find((item) => item.id === "oldtown.southwest.tree-2")!.transform = { x: 9, y: 0, z: -8.5, rotationY: 1.4 };
  plaza.instances.find((item) => item.id === "plaza.splash-faucet")!.transform = { x: -7.75, y: 0, z: 0, rotationY: -Math.PI / 2 };
  plaza.instances.push(
    { id: "oldtown.southwest.bed-1", assetId: "oldtown.flower-bed", label: "Flower and shrub bed", transform: { x: 3.8, y: 0, z: -8.5, rotationY: 0 } },
    { id: "oldtown.southwest.bed-2", assetId: "oldtown.flower-bed", label: "Flower and shrub bed", transform: { x: 12.8, y: 0, z: -8.5, rotationY: 0 } },
    { id: "oldtown.southwest.tree-3", assetId: "nature.deciduous-tree", label: "Shade tree", transform: { x: 16, y: 0, z: -8.5, rotationY: 0 } },
  );
  saveWorldLayout(old, store);

  const updated = loadWorldLayout(store);
  const canonical = getWorldArea(CANONICAL_WORLD_LAYOUT);
  const updatedPlaza = getWorldArea(updated);
  assert.equal(updated.canonicalRevision, 18);
  for (const id of ["plaza.paving", "plaza.pavilion-stage", "oldtown.coopersmith", "oldtown.southwest.tree-2", "plaza.splash-faucet"]) {
    assert.deepEqual(updatedPlaza.instances.find((item) => item.id === id)!.transform, canonical.instances.find((item) => item.id === id)!.transform);
  }
  assert.equal(updatedPlaza.instances.find((item) => item.id === "plaza.goose-fountain")!.transform.x, -14.25);
  for (const id of ["oldtown.southwest.bed-1", "oldtown.southwest.bed-2", "oldtown.southwest.tree-3"]) {
    assert.equal(updatedPlaza.instances.some((item) => item.id === id), false);
  }
  assert.equal(JSON.parse(store.getItem(WORLD_LAYOUT_STORAGE_KEY)!).canonicalRevision, 18);
});
