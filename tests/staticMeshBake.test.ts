import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { bakeStaticMeshes, dropSmallShadows } from "../src/game/staticMeshBake.ts";
import { OcclusionFadeGroupRegistry } from "../src/game/OcclusionFadeGroups.ts";
import { toonMaterial } from "../src/game/toonMaterial.ts";
import { WorldView } from "../src/game/WorldView.ts";
import { createWorldAssetView } from "../src/game/PlazaWorld.ts";
import type { WorldArea } from "../src/game/worldLayout.ts";

function piece(color: number, x: number, size = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), toonMaterial(color));
  mesh.position.x = x;
  return mesh;
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => { if (object instanceof THREE.Mesh) found.push(object); });
  return found;
}

function triangles(root: THREE.Object3D): number {
  return meshes(root).reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, 0);
}

test("baking combines plain pieces into one mesh that keeps every triangle, color, and position", () => {
  const root = new THREE.Group();
  const nested = new THREE.Group(); nested.position.set(0, 2, 0); nested.scale.set(2, 2, 2);
  nested.add(piece(0x0000ff, 1));
  root.add(piece(0xff0000, -3), piece(0x00ff00, 3), nested);
  const before = triangles(root);

  bakeStaticMeshes(root);

  const after = meshes(root);
  assert.equal(after.length, 1);
  assert.equal(triangles(root), before);
  const merged = after[0];
  const colors = merged.geometry.attributes.color;
  const seen = new Set<string>();
  for (let i = 0; i < colors.count; i += 1) seen.add([colors.getX(i), colors.getY(i), colors.getZ(i)].join());
  assert.deepEqual([...seen].sort(), ["0,0,1", "0,1,0", "1,0,0"]);
  merged.geometry.computeBoundingBox();
  // The nested piece was scaled 2x and lifted, so its top now reaches y = 2 + 2 * 0.5.
  assert.equal(merged.geometry.boundingBox!.max.y, 3);
  assert.equal(merged.geometry.boundingBox!.min.x, -3.5);
  assert.equal(merged.geometry.boundingBox!.max.x, 3.5);
});

test("a mirrored piece still faces outward after baking", () => {
  const root = new THREE.Group();
  const mirrored = piece(0xffffff, 0); mirrored.scale.x = -1;
  root.add(mirrored, piece(0xffffff, 5));
  bakeStaticMeshes(root);
  const geometry = meshes(root)[0].geometry;
  const position = geometry.attributes.position; const normal = geometry.attributes.normal; const index = geometry.index!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i)); b.fromBufferAttribute(position, index.getX(i + 1)); c.fromBufferAttribute(position, index.getX(i + 2));
    const face = b.sub(a).cross(c.sub(a)).normalize();
    n.fromBufferAttribute(normal, index.getX(i));
    assert.ok(face.dot(n) > 0.99, `triangle ${i / 3} is inside out`);
  }
});

test("pieces in different camera-fade groups bake separately and still fade as their own group", () => {
  const registry = new OcclusionFadeGroupRegistry();
  const root = new THREE.Group();
  const front = new THREE.Group(); front.add(piece(0xff0000, 0), piece(0x00ff00, 2));
  const back = new THREE.Group(); back.add(piece(0xff0000, 0), piece(0x00ff00, 2));
  root.add(front, back);
  registry.register("front", front); registry.register("back", back);

  bakeStaticMeshes(root, registry);

  assert.equal(meshes(root).length, 2);
  const frontGroup = registry.groupById("front")!; const backGroup = registry.groupById("back")!;
  assert.equal(frontGroup.meshes.length, 1); assert.equal(backGroup.meshes.length, 1);
  assert.notEqual(frontGroup.meshes[0], backGroup.meshes[0]);
  assert.equal(registry.groupForMesh(frontGroup.meshes[0]), frontGroup);
  assert.deepEqual(new Set(registry.meshesForRaycast()), new Set([frontGroup.meshes[0], backGroup.meshes[0]]));
});

test("textured, custom-shaded, and shadow-differing pieces are not mixed together", () => {
  const root = new THREE.Group();
  const textured = piece(0xffffff, 0); (textured.material as THREE.MeshToonMaterial).map = new THREE.Texture();
  const shaded = piece(0xffffff, 1); (shaded.material as THREE.MeshToonMaterial).onBeforeCompile = () => {};
  const casting = piece(0xffffff, 2); casting.castShadow = true;
  const plainA = piece(0xffffff, 3); const plainB = piece(0xffffff, 4);
  root.add(textured, shaded, casting, plainA, plainB);
  bakeStaticMeshes(root);
  const left = meshes(root);
  assert.ok(left.includes(textured)); assert.ok(left.includes(shaded)); assert.ok(left.includes(casting));
  assert.ok(!left.includes(plainA) && !left.includes(plainB));
  assert.equal(left.length, 4);
});

test("tiny pieces stop casting shadows while large ones keep them", () => {
  const root = new THREE.Group();
  const bolt = piece(0xffffff, 0, 0.02); bolt.castShadow = true;
  const wall = piece(0xffffff, 0, 3); wall.castShadow = true;
  root.add(bolt, wall);
  dropSmallShadows(root);
  assert.equal(bolt.castShadow, false);
  assert.equal(wall.castShadow, true);
});

test("the world bakes still scenery but leaves objects with moving parts intact", () => {
  const area: WorldArea = {
    id: "bake-test", label: "Bake test", chunks: [],
    instances: [
      { id: "bench", assetId: "oldtown.bench", label: "Bench", transform: { x: 0, y: 0, z: 0, rotationY: 0 } },
      { id: "mug", assetId: "coffee.mug", label: "Mug", transform: { x: 4, y: 0, z: 0, rotationY: 0 } },
    ],
  };
  const view = new WorldView(area);
  const built = meshes(createWorldAssetView("oldtown.bench", new OcclusionFadeGroupRegistry())).length;
  assert.ok(meshes(view.instances.get("bench")!).length < built);
  assert.ok(meshes(view.instances.get("mug")!).every((mesh) => mesh.name !== "baked-static"));
});
