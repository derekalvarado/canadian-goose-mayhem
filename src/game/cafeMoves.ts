import type * as THREE from "three";
import { cycleClip, JANITOR_FURIOUS_STOMP, JANITOR_LEGS, legAngles, paced, pulse, walkPose, wave, type BoneName, type LegDimensions, type Pose, type Vec3, type WalkStyle } from "./janitorGaits.ts";
import { BARISTA_JOG_SPEED, BARISTA_WALK_SPEED, CUSTOMER_WALK_SPEED, CUSTOMER_SHARED_TUNING, type CafeVariant } from "./cafeTuning.ts";
import { CAFE_SEAT_HEIGHT } from "./CoffeeFurnitureView.ts";

/**
 * Presentation clips for the coffee-shop people. Rig directions match the
 * janitor: +x swings a limb forward or leans the torso back, knees bend with -x,
 * elbows with +x, +y turns left, and +z lifts the right side (so a left arm
 * moves out with -z and a right arm with +z).
 */

const BONES: readonly BoneName[] = ["hips", "spine", "chest", "neck", "head",
  "left_shoulder", "left_elbow", "left_wrist", "right_shoulder", "right_elbow", "right_wrist",
  "left_hip", "left_knee", "left_ankle", "right_hip", "right_knee", "right_ankle"];
export type Rotations = Partial<Record<BoneName, Vec3>>;

export function full(rot: Rotations, hips: Vec3 = [0, 0, 0]): Pose {
  const complete: Rotations = {};
  for (const bone of BONES) complete[bone] = rot[bone] ?? [0, 0, 0];
  return { rot: complete, move: { hips } };
}
/** 0 → 1 over the first `rise` of the loop, hold, then back to 0 over the last `fall`. */
export function envelope(p: number, rise: number, fall: number): number {
  const up = Math.min(1, p / rise); const down = Math.min(1, (1 - p) / fall);
  const value = Math.min(up, down);
  return value * value * (3 - 2 * value);
}
/**
 * Arms, mirrored for either side: `out` moves the arm away from the body
 * (negative brings it across the front), `twist` turns it about its length.
 * Hand targets for the poses below were solved against the rig, then rounded.
 */
export function arm(side: "left" | "right", forward: number, out: number, elbow: number, wrist: Vec3 = [0, 0, 0], twist = 0): Rotations {
  const sign = side === "left" ? -1 : 1;
  return { [`${side}_shoulder`]: [forward, sign * twist, sign * out], [`${side}_elbow`]: [elbow, 0, 0], [`${side}_wrist`]: [wrist[0], sign * wrist[1], sign * wrist[2]] } as Rotations;
}
export const both = (forward: number, out: number, elbow: number, wrist: Vec3 = [0, 0, 0], twist = 0): Rotations =>
  ({ ...arm("left", forward, out, elbow, wrist, twist), ...arm("right", forward, out, elbow, wrist, twist) });

// --- Sitting -------------------------------------------------------------------------------------

export interface Seat { hips: Vec3; legs: Rotations }
/** Hips lowered onto the seat and pushed back over it, feet planted a little in front. */
export function seat(legs: LegDimensions, k: number): Seat {
  const hipsDrop = CAFE_SEAT_HEIGHT + 0.255 * k - 1.02 * k;
  const back = 0.06 * k;
  const [hip, knee] = legAngles(legs.ankleY - (legs.hipJointY + hipsDrop), -0.42 * k, legs);
  const rot: Rotations = {};
  for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
    rot[`${side}_hip`] = [hip, 0, sign * -0.05];
    rot[`${side}_knee`] = [knee, 0, 0];
    rot[`${side}_ankle`] = [-(hip + knee), 0, 0];
  }
  return { hips: [0, hipsDrop, back], legs: rot };
}
/** Hands resting on the thighs. */
export const lap = (): Rotations => both(0.25, -0.5, 0.35, [-0.1, 0, 0], 0.1);

export function seatedClips(s: Seat, bind: ReadonlyMap<string, THREE.Vector3>, sipSeconds: number): THREE.AnimationClip[] {
  const pose = (upper: Rotations) => full({ ...s.legs, ...upper }, s.hips);
  return [
    cycleClip("sit", 4, (p) => pose({ ...lap(), chest: [0.015 * wave(p), 0, 0], head: [-0.04, 0.08 * wave(p, 0.1), 0] }), bind),
    // Hands on the laptop keyboard at the near edge of the table.
    cycleClip("sit-type", 1.2, (p) => pose({
      spine: [-0.1, 0, 0], chest: [-0.08, 0, 0], head: [-0.22, 0.05 * wave(p), 0],
      ...arm("left", 0.9, -0.55, 0.18 + 0.08 * pulse(p * 3), [-0.4, 0, 0]),
      ...arm("right", 0.9, -0.55, 0.18 + 0.08 * pulse(p * 3, 0.5), [-0.4, 0, 0]),
    }), bind),
    // Both hands hold the paper up in front of the chest.
    cycleClip("sit-read", 4, (p) => pose({ spine: [0.04, 0, 0], head: [-0.2, 0.12 * wave(p), 0], ...both(0.85, -0.5, 0.9, [0, 0, 0], 0.2) }), bind),
    // The cup comes from the table to the lips, is held for a sip, then goes back down.
    cycleClip("sit-sip", sipSeconds, (p) => {
      const e = envelope(p, 0.25, 0.3);
      const mix = (from: number, to: number) => from + (to - from) * e;
      return pose({
        ...arm("left", 0.25, -0.5, 0.35, [-0.1, 0, 0], 0.1), head: [0.2 * e, 0, 0], neck: [0.06 * e, 0, 0], chest: [0.04 * e, 0, 0],
        ...arm("right", mix(0.9, 1.6), mix(-0.55, -1.0), mix(0.15, 1.4), [mix(-0.4, -0.2), 0, 0], mix(0, 0.4)),
      });
    }, bind, 64),
    cycleClip("sit-look", 4, (p) => pose({ ...lap(), neck: [0, 0.2 * wave(p), 0], head: [0.05, 0.4 * wave(p), 0] }), bind),
    // Waiting for an order: one hand drums on the table while they glance around.
    cycleClip("sit-wait", 3, (p) => pose({
      ...arm("left", 0.25, -0.5, 0.35, [-0.1, 0, 0], 0.1), ...arm("right", 0.75, -0.55, 0.15, [-0.35 + 0.15 * pulse(p * 6), 0, 0]),
      neck: [0, 0.18 * wave(p), 0], head: [0.04, 0.35 * wave(p), 0],
    }), bind),
    cycleClip("sit-startle", 1, (p) => {
      const e = Math.min(1, p / 0.12) * (p > 0.85 ? (1 - p) / 0.15 : 1);
      return pose({
        chest: [0.28 * e, 0, 0], spine: [0.1 * e, 0, 0], head: [0.22 * e, 0, 0],
        ...both(0.25 + 1.9 * e, -0.5 + 1.0 * e, 0.35 + 0.3 * e, [0, 0, 0], 0.1 - 0.1 * e),
      });
    }, bind),
    // Leaning in to dab a spill on the table.
    cycleClip("sit-dab", 0.9, (p) => pose({
      spine: [-0.26, 0, 0], chest: [-0.12, 0, 0], head: [-0.25, 0, 0],
      ...arm("left", 0.9, -0.55, 0.12, [-0.4, 0, 0]),
      ...arm("right", 1.1 + 0.08 * wave(p), -0.65 + 0.12 * wave(p, 0.25), 0.12, [-0.4, 0, 0]),
    }), bind),
    // Waving the goose off with one arm, without getting up.
    cycleClip("sit-shoo", 0.6, (p) => pose({
      ...arm("left", 0.25, -0.5, 0.35, [-0.1, 0, 0], 0.1), chest: [0.06, -0.2, 0], head: [0.05, -0.15, 0],
      ...arm("right", 1.7, -0.35 + 0.3 * wave(p), 0.1 + 0.55 * pulse(p)),
    }), bind),
  ];
}

// --- Standing ------------------------------------------------------------------------------------

export const hang = (): Rotations => ({ ...arm("left", 0.05, 0, 0.15), ...arm("right", 0.05, 0, 0.15) });
/** Walking with a cup held out in front at chest height. */
export function carryPose(style: WalkStyle, p: number): Pose {
  const walk = walkPose(style, p);
  return { rot: { ...walk.rot, ...arm("right", 0.1, -0.7, 1.1, [-0.2, 0, 0], 0.1) }, move: walk.move };
}
export function withHips(pose: Pose): Pose { return full(pose.rot ?? {}, pose.move?.hips ?? [0, 0, 0]); }

/** A calmer, less bouncy take on the janitor's walk; add the person's `legs` before use. */
export const CAFE_WALK: Omit<WalkStyle, "legs"> = { duration: 0.62, speed: 2.2, stance: 0.56, stepHeight: 0.09, crouch: 0.11, bob: 0.035, bounce: 0.45,
  sway: 0.025, roll: 0.04, twist: 0.1, lean: 0.05, headSteady: 0.55, nod: 0.05,
  armSwing: 0.36, armOut: 0.12, elbowBend: 0.3, elbowPump: 0.25, armLag: 0.05, heelStrike: 0.22 };

export function standingClips(legs: LegDimensions, walkSpeed: number, bind: ReadonlyMap<string, THREE.Vector3>): THREE.AnimationClip[] {
  const base: WalkStyle = { ...CAFE_WALK, legs };
  const walk = paced(base, walkSpeed / base.speed);
  const jog = paced({ ...JANITOR_FURIOUS_STOMP, legs, lean: 0.18, elbowBend: 0.8 }, BARISTA_JOG_SPEED / JANITOR_FURIOUS_STOMP.speed);
  const upright = (rot: Rotations, hipsY = 0) => full(rot, [0, hipsY, 0]);
  return [
    cycleClip("idle", 4, (p) => upright({ ...hang(), chest: [0.012 * wave(p), 0, 0], head: [0, 0.06 * wave(p, 0.2), 0] }), bind),
    cycleClip("look", 4, (p) => upright({ ...hang(), neck: [0, 0.18 * wave(p), 0], head: [0, 0.42 * wave(p), 0] }), bind),
    cycleClip("walk", walk.duration, (p) => withHips(walkPose(walk, p)), bind),
    cycleClip("carry", walk.duration, (p) => withHips(carryPose(walk, p)), bind),
    cycleClip("jog", jog.duration, (p) => withHips(walkPose(jog, p)), bind),
    cycleClip("shoo", 0.82, (p) => {
      const e = envelope(p, 0.3, 0.4);
      return upright({ chest: [0.08 - 0.2 * e, 0, 0], head: [0, 0.12 * wave(p), 0],
        ...arm("left", 0.2 + 1.15 * e, 0.4 - 0.2 * e, 0.32 - 0.24 * e), ...arm("right", 0.2 + 1.15 * e, 0.4 - 0.2 * e, 0.32 - 0.24 * e) });
    }, bind),
    // Hands at the espresso machine: tamping, twisting a portafilter, pressing buttons.
    cycleClip("brew", 1.6, (p) => upright({
      spine: [-0.07, 0, 0], head: [-0.22, 0.1 * wave(p), 0],
      ...arm("left", 0.2 + 0.08 * wave(p), -0.6, 1.3 + 0.1 * wave(p, 0.3), [-0.2, 0, 0], 0.1),
      ...arm("right", 0.25 + 0.1 * wave(p, 0.5), -0.55, 1.25 + 0.2 * pulse(p, 0.2), [-0.2, 0.4 * wave(p, 0.25), 0], 0.1),
    }), bind),
    // Leaning over the prep table, both hands pushing dough away and rolling it back.
    cycleClip("knead", 1.1, (p) => upright({
      spine: [-0.3 - 0.07 * pulse(p), 0, 0], chest: [-0.08, 0.05 * wave(p), 0], head: [-0.1, 0, 0],
      ...both(0.95 + 0.12 * pulse(p), -0.55, 0.12 + 0.3 * pulse(p, 0.5), [-0.5 + 0.2 * pulse(p), 0, 0]),
    }, -0.03), bind),
    // Bent over a table, circling a cloth.
    cycleClip("wipe", 0.8, (p) => upright({
      spine: [-0.45, 0, 0], chest: [-0.12, 0, 0], head: [0.05, 0, 0],
      ...arm("left", 0.95, -0.35, 0.1, [-0.3, 0, 0]),
      ...arm("right", 1.05 + 0.12 * wave(p), -0.5 + 0.25 * wave(p, 0.25), 0.1, [-0.3, 0, 0]),
    }, -0.05), bind),
    // One hand on a hip, the other turning the radio's knob.
    cycleClip("fiddle", 1, (p) => upright({
      spine: [-0.28, 0, 0], head: [-0.2, 0.15 * wave(p * 0.5), 0],
      ...arm("left", -0.1, 0.45, 1.5),
      ...arm("right", 0.8, -0.65, 0.15, [0, 0.7 * wave(p), 0]),
    }, -0.03), bind),
    // A hand raised high, waving: calling out an order or answering the bell.
    cycleClip("greet", 1.2, (p) => upright({
      ...arm("left", 0.05, 0, 0.15), head: [0.1, 0.1 * wave(p), 0], chest: [0.05, 0, 0],
      ...arm("right", 2.5, 0.05 + 0.25 * wave(p * 2), 0.35 + 0.25 * wave(p * 2, 0.25), [0, 0, 0], 0.4),
    }), bind),
    cycleClip("startle", 1, (p) => {
      const e = Math.min(1, p / 0.12) * (p > 0.85 ? (1 - p) / 0.15 : 1);
      return upright({ chest: [0.26 * e, 0, 0], head: [0.2 * e, 0, 0],
        ...arm("left", 0.05 + 1.4 * e, 0.6 * e, 0.15 + 1.1 * e), ...arm("right", 0.05 + 1.4 * e, 0.6 * e, 0.15 + 1.1 * e) }, 0.06 * e);
    }, bind),
    cycleClip("shrug", 1.6, (p) => {
      const e = envelope(p, 0.3, 0.3);
      return upright({ head: [0, 0.3 * wave(p), 0.18 * e], neck: [0, 0, 0.06 * e],
        ...both(0.05 - 0.15 * e, 0.4 * e, 0.15 + 1.25 * e, [0, 0.8 * e, 0]) });
    }, bind),
  ];
}

export function createCafePersonClips(variant: CafeVariant, bind: ReadonlyMap<string, THREE.Vector3>): THREE.AnimationClip[] {
  const k = (bind.get("hips")?.y ?? 1.02) / 1.02;
  const legs: LegDimensions = { thigh: JANITOR_LEGS.thigh * k, shin: JANITOR_LEGS.shin * k, hipJointY: JANITOR_LEGS.hipJointY * k, ankleY: JANITOR_LEGS.ankleY * k };
  const walkSpeed = variant === "barista" ? BARISTA_WALK_SPEED : CUSTOMER_WALK_SPEED;
  return [...standingClips(legs, walkSpeed, bind), ...seatedClips(seat(legs, k), bind, CUSTOMER_SHARED_TUNING.sipSeconds)];
}
