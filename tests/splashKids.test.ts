import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SplashKidView } from "../src/game/SplashKidView.ts";
import { SPLASH_KID_MOUTHS, SPLASH_KID_VARIANTS, type SplashKidVariant } from "../src/game/SplashKidModel.ts";
import { SPLASH_KID_FLEE_SPEED, SPLASH_KID_PLAY_SPEEDS } from "../src/game/splashKidTuning.ts";

async function loadKid(variant: SplashKidVariant) {
  const data = await readFile(new URL(`../assets/characters/kids/models/splash-kid-${variant}.glb`, import.meta.url));
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
}
function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = []; root.traverse((object) => { if (object instanceof THREE.SkinnedMesh) meshes.push(object); }); return meshes;
}
const HEIGHTS: Record<SplashKidVariant, [number, number]> = { runner: [1.15, 1.3], boots: [1.1, 1.3], floaties: [0.95, 1.15] };

for (const variant of SPLASH_KID_VARIANTS) {
  test(`${variant} splash kid is grounded, child-sized, and janitor-rig compatible`, async () => {
    const gltf = await loadKid(variant); gltf.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    assert.ok(bounds.min.y > -0.01 && bounds.min.y < 0.01, `feet at ${bounds.min.y}`);
    assert.ok(bounds.max.y > HEIGHTS[variant][0] && bounds.max.y < HEIGHTS[variant][1], `height ${bounds.max.y}`);
    assert.deepEqual(gltf.animations.map((clip) => clip.name).sort(), ["cry", "flee", "hands_up", "idle", "skip", "splash", "stomp", "walk"]);
    const meshes = skinnedMeshes(gltf.scene); assert.ok(meshes.length >= 8);
    for (const mesh of meshes) {
      assert.deepEqual(mesh.skeleton.bones.map((bone) => bone.name), [
        "root", "hips", "spine", "chest", "neck", "head",
        "left_shoulder", "left_elbow", "left_wrist", "left_hip", "left_knee", "left_ankle",
        "right_shoulder", "right_elbow", "right_wrist", "right_hip", "right_knee", "right_ankle",
      ]);
    }
    for (const name of Object.values(SPLASH_KID_MOUTHS)) assert.ok(gltf.scene.getObjectByName(name), `missing ${name}`);
    for (const side of ["left", "right"]) assert.equal(gltf.scene.getObjectByName(`${side}_hand_socket`)?.parent?.name, `${side}_wrist`);
  });

  test(`${variant} splash kid clips bend knees and elbows the anatomical way`, async () => {
    const gltf = await loadKid(variant);
    const euler = new THREE.Euler();
    for (const clip of gltf.animations) {
      for (const track of clip.tracks) {
        const [bone, property] = track.name.split(".");
        if (property !== "quaternion" || !/_(knee|elbow)$/.test(bone)) continue;
        for (let i = 0; i < track.times.length; i++) {
          const x = euler.setFromQuaternion(new THREE.Quaternion().fromArray(track.values, i * 4)).x;
          if (bone.endsWith("knee")) assert.ok(x <= 1e-6, `${clip.name} ${bone} hyperextends (${x})`);
          else assert.ok(x >= -1e-6, `${clip.name} ${bone} hyperextends (${x})`);
        }
      }
    }
  });
}

test("the three kids are distinct models", async () => {
  const signatures = await Promise.all(SPLASH_KID_VARIANTS.map(async (variant) => {
    const gltf = await loadKid(variant);
    return skinnedMeshes(gltf.scene).map((mesh) => `${mesh.name}:${mesh.geometry.getAttribute("position").count}`).sort().join(",");
  }));
  assert.equal(new Set(signatures).size, SPLASH_KID_VARIANTS.length);
});

test("splash kid views clone skeletons, map gameplay states to poses, and wail when scared", async () => {
  const source = await loadKid("runner");
  const first = new SplashKidView("runner", async () => source); const second = new SplashKidView("runner", async () => source);
  await Promise.all([first.ready, second.ready]);
  assert.notEqual(skinnedMeshes(first)[0].skeleton.bones[0], skinnedMeshes(second)[0].skeleton.bones[0]);
  const mouth = (view: SplashKidView) => ({
    smile: view.getObjectByName(SPLASH_KID_MOUTHS.smile)!.visible, wail: view.getObjectByName(SPLASH_KID_MOUTHS.wail)!.visible,
  });
  assert.deepEqual(mouth(first), { smile: true, wail: false });
  first.setState({ id: "kid", position: { x: 0, y: 0, z: 0 }, heading: 0, activity: "disappointed", activitySecondsRemaining: 1.5 });
  first.update(0.28);
  assert.ok(Math.abs(first.getObjectByName("left_shoulder")!.rotation.z) > 1);
  first.setState({ id: "kid", position: { x: 0, y: 0, z: 0 }, heading: 0, activity: "crying", activitySecondsRemaining: 1 });
  first.update(0.7);
  assert.equal(first.activeClip, "cry");
  assert.deepEqual(mouth(first), { smile: false, wail: true });
  first.setState({ id: "kid", position: { x: 0, y: 0, z: 0 }, heading: 0, activity: "playing", activitySecondsRemaining: 0 });
  assert.deepEqual(mouth(first), { smile: true, wail: false });
  const clips = { playing: "skip", splashing: "splash", frightened: "flee", crying: "cry", "walking-away": "walk", returning: "walk", away: "idle" } as const;
  for (const [activity, clip] of Object.entries(clips)) {
    first.setState({ id: "kid", position: { x: 0, y: 0, z: 0 }, heading: 0, activity: activity as keyof typeof clips, activitySecondsRemaining: 1 });
    assert.equal(first.activeClip, clip, activity);
  }
});

/** Ankle world positions over one loop of `clip`, sampled at `steps` frames. */
function ankleTrack(scene: THREE.Object3D, clip: THREE.AnimationClip, side: "left" | "right", steps: number): THREE.Vector3[] {
  const mixer = new THREE.AnimationMixer(scene); const action = mixer.clipAction(clip).play();
  const ankle = scene.getObjectByName(`${side}_ankle`)!; const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    action.time = (clip.duration * i) / steps; mixer.update(0); scene.updateMatrixWorld(true);
    points.push(ankle.getWorldPosition(new THREE.Vector3()));
  }
  mixer.stopAllAction(); return points;
}

for (const variant of SPLASH_KID_VARIANTS) {
  test(`${variant} splash kid keeps planted feet moving at gameplay speed`, async () => {
    const gltf = await loadKid(variant);
    const speeds = { skip: SPLASH_KID_PLAY_SPEEDS[variant], walk: SPLASH_KID_PLAY_SPEEDS[variant], flee: SPLASH_KID_FLEE_SPEED };
    for (const [name, speed] of Object.entries(speeds)) {
      const clip = gltf.animations.find((candidate) => candidate.name === name)!;
      const steps = 240; const dt = clip.duration / steps;
      for (const side of ["left", "right"] as const) {
        const track = ankleTrack(gltf.scene, clip, side, steps);
        const ground = Math.min(...track.map((point) => point.y));
        // On the ground, a treadmill-matched foot slides back (+z) at the travel speed. Skip the
        // first and last keyframe interval of each contact (6 of 240 frames), where interpolation
        // blends into the swing.
        const down = track.map((point) => point.y <= ground + 0.005);
        let planted = 0;
        for (let i = 6; i < track.length - 6; i++) {
          if (!down.slice(i - 6, i + 7).every(Boolean)) continue;
          planted++;
          const velocity = (track[i + 1].z - track[i - 1].z) / (2 * dt);
          assert.ok(Math.abs(velocity - speed) < speed * 0.1, `${name} ${side} foot slides: ${velocity.toFixed(2)} m/s vs ${speed}`);
        }
        assert.ok(planted > steps * 0.12, `${name} ${side} foot is barely planted (${planted} frames)`);
      }
    }
  });
}
