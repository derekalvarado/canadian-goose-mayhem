import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CAFE_VARIANTS, type CafeVariant } from "../src/game/CafePersonModel.ts";
import { CafePersonView, cafeClipFor } from "../src/game/CafePersonView.ts";
import type { CafePersonState } from "../src/game/simulation/cafeCrew.ts";

async function loadPerson(variant: CafeVariant) {
  const data = await readFile(new URL(`../assets/characters/cafe/models/cafe-${variant}.glb`, import.meta.url));
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
}

test("exported café people are grounded, fully weighted, and carry hand sockets", async () => {
  for (const variant of CAFE_VARIANTS) {
    const gltf = await loadPerson(variant);
    gltf.scene.updateMatrixWorld(true);
    assert.ok(Math.abs(new THREE.Box3().setFromObject(gltf.scene).min.y) < 0.02, `${variant} stands on the floor`);
    for (const side of ["left", "right"]) assert.equal(gltf.scene.getObjectByName(`${side}_hand_socket`)?.parent?.name, `${side}_wrist`);
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.SkinnedMesh)) return;
      assert.equal(object.skeleton.bones.length, 18);
      const weights = object.geometry.getAttribute("skinWeight");
      for (let i = 0; i < weights.count; i++) {
        const w = new THREE.Vector4().fromBufferAttribute(weights, i);
        assert.ok(Math.abs(w.x + w.y + w.z + w.w - 1) < 1e-6, `${variant} ${object.name} weight`);
      }
    });
  }
});

test("café clips bend knees and elbows the anatomical way", async () => {
  const euler = new THREE.Euler();
  for (const variant of CAFE_VARIANTS) {
    const gltf = await loadPerson(variant);
    for (const clip of gltf.animations) {
      for (const track of clip.tracks) {
        const [bone, property] = track.name.split(".");
        if (property !== "quaternion" || !/_(knee|elbow)$/.test(bone)) continue;
        for (let i = 0; i < track.times.length; i++) {
          const x = euler.setFromQuaternion(new THREE.Quaternion().fromArray(track.values, i * 4)).x;
          if (bone.endsWith("knee")) assert.ok(x <= 1e-6, `${variant} ${clip.name} ${bone} hyperextends (${x})`);
          else assert.ok(x >= -1e-6, `${variant} ${clip.name} ${bone} hyperextends (${x})`);
        }
      }
    }
  }
});

test("seated clips lower the hips while the feet stay on the floor", async () => {
  for (const variant of CAFE_VARIANTS) {
    const gltf = await loadPerson(variant);
    const scene = gltf.scene;
    const measure = (clipName: string) => {
      const mixer = new THREE.AnimationMixer(scene);
      mixer.clipAction(gltf.animations.find((clip) => clip.name === clipName)!).play(); mixer.setTime(0.5);
      scene.updateMatrixWorld(true);
      const hips = scene.getObjectByName("hips")!.getWorldPosition(new THREE.Vector3()).y;
      const ankle = scene.getObjectByName("left_ankle")!.getWorldPosition(new THREE.Vector3()).y;
      mixer.stopAllAction(); mixer.uncacheRoot(scene);
      return { hips, ankle };
    };
    const standing = measure("idle");
    for (const name of gltf.animations.map((clip) => clip.name).filter((name) => name.startsWith("sit"))) {
      const seated = measure(name);
      assert.ok(seated.hips < standing.hips - 0.1, `${variant} ${name} sits down`);
      assert.ok(Math.abs(seated.ankle - standing.ankle) < 0.05, `${variant} ${name} keeps the feet on the floor`);
    }
  }
});

test("café people pick clips from what they are doing, and open their mouths when startled", async () => {
  const base: CafePersonState = { id: "p", role: "customer", variant: "laptop", position: { x: 0, y: 0, z: 0 }, heading: 0,
    activity: "working", activitySecondsRemaining: 0, seated: true, moving: false };
  assert.equal(cafeClipFor(base, false), "sit-type");
  assert.equal(cafeClipFor({ ...base, variant: "reader" }, false), "sit-read");
  assert.equal(cafeClipFor({ ...base, activity: "sipping" }, false), "sit-sip");
  assert.equal(cafeClipFor({ ...base, seated: false, activity: "walking-to-pickup" }, true), "walk");
  assert.equal(cafeClipFor({ ...base, seated: false, activity: "returning-to-seat", heldEntityId: "cup" }, true), "carry");
  assert.equal(cafeClipFor({ ...base, role: "barista", variant: "barista", seated: false, activity: "chasing" }, true), "jog");
  assert.equal(cafeClipFor({ ...base, role: "barista", variant: "barista", seated: false, activity: "brewing" }, false), "brew");

  const source = await loadPerson("student");
  const view = new CafePersonView("student", async () => source);
  await view.ready;
  view.setState({ ...base, variant: "student", activity: "startled" });
  assert.equal(view.activeClip, "sit-startle");
  assert.equal(view.getObjectByName("cafe-mouth-open")?.visible, true);
  view.setState({ ...base, variant: "student", activity: "working" });
  assert.equal(view.getObjectByName("cafe-mouth-open")?.visible, false);
});
