import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { JanitorView } from "../src/game/JanitorView.ts";
import { PALETTE } from "../src/game/palette.ts";

async function loadJanitor() {
  const data = await readFile(new URL("../assets/characters/janitor/models/janitor-street-sweeper.glb", import.meta.url));
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
}
function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((object) => { if (object instanceof THREE.SkinnedMesh) meshes.push(object); });
  return meshes;
}

test("exported janitor is broom-free, grounded, and has valid weighted joints and prop sockets", async () => {
  const gltf = await loadJanitor();
  gltf.scene.updateMatrixWorld(true);
  const meshes = skinnedMeshes(gltf.scene);
  assert.equal(meshes.length, 9);
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  assert.ok(Math.abs(bounds.min.y) < 0.001);
  assert.ok(bounds.max.y > 2.5 && bounds.max.y < 2.65);
  assert.ok(bounds.max.x - bounds.min.x < 1.45);
  gltf.scene.traverse((object) => assert.doesNotMatch(object.name, /broom/i));
  assert.deepEqual(gltf.animations.map((clip) => clip.name).sort(), ["chase", "idle", "inspect", "look", "scratch", "shoo", "walk"]);
  for (const side of ["left", "right"]) {
    assert.equal(gltf.scene.getObjectByName(`${side}_hand_socket`)?.parent?.name, `${side}_wrist`);
  }
  let blendedVertices = 0;
  for (const mesh of meshes) {
    assert.equal(mesh.skeleton.bones.length, 18);
    const weights = mesh.geometry.getAttribute("skinWeight");
    const indices = mesh.geometry.getAttribute("skinIndex");
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < weights.count; i++) {
      const w = new THREE.Vector4().fromBufferAttribute(weights, i);
      assert.ok(Math.abs(w.x + w.y + w.z + w.w - 1) < 1e-6);
      assert.ok(w.toArray().every((v) => v >= 0 && v <= 1));
      assert.ok(new THREE.Vector4().fromBufferAttribute(indices, i).toArray().every((n) => n >= 0 && n < 18));
      if (w.x > 0 && w.y > 0) blendedVertices++;
      // Export/import must preserve the bind pose, not scatter body parts.
      const original = new THREE.Vector3().fromBufferAttribute(position, i);
      const posed = mesh.applyBoneTransform(i, original.clone());
      assert.ok(original.distanceTo(posed) < 1e-5);
    }
  }
  assert.ok(blendedVertices > 1000);
});

test("toon loading preserves independent animated skeletons, skin color, and editor preview opacity", async () => {
  const source = await loadJanitor();
  const first = new JanitorView(async () => source);
  const second = new JanitorView(async () => source);
  const preview = new JanitorView(async () => source);
  preview.userData.editorIgnore = true;
  await Promise.all([first.ready, second.ready, preview.ready]);
  assert.notEqual(skinnedMeshes(first)[0].skeleton.bones[0], skinnedMeshes(second)[0].skeleton.bones[0]);
  for (const [view, opacity] of [[first, 1], [second, 1], [preview, 0.45]] as const) {
    for (const mesh of skinnedMeshes(view)) {
      assert.equal(mesh.receiveShadow, false);
      assert.equal(mesh.castShadow, opacity === 1);
      for (const material of [mesh.material].flat()) {
        assert.ok(material instanceof THREE.MeshToonMaterial);
        assert.equal(material.opacity, opacity);
        if (material.name === "janitor-skin") assert.equal(material.color.getHex(), PALETTE.workwear.skin);
      }
    }
  }
  first.updateMatrixWorld(true);
  const socket = first.getHandSocket("left")!;
  const before = socket.getWorldPosition(new THREE.Vector3());
  const skin = skinnedMeshes(first).find((mesh) => mesh.name === "janitor-skin")!;
  const positions = skin.geometry.getAttribute("position");
  // Track a hand vertex, rather than merely checking that a bone was renamed.
  let handIndex = -1;
  for (let i = 0; i < positions.count; i++) {
    if (positions.getX(i) < -0.56 && positions.getY(i) < 1.1) { handIndex = i; break; }
  }
  assert.ok(handIndex >= 0);
  const vertex = new THREE.Vector3().fromBufferAttribute(positions, handIndex);
  first.playAnimation("walk", 0);
  first.update(0.25);
  first.updateMatrixWorld(true);
  assert.ok(socket.getWorldPosition(new THREE.Vector3()).distanceTo(before) > 0.01);
  assert.ok(skin.applyBoneTransform(handIndex, vertex.clone()).distanceTo(vertex) > 0.01);
  assert.ok(Math.abs(second.getObjectByName("left_elbow")!.rotation.x) < 1e-8);
  assert.deepEqual(first.position.toArray(), [0, 0, 0]);
  // A zero-delta/pause update must leave the animation pose unchanged.
  const paused = first.getObjectByName("left_elbow")!.quaternion.clone();
  first.update(0);
  assert.ok(paused.equals(first.getObjectByName("left_elbow")!.quaternion));
  first.playAnimation("look", 0);
  first.update(1);
  assert.ok(first.getObjectByName("head")!.rotation.y > 0.4);
});

test("exported clips bend knees and elbows the anatomical way", async () => {
  const gltf = await loadJanitor();
  const euler = new THREE.Euler();
  for (const clip of gltf.animations) {
    for (const track of clip.tracks) {
      const [bone, property] = track.name.split(".");
      if (property !== "quaternion" || !/_(knee|elbow)$/.test(bone)) continue;
      for (let i = 0; i < track.times.length; i++) {
        const x = euler.setFromQuaternion(new THREE.Quaternion().fromArray(track.values, i * 4)).x;
        // Forward is -Z: knees fold the shin back with -x, elbows fold the forearm forward with +x.
        if (bone.endsWith("knee")) assert.ok(x <= 1e-6, `${clip.name} ${bone} hyperextends (${x})`);
        else assert.ok(x >= -1e-6, `${clip.name} ${bone} hyperextends (${x})`);
      }
    }
  }
});

test("janitor stomps when chasing or recovering a stolen tool, and walks otherwise", async () => {
  const source = await loadJanitor();
  const view = new JanitorView(async () => source);
  await view.ready;
  view.setActivity("chasing-goose");
  assert.equal(view.activeClip, "chase");
  view.setActivity("walking-to-trash");
  assert.equal(view.activeClip, "walk");
  view.setActivity("retrieving-tool", true);
  assert.equal(view.activeClip, "chase");
  view.setActivity("retrieving-tool");
  assert.equal(view.activeClip, "walk");
});
