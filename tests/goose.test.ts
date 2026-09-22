import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Goose } from "../src/game/Goose.ts";
import { GOOSE_HEIGHT_METERS } from "../src/game/GooseModel.ts";
import { PALETTE } from "../src/game/palette.ts";

async function loadGoose() {
  const data = await readFile(new URL("../assets/characters/goose/models/canada-goose.glb", import.meta.url));
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
}

function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((object) => { if (object instanceof THREE.SkinnedMesh) meshes.push(object); });
  return meshes;
}

test("exported goose is grounded, long-necked, rigged, and contains every gameplay clip", async () => {
  const gltf = await loadGoose();
  gltf.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  assert.ok(Math.abs(bounds.min.y) < 1e-6);
  assert.ok(Math.abs(bounds.max.y - GOOSE_HEIGHT_METERS) < 1e-6);
  assert.ok(bounds.max.z - bounds.min.z > 1.25);
  assert.deepEqual(gltf.animations.map((clip) => clip.name).sort(), [
    "aggressive", "honk", "hurry", "idle", "spooked", "walk", "wings_spread",
  ]);
  const meshes = skinnedMeshes(gltf.scene);
  assert.equal(meshes.length, 6);
  assert.equal(meshes[0]?.skeleton.bones.length, 17);
  const blackMesh = meshes.find((mesh) => mesh.material.name === "goose-black");
  assert.ok(blackMesh);
  const blackPositions = blackMesh.geometry.getAttribute("position");
  const lowBlackVertices: number[] = [];
  for (let index = 0; index < blackPositions.count; index += 1) {
    const y = blackPositions.getY(index);
    if (y < 0.06) lowBlackVertices.push(y);
  }
  assert.ok(Math.max(...lowBlackVertices) - Math.min(...lowBlackVertices) > 0.015, "webbed feet need visible thickness above the ground");
  for (const name of ["neck_1", "neck_2", "neck_3", "neck_4", "neck_5", "neck_6"]) {
    assert.ok(gltf.scene.getObjectByName(name), `missing ${name}`);
  }
  let blendedVertices = 0;
  for (const mesh of meshes) {
    const weights = mesh.geometry.getAttribute("skinWeight");
    for (let index = 0; index < weights.count; index += 1) {
      const weight = new THREE.Vector4().fromBufferAttribute(weights, index);
      assert.ok(Math.abs(weight.x + weight.y + weight.z + weight.w - 1) < 1e-6);
      if (weight.x > 0 && weight.y > 0) blendedVertices += 1;
    }
  }
  assert.ok(blendedVertices > 1000);
});

test("runtime goose uses toon materials and blends held poses forward and back", async () => {
  const source = await loadGoose();
  const goose = new Goose(async () => source);
  await goose.ready;
  for (const mesh of skinnedMeshes(goose)) {
    assert.ok(mesh.material instanceof THREE.MeshToonMaterial);
    assert.equal(mesh.receiveShadow, false);
    if (mesh.material.name === "goose-brown") assert.equal(mesh.material.color.getHex(), PALETTE.goose.canadaBrown);
  }

  goose.updateMatrixWorld(true);
  const head = goose.getObjectByName("head")!;
  const neutralHead = head.getWorldPosition(new THREE.Vector3());
  for (let frame = 0; frame < 60; frame += 1) goose.update(1 / 60, frame / 60, 0, 0, false, true);
  goose.updateMatrixWorld(true);
  const threatHead = head.getWorldPosition(new THREE.Vector3());
  assert.ok(threatHead.y < neutralHead.y - 0.27);
  assert.ok(threatHead.z < neutralHead.z - 0.19);

  for (let frame = 0; frame < 60; frame += 1) goose.update(1 / 60, frame / 60, 0, 0, true, false);
  goose.updateMatrixWorld(true);
  const leftTip = goose.getObjectByName("left_wing_tip")!.getWorldPosition(new THREE.Vector3());
  const rightTip = goose.getObjectByName("right_wing_tip")!.getWorldPosition(new THREE.Vector3());
  assert.ok(rightTip.x - leftTip.x > 0.62);

  for (let frame = 0; frame < 70; frame += 1) goose.update(1 / 60, frame / 60, 0, 0, false, false);
  goose.updateMatrixWorld(true);
  assert.ok(head.getWorldPosition(new THREE.Vector3()).distanceTo(neutralHead) < 0.03);
});
