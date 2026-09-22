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
    "aggressive", "grab", "honk", "hurry", "idle", "sneak", "spooked", "walk", "wing_flap", "wing_flutter", "wings_spread",
  ]);
  const meshes = skinnedMeshes(gltf.scene);
  assert.ok(gltf.scene.getObjectByName("goose-shell"), "body, neck, head and tail share one continuous authored shell");
  for (const side of ["left", "right"]) {
    const wing = gltf.scene.getObjectByName(`goose-${side}-wing`) as THREE.SkinnedMesh;
    assert.ok(wing);
    wing.geometry.computeBoundingBox();
    const size = wing.geometry.boundingBox!.getSize(new THREE.Vector3());
    assert.ok(size.x < size.z * 0.16, "folded wings must be thin blades, not ovoids");
  }
  assert.equal(meshes[0]?.skeleton.bones.length, 20);
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
    assert.deepEqual([...mesh.material.gradientMap!.image.data], [255, 255, 255], "goose surfaces must not have dark shading bands");
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

test("feet have filled webbing and a smoothly skinned ankle instead of separate prongs", async () => {
  const gltf = await loadGoose();
  for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
    const foot = gltf.scene.getObjectByName(`goose-${side}-foot`) as THREE.SkinnedMesh;
    assert.ok(foot);
    assert.equal(foot.userData.surface_design, "continuous-webbed-foot-and-ankle");
    // Blender bakes the source's authored 1.22-unit height envelope into meters.
    // Test this exported surface independently of animation pose.
    const scale = GOOSE_HEIGHT_METERS / 1.22;
    const surface = new THREE.Mesh(foot.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    surface.updateMatrixWorld(true);
    for (const offset of [-0.035, 0, 0.035]) {
      const ray = new THREE.Raycaster(new THREE.Vector3((sign * 0.1 + offset) * scale, 0.2, -0.070 * scale), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(surface);
      assert.ok(hits.length >= 2, `${side}: missing filled webbing between toe tips`);
      assert.ok(hits[0].point.y < 0.035 * scale && hits[0].point.y > 0.010 * scale, "webbing should be a thin rounded paddle");
      assert.ok(hits.at(-1)!.point.y >= -1e-6 && hits.at(-1)!.point.y < 0.006 * scale, "rounded toe edge must stay close to the sole");
    }
    const soleRay = new THREE.Raycaster(new THREE.Vector3(sign * 0.1 * scale, 0.3, 0), new THREE.Vector3(0, -1, 0));
    assert.ok(Math.abs(soleRay.intersectObject(surface).at(-1)!.point.y) < 1e-6, "central sole must remain flat at ground height");
    let blended = 0;
    const weights = foot.geometry.getAttribute("skinWeight");
    for (let i=0; i<weights.count; i++) if (weights.getY(i)>0) blended++;
    assert.ok(blended > 100, "ankle needs a gradual foot-to-leg skin transition");
    surface.material.dispose();
  }
});

test("authored foot contacts stay level, lift cleanly, and close the gait loops", async () => {
  const gltf = await loadGoose();
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const point = new THREE.Vector3();
  for (const name of ["idle", "walk", "hurry", "sneak"]) {
    mixer.stopAllAction();
    const clip = gltf.animations.find((clip) => clip.name === name)!;
    mixer.clipAction(clip).play();
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    for (let frame=0; frame<120; frame++) {
      mixer.setTime(clip.duration * frame / 120);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.getObjectByName("left_foot")!.getWorldPosition(point);
      minHeight = Math.min(minHeight, point.y);
      maxHeight = Math.max(maxHeight, point.y);
      if (frame/120 < (name === "hurry" ? 0.47 : 0.55)) {
        assert.ok(Math.abs(point.y - 0.015574) < 0.001, `${name} stance must stay on the floor: ${point.y}`);
      }
    }
    assert.ok(minHeight > 0.014, `${name}: foot penetrates ground`);
    if (name !== "idle") assert.ok(maxHeight - minHeight > 0.035, `${name}: no readable foot lift`);
    for (const track of clip.tracks) {
      const size = track.getValueSize();
      for (let i=0; i<size; i++) {
        assert.ok(Math.abs(track.values[i] - track.values[track.values.length-size+i]) < 0.0001,
          `${name}: discontinuous loop in ${track.name}`);
      }
    }
    assert.ok(!clip.tracks.some((track) => track.name === 'root.position' &&
      [...track.values].some((value) => Math.abs(value) > 0.0001)), "clips must not move the gameplay root");
  }
});

test("head tracking is smooth, reversible, and cannot accumulate while idling", async () => {
  const source = await loadGoose();
  const goose = new Goose(async () => source);
  const neutral = new Goose(async () => source);
  await Promise.all([goose.ready, neutral.ready]);
  goose.setLookTarget({ x: -2, y: 1, z: -2 });
  let largestStep = 0;
  let previous = new THREE.Quaternion();
  for (let frame=0; frame<720; frame++) {
    goose.update(1/60, frame/60, 0, 0, false, false);
    neutral.update(1/60, frame/60, 0, 0, false, false);
    const head = goose.getObjectByName("head")!;
    if (frame > 0) largestStep = Math.max(largestStep, previous.angleTo(head.quaternion));
    previous.copy(head.quaternion);
  }
  assert.ok(largestStep < 0.03, `head tracking snapped: ${largestStep}`);
  const head = goose.getObjectByName("head")!;
  const neutralHead = neutral.getObjectByName("head")!;
  const angle = head.quaternion.angleTo(neutralHead.quaternion);
  assert.ok(angle > 0.2 && angle < 0.4, `look offset drifted: ${angle}`);
  goose.setLookTarget();
  for (let frame=0; frame<180; frame++) {
    goose.update(1/60, frame/60, 0, 0, false, false);
    neutral.update(1/60, frame/60, 0, 0, false, false);
  }
  assert.ok(head.quaternion.angleTo(neutralHead.quaternion) < 0.001);
});

test("resolved one-shots survive loading, recover, and never move the world root", async () => {
  const source = await loadGoose();
  const goose = new Goose(async () => source);
  goose.honk(); goose.spook(); goose.grab();
  await goose.ready;
  goose.position.set(3, 0.4, 7);
  goose.rotation.y = 1.2;
  const neutral = new Goose(async () => source);
  await neutral.ready;
  for (let i=0; i<180; i++) {
    goose.update(1/60, i/60, 0.6, 0, false, false);
    neutral.update(1/60, i/60, 0.6, 0, false, false);
  }
  assert.deepEqual(goose.position.toArray(), [3, 0.4, 7]);
  assert.equal(goose.rotation.y, 1.2);
  for (const name of ["head", "lower_bill", "left_wing", "right_wing", "body"]) {
    assert.ok(goose.getObjectByName(name)!.quaternion.angleTo(neutral.getObjectByName(name)!.quaternion) < 0.001,
      `${name} failed to recover from a gesture`);
  }
});
