import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "./palette.ts";

import { SPLASH_KID_FLEE_SPEED, SPLASH_KID_PLAY_SPEEDS, type SplashKidVariant } from "./splashKidTuning.ts";
import { cycleClip, walkClip, type LegDimensions, type Pose } from "./janitorGaits.ts";
import { fleePose, jetJumpPose, kidSkip, kidWalk, puddleStompPose, rubEyesPose, twirlPose, type FleeArms } from "./splashKidMoves.ts";

export { SPLASH_KID_VARIANTS, type SplashKidVariant } from "./splashKidTuning.ts";

const FACE = {
  "kid-eyes": PALETTE.goose.black, "kid-eye-shine": PALETTE.goose.highlight, "kid-cheeks": PALETTE.kids.cheeks,
  "kid-mouth": PALETTE.goose.black, "kid-mouth-open": PALETTE.goose.black,
};
/** Both mouths are exported; the view shows one at a time (see `SplashKidView`). */
export const SPLASH_KID_MOUTHS = { smile: "kid-mouth", wail: "kid-mouth-open" } as const;
export const SPLASH_KID_COLORS: Readonly<Record<SplashKidVariant, Readonly<Record<string, number>>>> = {
  runner: {
    ...FACE, "kid-skin": PALETTE.kids.skinDeep, "kid-hair": PALETTE.kids.hairDark,
    "kid-top": PALETTE.kids.rashGuard, "kid-bottom": PALETTE.accent.sunlight, "kid-shoes": PALETTE.goose.orange,
    "kid-accent": PALETTE.flower.coral,
  },
  boots: {
    ...FACE, "kid-skin": PALETTE.kids.skinGolden, "kid-hair": PALETTE.kids.hairBlack,
    "kid-top": PALETTE.flower.coral, "kid-bottom": PALETTE.accent.navy, "kid-shoes": PALETTE.flower.yellow,
    "kid-accent": PALETTE.kids.hairTie,
  },
  floaties: {
    ...FACE, "kid-skin": PALETTE.kids.skinFair, "kid-hair": PALETTE.kids.hairGinger,
    "kid-top": PALETTE.kids.swimsuit, "kid-hat": PALETTE.kids.sunHat, "kid-accent": PALETTE.goose.orange,
  },
};

/** Body proportions per kid, metres. Heights are measured up from the ground. */
interface Build {
  /** Hip joint height; also the leg length. */
  legs: number;
  /** Hip joint to shoulder joint. */
  torso: number;
  /** Head radius. Kids read young through big heads on short bodies. */
  head: number;
  /** Torso half-width at the belly. */
  girth: number;
  /** Limb thickness multiplier. */
  limb: number;
}
const BUILDS: Readonly<Record<SplashKidVariant, Build>> = {
  runner: { legs: 0.47, torso: 0.34, head: 0.158, girth: 0.14, limb: 1 },
  boots: { legs: 0.44, torso: 0.33, head: 0.16, girth: 0.135, limb: 0.95 },
  floaties: { legs: 0.33, torso: 0.29, head: 0.165, girth: 0.155, limb: 1.12 },
};
const ANKLE_Y = 0.07;

/** Leg lengths for walk/run IK, matching the rig built by `createSplashKidModel`. */
export function splashKidLegs(variant: SplashKidVariant): LegDimensions {
  const { legs } = BUILDS[variant];
  const knee = ANKLE_Y + (legs - ANKLE_Y) * 0.5;
  return { thigh: legs - knee, shin: knee - ANKLE_Y, hipJointY: legs, ankleY: ANKLE_Y };
}

type ColorSlot = string;
type Point = [number, number, number];
type Weight = (position: THREE.Vector3) => [number, number, number];

/**
 * Low-detail child rig built from soft, smooth-normal forms (no boxes) so the kids
 * read as squashy storybook children rather than toy figures. Metres, Y up,
 * facing -Z, feet at Y=0, with the janitor's 18 bone names.
 */
export function createSplashKidModel(variant: SplashKidVariant): THREE.Group {
  const build = BUILDS[variant];
  const model = new THREE.Group();
  model.name = `splash-kid-${variant}`;
  model.userData = { assetRole: "rigged-character", visualDetailTier: 2, forward: "-Z" };
  const bones: THREE.Bone[] = [];
  const bindPositions = new Map<string, THREE.Vector3>();
  function joint(name: string, position: Point, parent?: THREE.Bone): THREE.Bone {
    const bone = new THREE.Bone(); bone.name = name;
    const absolute = new THREE.Vector3(...position); bone.position.copy(absolute);
    if (parent) bone.position.sub(bindPositions.get(parent.name)!);
    (parent ?? model).add(bone); bones.push(bone); bindPositions.set(name, absolute); return bone;
  }
  const { legs: L, torso: T, head: H, girth: G, limb } = build;
  const kneeY = ANKLE_Y + (L - ANKLE_Y) * 0.5;
  const shoulderY = L + T;
  const hipsY = L + 0.03, spineY = L + T * 0.35, chestY = L + T * 0.68;
  const neckY = shoulderY + 0.035, headY = neckY + 0.05, headCenterY = headY + H * 0.92;

  const root = joint("root", [0, 0, 0]);
  const hips = joint("hips", [0, hipsY, 0], root);
  const spine = joint("spine", [0, spineY, 0], hips);
  const chest = joint("chest", [0, chestY, 0], spine);
  const neck = joint("neck", [0, neckY, 0], chest);
  const head = joint("head", [0, headY, -0.005], neck);

  const index = (bone: THREE.Bone) => bones.indexOf(bone);
  const rigid = (bone: THREE.Bone): Weight => () => [index(bone), index(bone), 0];
  const blendY = (lower: THREE.Bone, upper: THREE.Bone, bottom: number, top: number): Weight => (p) => [
    index(lower), index(upper), THREE.MathUtils.smoothstep(p.y, bottom, top),
  ];
  const middle = (spineY + chestY) / 2;
  const torsoWeight: Weight = (p) => p.y < middle ? blendY(hips, spine, hipsY - 0.02, spineY + 0.04)(p) : blendY(spine, chest, middle, chestY + 0.04)(p);

  const pieces = new Map<ColorSlot, THREE.BufferGeometry[]>();
  function add(geometry: THREE.BufferGeometry, slot: ColorSlot, weight: Weight): void {
    if (!(slot in SPLASH_KID_COLORS[variant])) throw new Error(`${variant} kid has no ${slot} colour`);
    geometry.deleteAttribute("uv");
    const p = new THREE.Vector3(); const positions = geometry.getAttribute("position");
    const indices: number[] = []; const weights: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i); const [a, b, amount] = weight(p);
      indices.push(a, b, 0, 0); weights.push(1 - amount, amount, 0, 0);
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    const bucket = pieces.get(slot) ?? []; bucket.push(geometry); pieces.set(slot, bucket);
  }
  function oval(slot: ColorSlot, center: Point, radii: Point, weight: Weight, tilt: Point = [0, 0, 0], detail = 1): THREE.BufferGeometry {
    // Small details (eyes, toes, hair ties) need far fewer segments than the head.
    const segments = Math.round(THREE.MathUtils.clamp(8 + Math.max(...radii) * 90, 8, 18) * detail);
    const geometry = new THREE.SphereGeometry(1, segments, Math.max(6, Math.round(segments * 0.7)));
    geometry.scale(...radii).rotateX(tilt[0]).rotateY(tilt[1]).rotateZ(tilt[2]).translate(...center);
    add(geometry, slot, weight); return geometry;
  }
  /** Rounded tube between two points; `flatten` squashes it front to back. */
  function limbTube(slot: ColorSlot, from: Point, to: Point, radius: number, weight: Weight, flatten = 0.85): void {
    const start = new THREE.Vector3(...from); const end = new THREE.Vector3(...to);
    const geometry = new THREE.CapsuleGeometry(radius, start.distanceTo(end), 4, 12);
    geometry.scale(1, 1, flatten);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), start.clone().sub(end).normalize()));
    geometry.translate(...start.clone().add(end).multiplyScalar(0.5).toArray());
    add(geometry, slot, weight);
  }
  /** Lathe of (y, radius) pairs around a vertical axis, squashed to `depth`. */
  function garment(slot: ColorSlot, profile: [number, number][], depth: number, center: Point, weight: Weight): void {
    const curve = new THREE.SplineCurve(profile.map(([y, radius]) => new THREE.Vector2(radius, y)));
    const geometry = new THREE.LatheGeometry(curve.getPoints(14), 24);
    geometry.scale(1, 1, depth).translate(...center);
    add(geometry, slot, weight);
  }

  // Torso: a soft pear with a little tummy, closing in at the neck.
  const topBottom = variant === "floaties" ? L - 0.07 : L - 0.01;
  garment("kid-top", [
    [topBottom, 0], [topBottom + 0.004, G * 0.9], [L + T * 0.12, G * 1.03], [L + T * 0.32, G * 1.08], [L + T * 0.7, G * 0.97],
    [shoulderY - 0.02, G * 0.86], [shoulderY + 0.025, G * 0.55], [shoulderY + 0.045, 0.045], [shoulderY + 0.05, 0],
  ], 0.8, [0, 0, 0], torsoWeight);
  if (variant === "floaties") {
    // One-piece swimsuit straps over the shoulders.
    for (const side of [-1, 1]) limbTube("kid-top", [side * G * 0.5, shoulderY - 0.06, -G * 0.55], [side * G * 0.55, shoulderY + 0.02, 0], 0.018, rigid(chest), 1);
    for (const side of [-1, 1]) limbTube("kid-top", [side * G * 0.55, shoulderY + 0.02, 0], [side * G * 0.5, shoulderY - 0.06, G * 0.55], 0.018, rigid(chest), 1);
  }
  oval("kid-skin", [0, neckY + 0.02, -0.005], [0.042 * limb, 0.05, 0.04 * limb], blendY(chest, head, neckY - 0.01, headY));

  // Head: big and round, with a face on the front surface.
  const headRadii: Point = [H, H * 1.02, H * 0.94];
  const headCenter: Point = [0, headCenterY, -0.012];
  oval("kid-skin", headCenter, headRadii, rigid(head), [0, 0, 0], 1.25);
  const onFace = (x: number, y: number, inset = 0): Point => {
    const u = x / headRadii[0], v = (y - headCenter[1]) / headRadii[1];
    return [x, y, headCenter[2] - headRadii[2] * Math.sqrt(Math.max(0, 1 - u * u - v * v)) + inset];
  };
  const faceScale = H / 0.16;
  for (const side of [-1, 1]) {
    const eye = onFace(side * H * 0.34, headCenterY + H * 0.02, 0.004);
    oval("kid-eyes", eye, [0.017 * faceScale, 0.025 * faceScale, 0.012], rigid(head), [0, side * 0.3, 0]);
    oval("kid-eye-shine", [eye[0] + side * 0.004 - 0.003, eye[1] + 0.009 * faceScale, eye[2] - 0.009], [0.0055, 0.0065, 0.004], rigid(head));
    oval("kid-cheeks", onFace(side * H * 0.56, headCenterY - H * 0.24, 0.006), [0.03 * faceScale, 0.018 * faceScale, 0.012], rigid(head), [0, side * 0.55, 0]);
    oval("kid-skin", [side * H * 0.97, headCenterY - H * 0.02, 0], [0.028, 0.042, 0.03], rigid(head));
  }
  oval("kid-skin", onFace(0, headCenterY - H * 0.12, 0.006), [0.02 * faceScale, 0.016 * faceScale, 0.016], rigid(head));
  // Smile drawn as a thin tube lying on the face surface.
  const smileCurve = new THREE.CatmullRomCurve3([-1, -0.5, 0, 0.5, 1].map((t) =>
    new THREE.Vector3(...onFace(t * 0.024 * faceScale, headCenterY - H * 0.33 + 0.009 * faceScale * t * t, -0.001))));
  add(new THREE.TubeGeometry(smileCurve, 12, 0.0045, 5, false), "kid-mouth", rigid(head));
  // Open wailing mouth for scares and tears; hidden by default.
  oval("kid-mouth-open", onFace(0, headCenterY - H * 0.36, 0.005), [0.019 * faceScale, 0.025 * faceScale, 0.012], rigid(head));

  // Hair and hats. A sphere segment tilted back leaves the forehead clear.
  const hairCap = (radii: Point, thetaLength: number, tiltBack: number, lift = 0) => {
    const cap = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, thetaLength);
    cap.scale(...radii).rotateX(tiltBack).translate(0, headCenterY + lift, headCenter[2] + 0.006);
    add(cap, "kid-hair", rigid(head));
  };
  if (variant === "runner") {
    hairCap([H * 1.06, H * 1.08, H * 1.02], Math.PI * 0.56, 0.52);
    // Tousled fringe and crown tufts.
    for (const [x, y, rz] of [[-0.42, 0.4, 0.5], [-0.08, 0.44, 0.15], [0.3, 0.41, -0.35]]) {
      oval("kid-hair", onFace(x * H, headCenterY + y * H, 0.012), [0.052 * faceScale, 0.03 * faceScale, 0.03 * faceScale], rigid(head), [-0.6, 0, rz]);
    }
  } else if (variant === "boots") {
    hairCap([H * 1.05, H * 1.07, H * 1.02], Math.PI * 0.62, 0.62);
    // Bangs, then two bunches tied high with pink hair ties and a headband.
    oval("kid-hair", [0, headCenterY + H * 0.5, headCenter[2] - H * 0.74], [H * 0.66, H * 0.17, H * 0.26], rigid(head), [-0.7, 0, 0]);
    for (const side of [-1, 1]) {
      oval("kid-hair", [side * H * 1.12, headCenterY + H * 0.45, H * 0.2], [H * 0.36, H * 0.46, H * 0.36], rigid(head), [0, 0, side * -0.5]);
      oval("kid-accent", [side * H * 0.92, headCenterY + H * 0.52, H * 0.14], [0.028, 0.032, 0.03], rigid(head));
    }
    const band = new THREE.TorusGeometry(H * 1.075, 0.014, 6, 24, Math.PI);
    band.rotateX(0.45).translate(0, headCenterY + 0.01, headCenter[2] + 0.01);
    add(band, "kid-accent", rigid(head));
  } else {
    // Wisps peeking out under a floppy bucket hat.
    for (const side of [-1, 1]) oval("kid-hair", [side * H * 0.82, headCenterY + H * 0.2, H * 0.3], [H * 0.3, H * 0.34, H * 0.5], rigid(head));
    oval("kid-hair", [0, headCenterY + H * 0.1, H * 0.62], [H * 0.72, H * 0.5, H * 0.4], rigid(head));
    const hatY = headCenterY + H * 0.38;
    garment("kid-hat", [[0, H * 1.02], [H * 0.35, H * 0.98], [H * 0.7, H * 0.78], [H * 0.8, H * 0.45], [H * 0.82, 0]], 0.98, [0, hatY, headCenter[2] + 0.01], rigid(head));
    garment("kid-accent", [[H * 0.02, H * 1.05], [H * 0.12, H * 1.03]], 0.98, [0, hatY, headCenter[2] + 0.01], rigid(head));
    const brim = new THREE.CylinderGeometry(H * 1.05, H * 1.5, 0.05, 28, 1, true);
    brim.translate(0, hatY - 0.01, headCenter[2] + 0.01);
    add(brim, "kid-hat", rigid(head));
  }

  for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
    // Arms hang a little out from the tummy, elbows soft, hands at mid-thigh.
    const shoulderPoint: Point = [sign * (G + 0.004), shoulderY - 0.01, 0];
    const elbowPoint: Point = [sign * (G + 0.05), shoulderY - T * 0.41, 0.005];
    const wristPoint: Point = [sign * (G + 0.068), shoulderY - T * 0.76, -0.01];
    const shoulder = joint(`${side}_shoulder`, shoulderPoint, chest);
    const elbow = joint(`${side}_elbow`, elbowPoint, shoulder);
    const wrist = joint(`${side}_wrist`, wristPoint, elbow);
    const socket = new THREE.Object3D(); socket.name = `${side}_hand_socket`; socket.position.set(0, -0.05, -0.02); socket.userData.attachmentRole = "hand-prop"; wrist.add(socket);
    const armWeight: Weight = (p) => p.y > elbowPoint[1] ? blendY(elbow, shoulder, elbowPoint[1] - 0.01, elbowPoint[1] + 0.05)(p) : blendY(wrist, elbow, wristPoint[1] - 0.01, wristPoint[1] + 0.03)(p);
    const upper = 0.042 * limb, lower = 0.037 * limb;
    limbTube("kid-skin", shoulderPoint, elbowPoint, upper, armWeight);
    limbTube("kid-skin", elbowPoint, wristPoint, lower, armWeight);
    // Mitten hand with a thumb.
    oval("kid-skin", [wristPoint[0] + sign * 0.006, wristPoint[1] - 0.045, wristPoint[2] - 0.004], [0.036 * limb, 0.05 * limb, 0.026 * limb], rigid(wrist));
    oval("kid-skin", [wristPoint[0] - sign * 0.018, wristPoint[1] - 0.03, wristPoint[2] - 0.022], [0.012 * limb, 0.024 * limb, 0.013 * limb], rigid(wrist), [0, 0, sign * 0.5]);
    if (variant === "runner") {
      // Short rash-guard sleeve over a round shoulder.
      const cuff: Point = [THREE.MathUtils.lerp(shoulderPoint[0], elbowPoint[0], 0.55), THREE.MathUtils.lerp(shoulderPoint[1], elbowPoint[1], 0.55), 0.003];
      limbTube("kid-top", shoulderPoint, cuff, upper + 0.008, rigid(shoulder), 0.9);
    } else {
      oval("kid-skin", [shoulderPoint[0] - sign * 0.006, shoulderPoint[1] - 0.012, 0], [upper * 1.08, upper * 1.08, upper], rigid(shoulder));
    }
    if (variant === "floaties") {
      // Inflatable water wing around the upper arm.
      const wing = new THREE.TorusGeometry(0.052, 0.03, 10, 20);
      const at = new THREE.Vector3(...shoulderPoint).lerp(new THREE.Vector3(...elbowPoint), 0.5);
      wing.rotateX(Math.PI / 2).rotateZ(sign * 0.25).translate(at.x, at.y, at.z);
      add(wing, "kid-accent", rigid(shoulder));
    }

    // Legs: round thighs and shins that bend at soft knees.
    // Hip, knee, and ankle stack straight up so the gait IK (which assumes this) keeps feet planted.
    const hipPoint: Point = [sign * G * 0.51, L, 0];
    const kneePoint: Point = [sign * G * 0.51, kneeY, 0];
    const anklePoint: Point = [sign * G * 0.51, ANKLE_Y, 0];
    const thigh = joint(`${side}_hip`, hipPoint, hips);
    const knee = joint(`${side}_knee`, kneePoint, thigh);
    const ankle = joint(`${side}_ankle`, anklePoint, knee);
    const legWeight: Weight = (p) => p.y > kneeY + 0.04 ? blendY(thigh, hips, L - 0.01, L + 0.06)(p) : blendY(knee, thigh, kneeY - 0.02, kneeY + 0.04)(p);
    limbTube("kid-skin", hipPoint, kneePoint, 0.05 * limb, legWeight, 0.95);
    limbTube("kid-skin", kneePoint, anklePoint, 0.043 * limb, legWeight, 0.95);
    const legX = hipPoint[0];
    if (variant === "runner") {
      // Knee-length board shorts.
      garment("kid-bottom", [[kneeY + 0.05, 0.068], [L - 0.04, 0.074], [L + 0.05, 0.08]], 0.95, [legX, 0, 0.005], legWeight);
      oval("kid-shoes", [anklePoint[0], 0.042, -0.035], [0.052, 0.042, 0.1], rigid(ankle));
      oval("kid-accent", [anklePoint[0], 0.075, -0.05], [0.046, 0.012, 0.05], rigid(ankle));
    } else if (variant === "boots") {
      garment("kid-bottom", [[L - 0.12, 0.066], [L - 0.06, 0.07], [L + 0.05, 0.078]], 0.95, [legX, 0, 0.005], legWeight);
      // Welly boot: straight shaft with a rolled top, chunky toe.
      const bootTop = kneeY - 0.03;
      garment("kid-shoes", [[0.015, 0.055], [0.06, 0.058], [bootTop - 0.02, 0.058], [bootTop, 0.063], [bootTop + 0.004, 0.05]], 0.95, [anklePoint[0], 0, 0.004], blendY(ankle, knee, ANKLE_Y + 0.02, ANKLE_Y + 0.08));
      oval("kid-shoes", [anklePoint[0], 0.04, -0.045], [0.058, 0.042, 0.1], rigid(ankle));
    } else {
      // Bare feet with a hint of toes.
      oval("kid-skin", [anklePoint[0], 0.032, -0.03], [0.046, 0.032, 0.085], rigid(ankle));
      oval("kid-skin", [anklePoint[0], 0.04, 0.005], [0.04, 0.042, 0.045], rigid(ankle));
    }
  }
  if (variant === "runner" || variant === "boots") {
    // Waistband joining both shorts legs.
    garment("kid-bottom", [[L - 0.06, G * 1.0], [L + 0.02, G * 1.04], [L + 0.07, G * 1.02], [L + 0.075, 0]], 0.84, [0, 0, 0.004], rigid(hips));
  } else {
    // Rounded swimsuit seat, closed underneath.
    garment("kid-top", [[L - 0.088, 0], [L - 0.084, G * 0.55], [L - 0.065, G * 0.9], [L - 0.02, G * 1.03], [L + 0.05, G * 1.05], [L + 0.055, 0]], 0.84, [0, 0, 0.004], rigid(hips));
  }

  model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const [slot, geometries] of pieces) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error(`Unable to merge ${slot}`);
    const material = new THREE.MeshStandardMaterial({ color: SPLASH_KID_COLORS[variant][slot], roughness: 1, metalness: 0 }); material.name = slot;
    const mesh = new THREE.SkinnedMesh(geometry, material); mesh.name = slot; mesh.castShadow = true; mesh.receiveShadow = false; model.add(mesh); mesh.bind(skeleton);
    geometries.forEach((part) => part.dispose());
  }
  model.animations = createSplashKidClips(variant, new Map(bones.map((bone) => [bone.name, bone.position.clone()])));
  return model;
}

/** How each kid splashes at a jet and runs from the goose, as picked in the kid animation lab. */
const PERSONALITY: Readonly<Record<SplashKidVariant, { splash: (legs: LegDimensions) => [number, (p: number) => Pose]; flee: FleeArms; cryReach: [number, number] }>> = {
  runner: { splash: (legs) => [0.95, jetJumpPose({ legs, height: 0.13, crouch: 0.07 })], flee: "pump", cryReach: [1.45, 1.4] },
  boots: { splash: (legs) => [0.9, puddleStompPose({ legs, knee: 0.14, flap: 0.6 })], flee: "flail", cryReach: [1.55, 1.3] },
  floaties: { splash: (legs) => [2.4, twirlPose({ legs, arms: 1.35, tilt: 0.28 })], flee: "clutch", cryReach: [1.9, 1.0] },
};

/** In-place presentation clips; never move gameplay state. Travel clips match the kid's gameplay speed. */
function createSplashKidClips(variant: SplashKidVariant, bind: ReadonlyMap<string, THREE.Vector3>): THREE.AnimationClip[] {
  const rotation = (bone: string, times: number[], angles: Point[]) => new THREE.QuaternionKeyframeTrack(
    `${bone}.quaternion`, times, angles.flatMap((angle) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...angle)).toArray()),
  );
  const position = (bone: string, times: number[], values: Point[]) => new THREE.VectorKeyframeTrack(`${bone}.position`, times, values.flat());
  const legs = splashKidLegs(variant); const playSpeed = SPLASH_KID_PLAY_SPEEDS[variant];
  const idle = new THREE.AnimationClip("idle", 2.4, [rotation("chest", [0, 1.2, 2.4], [[0,0,0], [0.025,0,0], [0,0,0]])]);
  const skip = kidSkip(legs, playSpeed);
  const [splashSeconds, splashPose] = PERSONALITY[variant].splash(legs);
  const flee = fleePose(legs, SPLASH_KID_FLEE_SPEED, PERSONALITY[variant].flee);
  const stomp = new THREE.AnimationClip("stomp", 0.9, [
    position("root", [0,0.28,0.48,0.66,0.9], [[0,0,0],[0,0.035,0],[0,0,0],[0,0.025,0],[0,0,0]]),
    rotation("left_hip", [0,0.28,0.48,0.9], [[0,0,0],[0.55,0,0],[-0.2,0,0],[0,0,0]]),
    rotation("right_hip", [0,0.45,0.65,0.9], [[0,0,0],[0.5,0,0],[-0.18,0,0],[0,0,0]]),
  ]);
  const handsUp = new THREE.AnimationClip("hands_up", 0.8, [
    rotation("left_shoulder", [0,0.28,0.62,0.8], [[0,0,0],[0,0,-2.4],[0,0,-2.2],[0,0,0]]),
    rotation("right_shoulder", [0,0.28,0.62,0.8], [[0,0,0],[0,0,2.4],[0,0,2.2],[0,0,0]]),
    rotation("chest", [0,0.28,0.62,0.8], [[0,0,0],[0.12,0,0],[0.06,0,0],[0,0,0]]),
  ]);
  return [
    idle,
    walkClip("walk", kidWalk(legs, playSpeed), bind),
    cycleClip("skip", skip.duration, skip.pose, bind, 60),
    cycleClip("splash", splashSeconds, splashPose, bind, 72),
    cycleClip("flee", flee.duration, flee.pose, bind, 48),
    cycleClip("cry", 1.6, rubEyesPose({ legs, sob: 1, reach: PERSONALITY[variant].cryReach }), bind, 48),
    stomp, handsUp,
  ];
}
