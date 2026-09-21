import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "./palette.ts";

/** Shared palette slots survive export/import. */
export const JANITOR_COLORS = {
  "janitor-skin": PALETTE.workwear.skin,
  "janitor-hair": PALETTE.goose.white,
  "janitor-cap": PALETTE.plaza.awningGreen,
  "janitor-shirt": PALETTE.accent.brick,
  "janitor-vest": PALETTE.workwear.safetyVest,
  "janitor-reflective-stripe": PALETTE.workwear.reflective,
  "janitor-trousers": PALETTE.workwear.trousers,
  "janitor-boots": PALETTE.plaza.iron,
  "janitor-eyes": PALETTE.goose.black,
} as const;

type ColorSlot = keyof typeof JANITOR_COLORS;
type Point = [number, number, number];
type Weight = (position: THREE.Vector3) => [number, number, number];

/** Smooth silhouettes, sparse costume details. Metres, Y up, facing -Z, feet at Y=0. */
export function createJanitorModel(): THREE.Group {
  const model = new THREE.Group();
  model.name = "street-janitor";
  model.userData = { assetRole: "rigged-character", visualDetailTier: 3, forward: "-Z" };
  const bones: THREE.Bone[] = [];
  const bindPositions = new Map<string, THREE.Vector3>();
  function joint(name: string, position: Point, parent?: THREE.Bone): THREE.Bone {
    const bone = new THREE.Bone();
    bone.name = name;
    const absolute = new THREE.Vector3(...position);
    bone.position.copy(absolute);
    if (parent) bone.position.sub(bindPositions.get(parent.name)!);
    (parent ?? model).add(bone);
    bones.push(bone);
    bindPositions.set(name, absolute);
    return bone;
  }
  const root = joint("root", [0, 0, 0]);
  const hips = joint("hips", [0, 1.02, 0], root);
  const spine = joint("spine", [0, 1.28, 0], hips);
  const chest = joint("chest", [0, 1.65, 0], spine);
  const neck = joint("neck", [0, 1.92, 0], chest);
  const head = joint("head", [0, 2.05, -0.015], neck);
  const rigid = (bone: THREE.Bone): Weight => () => [bones.indexOf(bone), bones.indexOf(bone), 0];
  const blendY = (lower: THREE.Bone, upper: THREE.Bone, bottom: number, top: number): Weight => (p) => [
    bones.indexOf(lower), bones.indexOf(upper), THREE.MathUtils.smoothstep(p.y, bottom, top),
  ];
  const torsoWeight: Weight = (p) => p.y < 1.42
    ? blendY(hips, spine, 1.08, 1.4)(p)
    : blendY(spine, chest, 1.42, 1.8)(p);
  const pieces = new Map<ColorSlot, THREE.BufferGeometry[]>();
  function add(geometry: THREE.BufferGeometry, slot: ColorSlot, weight: Weight): void {
    geometry.deleteAttribute("uv");
    const p = new THREE.Vector3();
    const positions = geometry.getAttribute("position");
    const indices: number[] = [], weights: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i);
      const [a, b, amount] = weight(p);
      indices.push(a, b, 0, 0);
      weights.push(1 - amount, amount, 0, 0);
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    const bucket = pieces.get(slot) ?? [];
    bucket.push(geometry);
    pieces.set(slot, bucket);
  }
  function oval(slot: ColorSlot, center: Point, radii: Point, weight: Weight, tilt = 0): void {
    const geometry = new THREE.SphereGeometry(1, 24, 16);
    geometry.scale(...radii).rotateZ(tilt).translate(...center);
    add(geometry, slot, weight);
  }
  // Many smooth-normal rings produce round clothing, without surface micro-detail.
  function garment(slot: ColorSlot, profile: [number, number][], depth: number, center: Point, weight: Weight): void {
    const curve = new THREE.SplineCurve(profile.map(([y, radius]) => new THREE.Vector2(radius, y)));
    const geometry = new THREE.LatheGeometry(curve.getPoints(32), 32);
    geometry.scale(1, 1, depth).translate(...center);
    add(geometry, slot, weight);
  }
  garment("janitor-shirt", [[0.98, 0], [1.01, 0.31], [1.12, 0.41], [1.38, 0.435], [1.65, 0.385], [1.79, 0.33], [1.86, 0.22], [1.89, 0]], 0.73, [0, 0, 0], torsoWeight);

  // Tailored vest shell: lowered armholes and a front V expose the red shirt.
  const torsoRadius = (y: number) => 0.44 - 0.12 * Math.pow((y - 1.3) / 0.65, 2);
  function vestSurface(bottom: number, top: number, neckline: boolean, offset = 0): THREE.BufferGeometry {
    const positions: number[] = [], indices: number[] = [];
    const segments = 64, rows = 16;
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= segments; col++) {
        const theta = col / segments * Math.PI * 2;
        const front = Math.max(0, -Math.cos(theta));
        const armhole = Math.pow(Math.abs(Math.sin(theta)), 8) * 0.2;
        const v = Math.pow(front, 12) * 0.25;
        const edge = neckline ? top - armhole - v : top;
        const y = THREE.MathUtils.lerp(bottom, edge, row / rows);
        const radius = torsoRadius(y) + offset;
        positions.push(Math.sin(theta) * radius, y, Math.cos(theta) * radius * 0.75 - 0.007);
        if (row < rows && col < segments) {
          const a = row * (segments + 1) + col, b = a + segments + 1;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  add(vestSurface(1.075, 1.875, true), "janitor-vest", torsoWeight);
  add(vestSurface(1.27, 1.345, false, 0.004), "janitor-reflective-stripe", torsoWeight);
  for (const side of [-1, 1]) {
    oval("janitor-vest", [side * 0.185, 1.18, -0.31], [0.107, 0.089, 0.033], torsoWeight);
    oval("janitor-vest", [side * 0.185, 1.25, -0.32], [0.107, 0.022, 0.032], torsoWeight);
  }
  oval("janitor-trousers", [0, 0.985, 0.012], [0.36, 0.22, 0.25], rigid(hips));
  oval("janitor-skin", [0, 1.94, -0.015], [0.135, 0.145, 0.13], blendY(chest, neck, 1.87, 1.99));
  oval("janitor-skin", [0, 2.19, -0.035], [0.278, 0.305, 0.252], rigid(head));
  oval("janitor-hair", [0, 2.255, 0.065], [0.28, 0.185, 0.222], rigid(head));
  for (const side of [-1, 1]) {
    oval("janitor-skin", [side * 0.273, 2.18, -0.012], [0.064, 0.089, 0.062], rigid(head));
    oval("janitor-hair", [side * 0.254, 2.27, -0.087], [0.031, 0.077, 0.04], rigid(head));
    oval("janitor-eyes", [side * 0.095, 2.239, -0.268], [0.015, 0.022, 0.01], rigid(head));
    oval("janitor-hair", [side * 0.06, 2.107, -0.282], [0.077, 0.035, 0.025], rigid(head), side * -0.18);
  }
  oval("janitor-skin", [0, 2.173, -0.292], [0.064, 0.061, 0.072], rigid(head));
  const crown = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  crown.scale(0.305, 0.215, 0.275).translate(0, 2.375, -0.005);
  add(crown, "janitor-cap", rigid(head));
  oval("janitor-cap", [0, 2.379, -0.012], [0.307, 0.033, 0.281], rigid(head));
  oval("janitor-cap", [0, 2.385, -0.247], [0.274, 0.028, 0.16], rigid(head));

  for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
    const shoulder = joint(`${side}_shoulder`, [sign * 0.355, 1.745, 0], chest);
    const elbow = joint(`${side}_elbow`, [sign * 0.535, 1.38, -0.015], shoulder);
    const wrist = joint(`${side}_wrist`, [sign * 0.585, 1.095, -0.075], elbow);
    const grip = new THREE.Object3D();
    grip.name = `${side}_hand_socket`;
    grip.position.set(0, -0.08, -0.04);
    grip.userData.attachmentRole = "hand-prop";
    wrist.add(grip);
    const armWeight: Weight = (p) => p.y > 1.23
      ? blendY(elbow, shoulder, 1.29, 1.51)(p)
      : blendY(wrist, elbow, 1.075, 1.21)(p);
    oval("janitor-shirt", [sign * 0.433, 1.594, -0.004], [0.152, 0.273, 0.155], armWeight, sign * -0.34);
    oval("janitor-shirt", [sign * 0.517, 1.411, -0.01], [0.133, 0.085, 0.143], armWeight);
    oval("janitor-skin", [sign * 0.56, 1.251, -0.047], [0.097, 0.206, 0.098], armWeight, sign * -0.13);
    oval("janitor-skin", [sign * 0.591, 1.045, -0.081], [0.096, 0.13, 0.08], rigid(wrist));
    oval("janitor-skin", [sign * 0.531, 1.065, -0.13], [0.038, 0.064, 0.04], rigid(wrist));
    const thigh = joint(`${side}_hip`, [sign * 0.208, 0.97, 0.015], hips);
    const knee = joint(`${side}_knee`, [sign * 0.217, 0.59, 0.012], thigh);
    const ankle = joint(`${side}_ankle`, [sign * 0.22, 0.19, 0.015], knee);
    const legWeight: Weight = (p) => p.y > 0.78
      ? blendY(thigh, hips, 0.82, 1.08)(p)
      : blendY(knee, thigh, 0.48, 0.7)(p);
    garment("janitor-trousers", [[0.33, 0.11], [0.37, 0.159], [0.53, 0.175], [0.75, 0.195], [0.92, 0.205], [1.03, 0.15], [1.06, 0]], 0.94, [sign * 0.213, 0, 0.016], legWeight);
    oval("janitor-trousers", [sign * 0.374, 0.747, -0.025], [0.058, 0.112, 0.128], legWeight);
    const bootWeight = blendY(ankle, knee, 0.2, 0.4);
    garment("janitor-boots", [[0.07, 0.12], [0.14, 0.139], [0.3, 0.146], [0.43, 0.15], [0.46, 0.141]], 0.91, [sign * 0.22, 0, 0.015], bootWeight);
    oval("janitor-boots", [sign * 0.22, 0.115, -0.082], [0.164, 0.115, 0.272], rigid(ankle));
  }
  model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const [slot, geometries] of pieces) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error(`Unable to merge ${slot}`);
    const material = new THREE.MeshStandardMaterial({ color: JANITOR_COLORS[slot], roughness: 1, metalness: 0 });
    material.name = slot;
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = slot;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    model.add(mesh);
    mesh.bind(skeleton);
    geometries.forEach((part) => part.dispose());
  }
  model.animations = createJanitorClips();
  return model;
}

/** In-place presentation clips; never move gameplay state. */
function createJanitorClips(): THREE.AnimationClip[] {
  const rotation = (bone: string, times: number[], angles: Point[]): THREE.QuaternionKeyframeTrack => {
    const values = angles.flatMap((angle) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...angle)).toArray());
    return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
  };
  const idle = new THREE.AnimationClip("idle", 4, [
    rotation("chest", [0, 1, 2, 3, 4], [[0, 0, 0], [0.012, 0, 0], [0, 0, 0], [-0.01, 0, 0], [0, 0, 0]]),
  ]);
  const look = new THREE.AnimationClip("look", 4, [
    rotation("head", [0, 1, 2, 3, 4], [[0, 0, 0], [0, 0.45, 0], [0, 0, 0], [0, -0.45, 0], [0, 0, 0]]),
  ]);
  const times = [0, 0.25, 0.5, 0.75, 1];
  const walkTracks: THREE.KeyframeTrack[] = [];
  for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
    walkTracks.push(rotation(`${side}_hip`, times, [0.36, 0, -0.36, 0, 0.36].map((x) => [x * sign, 0, 0])));
    // Forward is -Z: positive knee rotation folds the lower leg behind.
    walkTracks.push(rotation(`${side}_knee`, times, (sign === 1 ? [0.04, 0.05, 0.12, 0.65, 0.04] : [0.12, 0.65, 0.04, 0.05, 0.12]).map((x) => [x, 0, 0])));
    walkTracks.push(rotation(`${side}_shoulder`, times, [-0.24, 0, 0.24, 0, -0.24].map((x) => [x * sign, 0, 0])));
    walkTracks.push(rotation(`${side}_elbow`, times, [-0.08, -0.14, -0.2, -0.14, -0.08].map((x) => [x, 0, 0])));
  }
  const shooTimes = [0, 0.14, 0.34, 0.58, 0.82];
  const shoo = new THREE.AnimationClip("shoo", 0.82, [
    rotation("chest", shooTimes, [[0, 0, 0], [-0.08, 0, 0], [0.14, 0, 0], [0.06, 0, 0], [0, 0, 0]]),
    rotation("head", shooTimes, [[0, 0, 0], [0, 0.12, 0], [0, -0.08, 0], [0, 0.05, 0], [0, 0, 0]]),
    rotation("left_shoulder", shooTimes, [[0, 0, 0], [-0.65, 0, -0.4], [-1.35, 0, -0.18], [-0.82, 0, -0.32], [0, 0, 0]]),
    rotation("right_shoulder", shooTimes, [[0, 0, 0], [-0.65, 0, 0.4], [-1.35, 0, 0.18], [-0.82, 0, 0.32], [0, 0, 0]]),
    rotation("left_elbow", shooTimes, [[0, 0, 0], [-0.32, 0, 0], [-0.08, 0, 0], [-0.28, 0, 0], [0, 0, 0]]),
    rotation("right_elbow", shooTimes, [[0, 0, 0], [-0.32, 0, 0], [-0.08, 0, 0], [-0.28, 0, 0], [0, 0, 0]]),
  ]);
  const inspectTimes = [0, 0.4, 0.8, 1.2, 1.6];
  const inspect = new THREE.AnimationClip("inspect", 1.6, [
    rotation("spine", inspectTimes, [[0, 0, 0], [0.22, 0, 0], [0.27, 0, 0], [0.2, 0, 0], [0, 0, 0]]),
    rotation("head", inspectTimes, [[0, 0, 0], [0.24, 0.3, 0], [0.32, -0.28, 0], [0.22, 0.18, 0], [0, 0, 0]]),
    rotation("left_shoulder", inspectTimes, [[0, 0, 0], [0.18, 0, -0.08], [0.24, 0, -0.12], [0.16, 0, -0.07], [0, 0, 0]]),
    rotation("right_shoulder", inspectTimes, [[0, 0, 0], [0.18, 0, 0.08], [0.24, 0, 0.12], [0.16, 0, 0.07], [0, 0, 0]]),
  ]);
  const scratchTimes = [0, 0.22, 0.5, 0.78, 1.06, 1.3];
  const scratch = new THREE.AnimationClip("scratch", 1.3, [
    rotation("head", scratchTimes, [[0, 0, 0], [0, -0.18, 0.08], [0.05, -0.25, 0.1], [0, 0.2, -0.06], [0.04, -0.18, 0.08], [0, 0, 0]]),
    rotation("right_shoulder", scratchTimes, [[0, 0, 0], [-1.28, 0.15, 0.48], [-1.38, 0.2, 0.55], [-1.3, 0.12, 0.48], [-1.38, 0.2, 0.55], [0, 0, 0]]),
    rotation("right_elbow", scratchTimes, [[0, 0, 0], [-1.18, 0, 0], [-1.34, 0, 0], [-1.16, 0, 0], [-1.34, 0, 0], [0, 0, 0]]),
    rotation("right_wrist", scratchTimes, [[0, 0, 0], [-0.2, 0, 0.1], [-0.3, 0, -0.1], [-0.16, 0, 0.12], [-0.3, 0, -0.1], [0, 0, 0]]),
  ]);
  return [idle, look, new THREE.AnimationClip("walk", 1, walkTracks), shoo, inspect, scratch];
}
