import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "./palette.ts";
import { JANITOR_LEGS, type LegDimensions } from "./janitorGaits.ts";
import { createCafePersonClips } from "./cafeMoves.ts";
import type { CafeVariant } from "./cafeTuning.ts";

export type { CafeVariant } from "./cafeTuning.ts";
export { CAFE_VARIANTS } from "./cafeTuning.ts";

type ColorSlot =
  | "cafe-skin" | "cafe-hair" | "cafe-eyes" | "cafe-eye-shine" | "cafe-mouth" | "cafe-mouth-open" | "cafe-cheeks"
  | "cafe-top" | "cafe-trousers" | "cafe-shoes" | "cafe-accent" | "cafe-trim" | "cafe-glasses";

const P = PALETTE.cafePeople;
const FACE = { "cafe-eyes": P.eyes, "cafe-eye-shine": P.eyeShine, "cafe-mouth": P.mouth, "cafe-mouth-open": P.mouthOpen, "cafe-cheeks": P.cheeks, "cafe-glasses": P.glasses };

/** Palette slots per person; mesh material names match these keys so the toon loader can recolor them. */
export const CAFE_PERSON_COLORS: Readonly<Record<CafeVariant, Readonly<Record<ColorSlot, number>>>> = {
  barista: { ...FACE, "cafe-skin": P.skinWarm, "cafe-hair": P.hairAuburn, "cafe-top": P.baristaShirt, "cafe-trousers": P.darkTrousers,
    "cafe-shoes": P.shoes, "cafe-accent": PALETTE.coffee.apron, "cafe-trim": PALETTE.cafe.cupSleeve },
  laptop: { ...FACE, "cafe-skin": P.skinLight, "cafe-hair": P.hairBrown, "cafe-top": P.hoodie, "cafe-trousers": P.jeans,
    "cafe-shoes": P.sneakers, "cafe-accent": P.beanie, "cafe-trim": P.hoodieString },
  reader: { ...FACE, "cafe-skin": P.skinFair, "cafe-hair": P.hairSilver, "cafe-top": P.cardigan, "cafe-trousers": P.slacks,
    "cafe-shoes": P.shoes, "cafe-accent": P.blouse, "cafe-trim": PALETTE.cafe.coins },
  baker: { ...FACE, "cafe-skin": P.skinRuddy, "cafe-hair": P.hairGinger, "cafe-top": P.chefWhite, "cafe-trousers": P.checkTrousers,
    "cafe-shoes": P.shoes, "cafe-accent": 0xc9d4d8, "cafe-trim": P.chefButton },
  student: { ...FACE, "cafe-skin": P.skinDeep, "cafe-hair": P.hairBlack, "cafe-top": P.sweater, "cafe-trousers": P.jeans,
    "cafe-shoes": P.sneakers, "cafe-accent": P.sweaterStripe, "cafe-trim": PALETTE.kids.hairTie },
};

/** Overall size relative to the janitor, so the room is not four copies of one body. */
const HEIGHT_SCALE: Readonly<Record<CafeVariant, number>> = { barista: 0.96, laptop: 1, reader: 0.94, student: 0.95, baker: 1.02 };

/** Leg lengths for walk and sitting IK, matching the rig `createCafePersonModel` builds. */
export function cafePersonLegs(variant: CafeVariant): LegDimensions {
  const k = HEIGHT_SCALE[variant];
  return { thigh: JANITOR_LEGS.thigh * k, shin: JANITOR_LEGS.shin * k, hipJointY: JANITOR_LEGS.hipJointY * k, ankleY: JANITOR_LEGS.ankleY * k };
}
export function cafePersonScale(variant: CafeVariant): number { return HEIGHT_SCALE[variant]; }

type Point = [number, number, number];
type Weight = (position: THREE.Vector3) => [number, number, number];

/**
 * Coffee-shop people on the janitor's 18-bone rig and proportions (he is the
 * reference for how people look in this game), with their own faces, hair, and
 * clothes. Metres, Y up, facing -Z, feet at Y=0. Geometry is authored at the
 * janitor's size and scaled per person.
 */
export function createCafePersonModel(variant: CafeVariant): THREE.Group {
  const k = HEIGHT_SCALE[variant];
  const model = new THREE.Group();
  model.name = `cafe-${variant}`;
  model.userData = { assetRole: "rigged-character", visualDetailTier: 3, forward: "-Z", variant };
  const bones: THREE.Bone[] = [];
  const bindPositions = new Map<string, THREE.Vector3>();
  function joint(name: string, position: Point, parent?: THREE.Bone): THREE.Bone {
    const bone = new THREE.Bone();
    bone.name = name;
    const absolute = new THREE.Vector3(...position).multiplyScalar(k);
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
  const torsoWeight: Weight = (p) => p.y < 1.42 ? blendY(hips, spine, 1.08, 1.4)(p) : blendY(spine, chest, 1.42, 1.8)(p);
  const pieces = new Map<ColorSlot, THREE.BufferGeometry[]>();
  /** Weights are read in janitor coordinates, then the piece is scaled to this person's size. */
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
    geometry.scale(k, k, k);
    const bucket = pieces.get(slot) ?? [];
    bucket.push(geometry);
    pieces.set(slot, bucket);
  }
  function oval(slot: ColorSlot, center: Point, radii: Point, weight: Weight, tilt: number | Point = 0): void {
    // Small details need far fewer facets than the head and hips.
    const segments = Math.round(THREE.MathUtils.clamp(10 + Math.max(...radii) * 50, 10, 24));
    const geometry = new THREE.SphereGeometry(1, segments, Math.max(8, Math.round(segments * 0.66)));
    const [rx, ry, rz] = typeof tilt === "number" ? [0, 0, tilt] : tilt;
    geometry.scale(...radii).rotateX(rx).rotateY(ry).rotateZ(rz).translate(...center);
    add(geometry, slot, weight);
  }
  function garment(slot: ColorSlot, profile: [number, number][], depth: number, center: Point, weight: Weight, phiStart = 0, phiLength = Math.PI * 2): void {
    const curve = new THREE.SplineCurve(profile.map(([y, radius]) => new THREE.Vector2(radius, y)));
    const geometry = new THREE.LatheGeometry(curve.getPoints(32), 32, phiStart, phiLength);
    geometry.scale(1, 1, depth).translate(...center);
    add(geometry, slot, weight);
  }
  function tube(slot: ColorSlot, from: Point, to: Point, radius: number, weight: Weight): void {
    const start = new THREE.Vector3(...from); const end = new THREE.Vector3(...to);
    const geometry = new THREE.CapsuleGeometry(radius, start.distanceTo(end), 8, 20);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), start.clone().sub(end).normalize()));
    geometry.translate(...start.clone().add(end).multiplyScalar(0.5).toArray());
    add(geometry, slot, weight);
  }

  // --- Torso -------------------------------------------------------------------------------------
  const bulky = variant === "laptop" ? 0.025 : variant === "reader" || variant === "baker" ? 0.015 : 0;
  const hem = variant === "laptop" ? 0.93 : variant === "barista" ? 0.98 : 0.95;
  garment("cafe-top", [[hem, 0], [hem + 0.03, 0.33 + bulky], [1.12, 0.41 + bulky], [1.38, 0.43 + bulky], [1.65, 0.385 + bulky],
    [1.79, 0.33 + bulky * 0.6], [1.86, 0.22], [1.89, 0]], 0.73, [0, 0, 0], torsoWeight);
  if (variant === "barista") {
    // Apron: a front half-shell from the chest to the knees, a bib, neck strap, and waist ties.
    garment("cafe-accent", [[0.6, 0.27], [0.8, 0.33], [1.0, 0.425], [1.2, 0.445], [1.32, 0.45]], 0.76, [0, 0, -0.012], (p) => p.y > 1.1 ? torsoWeight(p) : rigid(hips)(p),
      Math.PI * 0.62, Math.PI * 0.76);
    garment("cafe-accent", [[1.3, 0.45], [1.5, 0.44], [1.66, 0.4]], 0.76, [0, 0, -0.012], torsoWeight, Math.PI * 0.78, Math.PI * 0.44);
    for (const side of [-1, 1]) tube("cafe-accent", [side * 0.16, 1.68, -0.29], [side * 0.1, 1.9, -0.12], 0.016, blendY(chest, neck, 1.8, 1.95));
    oval("cafe-trim", [0, 1.24, -0.335], [0.13, 0.08, 0.03], torsoWeight); // pocket
    for (const side of [-1, 1]) tube("cafe-accent", [side * 0.38, 1.28, 0.05], [side * 0.2, 1.24, 0.31], 0.02, torsoWeight);
  } else if (variant === "laptop") {
    // Hood bunched behind the neck, drawstrings, and a front pocket.
    oval("cafe-top", [0, 1.86, 0.2], [0.27, 0.14, 0.15], blendY(chest, neck, 1.8, 1.95));
    for (const side of [-1, 1]) tube("cafe-trim", [side * 0.07, 1.82, -0.31], [side * 0.08, 1.62, -0.34], 0.012, torsoWeight);
    oval("cafe-top", [0, 1.17, -0.33], [0.26, 0.12, 0.06], torsoWeight);
  } else if (variant === "reader") {
    // Open cardigan over a pale blouse, with a column of buttons.
    oval("cafe-accent", [0, 1.52, -0.31], [0.085, 0.36, 0.05], torsoWeight);
    oval("cafe-accent", [0, 1.84, -0.2], [0.13, 0.06, 0.08], torsoWeight); // collar
    for (let index = 0; index < 4; index += 1) oval("cafe-trim", [0.1, 1.2 + index * 0.13, -0.335], [0.018, 0.018, 0.01], torsoWeight);
  } else if (variant === "baker") {
    // Double-breasted chef's jacket with a standing collar, and a long work apron.
    garment("cafe-top", [[1.8, 0.3], [1.86, 0.25], [1.95, 0.17]], 0.9, [0, 0, -0.01], blendY(chest, neck, 1.8, 1.95));
    for (const x of [-0.12, 0.12]) for (let index = 0; index < 4; index += 1) oval("cafe-trim", [x, 1.72 - index * 0.13, -0.335 + index * 0.004], [0.02, 0.02, 0.012], torsoWeight);
    garment("cafe-accent", [[0.55, 0.28], [0.8, 0.34], [1.0, 0.44], [1.2, 0.46], [1.3, 0.465]], 0.76, [0, 0, -0.014], (p) => p.y > 1.1 ? torsoWeight(p) : rigid(hips)(p),
      Math.PI * 0.62, Math.PI * 0.76);
    for (const side of [-1, 1]) tube("cafe-accent", [side * 0.39, 1.29, 0.05], [side * 0.2, 1.25, 0.32], 0.02, torsoWeight);
  } else {
    // Sweater with a cream band across the chest.
    garment("cafe-accent", [[1.44, 0.44], [1.47, 0.445], [1.53, 0.43], [1.56, 0.425]], 0.745, [0, 0, 0], torsoWeight);
  }

  // --- Hips and head -----------------------------------------------------------------------------
  oval("cafe-trousers", [0, 0.985, 0.012], [0.35, 0.21, 0.245], rigid(hips));
  oval("cafe-skin", [0, 1.94, -0.015], [0.13, 0.145, 0.125], blendY(chest, neck, 1.87, 1.99));
  const headCenter: Point = [0, 2.19, -0.035];
  const headRadii: Point = [0.27, 0.3, 0.248];
  oval("cafe-skin", headCenter, headRadii, rigid(head));
  const onFace = (x: number, y: number, inset = 0): Point => {
    const u = x / headRadii[0], v = (y - headCenter[1]) / headRadii[1];
    return [x, y, headCenter[2] - headRadii[2] * Math.sqrt(Math.max(0, 1 - u * u - v * v)) + inset];
  };
  for (const side of [-1, 1]) {
    oval("cafe-skin", [side * 0.266, 2.18, -0.012], [0.058, 0.084, 0.058], rigid(head)); // ears
    const eye = onFace(side * 0.095, 2.235, 0.006);
    oval("cafe-eyes", eye, [0.018, 0.026, 0.012], rigid(head), [0, side * 0.3, 0]);
    oval("cafe-eye-shine", [eye[0] + side * 0.004 - 0.004, eye[1] + 0.009, eye[2] - 0.009], [0.006, 0.007, 0.004], rigid(head));
    const brow = onFace(side * 0.1, 2.3, -0.004);
    oval("cafe-hair", brow, [0.052, 0.013, 0.014], rigid(head), [0, side * 0.3, side * (variant === "reader" ? 0.12 : -0.1)]);
    if (variant !== "laptop") oval("cafe-cheeks", onFace(side * 0.155, 2.13, 0.008), [0.04, 0.024, 0.012], rigid(head), [0, side * 0.5, 0]);
  }
  oval("cafe-skin", onFace(0, 2.165, -0.02), [0.05, 0.052, 0.06], rigid(head)); // nose
  const smile = new THREE.CatmullRomCurve3([-1, -0.5, 0, 0.5, 1].map((t) => new THREE.Vector3(...onFace(t * 0.05, 2.085 + 0.012 * t * t, -0.002))));
  add(new THREE.TubeGeometry(smile, 12, 0.008, 5, false), "cafe-mouth", rigid(head));
  oval("cafe-mouth-open", onFace(0, 2.075, 0.006), [0.036, 0.042, 0.016], rigid(head));
  if (variant === "reader" || variant === "laptop") {
    // Round spectacles resting on the nose.
    for (const side of [-1, 1]) {
      const [x, y, z] = onFace(side * 0.1, 2.232, -0.03);
      const ring = new THREE.TorusGeometry(0.052, 0.008, 6, 20); ring.rotateY(side * 0.25).translate(x, y, z);
      add(ring, "cafe-glasses", rigid(head));
      tube("cafe-glasses", [side * 0.15, 2.24, z + 0.01], [side * 0.26, 2.24, -0.03], 0.006, rigid(head));
    }
    const bridge = onFace(0, 2.245, -0.045);
    tube("cafe-glasses", [-0.045, bridge[1], bridge[2]], [0.045, bridge[1], bridge[2]], 0.006, rigid(head));
  }

  /**
   * Hair: a shell hugging the scalp, cut along a hairline that sits high on the
   * forehead and slopes down past the ears to the nape (`front`/`back` are heights
   * above the head's centre). Then per-person styling on top.
   */
  const hairShell = (scale: number, front: number, back: number) => {
    const sphere = new THREE.SphereGeometry(1, 48, 32);
    sphere.scale(headRadii[0] * scale, headRadii[1] * scale, headRadii[2] * scale);
    const position = sphere.getAttribute("position"); const index = sphere.getIndex()!;
    const ry = headRadii[1] * scale; const rz = headRadii[2] * scale;
    const above: boolean[] = [];
    // Vertices below the hairline slide up onto it along the scalp, so the edge is a smooth curve.
    for (let vertex = 0; vertex < position.count; vertex++) {
      const x = position.getX(vertex); const y = position.getY(vertex); const z = position.getZ(vertex);
      const line = front + (back - front) * (z / rz + 1) / 2;
      above.push(y > line);
      if (y > line) continue;
      const ratio = Math.sqrt(Math.max(0, 1 - (line / ry) ** 2)) / Math.sqrt(Math.max(1e-6, 1 - (y / ry) ** 2));
      position.setXYZ(vertex, x * ratio, line, z * ratio);
    }
    const kept: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (above[a] || above[b] || above[c]) kept.push(a, b, c);
    }
    sphere.setIndex(kept);
    sphere.computeVertexNormals();
    sphere.translate(headCenter[0], headCenter[1] + 0.012, headCenter[2] + 0.006);
    add(sphere, "cafe-hair", rigid(head));
  };
  if (variant === "barista") {
    hairShell(1.05, 0.2, -0.24);
    // A bun on the crown, and soft waves over the tops of the ears.
    oval("cafe-hair", [0, 2.47, 0.1], [0.14, 0.12, 0.13], rigid(head));
    oval("cafe-hair", [0, 2.39, 0.13], [0.1, 0.06, 0.1], rigid(head));
    for (const side of [-1, 1]) oval("cafe-hair", [side * 0.235, 2.25, 0.03], [0.07, 0.1, 0.16], rigid(head));
    // A side part: a shallow ridge of hair sweeping across the forehead line.
    oval("cafe-hair", [0.05, 2.43, -0.2], [0.17, 0.045, 0.08], rigid(head), [-0.45, 0, -0.18]);
  } else if (variant === "laptop") {
    hairShell(1.03, 0.16, -0.22);
    // Beanie with a folded cuff, a short beard, and a moustache.
    const crown = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    crown.scale(0.29, 0.29, 0.275).translate(0, 2.3, 0.0);
    add(crown, "cafe-accent", rigid(head));
    const cuff = new THREE.CylinderGeometry(0.296, 0.29, 0.1, 32, 1, true); cuff.scale(1, 1, 0.95).translate(0, 2.33, 0);
    add(cuff, "cafe-accent", rigid(head));
    oval("cafe-accent", [0, 2.6, 0.02], [0.045, 0.045, 0.045], rigid(head));
    oval("cafe-hair", [0, 2.04, -0.13], [0.23, 0.13, 0.17], rigid(head));
    oval("cafe-hair", onFace(0, 2.115, 0.0), [0.08, 0.02, 0.025], rigid(head));
    for (const side of [-1, 1]) oval("cafe-hair", [side * 0.235, 2.12, -0.05], [0.05, 0.12, 0.12], rigid(head));
  } else if (variant === "reader") {
    // A soft silver bob that covers the ears and curls under at the jaw.
    hairShell(1.08, 0.22, -0.3);
    for (const side of [-1, 1]) oval("cafe-hair", [side * 0.25, 2.12, 0.03], [0.09, 0.2, 0.21], rigid(head));
    oval("cafe-hair", [0, 2.08, 0.15], [0.25, 0.17, 0.14], rigid(head));
  } else if (variant === "baker") {
    hairShell(1.04, 0.2, -0.26);
    // A soft baker's toque over short ginger hair, and a big moustache.
    const band = new THREE.CylinderGeometry(0.29, 0.285, 0.1, 32, 1, true); band.scale(1, 1, 0.95).translate(0, 2.38, -0.005);
    add(band, "cafe-top", rigid(head));
    oval("cafe-top", [0, 2.5, 0.0], [0.33, 0.14, 0.31], rigid(head));
    oval("cafe-top", [0.05, 2.58, 0.02], [0.26, 0.09, 0.24], rigid(head));
    for (const side of [-1, 1]) oval("cafe-hair", onFace(side * 0.055, 2.118, 0.004), [0.07, 0.03, 0.03], rigid(head), [0, side * 0.35, side * -0.25]);
  } else {
    hairShell(1.05, 0.19, -0.24);
    // Hair pulled back into a high ponytail with a pink tie.
    oval("cafe-trim", [0, 2.4, 0.24], [0.055, 0.055, 0.055], rigid(head));
    tube("cafe-hair", [0, 2.38, 0.28], [0, 2.04, 0.37], 0.065, rigid(head));
    oval("cafe-hair", [0, 2.02, 0.37], [0.07, 0.09, 0.07], rigid(head));
    for (const side of [-1, 1]) oval("cafe-hair", [side * 0.24, 2.24, 0.02], [0.05, 0.09, 0.14], rigid(head));
  }

  // --- Limbs ------------------------------------------------------------------------------------
  const longSleeves = variant !== "barista" && variant !== "baker";
  for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
    const shoulder = joint(`${side}_shoulder`, [sign * 0.355, 1.745, 0], chest);
    const elbow = joint(`${side}_elbow`, [sign * 0.535, 1.38, -0.015], shoulder);
    const wrist = joint(`${side}_wrist`, [sign * 0.585, 1.095, -0.075], elbow);
    const grip = new THREE.Object3D();
    grip.name = `${side}_hand_socket`;
    grip.position.set(0, -0.08 * k, -0.04 * k);
    grip.userData.attachmentRole = "hand-prop";
    wrist.add(grip);
    const armWeight: Weight = (p) => p.y > 1.23 ? blendY(elbow, shoulder, 1.29, 1.51)(p) : blendY(wrist, elbow, 1.075, 1.21)(p);
    const shoulderCap: Point = [sign * 0.35, 1.72, 0];
    const elbowPoint: Point = [sign * 0.525, 1.4, -0.012];
    if (longSleeves) {
      tube("cafe-top", shoulderCap, elbowPoint, 0.1 + bulky, armWeight);
      tube("cafe-top", elbowPoint, [sign * 0.578, 1.16, -0.066], 0.088 + bulky, armWeight);
      oval(variant === "reader" ? "cafe-top" : variant === "student" ? "cafe-accent" : "cafe-top", [sign * 0.58, 1.15, -0.07], [0.095, 0.035, 0.095], rigid(wrist));
    } else {
      // Sleeves rolled above the elbow, like the janitor's.
      tube("cafe-top", shoulderCap, [sign * 0.52, 1.41, -0.01], 0.098, armWeight);
      oval("cafe-top", [sign * 0.52, 1.415, -0.01], [0.11, 0.045, 0.112], armWeight, sign * 0.5);
      oval("cafe-skin", [sign * 0.56, 1.251, -0.047], [0.09, 0.2, 0.092], armWeight, sign * -0.13);
    }
    oval("cafe-skin", [sign * 0.591, 1.045, -0.081], [0.088, 0.12, 0.075], rigid(wrist));
    oval("cafe-skin", [sign * 0.531, 1.065, -0.13], [0.035, 0.06, 0.038], rigid(wrist));

    const thigh = joint(`${side}_hip`, [sign * 0.208, 0.97, 0.015], hips);
    const knee = joint(`${side}_knee`, [sign * 0.217, 0.59, 0.012], thigh);
    const ankle = joint(`${side}_ankle`, [sign * 0.22, 0.19, 0.015], knee);
    const legWeight: Weight = (p) => p.y > 0.78 ? blendY(thigh, hips, 0.82, 1.08)(p) : blendY(knee, thigh, 0.48, 0.7)(p);
    const flare = variant === "reader" ? 0.012 : 0;
    garment("cafe-trousers", [[0.2, 0.11 + flare], [0.3, 0.14 + flare], [0.53, 0.165], [0.75, 0.19], [0.92, 0.2], [1.03, 0.15], [1.06, 0]], 0.94,
      [sign * 0.213, 0, 0.016], (p) => p.y < 0.4 ? blendY(ankle, knee, 0.2, 0.4)(p) : legWeight(p));
    const shoeWeight = rigid(ankle);
    garment("cafe-shoes", [[0.03, 0.11], [0.1, 0.12], [0.2, 0.118], [0.23, 0.1]], 0.9, [sign * 0.22, 0, 0.015], shoeWeight);
    oval("cafe-shoes", [sign * 0.22, 0.075, -0.09], [0.13, 0.075, 0.23], shoeWeight);
    if (variant === "laptop" || variant === "student") oval("cafe-trousers", [sign * 0.22, 0.03, -0.085], [0.135, 0.03, 0.24], shoeWeight); // sneaker sole stripe
  }

  model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const colors = CAFE_PERSON_COLORS[variant];
  for (const [slot, geometries] of pieces) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error(`Unable to merge ${slot}`);
    const material = new THREE.MeshStandardMaterial({ color: colors[slot], roughness: 1, metalness: 0 });
    material.name = slot;
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = slot;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    if (slot === "cafe-mouth-open") mesh.visible = false;
    model.add(mesh);
    mesh.bind(skeleton);
    geometries.forEach((part) => part.dispose());
  }
  model.animations = createCafePersonClips(variant, new Map(bones.map((bone) => [bone.name, bone.position.clone()])));
  return model;
}
