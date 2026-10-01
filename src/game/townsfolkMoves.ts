import type * as THREE from "three";
import { cycleClip, JANITOR_LEGS, paced, pulse, walkPose, wave, type LegDimensions, type WalkStyle } from "./janitorGaits.ts";
import { arm, both, CAFE_WALK, envelope, full, seat, seatedClips, standingClips, withHips, type Rotations } from "./cafeMoves.ts";
import { CUSTOMER_SHARED_TUNING } from "./cafeTuning.ts";
import { TOWNSFOLK_RUNNERS, TOWNSFOLK_WALK_SPEEDS, type TownsfolkLook } from "./townsfolkTuning.ts";

/**
 * Presentation clips for townsfolk: the café people's everyday walking, sitting,
 * and reactions, plus things parents and passers-by do in the square. Rig
 * directions match the janitor: +x swings a limb forward or leans the torso
 * back, knees bend with -x, elbows with +x, +y turns left, +z lifts the right side.
 */

/** Clips borrowed from the café people. */
const STANDING = new Set(["idle", "look", "walk", "carry", "shoo", "greet", "startle", "shrug"]);
const SEATED = new Set(["sit", "sit-sip", "sit-look", "sit-startle", "sit-shoo", "sit-wait"]);

/** A light, springy run with a short flight phase and pumping arms. */
export const TOWNSFOLK_RUN: Omit<WalkStyle, "legs"> = {
  duration: 0.62, speed: 3.1, stance: 0.42, stepHeight: 0.2, crouch: 0.16, bob: 0.06, bounce: 0.7,
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

function benchClips(legs: LegDimensions, k: number, bind: ReadonlyMap<string, THREE.Vector3>): THREE.AnimationClip[] {
  const s = seat(legs, k);
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
  const k = (bind.get("hips")?.y ?? 1.02) / 1.02;
  const legs: LegDimensions = { thigh: JANITOR_LEGS.thigh * k, shin: JANITOR_LEGS.shin * k, hipJointY: JANITOR_LEGS.hipJointY * k, ankleY: JANITOR_LEGS.ankleY * k };
  const speed = TOWNSFOLK_WALK_SPEEDS[look];
  const runner = TOWNSFOLK_RUNNERS.includes(look);
  // Runners still walk while they get their breath back.
  const walkSpeed = runner ? 1.5 : speed;
  const clips = [
    ...standingClips(legs, walkSpeed, bind).filter((clip) => STANDING.has(clip.name)),
    ...squareClips(bind),
    ...seatedClips(seat(legs, k), bind, CUSTOMER_SHARED_TUNING.sipSeconds).filter((clip) => SEATED.has(clip.name)),
    ...benchClips(legs, k, bind),
  ];
  if (runner) {
    const run = paced({ ...TOWNSFOLK_RUN, legs }, speed / TOWNSFOLK_RUN.speed);
    clips.push(cycleClip("run", run.duration, (p) => withHips(walkPose(run, p)), bind));
  }
  return clips;
}

/** The same walk the clips use, for the lab's treadmill. */
export function townsfolkWalkStyle(look: TownsfolkLook, legs: LegDimensions): WalkStyle {
  return paced({ ...CAFE_WALK, legs }, TOWNSFOLK_WALK_SPEEDS[look] / CAFE_WALK.speed);
}
