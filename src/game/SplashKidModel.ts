import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "./palette.ts";

export type SplashKidVariant = "runner" | "boots";

export const SPLASH_KID_COLORS: Readonly<Record<SplashKidVariant, Readonly<Record<string, number>>>> = {
  runner: {
    "kid-skin": 0xb97443, "kid-arms": 0xb97443, "kid-hair": 0x3e3028,
    "kid-eyes": PALETTE.goose.black, "kid-mouth": PALETTE.goose.black,
    "kid-top": PALETTE.plaza.water, "kid-sleeves": PALETTE.plaza.water,
    "kid-bottom": PALETTE.accent.sunlight, "kid-shoes": PALETTE.goose.orange,
    "kid-headband": PALETTE.flower.coral,
  },
  boots: {
    "kid-skin": 0xd09257, "kid-arms": 0xd09257, "kid-hair": 0x40332d,
    "kid-eyes": PALETTE.goose.black, "kid-mouth": PALETTE.goose.black,
    "kid-top": PALETTE.flower.coral, "kid-sleeves": PALETTE.flower.coral,
    "kid-bottom": PALETTE.accent.navy, "kid-shoes": PALETTE.accent.sunlight,
    "kid-headband": PALETTE.flower.coral,
  },
};

type ColorSlot = keyof typeof SPLASH_KID_COLORS.runner;
type Point = [number, number, number];
type Weight = (position: THREE.Vector3) => [number, number, number];

/** Low-detail 1.18 m child rig. Metres, Y up, facing -Z, feet at Y=0. */
export function createSplashKidModel(variant: SplashKidVariant): THREE.Group {
  const model = new THREE.Group();
  model.name = `splash-kid-${variant}`;
  model.userData = { assetRole: "rigged-character", visualDetailTier: 2, forward: "-Z", flatArms: true };
  const bones: THREE.Bone[] = [];
  const bindPositions = new Map<string, THREE.Vector3>();
  function joint(name: string, position: Point, parent?: THREE.Bone): THREE.Bone {
    const bone = new THREE.Bone(); bone.name = name;
    const absolute = new THREE.Vector3(...position); bone.position.copy(absolute);
    if (parent) bone.position.sub(bindPositions.get(parent.name)!);
    (parent ?? model).add(bone); bones.push(bone); bindPositions.set(name, absolute); return bone;
  }
  const root = joint("root", [0, 0, 0]);
  const hips = joint("hips", [0, 0.47, 0], root);
  const spine = joint("spine", [0, 0.63, 0], hips);
  const chest = joint("chest", [0, 0.79, 0], spine);
  const neck = joint("neck", [0, 0.91, 0], chest);
  const head = joint("head", [0, 1.01, -0.01], neck);
  const rigid = (bone: THREE.Bone): Weight => () => [bones.indexOf(bone), bones.indexOf(bone), 0];
  const pieces = new Map<ColorSlot, THREE.BufferGeometry[]>();
  function add(geometry: THREE.BufferGeometry, slot: ColorSlot, weight: Weight): void {
    geometry.deleteAttribute("uv");
    const p = new THREE.Vector3(); const positions = geometry.getAttribute("position");
    const indices: number[] = []; const weights: number[] = [];
    for (let index = 0; index < positions.count; index++) {
      p.fromBufferAttribute(positions, index); const [a, b, amount] = weight(p);
      indices.push(a, b, 0, 0); weights.push(1 - amount, amount, 0, 0);
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    const bucket = pieces.get(slot) ?? []; bucket.push(geometry); pieces.set(slot, bucket);
  }
  function oval(slot: ColorSlot, center: Point, radii: Point, weight: Weight): void {
    const geometry = new THREE.SphereGeometry(1, 12, 8);
    geometry.scale(...radii).translate(...center); add(geometry, slot, weight);
  }
  function box(slot: ColorSlot, center: Point, size: Point, weight: Weight): void {
    const geometry = new THREE.BoxGeometry(...size, 1, 1, 1); geometry.translate(...center); add(geometry, slot, weight);
  }
  /** A six-face tapered prism keeps arms graphic and shallow instead of bubbly. */
  function flatLimb(slot: ColorSlot, start: Point, end: Point, startWidth: number, endWidth: number, depth: number, weight: Weight): void {
    const dx = end[0] - start[0]; const dy = end[1] - start[1]; const length = Math.max(0.0001, Math.hypot(dx, dy));
    const px = -dy / length; const py = dx / length;
    const positions: number[] = [];
    for (const [point, width] of [[start, startWidth], [end, endWidth]] as const) {
      for (const side of [-1, 1]) for (const z of [-depth / 2, depth / 2]) {
        positions.push(point[0] + px * width * side, point[1] + py * width * side, point[2] + z);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex([0,1,3,0,3,2,4,6,7,4,7,5,0,4,5,0,5,1,2,3,7,2,7,6,0,2,6,0,6,4,1,5,7,1,7,3]);
    geometry.computeVertexNormals(); add(geometry, slot, weight);
  }

  const torso = new THREE.CylinderGeometry(0.17, 0.205, 0.38, 8, 1);
  torso.scale(1, 1, 0.72).translate(0, 0.69, 0); add(torso, "kid-top", rigid(spine));
  oval("kid-bottom", [0, 0.48, 0.005], [0.205, 0.105, 0.135], rigid(hips));
  box("kid-bottom", [-0.092, 0.39, 0], [0.16, 0.17, 0.19], rigid(hips));
  box("kid-bottom", [0.092, 0.39, 0], [0.16, 0.17, 0.19], rigid(hips));
  oval("kid-skin", [0, 1.035, -0.015], [0.155, 0.17, 0.135], rigid(head));
  if (variant === "runner") {
    oval("kid-hair", [0, 1.105, 0.025], [0.165, 0.125, 0.145], rigid(head));
  } else {
    oval("kid-hair", [0, 1.055, 0.035], [0.178, 0.185, 0.125], rigid(head));
    const band = new THREE.TorusGeometry(0.16, 0.016, 5, 16, Math.PI);
    band.rotateX(Math.PI / 2).rotateZ(Math.PI).translate(0, 1.125, -0.008); add(band, "kid-headband", rigid(head));
  }
  for (const side of [-1, 1]) oval("kid-eyes", [side * 0.052, 1.065, -0.139], [0.013, 0.019, 0.008], rigid(head));
  oval("kid-skin", [0, 1.027, -0.147], [0.025, 0.022, 0.018], rigid(head));
  box("kid-mouth", [0, 0.992, -0.148], [0.055, 0.012, 0.008], rigid(head));

  for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
    const shoulderPoint: Point = [sign * 0.17, 0.8, 0]; const elbowPoint: Point = [sign * 0.27, 0.65, 0]; const wristPoint: Point = [sign * 0.305, 0.51, -0.005];
    const shoulder = joint(`${side}_shoulder`, shoulderPoint, chest);
    const elbow = joint(`${side}_elbow`, elbowPoint, shoulder);
    const wrist = joint(`${side}_wrist`, wristPoint, elbow);
    const socket = new THREE.Object3D(); socket.name = `${side}_hand_socket`; socket.position.set(0, -0.055, -0.025); socket.userData.attachmentRole = "hand-prop"; wrist.add(socket);
    flatLimb("kid-sleeves", shoulderPoint, elbowPoint, 0.063, 0.052, 0.052, rigid(shoulder));
    flatLimb("kid-arms", elbowPoint, wristPoint, 0.052, 0.042, 0.045, rigid(elbow));
    oval("kid-skin", [sign * 0.315, 0.47, -0.008], [0.055, 0.065, 0.035], rigid(wrist));

    const thigh = joint(`${side}_hip`, [sign * 0.09, 0.43, 0.005], hips);
    const knee = joint(`${side}_knee`, [sign * 0.095, 0.255, 0], thigh);
    const ankle = joint(`${side}_ankle`, [sign * 0.098, 0.095, 0], knee);
    flatLimb("kid-skin", [sign * 0.09, 0.39, 0], [sign * 0.095, 0.245, 0], 0.065, 0.055, 0.105, rigid(thigh));
    if (variant === "boots") {
      box("kid-shoes", [sign * 0.098, 0.115, 0], [0.135, 0.23, 0.15], rigid(ankle));
      oval("kid-shoes", [sign * 0.098, 0.045, -0.055], [0.082, 0.047, 0.14], rigid(ankle));
    } else {
      flatLimb("kid-skin", [sign * 0.095, 0.255, 0], [sign * 0.098, 0.075, 0], 0.055, 0.047, 0.095, rigid(knee));
      oval("kid-shoes", [sign * 0.098, 0.035, -0.045], [0.077, 0.04, 0.13], rigid(ankle));
    }
  }
  model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const [slot, geometries] of pieces) {
    const geometry = mergeGeometries(geometries); if (!geometry) throw new Error(`Unable to merge ${slot}`);
    const material = new THREE.MeshStandardMaterial({ color: SPLASH_KID_COLORS[variant][slot], roughness: 1, metalness: 0 }); material.name = slot;
    const mesh = new THREE.SkinnedMesh(geometry, material); mesh.name = slot; mesh.castShadow = true; mesh.receiveShadow = false; model.add(mesh); mesh.bind(skeleton);
    geometries.forEach((part) => part.dispose());
  }
  model.animations = createSplashKidClips();
  return model;
}

function createSplashKidClips(): THREE.AnimationClip[] {
  const rotation = (bone: string, times: number[], angles: Point[]) => new THREE.QuaternionKeyframeTrack(
    `${bone}.quaternion`, times, angles.flatMap((angle) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...angle)).toArray()),
  );
  const position = (bone: string, times: number[], values: Point[]) => new THREE.VectorKeyframeTrack(`${bone}.position`, times, values.flat());
  const idle = new THREE.AnimationClip("idle", 2.4, [rotation("chest", [0, 1.2, 2.4], [[0,0,0], [0.025,0,0], [0,0,0]])]);
  const gait = (name: "walk" | "run", amount: number, duration: number) => {
    const times = [0, duration * 0.25, duration * 0.5, duration * 0.75, duration]; const tracks: THREE.KeyframeTrack[] = [];
    for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
      tracks.push(rotation(`${side}_hip`, times, [amount,0,-amount,0,amount].map((x) => [x * sign,0,0])));
      tracks.push(rotation(`${side}_knee`, times, (sign === 1 ? [0.05,0.08,0.14,amount * 1.7,0.05] : [0.14,amount * 1.7,0.05,0.08,0.14]).map((x) => [x,0,0])));
      tracks.push(rotation(`${side}_shoulder`, times, [-amount * 0.7,0,amount * 0.7,0,-amount * 0.7].map((x) => [x * sign,0,0])));
    }
    return new THREE.AnimationClip(name, duration, tracks);
  };
  const stomp = new THREE.AnimationClip("stomp", 0.9, [
    position("root", [0,0.28,0.48,0.66,0.9], [[0,0,0],[0,0.035,0],[0,0,0],[0,0.025,0],[0,0,0]]),
    rotation("left_hip", [0,0.28,0.48,0.9], [[0,0,0],[-0.55,0,0],[0.2,0,0],[0,0,0]]),
    rotation("right_hip", [0,0.45,0.65,0.9], [[0,0,0],[-0.5,0,0],[0.18,0,0],[0,0,0]]),
  ]);
  const handsUp = new THREE.AnimationClip("hands_up", 0.8, [
    rotation("left_shoulder", [0,0.28,0.62,0.8], [[0,0,0],[0,0,-1.65],[0,0,-1.48],[0,0,0]]),
    rotation("right_shoulder", [0,0.28,0.62,0.8], [[0,0,0],[0,0,1.65],[0,0,1.48],[0,0,0]]),
    rotation("chest", [0,0.28,0.62,0.8], [[0,0,0],[-0.12,0,0],[-0.06,0,0],[0,0,0]]),
  ]);
  const cry = new THREE.AnimationClip("cry", 1.4, [
    rotation("head", [0,0.7,1.4], [[0.24,0,0],[0.31,0.08,0],[0.24,0,0]]),
    rotation("left_shoulder", [0,0.7,1.4], [[-0.8,0,-0.48],[-0.9,0,-0.58],[-0.8,0,-0.48]]),
    rotation("right_shoulder", [0,0.7,1.4], [[-0.8,0,0.48],[-0.9,0,0.58],[-0.8,0,0.48]]),
    rotation("chest", [0,0.7,1.4], [[0.14,0,0],[0.19,0,0],[0.14,0,0]]),
  ]);
  return [idle, gait("walk", 0.34, 1), gait("run", 0.62, 0.62), stomp, handsUp, cry];
}
