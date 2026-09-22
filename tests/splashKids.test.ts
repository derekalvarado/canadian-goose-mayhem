import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SplashKidView } from "../src/game/SplashKidView.ts";
import type { SplashKidVariant } from "../src/game/SplashKidModel.ts";

async function loadKid(variant: SplashKidVariant) {
  const data = await readFile(new URL(`../assets/characters/kids/models/splash-kid-${variant}.glb`, import.meta.url));
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
}
function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = []; root.traverse((object) => { if (object instanceof THREE.SkinnedMesh) meshes.push(object); }); return meshes;
}

for (const variant of ["runner", "boots"] as const) {
  test(`${variant} splash kid is grounded, child-sized, flat-armed, and janitor-rig compatible`, async () => {
    const gltf = await loadKid(variant); gltf.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    assert.ok(bounds.min.y > -0.01 && bounds.min.y < 0.01);
    assert.ok(bounds.max.y > 1.15 && bounds.max.y < 1.3);
    assert.deepEqual(gltf.animations.map((clip) => clip.name).sort(), ["cry", "hands_up", "idle", "run", "stomp", "walk"]);
    const meshes = skinnedMeshes(gltf.scene); assert.ok(meshes.length >= 8);
    for (const mesh of meshes) {
      assert.equal(mesh.skeleton.bones.length, 18);
      assert.deepEqual(mesh.skeleton.bones.map((bone) => bone.name), [
        "root", "hips", "spine", "chest", "neck", "head",
        "left_shoulder", "left_elbow", "left_wrist", "left_hip", "left_knee", "left_ankle",
        "right_shoulder", "right_elbow", "right_wrist", "right_hip", "right_knee", "right_ankle",
      ]);
    }
    for (const name of ["kid-sleeves", "kid-arms"]) {
      const armMesh = meshes.find((mesh) => mesh.name === name)!; armMesh.geometry.computeBoundingBox();
      assert.ok(armMesh.geometry.boundingBox!.max.z - armMesh.geometry.boundingBox!.min.z <= 0.055, `${name} must stay visually flat`);
    }
    for (const side of ["left", "right"]) assert.equal(gltf.scene.getObjectByName(`${side}_hand_socket`)?.parent?.name, `${side}_wrist`);
  });
}

test("splash kid views clone skeletons and map gameplay states to distinct poses", async () => {
  const source = await loadKid("runner");
  const first = new SplashKidView("runner", async () => source); const second = new SplashKidView("runner", async () => source);
  await Promise.all([first.ready, second.ready]);
  assert.notEqual(skinnedMeshes(first)[0].skeleton.bones[0], skinnedMeshes(second)[0].skeleton.bones[0]);
  first.setState({ id: "kid", position: { x: 0, y: 0, z: 0 }, heading: 0, activity: "disappointed", activitySecondsRemaining: 1.5 });
  first.update(0.28);
  assert.ok(Math.abs(first.getObjectByName("left_shoulder")!.rotation.z) > 1);
  first.setState({ id: "kid", position: { x: 0, y: 0, z: 0 }, heading: 0, activity: "crying", activitySecondsRemaining: 1 });
  first.update(0.7);
  assert.ok(first.getObjectByName("head")!.rotation.x > 0.2);
});
