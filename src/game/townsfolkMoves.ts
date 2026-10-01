import type * as THREE from "three";
import { cycleClip, paced, pulse, walkPose, wave, type LegDimensions, type WalkStyle } from "./janitorGaits.ts";
import { arm, both, CAFE_WALK, carryPose, envelope, full, seat, seatedClips, standingClips, withHips, type Rotations } from "./cafeMoves.ts";
import { CUSTOMER_SHARED_TUNING } from "./cafeTuning.ts";
import { TOWNSFOLK_RUNNERS, TOWNSFOLK_WALK_SPEEDS, type TownsfolkLook } from "./townsfolkTuning.ts";

/**
 * Presentation clips for townsfolk: the café people's everyday walking, sitting,
 * and reactions, plus things parents and passers-by do in the square. Rig
 * directions match the janitor: +x swings a limb forward or leans the torso
 * back, knees bend with -x, elbows with +x, +y turns left, +z lifts the right side.
 */

/** Clips borrowed from the café people. */
const STANDING = new Set(["idle", "look", "shoo", "greet", "startle", "shrug"]);

/**
 * The townsfolk walk: the café people's calm gait, carried tall on long legs —
 * barely any crouch, a shorter stride (sized to the person) at a quicker step.
 */
export const TOWNSFOLK_WALK: Omit<WalkStyle, "legs" | "duration" | "speed"> = {
  ...CAFE_WALK, crouch: 0.04, bob: 0.03, stepHeight: 0.08, lean: 0.03,
};
/** Metres per full cycle (two steps) for a person of height scale 1. */
const STRIDE = 1.15;
/** Leg lengths read off a townsperson's rig. */
export function legsFromBind(bind: ReadonlyMap<string, THREE.Vector3>): LegDimensions {
  const hipJointY = (bind.get("hips")?.y ?? 0) + (bind.get("left_hip")?.y ?? 0);
  const thigh = -(bind.get("left_knee")?.y ?? 0); const shin = -(bind.get("left_ankle")?.y ?? 0);
  return { thigh, shin, hipJointY, ankleY: hipJointY - thigh - shin };
}
/** The walk at this person's pace and size. */
export function townsfolkWalkStyle(look: TownsfolkLook, legs: LegDimensions, tweak: Partial<WalkStyle> = {}): WalkStyle {
  const k = legs.ankleY / 0.19; const speed = TOWNSFOLK_WALK_SPEEDS[look];
  return { ...TOWNSFOLK_WALK, ...tweak, legs, speed, duration: STRIDE * k / speed };
}
const SEATED = new Set(["sit", "sit-sip", "sit-look", "sit-startle", "sit-shoo", "sit-wait"]);

/** A light, springy run with a short flight phase and pumping arms. */
export const TOWNSFOLK_RUN: Omit<WalkStyle, "legs"> = {
  duration: 0.62, speed: 3.1, stance: 0.42, stepHeight: 0.2, crouch: 0.1, bob: 0.05, bounce: 0.7,
  sway: 0.02, roll: 0.04, twist: 0.16, lean: 0.16, leanPump: 0.03, headSteady: 0.75, nod: 0.04,
  armSwing: 0.7, armOut: 0.14, elbowBend: 1.45, elbowPump: 0.25, armLag: 0.03, heelStrike: 0.1,
};

function squareClips(bind: ReadonlyMap<string, THREE.Vector3>): THREE.AnimationClip[] {
  const upright = (rot: Rotations, hipsX = 0, hipsY = 0) => full(rot, [hipsX, hipsY, 0]);
  return [
    // Hands on hips, weight shifting from foot to foot while watching the kids.
    cycleClip("watch", 6, (p) => upright({
      ...arm("left", -0.98, 0.3, 1.08, [-0.27, 0, 0], 0.69), ...arm("right", -0.98, 0.3, 1.08, [-0.27, 0, 0], 0.69),
      hips: [0, 0, 0.03 * wave(p)], spine: [0, 0, -0.02 * wave(p)], neck: [0, 0.15 * wave(p, 0.1), 0], head: [-0.05, 0.3 * wave(p, 0.15), 0],
      left_hip: [0, 0, -0.03 * wave(p)], right_hip: [0, 0, -0.03 * wave(p)],
    }, 0.025 * wave(p)), bind),
    // Clapping and cheering: hands meet in front of the chest a few times a second.
    cycleClip("clap", 0.5, (p) => {
      const meet = pulse(p, 0.25);
      const mix = (open: number, shut: number) => open + (shut - open) * meet;
      const hands = (side: "left" | "right") => arm(side, mix(-0.12, 0.5), mix(0.11, -0.4), mix(1.73, 1.37), [mix(-0.19, -0.31), 0, 0], mix(0.87, 1.04));
      return upright({ chest: [0.05, 0, 0], head: [0.08, 0, 0], ...hands("left"), ...hands("right") }, 0, 0.015 * meet);
    }, bind),
    // Calling across the splash pad with hands cupped round the mouth.
    cycleClip("call", 1.6, (p) => {
      const shout = envelope(p, 0.2, 0.35);
      return upright({
        chest: [0.1 * shout, 0, 0], spine: [0.04 * shout, 0, 0], head: [0.15 * shout, 0, 0],
        ...arm("left", 0.05 + 1.42 * shout, -0.33 * shout, 0.15 + 1.31 * shout, [0.04 * shout, 0, 0], 1.05 * shout),
        ...arm("right", 0.05 + 1.42 * shout, -0.33 * shout, 0.15 + 1.31 * shout, [0.04 * shout, 0, 0], 1.05 * shout),
      });
    }, bind),
    // Head down over a phone held at the chest, thumb scrolling.
    cycleClip("phone", 3, (p) => upright({
      ...arm("left", 0.05, 0.05, 0.25), ...arm("right", -0.1, 0.31, 1.48, [-0.12 + 0.06 * pulse(p * 3), 0, 0], 1.22),
      neck: [-0.2, 0, 0], head: [-0.3, 0.05 * wave(p), 0], spine: [-0.03, 0, 0],
    }), bind),
    // Filming: the phone held up level in both hands, panning slowly after the kids.
    cycleClip("film", 5, (p) => upright({
      ...arm("left", 1.39, -0.61, 1.37, [-0.52, 0, 0], 0.69), ...arm("right", 1.39, -0.61, 1.37, [-0.52, 0, 0], 0.69),
      chest: [0.04, 0.22 * wave(p), 0], spine: [0, 0.1 * wave(p), 0], head: [0.02, 0.05 * wave(p), 0],
    }), bind),
    // At the counter: a forearm on the top, nodding along while the order is taken.
    cycleClip("order", 2.4, (p) => upright({
      spine: [-0.08, 0, 0], head: [-0.05 + 0.08 * pulse(p * 2), 0.06 * wave(p), 0],
      ...arm("left", 0.05, 0, 0.2), ...arm("right", 0.72, -0.39, 0.1, [-0.25, 0, 0], -0.13),
    }), bind),
  ];
}

function benchClips(legs: LegDimensions, k: number, hipsY: number, bind: ReadonlyMap<string, THREE.Vector3>): THREE.AnimationClip[] {
  const s = seat(legs, k, hipsY);
  const pose = (upper: Rotations) => full({ ...s.legs, ...upper }, s.hips);
  return [
    // Phone in both hands in the lap, head bowed.
    cycleClip("sit-phone", 3, (p) => pose({
      ...both(0.55, -0.6, 1.15, [-0.3, 0, 0], 0.3), neck: [-0.18, 0, 0], head: [-0.32, 0.05 * wave(p), 0], spine: [-0.06, 0, 0],
      right_wrist: [-0.3 + 0.06 * pulse(p * 3), 0, 0],
    }), bind),
    // Arms spread along the bench back, face turned up to the sun.
    cycleClip("sit-relax", 6, (p) => pose({
      ...arm("left", -0.6, 1.0, 0.3, [0, 0, 0], -0.2), ...arm("right", -0.6, 1.0, 0.3, [0, 0, 0], -0.2),
      spine: [0.1, 0, 0], chest: [0.06 + 0.015 * wave(p), 0, 0], head: [0.22, 0.12 * wave(p, 0.2), 0],
    }), bind),
    // Leaning over to stroke the dog sitting on the bench beside them (to their right).
    cycleClip("sit-pet", 1.8, (p) => pose({
      ...arm("left", 0.25, -0.5, 0.35, [-0.1, 0, 0], 0.1), ...arm("right", -1.08 + 0.2 * wave(p), 1.45, 1.24, [0.11, 0, 0], -0.09),
      spine: [-0.06, -0.15, -0.16], chest: [0, -0.15, -0.06], head: [-0.2, -0.45, -0.05],
    }), bind),
  ];
}

export function createTownsfolkClips(look: TownsfolkLook, bind: ReadonlyMap<string, THREE.Vector3>): THREE.AnimationClip[] {
  const legs = legsFromBind(bind);
  const k = legs.ankleY / 0.19; const hipsY = bind.get("hips")?.y ?? 1.02 * k;
  const speed = TOWNSFOLK_WALK_SPEEDS[look];
  const runner = TOWNSFOLK_RUNNERS.includes(look);
  const walk = townsfolkWalkStyle(look, legs);
  const clips = [
    ...standingClips(legs, speed, bind).filter((clip) => STANDING.has(clip.name)),
    cycleClip("walk", walk.duration, (p) => withHips(walkPose(walk, p)), bind),
    cycleClip("carry", walk.duration, (p) => withHips(carryPose(walk, p)), bind),
    ...squareClips(bind),
    ...seatedClips(seat(legs, k, hipsY), bind, CUSTOMER_SHARED_TUNING.sipSeconds).filter((clip) => SEATED.has(clip.name)),
    ...benchClips(legs, k, hipsY, bind),
  ];
  if (runner) {
    const run = paced({ ...TOWNSFOLK_RUN, legs }, speed / TOWNSFOLK_RUN.speed);
    clips.push(cycleClip("run", run.duration, (p) => withHips(walkPose(run, p)), bind));
  }
  return clips;
}

