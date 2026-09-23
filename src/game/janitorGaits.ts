import * as THREE from "three";

/** Procedural janitor clips, sampled from phase functions. Presentation only. */

export type BoneName =
  | "root" | "hips" | "spine" | "chest" | "neck" | "head"
  | `${"left" | "right"}_${"shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle"}`;
export type Vec3 = [number, number, number];

/** Euler XYZ radians per bone, plus optional position offsets from the bind pose (metres). */
export interface Pose {
  rot?: Partial<Record<BoneName, Vec3>>;
  move?: Partial<Record<BoneName, Vec3>>;
}

export const TAU = Math.PI * 2;
/** Sine wave for phase p: `wave(p)` peaks at p = 0.25, `wave(p, 0.25)` peaks at p = 0. */
export const wave = (p: number, shift = 0): number => Math.sin(TAU * (p + shift));
/** Positive half of a wave, zero otherwise. */
export const pulse = (p: number, shift = 0): number => Math.max(0, wave(p, shift));

/**
 * Sample `pose(p)` for phase p in [0, 1] into a looping clip. `bind` holds each
 * bone's local bind position, which `move` offsets are added to. Write poses as
 * periodic functions of p so the loop is seamless.
 */
export function cycleClip(
  name: string, duration: number, pose: (p: number) => Pose,
  bind: ReadonlyMap<string, THREE.Vector3>, samples = 48,
): THREE.AnimationClip {
  const rotations = new Map<string, number[]>();
  const moves = new Map<string, number[]>();
  const times: number[] = [];
  const euler = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  for (let i = 0; i <= samples; i++) {
    const p = i / samples;
    times.push(p * duration);
    const frame = pose(p % 1);
    for (const [bone, angle] of Object.entries(frame.rot ?? {})) {
      if (!rotations.has(bone)) rotations.set(bone, []);
      rotations.get(bone)!.push(...quaternion.setFromEuler(euler.set(...angle!)).toArray());
    }
    for (const [bone, offset] of Object.entries(frame.move ?? {})) {
      const origin = bind.get(bone);
      if (!origin) throw new Error(`Unknown bone ${bone}`);
      if (!moves.has(bone)) moves.set(bone, []);
      moves.get(bone)!.push(origin.x + offset![0], origin.y + offset![1], origin.z + offset![2]);
    }
  }
  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, values] of rotations) {
    if (values.length !== times.length * 4) throw new Error(`${name}: ${bone} rotation must be set on every frame`);
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  }
  for (const [bone, values] of moves) {
    if (values.length !== times.length * 3) throw new Error(`${name}: ${bone} move must be set on every frame`);
    tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, times, values));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

/**
 * Rig directions (measured in the lab):
 * - +x on hips/shoulders swings a limb forward; knees bend with -x; elbows bend with +x.
 * - +x on spine/chest/neck/head leans back; forward lean is -x.
 * - +y turns toward the janitor's left; +z lifts the right side.
 */

const THIGH = 0.38, SHIN = 0.4;
const HIP_JOINT_Y = 0.97, ANKLE_Y = 0.19;

export interface WalkStyle {
  /** Seconds per full cycle (two steps). */
  duration: number;
  /** Ground speed in m/s; stance feet move backwards at this speed so they stay planted. */
  speed: number;
  /** Fraction of the cycle each foot is on the ground (0.5–0.7). */
  stance: number;
  /** Peak foot lift during swing, metres. */
  stepHeight: number;
  /** Swing-lift curve exponent: 1 = round arc, <1 = boxy high-stepping, >1 = low scuffing. */
  liftShape?: number;
  /** Hips lowered from bind height, metres; needed for knee bend and reach. */
  crouch: number;
  /** Vertical hip travel per step, metres. */
  bob: number;
  /** 0 = smooth sine bob, 1 = sharp bouncy bottoms. */
  bounce: number;
  /** Side-to-side hip travel, metres, onto the stance foot. */
  sway: number;
  /** Hip tilt (radians) with each step; the upper body partly cancels it. */
  roll: number;
  /** Hip yaw (radians) toward the forward leg; the chest counter-twists. */
  twist: number;
  /** Forward torso lean (radians). */
  lean: number;
  /** Extra forward lean pumped on each step (radians). */
  leanPump?: number;
  /** How much the head cancels body motion (0 = rides along, 1 = stays level). */
  headSteady: number;
  /** Head nod per step (radians), slightly behind the bob. */
  nod: number;
  /** Arm swing about the shoulder (radians). */
  armSwing: number;
  /** Arms held out from the body (radians). */
  armOut: number;
  /** Resting elbow bend (radians). */
  elbowBend: number;
  /** Extra elbow bend when the arm swings forward (radians). */
  elbowPump: number;
  /** Arm swing delay as a fraction of the cycle (floppy follow-through). */
  armLag: number;
  /** Toe-up at heel strike (radians). */
  heelStrike: number;
}

/** 2-bone sagittal IK: hip pitch and knee bend that put the ankle at (y, z) relative to the hip joint. */
function legAngles(dy: number, dz: number): [number, number] {
  const reach = Math.min(Math.hypot(dy, dz), THIGH + SHIN - 1e-4);
  const toTarget = Math.atan2(-dz, -dy); // forward (-z) is positive swing
  const thighOffset = Math.acos((THIGH * THIGH + reach * reach - SHIN * SHIN) / (2 * THIGH * reach));
  const knee = Math.PI - Math.acos((THIGH * THIGH + SHIN * SHIN - reach * reach) / (2 * THIGH * SHIN));
  return [toTarget + thighOffset, -knee];
}

export function walkPose(style: WalkStyle, p: number): Pose {
  const stride = style.speed * style.duration;
  const half = (stride * style.stance) / 2;
  // Bob: lowest at each foot contact (p = 0, 0.5), highest at passing.
  const smooth = 0.5 - 0.5 * Math.cos(2 * TAU * p);
  const sharp = Math.abs(Math.sin(2 * TAU * p));
  const bobShape = smooth * (1 - style.bounce) + sharp * style.bounce;
  const hipsY = -style.crouch + style.bob * (bobShape - 1);
  // Left foot lands at p = 0, right at p = 0.5. Left is -x.
  const hipsX = -style.sway * wave(p);
  const roll = style.roll * wave(p);
  const twist = -style.twist * wave(p, 0.25); // left hip forward at p = 0
  const lean = style.lean + (style.leanPump ?? 0) * bobShape;

  const rot: Pose["rot"] = {};
  const move: Pose["move"] = { hips: [hipsX, hipsY, 0] };
  rot.hips = [0, twist, roll];
  // Upper body mostly rides the hip roll, so a big roll reads as a waddle.
  rot.spine = [-lean * 0.6, -twist * 0.5, -roll * 0.3];
  rot.chest = [-lean * 0.4, -twist * 1.1, 0];
  const nod = style.nod * wave(p, -0.05) ** 2;
  rot.neck = [lean * style.headSteady * 0.5, twist * 0.3 * style.headSteady, -roll * 0.7 * style.headSteady];
  rot.head = [lean * style.headSteady * 0.5 - nod, twist * 0.3 * style.headSteady, 0];

  for (const [side, offset, sign] of [["left", 0, -1], ["right", 0.5, 1]] as const) {
    const q = (p - offset + 1) % 1; // 0 = heel strike
    let z: number, lift: number;
    if (q < style.stance) {
      z = -half + (q / style.stance) * 2 * half;
      lift = 0;
    } else {
      const s = (q - style.stance) / (1 - style.stance);
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * s);
      z = half - eased * 2 * half;
      lift = style.stepHeight * Math.sin(Math.PI * s) ** (style.liftShape ?? 1);
    }
    const dy = ANKLE_Y + lift - (HIP_JOINT_Y + hipsY);
    const [hip, knee] = legAngles(dy, z);
    const contact = q < 0.12 ? style.heelStrike * (1 - q / 0.12) : 0;
    const toeOff = q > style.stance - 0.1 && q < style.stance + 0.1 ? -0.35 * pulse((q - style.stance + 0.1) / 0.4) : 0;
    // Legs cancel the hip roll and sideways shift so feet track straight.
    rot[`${side}_hip`] = [hip, -twist, -roll - hipsX / (HIP_JOINT_Y - ANKLE_Y)];
    rot[`${side}_knee`] = [knee, 0, 0];
    rot[`${side}_ankle`] = [-(hip + knee) + contact + toeOff, 0, 0];

    // Arms swing opposite their leg.
    const armPhase = wave(p - offset - style.armLag, 0.25); // +1 when this leg is forward
    const swing = -style.armSwing * armPhase;
    const outward = sign * style.armOut;
    rot[`${side}_shoulder`] = [swing, 0, outward];
    rot[`${side}_elbow`] = [style.elbowBend + style.elbowPump * Math.max(0, -armPhase), 0, 0];
    rot[`${side}_wrist`] = [0, 0, 0];
  }
  return { rot, move };
}

export function walkClip(name: string, style: WalkStyle, bind: ReadonlyMap<string, THREE.Vector3>): THREE.AnimationClip {
  return cycleClip(name, style.duration, (p) => walkPose(style, p), bind);
}

/** Change pace without changing stride length (cadence scales with speed), so feet stay planted. */
export const paced = (style: WalkStyle, factor: number): WalkStyle =>
  ({ ...style, duration: style.duration / factor, speed: style.speed * factor });

/** Everyday walk: quick, springy shuffle with bent elbows. Prototyped in the janitor animation lab. */
export const JANITOR_WALK: WalkStyle = paced({
  duration: 0.62, speed: 2.2, stance: 0.55, stepHeight: 0.1, crouch: 0.12, bob: 0.05, bounce: 0.8,
  sway: 0.03, roll: 0.05, twist: 0.12, lean: 0.1, headSteady: 0.4, nod: 0.08,
  armSwing: 0.45, armOut: 0.18, elbowBend: 0.5, elbowPump: 0.3, armLag: 0.04, heelStrike: 0.25,
}, 0.8);

/** Hunched, fist-pumping stomp at the original 0.75s stride. */
export const JANITOR_FURIOUS_STOMP: WalkStyle = {
  duration: 0.75, speed: 2.2, stance: 0.5, stepHeight: 0.2, liftShape: 0.5, crouch: 0.16, bob: 0.04, bounce: 0.6,
  sway: 0.05, roll: 0.08, twist: 0.1, lean: 0.24, leanPump: 0.04, headSteady: 0.7, nod: 0.08,
  armSwing: 0.55, armOut: 0.28, elbowBend: 0.9, elbowPump: 0.4, armLag: 0.03, heelStrike: 0.05,
};
/** Chasing the goose: the furious stomp with quicker legs, same stride. */
export const JANITOR_CHASE: WalkStyle = paced(JANITOR_FURIOUS_STOMP, 3 / JANITOR_FURIOUS_STOMP.speed);

