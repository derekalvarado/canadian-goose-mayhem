import * as THREE from "three";
import { arm, CAFE_WALK, full, withHips, type Rotations } from "../../game/cafeMoves.ts";
import { createDogModel, dogPose } from "../../game/DogModel.ts";
import { cycleClip, paced, pulse, walkPose, wave, type WalkStyle } from "../../game/janitorGaits.ts";
import { createTownsfolkModel, townsfolkLegs, type TownsfolkLook } from "../../game/TownsfolkModel.ts";
import { TOWNSFOLK_RUN } from "../../game/townsfolkMoves.ts";
import { TOWNSFOLK_WALK_SPEEDS } from "../../game/townsfolkTuning.ts";

/**
 * Alternatives to try against what the game ships. Each card says what it is
 * trying; pick by name ("watch B", "walk C") and the chosen pose moves into
 * src/game/townsfolkMoves.ts (or DogModel.ts for the dog).
 */

function bindOf(model: THREE.Object3D): Map<string, THREE.Vector3> {
  const bind = new Map<string, THREE.Vector3>();
  model.traverse((object) => { if ((object as THREE.Bone).isBone) bind.set(object.name, object.position.clone()); });
  return bind;
}
const binds = new Map<string, Map<string, THREE.Vector3>>();
const bind = (look: TownsfolkLook | "dog") => {
  let found = binds.get(look);
  if (!found) { found = bindOf(look === "dog" ? createDogModel() : createTownsfolkModel(look)); binds.set(look, found); }
  return found;
};
const upright = (rot: Rotations, hipsX = 0, hipsY = 0) => full(rot, [hipsX, hipsY, 0]);

/** Watching the kids, hands clasped in front, rocking gently. */
export function watchClasped(look: TownsfolkLook): THREE.AnimationClip {
  return cycleClip("watch B: hands clasped", 5, (p) => upright({
    ...arm("left", 0.39, -0.45, 0.76, [0.18, 0, 0], 0.98), ...arm("right", 0.39, -0.45, 0.76, [0.18, 0, 0], 0.98),
    hips: [0, 0, 0.025 * wave(p)], neck: [0, 0.15 * wave(p, 0.1), 0], head: [0, 0.3 * wave(p, 0.15), 0],
  }, 0.02 * wave(p)), bind(look));
}
/** Hands behind the back, rocking from heels to toes. */
export function watchBehind(look: TownsfolkLook): THREE.AnimationClip {
  return cycleClip("watch C: hands behind back", 4, (p) => upright({
    ...arm("left", -0.27, -0.61, 0.54, [0.22, 0, 0], 1.54), ...arm("right", -0.27, -0.61, 0.54, [0.22, 0, 0], 1.54),
    spine: [0.02 * wave(p * 2), 0, 0], chest: [0.04, 0, 0], head: [0.05, 0.25 * wave(p, 0.1), 0],
    left_ankle: [-0.06 * pulse(p * 2), 0, 0], right_ankle: [-0.06 * pulse(p * 2), 0, 0],
  }, 0, 0.012 * pulse(p * 2)), bind(look));
}
function walk(look: TownsfolkLook, name: string, tweak: Partial<WalkStyle>): THREE.AnimationClip {
  const style = paced({ ...CAFE_WALK, ...tweak, legs: townsfolkLegs(look) }, TOWNSFOLK_WALK_SPEEDS[look] / (tweak.speed ?? CAFE_WALK.speed));
  return cycleClip(name, style.duration, (p) => withHips(walkPose(style, p)), bind(look));
}
/** Looser and loungier: more hip sway, floppier arms, a softer bob. */
export const strollWalk = (look: TownsfolkLook) => walk(look, "walk B: relaxed stroll", { sway: 0.045, roll: 0.07, bob: 0.025, bounce: 0.2, armSwing: 0.3, armLag: 0.1, elbowBend: 0.2, lean: 0.02 });
/** On a mission: leaning in, swinging the arms, a springier step. */
export const purposefulWalk = (look: TownsfolkLook) => walk(look, "walk C: purposeful", { lean: 0.12, armSwing: 0.55, elbowBend: 0.55, elbowPump: 0.4, bob: 0.05, bounce: 0.7, twist: 0.14 });
/** A gentler jog: shorter quicker steps and relaxed arms. */
export function easyJog(): THREE.AnimationClip {
  const style = paced({ ...TOWNSFOLK_RUN, duration: 0.5, speed: 2.5, stepHeight: 0.14, bob: 0.04, armSwing: 0.45, elbowBend: 1.3, lean: 0.1, legs: townsfolkLegs("jogger") },
    TOWNSFOLK_WALK_SPEEDS.jogger / 2.5);
  return cycleClip("run B: easy jog", style.duration, (p) => withHips(walkPose(style, p)), bind("jogger"));
}
/** Each yap bounces the front paws off the bench. */
export function hoppingBark(): THREE.AnimationClip {
  return cycleClip("bark B: hopping", 0.6, (p) => {
    const hop = pulse(p, 0.05);
    return dogPose({
      pelvis: [0.25 * hop, 0, 0], chest: [0.05 * hop, 0, 0], neck: [0.2 + 0.15 * hop, 0, 0], head: [0.05, 0, 0], jaw: [-0.5 * pulse(p, 0.1), 0, 0],
      front_left_upper: [0.4 * hop - 0.25 * hop, 0, -0.08], front_right_upper: [0.4 * hop - 0.25 * hop, 0, 0.08],
      front_left_lower: [0.6 * hop, 0, 0], front_right_lower: [0.6 * hop, 0, 0],
      back_left_upper: [-0.25 * hop, 0, -0.05], back_right_upper: [-0.25 * hop, 0, 0.05], back_left_lower: [0.3 * hop, 0, 0], back_right_lower: [0.3 * hop, 0, 0],
      tail: [-0.2, 0.45 * wave(p * 2), 0], left_ear: [0.2, 0, 0], right_ear: [0.2, 0, 0],
    }, [0, 0.03 * hop, 0]);
  }, bind("dog"));
}
