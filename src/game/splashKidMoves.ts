import { legAngles, TAU, wave, walkPose, type LegDimensions, type Pose, type Vec3, type WalkStyle } from "./janitorGaits.ts";

/**
 * Pose functions for the splash-pad kids, written as functions of loop phase p in
 * [0, 1) and sampled into clips with `cycleClip`. Presentation only.
 *
 * Rig directions match the janitor: +x swings a hanging limb forward and leans the
 * spine/neck/head back; knees bend with -x, elbows with +x; +y turns toward the
 * kid's left; -z raises the left arm sideways and +z the right.
 */

/** Smooth 0→1→0 bump across the phase window [start, end), wrapping past 1. */
export function bump(p: number, start: number, end: number): number {
  const length = ((end - start) % 1 + 1) % 1 || 1;
  const s = ((p - start) % 1 + 1) % 1;
  return s < length ? Math.sin(Math.PI * s / length) : 0;
}
/** Eased 0→1 ramp across [start, end); 0 before (within the loop) and 1 after. */
export function ramp(p: number, start: number, end: number): number {
  const t = Math.min(1, Math.max(0, (p - start) / (end - start)));
  return t * t * (3 - 2 * t);
}
const smooth = (t: number) => t * t * (3 - 2 * t);

export interface FootTarget {
  /** Ankle position along the body, metres; forward is -z. */
  z: number;
  /** Ankle height above its resting height, metres. */
  lift: number;
}

/** Hip, knee, and ankle rotations that put the ankle at `foot` with the sole flat (or pointed). */
export function legTo(legs: LegDimensions, hipsY: number, hipsZ: number, foot: FootTarget, point = 0, sideways = 0): [Vec3, Vec3, Vec3] {
  const dy = legs.ankleY + foot.lift - (legs.hipJointY + hipsY);
  const [hip, knee] = legAngles(dy, foot.z - hipsZ, legs);
  return [[hip, 0, sideways], [knee, 0, 0], [-(hip + knee) - point, 0, 0]];
}

function setLegs(rot: NonNullable<Pose["rot"]>, legs: LegDimensions, hipsY: number, hipsZ: number, left: FootTarget, right: FootTarget, point: [number, number] = [0, 0], hipsX = 0): void {
  const sideways = -hipsX / (legs.hipJointY - legs.ankleY);
  [rot.left_hip, rot.left_knee, rot.left_ankle] = legTo(legs, hipsY, hipsZ, left, point[0], sideways);
  [rot.right_hip, rot.right_knee, rot.right_ankle] = legTo(legs, hipsY, hipsZ, right, point[1], sideways);
}

/** Scale for leg-relative distances: 1 for Milo's 0.4 m legs. */
export const legScale = (legs: LegDimensions) => (legs.hipJointY - legs.ankleY) / 0.4;

// ---------------------------------------------------------------------------
// Travelling gaits with flight phases (skips, gallops), foot-planted at `speed`.

export interface ContactGait {
  duration: number;
  /** Ground speed in m/s; planted feet slide back at this speed. */
  speed: number;
  legs: LegDimensions;
  /** Phase windows each foot is planted, in order. */
  left: [number, number][];
  right: [number, number][];
  /** Where each foot's contacts are centred along the body (forward is -z). */
  offset?: [number, number];
  /** Peak swing lift for a full-length swing, metres. */
  stepHeight: number;
}

function footOnTrack(p: number, windows: [number, number][], gait: ContactGait, offset: number): FootTarget & { planted: boolean } {
  const metres = gait.speed * gait.duration;
  const span = (a: number, b: number) => ((b - a) % 1 + 1) % 1;
  for (const [a, b] of windows) {
    const s = ((p - a) % 1 + 1) % 1; const length = span(a, b);
    if (s < length) return { z: offset + metres * (s - length / 2), lift: 0, planted: true };
  }
  // In the air: swing from the last lift-off to the next landing.
  let best = { gap: Infinity, s: 0, from: 0, to: 0 };
  windows.forEach(([a, b], index) => {
    const [nextA, nextB] = windows[(index + 1) % windows.length];
    const gap = span(b, nextA) || 1; const s = ((p - b) % 1 + 1) % 1;
    if (s < gap && gap < best.gap) best = { gap, s: s / gap, from: offset + metres * span(a, b) / 2, to: offset - metres * span(nextA, nextB) / 2 };
  });
  const lift = gait.stepHeight * Math.min(1, best.gap / 0.45) * Math.sin(Math.PI * best.s) ** 0.7;
  return { z: best.from + (best.to - best.from) * smooth(best.s), lift, planted: false };
}

/** Legs for a contact gait; the variant supplies the upper body and hip motion. */
export function contactLegs(gait: ContactGait, p: number, hipsY: number, hipsX = 0): Pose["rot"] {
  const [leftOffset, rightOffset] = gait.offset ?? [0, 0];
  const left = footOnTrack(p, gait.left, gait, leftOffset); const right = footOnTrack(p, gait.right, gait, rightOffset);
  const rot: NonNullable<Pose["rot"]> = {};
  // Toes point a little while a foot is off the ground.
  setLegs(rot, gait.legs, hipsY, 0, left, right, [left.planted ? 0 : 0.35 * Math.min(1, left.lift / 0.05), right.planted ? 0 : 0.35 * Math.min(1, right.lift / 0.05)], hipsX);
  return rot;
}

export interface SkipStyle { duration: number; speed: number; legs: LegDimensions; hop: number; knee: number; armSwing: number; armOut: number; lean: number }
/** Step-hop, step-hop: the free knee drives up while the opposite arm swings high. */
export function skipPose(style: SkipStyle): (p: number) => Pose {
  const k = legScale(style.legs);
  const gait: ContactGait = {
    duration: style.duration, speed: style.speed, legs: style.legs, stepHeight: style.knee * k,
    left: [[0, 0.13], [0.2, 0.33]], right: [[0.5, 0.63], [0.7, 0.83]],
  };
  return (p) => {
    // The body only rises once the foot has left the ground, so planted feet stay in reach.
    const glide = bump(p, 0.33, 0.5) + bump(p, 0.83, 0);
    const hop = bump(p, 0.13, 0.2) + bump(p, 0.63, 0.7);
    const land = bump(p, 0.96, 0.1) + bump(p, 0.46, 0.6);
    const hipsY = (-0.035 + style.hop * glide + style.hop * 0.4 * hop - 0.02 * land) * k;
    const hipsX = 0.012 * wave(p, 0.25) * k;
    const rot = contactLegs(gait, p, hipsY, hipsX)!;
    const twist = 0.14 * Math.cos(TAU * (p - 0.17));
    // Twist the chest, not the hips: hip yaw would swing the planted foot off its line.
    rot.hips = [0, 0, 0];
    rot.spine = [-style.lean, twist * 0.4, 0];
    rot.chest = [-style.lean * 0.4 + 0.04 * glide, twist * 0.8, 0];
    rot.neck = [0.05, -twist * 0.3, 0];
    rot.head = [0.08 * glide - 0.05 * land, -twist * 0.3, 0.05 * wave(p)];
    for (const [side, peak, sign] of [["left", 0.17, -1], ["right", 0.67, 1]] as const) {
      const forward = Math.cos(TAU * (p - peak));
      rot[`${side}_shoulder`] = [0.25 + style.armSwing * forward, 0, sign * (style.armOut + 0.15 * Math.max(0, forward))];
      rot[`${side}_elbow`] = [0.45 + 0.45 * Math.max(0, forward), 0, 0];
      rot[`${side}_wrist`] = [0.2 * forward, 0, 0];
    }
    return { rot, move: { hips: [hipsX, hipsY, 0] } };
  };
}

export interface GallopStyle { duration: number; speed: number; legs: LegDimensions; hop: number; reins: number }
/** Horsey gallop: trailing foot lands, leading foot lands ahead, then a bouncy float. Hands hold imaginary reins. */
export function gallopPose(style: GallopStyle): (p: number) => Pose {
  const k = legScale(style.legs);
  const gait: ContactGait = {
    duration: style.duration, speed: style.speed, legs: style.legs, stepHeight: 0.09 * k,
    left: [[0, 0.3]], right: [[0.18, 0.5]], offset: [0.07 * k, -0.07 * k],
  };
  return (p) => {
    const float = bump(p, 0.46, 0.04);
    const hipsY = (-0.05 + style.hop * float - 0.015 * bump(p, 0.04, 0.4)) * k;
    const rot = contactLegs(gait, p, hipsY)!;
    rot.hips = [0, -0.18, 0];
    rot.spine = [-0.06, 0.1, 0];
    rot.chest = [-0.05 + 0.08 * float, 0.08, 0];
    rot.neck = [0, 0, 0];
    rot.head = [0.12 * float - 0.04, 0, 0.06 * Math.sin(TAU * p)];
    const jiggle = 0.25 * Math.sin(TAU * (p + 0.1));
    for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
      rot[`${side}_shoulder`] = [style.reins + jiggle, 0, sign * 0.18];
      rot[`${side}_elbow`] = [1.05 - jiggle * 0.8, 0, 0];
      rot[`${side}_wrist`] = [-0.3 + jiggle, 0, 0];
    }
    return { rot, move: { hips: [0, hipsY, 0] } };
  };
}

/** Kid-sized `walkPose` knobs, scaled to the rig's leg length. */
export function kidWalkStyle(legs: LegDimensions, style: Omit<WalkStyle, "legs">): WalkStyle {
  const k = legScale(legs);
  return { ...style, legs, stepHeight: style.stepHeight * k, crouch: style.crouch * k, bob: style.bob * k, sway: style.sway * k };
}

// ---------------------------------------------------------------------------
// Fleeing from the goose: sprint legs from `walkPose`, frightened upper bodies.

export type FleeArms = "pump" | "flail" | "clutch";
/** Sprint legs at `speed`, with arms that pump, flail overhead, or clutch the head. */
export function fleePose(legs: LegDimensions, speed: number, arms: FleeArms): { duration: number; pose: (p: number) => Pose } {
  const k = legScale(legs);
  // Little legs take quicker steps to keep up.
  const duration = 0.44 * k * (3.15 / speed) ** 0.5;
  const style = kidWalkStyle(legs, {
    duration, speed, stance: 0.3, stepHeight: 0.13, liftShape: 0.8, crouch: 0.075, bob: 0.035, bounce: 0.5,
    // Little hip roll or twist: both tip the legs' IK plane and sink or skate planted feet.
    sway: 0.012, roll: 0.015, twist: 0.06, lean: arms === "pump" ? 0.22 : arms === "flail" ? 0.02 : 0.12,
    headSteady: 0.6, nod: 0.05, armSwing: 0.9, armOut: 0.2, elbowBend: 1.3, elbowPump: 0.25, armLag: 0.03, heelStrike: 0,
  });
  return {
    duration,
    pose: (p) => {
      const base = walkPose(style, p);
      const rot = base.rot!;
      if (arms === "flail") {
        // Arms up and waving, head thrown back mid-scream.
        for (const [side, sign, shift] of [["left", -1, 0], ["right", 1, 0.37]] as const) {
          rot[`${side}_shoulder`] = [-0.25 + 0.35 * Math.sin(TAU * (2 * p + shift)), 0, sign * (2.35 + 0.35 * Math.sin(TAU * (2 * p + shift + 0.25)))];
          rot[`${side}_elbow`] = [0.35 + 0.3 * Math.sin(TAU * (2 * p + shift + 0.5)), 0, 0];
          rot[`${side}_wrist`] = [0.4 * Math.sin(TAU * (2 * p + shift)), 0, 0];
        }
        rot.head = [0.28, rot.head![1], rot.head![2]];
        rot.neck = [0.1, rot.neck![1], rot.neck![2]];
      } else if (arms === "clutch") {
        // Hands clamped to the sides of the head, elbows out.
        for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
          // Raise the arm forward-up with the elbow splayed out; bending the elbow then folds the hand back onto the head.
          rot[`${side}_shoulder`] = [2.15, 0, sign * 0.8];
          rot[`${side}_elbow`] = [1.9, 0, 0];
          rot[`${side}_wrist`] = [0, 0, 0];
        }
        rot.chest = [rot.chest![0], rot.chest![1] * 0.4, 0];
        rot.head = [-0.05, 0.25 * Math.sin(TAU * p), 0];
      } else {
        // Hard pumping arms and a quick look back over the shoulder each stride.
        for (const [side, sign, shift] of [["left", -1, 0], ["right", 1, 0.5]] as const) {
          const swing = Math.sin(TAU * (p - shift + 0.25));
          rot[`${side}_shoulder`] = [0.2 - 1.05 * swing, 0, sign * 0.22];
          rot[`${side}_elbow`] = [1.25 + 0.35 * Math.max(0, -swing), 0, 0];
        }
        rot.head = [rot.head![0] + 0.1, 0.35 * bump(p, 0.1, 0.45), 0];
      }
      return base;
    },
  };
}

// ---------------------------------------------------------------------------
// Splashing in place at a jet.

const planted: FootTarget = { z: 0, lift: 0 };

export interface JumpStyle { legs: LegDimensions; height: number; crouch: number }
/** Two-footed jump into a jet: arms swing back, fling up overhead, land in a squashy crouch. */
export function jetJumpPose(style: JumpStyle): (p: number) => Pose {
  const k = legScale(style.legs);
  return (p) => {
    const air = bump(p, 0.32, 0.64);
    const load = bump(p, 0.02, 0.34) + bump(p, 0.6, 0.9) * 1.1;
    const hipsY = (-style.crouch * load + style.height * air - 0.015) * k;
    const tuck = 0.06 * k * bump(p, 0.36, 0.62);
    const foot = { z: -0.01 * k, lift: Math.max(0, hipsY + 0.015 * k) - tuck * 0.4 };
    const rot: NonNullable<Pose["rot"]> = {};
    setLegs(rot, style.legs, hipsY - tuck, 0, foot, foot, [0.5 * air, 0.5 * air]);
    // Arms: back during the load, up overhead at the top, then flop down.
    const up = bump(p, 0.24, 0.8) ** 0.7;
    const back = bump(p, 0.02, 0.3);
    for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
      rot[`${side}_shoulder`] = [-0.6 * back - 0.25 * up, 0, sign * (0.12 + 2.45 * up)];
      rot[`${side}_elbow`] = [0.25 + 0.35 * back + 0.2 * bump(p, 0.6, 0.95), 0, 0];
      rot[`${side}_wrist`] = [0.3 * up, 0, 0];
    }
    rot.hips = [0, 0, 0];
    rot.spine = [-0.3 * load + 0.03 * air, 0, 0];
    rot.chest = [-0.12 * load + 0.05 * air, 0, 0];
    rot.neck = [0.1 * air, 0, 0];
    rot.head = [0.25 * air - 0.1 * load, 0, 0.08 * Math.sin(TAU * p)];
    return { rot, move: { hips: [0, hipsY, 0.035 * load * k] } };
  };
}

export interface StompStyle { legs: LegDimensions; knee: number; flap: number }
/** Alternating high-knee puddle stomps with arms out for balance and a look down at the splash. */
export function puddleStompPose(style: StompStyle): (p: number) => Pose {
  const k = legScale(style.legs);
  const stompFoot = (p: number, start: number): FootTarget => {
    // Lift slowly, slam down fast.
    const s = ((p - start) % 1 + 1) % 1;
    if (s > 0.42) return planted;
    const lift = s < 0.3 ? Math.sin((Math.PI / 2) * (s / 0.3)) : 1 - ((s - 0.3) / 0.12) ** 2;
    return { z: -0.05 * k * lift, lift: style.knee * k * lift };
  };
  return (p) => {
    const impact = bump(p, 0.4, 0.58) + bump(p, 0.9, 0.08);
    const hipsX = 0.025 * k * Math.sin(TAU * (p - 0.1));
    const hipsY = (-0.03 - 0.03 * impact) * k;
    const rot: NonNullable<Pose["rot"]> = {};
    setLegs(rot, style.legs, hipsY, 0, stompFoot(p, 0), stompFoot(p, 0.5), [0, 0], hipsX);
    rot.hips = [0, 0, 0.1 * Math.sin(TAU * (p - 0.1))];
    rot.spine = [-0.12 * impact + 0.03, 0, -0.05 * Math.sin(TAU * (p - 0.1))];
    rot.chest = [-0.08 * impact + 0.06 * bump(p, 0.1, 0.35), 0, 0];
    rot.neck = [-0.1 * impact, 0, 0];
    rot.head = [-0.22 * impact + 0.1 * (bump(p, 0.1, 0.35) + bump(p, 0.6, 0.85)), 0.1 * Math.sin(TAU * p), 0];
    for (const [side, sign, start] of [["left", -1, 0.5], ["right", 1, 0]] as const) {
      // The arm opposite the stomping leg flaps up for balance.
      const flap = bump(p, start + 0.05, start + 0.5);
      rot[`${side}_shoulder`] = [0.3 + 0.15 * flap, 0, sign * (0.45 + style.flap * flap)];
      rot[`${side}_elbow`] = [0.95 - 0.35 * flap, 0, 0];
      rot[`${side}_wrist`] = [0.3 * flap, 0, 0];
    }
    return { rot, move: { hips: [hipsX, hipsY, 0] } };
  };
}

export interface TwirlStyle { legs: LegDimensions; arms: number; tilt: number }
/** Spinning in place with arms out and face up to the spray, in little shuffling steps. */
export function twirlPose(style: TwirlStyle): (p: number) => Pose {
  const k = legScale(style.legs);
  return (p) => {
    const steps = 6;
    const step = (start: number): FootTarget => ({ z: 0, lift: 0.035 * k * Math.max(0, Math.sin(TAU * (steps * p - start))) });
    const hipsY = (-0.025 - 0.008 * Math.abs(Math.sin(Math.PI * steps * p))) * k;
    const rot: NonNullable<Pose["rot"]> = {};
    setLegs(rot, style.legs, hipsY, 0, step(0), step(0.5));
    rot.root = [0, TAU * p, 0];
    rot.hips = [0, 0, 0];
    rot.spine = [0.06, 0, 0];
    rot.chest = [style.tilt * 0.4, 0, 0.05 * Math.sin(TAU * p * 2)];
    rot.neck = [style.tilt * 0.5, 0, 0];
    rot.head = [style.tilt, 0, 0.12 * Math.sin(TAU * p * 2)];
    for (const [side, sign, shift] of [["left", -1, 0], ["right", 1, 0.5]] as const) {
      const flutter = Math.sin(TAU * (steps * p + shift));
      rot[`${side}_shoulder`] = [0.1, 0.2, sign * (style.arms + 0.12 * flutter)];
      rot[`${side}_elbow`] = [0.2, 0, 0];
      rot[`${side}_wrist`] = [0, 0, sign * 0.4 * flutter];
    }
    return { rot, move: { hips: [0, hipsY, 0] } };
  };
}

export interface ScoopStyle { legs: LegDimensions; bend: number }
/** Crouch, scoop water in both hands, and toss it up overhead with a little hop and a giggle. */
export function scoopTossPose(style: ScoopStyle): (p: number) => Pose {
  const k = legScale(style.legs);
  return (p) => {
    const down = ramp(p, 0.02, 0.3) * (1 - ramp(p, 0.42, 0.52));
    const toss = ramp(p, 0.44, 0.54) * (1 - ramp(p, 0.72, 0.92));
    const hop = bump(p, 0.47, 0.6);
    const giggle = bump(p, 0.6, 0.98) * Math.sin(TAU * 7 * p);
    const hipsY = (-0.1 * down * style.bend + 0.035 * hop - 0.02) * k;
    const hipsZ = 0.06 * down * style.bend * k;
    const rot: NonNullable<Pose["rot"]> = {};
    const foot = { z: 0, lift: Math.max(0, hipsY + 0.02 * k) };
    setLegs(rot, style.legs, hipsY, hipsZ, foot, foot, [0.3 * hop, 0.3 * hop]);
    rot.hips = [0, 0, 0];
    rot.spine = [-0.55 * down * style.bend + 0.08 * toss, 0, 0];
    rot.chest = [-0.35 * down * style.bend + 0.1 * toss + 0.03 * giggle, 0, 0];
    rot.neck = [0.25 * down + 0.1 * toss, 0, 0];
    rot.head = [0.1 * down + 0.2 * toss, 0, 0.08 * giggle];
    const scoop = bump(p, 0.28, 0.46);
    for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
      // Hands meet in front, down at the water, before flinging up.
      rot[`${side}_shoulder`] = [1.05 * down + 0.25 * scoop - 0.3 * toss, 0, sign * (0.08 - 0.3 * down + 2.55 * toss)];
      rot[`${side}_elbow`] = [0.2 * down + 0.35 * scoop + 0.15 * toss, 0, 0];
      rot[`${side}_wrist`] = [0.6 * scoop + 0.4 * toss, sign * 0.3 * down, 0];
    }
    return { rot, move: { hips: [0, hipsY, hipsZ] } };
  };
}

// ---------------------------------------------------------------------------
// Crying after a fright.

export interface CryStyle {
  legs: LegDimensions; sob: number;
  /** Shoulder raise and elbow bend that land the fists on the eyes; longer arms raise less and bend more. */
  reach?: [number, number];
}
/** Fists rubbing both eyes in turn while the shoulders heave. */
export function rubEyesPose(style: CryStyle): (p: number) => Pose {
  const k = legScale(style.legs);
  return (p) => {
    const heave = Math.max(0, Math.sin(TAU * 3 * p)) ** 2 * style.sob;
    const hipsY = (-0.02 - 0.01 * heave) * k;
    const rot: NonNullable<Pose["rot"]> = {};
    setLegs(rot, style.legs, hipsY, 0, planted, planted);
    rot.hips = [0, 0, 0];
    rot.spine = [-0.1 - 0.05 * heave, 0, 0];
    rot.chest = [-0.08 + 0.08 * heave, 0, 0];
    rot.neck = [-0.12, 0, 0];
    rot.head = [-0.32 + 0.1 * heave, 0.08 * Math.sin(TAU * p), 0.05 * Math.sin(TAU * p)];
    for (const [side, sign, shift] of [["left", -1, 0], ["right", 1, 0.5]] as const) {
      const rub = Math.sin(TAU * (2 * p + shift));
      // Arm raised forward and angled in, forearm up: fists land in front of the bowed eyes.
      const [raise, bend] = style.reach ?? [1.9, 1.0];
      rot[`${side}_shoulder`] = [raise + 0.08 * rub, 0, sign * (-0.3 + 0.06 * rub)];
      rot[`${side}_elbow`] = [bend + 0.15 * rub, 0, 0];
      rot[`${side}_wrist`] = [0.2, 0, sign * 0.3 * rub];
    }
    return { rot, move: { hips: [0, hipsY, 0] } };
  };
}

/** Head back, arms limp, bawling with sobbing bounces and a foot stamp. */
export function wailPose(style: CryStyle): (p: number) => Pose {
  const k = legScale(style.legs);
  return (p) => {
    const sob = Math.max(0, Math.sin(TAU * 4 * p)) * style.sob;
    const stamp = bump(p, 0.62, 0.8);
    const hipsY = (-0.02 - 0.012 * sob) * k;
    const rot: NonNullable<Pose["rot"]> = {};
    setLegs(rot, style.legs, hipsY, 0, planted, { z: -0.02 * k * stamp, lift: 0.06 * k * stamp });
    rot.hips = [0, 0, 0];
    rot.spine = [0.05 + 0.04 * sob, 0, 0];
    rot.chest = [0.08 - 0.06 * sob, 0, 0];
    rot.neck = [0.12, 0, 0];
    rot.head = [0.3 - 0.1 * sob, 0.1 * Math.sin(TAU * p), 0];
    for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
      rot[`${side}_shoulder`] = [-0.05 + 0.05 * sob, 0, sign * (0.28 + 0.08 * sob + 0.3 * stamp)];
      rot[`${side}_elbow`] = [0.15 + 0.1 * sob, 0, 0];
      rot[`${side}_wrist`] = [0, 0, 0];
    }
    return { rot, move: { hips: [0, hipsY, 0] } };
  };
}

// ---------------------------------------------------------------------------
// Shipped locomotion, sized to each kid's legs and gameplay speed.

/** Skipping between splash spots; little legs skip quicker to cover the same ground. */
export function kidSkip(legs: LegDimensions, speed: number): { duration: number; pose: (p: number) => Pose } {
  const duration = 0.7 * Math.sqrt(legScale(legs)) * (1.4 / speed);
  return { duration, pose: skipPose({ duration, speed, legs, hop: 0.05, knee: 0.16, armSwing: 0.95, armOut: 0.22, lean: 0.06 }) };
}

/**
 * Quick, slightly bouncy kid walk. The cadence is chosen so a planted foot at the
 * ends of its stance is still within reach of the crouched hip, keeping feet planted.
 */
export function kidWalk(legs: LegDimensions, speed: number): WalkStyle {
  const knobs = {
    speed, stance: 0.55, stepHeight: 0.07, crouch: 0.05, bob: 0.025, bounce: 0.5,
    // Hip twist swings planted feet off their line, so keep it small.
    sway: 0.02, roll: 0.03, twist: 0.04, lean: 0.03, headSteady: 0.4, nod: 0.06,
    armSwing: 0.45, armOut: 0.15, elbowBend: 0.3, elbowPump: 0.25, armLag: 0.05, heelStrike: 0.15,
  };
  const leg = legs.hipJointY - legs.ankleY;
  const k = legScale(legs);
  const drop = leg - (knobs.crouch + knobs.bob) * k;
  // Keep some knee bend at the ends of stance: near a straight leg, keyframe blending makes feet skate.
  const halfStance = 0.85 * Math.sqrt(leg * leg - drop * drop);
  return kidWalkStyle(legs, { ...knobs, duration: (2 * halfStance) / (speed * knobs.stance) });
}
