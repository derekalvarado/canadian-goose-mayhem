import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GooseGaitRig, SHIPPED_WALK } from "../src/dev/gooseLab/gait.ts";

async function loadGoose() {
  const data = await readFile(new URL("../assets/characters/goose/models/canada-goose.glb", import.meta.url));
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
}

test("goose lab's walk port reproduces the exported walk clip, so lab variants compare against what ships", async () => {
  const exported = await loadGoose();
  const ported = await loadGoose();
  const clip = exported.animations.find((candidate) => candidate.name === "walk")!;
  assert.ok(Math.abs(clip.duration - SHIPPED_WALK.duration) < 1 / 60, "SHIPPED_WALK.duration matches the exported clip");
  const mixer = new THREE.AnimationMixer(exported.scene);
  const action = mixer.clipAction(clip).play();
  const rig = new GooseGaitRig(ported.scene.getObjectByName("canada-goose")!);
  const frames = Math.round(SHIPPED_WALK.duration * 60);
  const bones: THREE.Bone[] = [];
  exported.scene.traverse((object) => { if (object instanceof THREE.Bone) bones.push(object); });
  assert.equal(bones.length, 20);
  for (let frame = 0; frame < frames; frame += 5) {
    action.time = frame / 60;
    mixer.update(0);
    rig.apply(SHIPPED_WALK, frame / frames);
    for (const bone of bones) {
      const other = ported.scene.getObjectByName(bone.name)!;
      assert.ok(bone.position.distanceTo(other.position) < 1e-5, `${bone.name} position at frame ${frame}`);
      assert.ok(1 - Math.abs(bone.quaternion.dot(other.quaternion)) < 1e-6, `${bone.name} rotation at frame ${frame}`);
      assert.ok(bone.scale.distanceTo(other.scale) < 1e-5, `${bone.name} scale at frame ${frame}`);
    }
  }
});
