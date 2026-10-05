import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { ACOUSTIC_GUITAR_LENGTH, createMusicianModel } from "../src/game/MusicianModel.ts";

/** A hand's grip in the held guitar's own axes: x across, y out of the strings, z from headstock to body. */
function gripOnGuitar(model: THREE.Object3D, side: "left" | "right"): THREE.Vector3 {
  const socket = model.getObjectByName("guitar_socket")!;
  const grip = model.getObjectByName(`${side}_hand_socket`)!.getWorldPosition(new THREE.Vector3());
  return socket.worldToLocal(grip);
}

test("the musician's hands stay on the guitar while she plays and rests", () => {
  const model = createMusicianModel();
  for (const name of ["play", "rest"]) {
    const clip = model.animations.find((candidate) => candidate.name === name)!;
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clip).play();
    for (let i = 0; i < 12; i++) {
      mixer.setTime((i / 12) * clip.duration);
      model.updateMatrixWorld(true);
      const fret = gripOnGuitar(model, "left"), strum = gripOnGuitar(model, "right");
      // Fretting hand wraps the neck: close to its centre line, between the nut and the body.
      assert.ok(Math.hypot(fret.x, fret.y) < 0.12, `${name} fretting hand drifts off the neck (${fret.toArray()})`);
      assert.ok(fret.z > 0.15 && fret.z < 0.6 * ACOUSTIC_GUITAR_LENGTH, `${name} fretting hand leaves the neck (${fret.z})`);
      // Strumming hand stays just in front of the strings over the body.
      assert.ok(strum.y > 0 && strum.y < 0.16, `${name} strumming hand is not over the strings (${strum.y})`);
      assert.ok(strum.z > 0.6 * ACOUSTIC_GUITAR_LENGTH && strum.z < ACOUSTIC_GUITAR_LENGTH, `${name} strumming hand leaves the body (${strum.z})`);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(model);
  }
});

test("musician clips never bend an elbow or knee backwards", () => {
  const model = createMusicianModel();
  const euler = new THREE.Euler();
  for (const clip of model.animations) {
    for (const track of clip.tracks) {
      const bone = track.name.split(".")[0];
      if (!/(elbow|knee)$/.test(bone) || !track.name.endsWith("quaternion")) continue;
      for (let i = 0; i < track.values.length; i += 4) {
        const x = euler.setFromQuaternion(new THREE.Quaternion().fromArray(track.values, i)).x;
        if (bone.endsWith("knee")) assert.ok(x <= 1e-6, `${clip.name} ${bone} hyperextends (${x})`);
        else assert.ok(x >= -1e-6, `${clip.name} ${bone} hyperextends (${x})`);
      }
    }
  }
});
