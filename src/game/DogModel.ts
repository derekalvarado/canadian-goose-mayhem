import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { cycleClip, pulse, wave, type Pose, type Vec3 } from "./janitorGaits.ts";
import { PALETTE } from "./palette.ts";

export type DogSlot = "dog-coat" | "dog-shade" | "dog-nose" | "dog-eyes" | "dog-eye-shine" | "dog-tongue" | "dog-mouth" | "dog-collar" | "dog-tag";
const D = PALETTE.dog;
export const DOG_COLORS: Readonly<Record<DogSlot, number>> = {
  "dog-coat": D.coat, "dog-shade": D.coatShade, "dog-nose": D.nose, "dog-eyes": D.eyes, "dog-eye-shine": D.eyeShine,
  "dog-tongue": D.tongue, "dog-mouth": D.mouth, "dog-collar": D.collar, "dog-tag": D.tag,
};

type Point = [number, number, number];
type DogBone = "root" | "pelvis" | "chest" | "neck" | "head" | "jaw" | "left_ear" | "right_ear" | "tail" | "tail_tip"
  | `${"front" | "back"}_${"left" | "right"}_${"upper" | "lower"}`;
const BONES: readonly DogBone[] = ["pelvis", "chest", "neck", "head", "jaw", "left_ear", "right_ear", "tail", "tail_tip",
  "front_left_upper", "front_left_lower", "front_right_upper", "front_right_lower",
  "back_left_upper", "back_left_lower", "back_right_upper", "back_right_lower"];

/**
 * A small, fluffy white terrier: round face, pricked ears, carrot tail. Metres,
 * Y up, facing -Z, paws at Y=0, standing about 0.45 m at the shoulder (people in
 * this game are drawn large). Rig: +x on a bone raises whatever points forward
 * from it and swings a hanging leg forward; +y turns left; +z rolls right side up.
 */
export function createDogModel(): THREE.Group {
  const model = new THREE.Group();
  model.name = "small-white-dog";
  model.userData = { assetRole: "rigged-character", visualDetailTier: 3, forward: "-Z" };
  const bones: THREE.Bone[] = [];
  const absolute = new Map<string, THREE.Vector3>();
  const bone = (name: DogBone, position: Point, parent?: THREE.Bone) => {
    const b = new THREE.Bone(); b.name = name;
    const at = new THREE.Vector3(...position); absolute.set(name, at);
    b.position.copy(at); if (parent) b.position.sub(absolute.get(parent.name)!);
    (parent ?? model).add(b); bones.push(b); return b;
  };
  const root = bone("root", [0, 0, 0]);
  const pelvis = bone("pelvis", [0, 0.47, 0.18], root);
  const chest = bone("chest", [0, 0.48, -0.16], pelvis);
  const neck = bone("neck", [0, 0.56, -0.28], chest);
  const head = bone("head", [0, 0.7, -0.36], neck);
  const jaw = bone("jaw", [0, 0.64, -0.42], head);
  const leftEar = bone("left_ear", [-0.09, 0.84, -0.36], head);
  const rightEar = bone("right_ear", [0.09, 0.84, -0.36], head);
  const tail = bone("tail", [0, 0.56, 0.36], pelvis);
  const tailTip = bone("tail_tip", [0, 0.72, 0.4], tail);
  const legs = new Map<string, [THREE.Bone, THREE.Bone]>();
  for (const [end, parent, z] of [["front", chest, -0.2], ["back", pelvis, 0.24]] as const) {
    for (const [side, x] of [["left", -0.11], ["right", 0.11]] as const) {
      const upper = bone(`${end}_${side}_upper`, [x, 0.4, z], parent);
      const lower = bone(`${end}_${side}_lower`, [x, 0.2, z + (end === "back" ? 0.03 : 0)], upper);
      legs.set(`${end}_${side}`, [upper, lower]);
    }
  }
  const index = (b: THREE.Bone) => bones.indexOf(b);
  const pieces = new Map<DogSlot, THREE.BufferGeometry[]>();
  type Weight = (p: THREE.Vector3) => [number, number, number];
  const rigid = (b: THREE.Bone): Weight => () => [index(b), index(b), 0];
  const blendZ = (front: THREE.Bone, back: THREE.Bone, z0: number, z1: number): Weight => (p) => [index(front), index(back), THREE.MathUtils.smoothstep(p.z, z0, z1)];
  const blendY = (lower: THREE.Bone, upper: THREE.Bone, y0: number, y1: number): Weight => (p) => [index(lower), index(upper), THREE.MathUtils.smoothstep(p.y, y0, y1)];
  function add(geometry: THREE.BufferGeometry, slot: DogSlot, weight: Weight): void {
    geometry.deleteAttribute("uv");
    const p = new THREE.Vector3(); const positions = geometry.getAttribute("position");
    const skinIndex: number[] = []; const skinWeight: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i); const [a, b, t] = weight(p);
      skinIndex.push(a, b, 0, 0); skinWeight.push(1 - t, t, 0, 0);
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
    const bucket = pieces.get(slot) ?? []; bucket.push(geometry); pieces.set(slot, bucket);
  }
  function oval(slot: DogSlot, center: Point, radii: Point, weight: Weight, tilt: Point = [0, 0, 0]): void {
    const segments = Math.round(THREE.MathUtils.clamp(8 + Math.max(...radii) * 40, 8, 16));
    const geometry = new THREE.SphereGeometry(1, segments, Math.max(6, Math.round(segments * 0.66)));
    geometry.scale(...radii).rotateX(tilt[0]).rotateY(tilt[1]).rotateZ(tilt[2]).translate(...center);
    add(geometry, slot, weight);
  }
  function cone(slot: DogSlot, base: Point, tip: Point, radius: number, weight: Weight): void {
    const a = new THREE.Vector3(...base); const b = new THREE.Vector3(...tip);
    const geometry = new THREE.ConeGeometry(radius, a.distanceTo(b), 8, 1);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    add(geometry, slot, weight);
  }

  // Body: a fluffy barrel, with tufts along the belly and a ruff at the chest.
  const body = blendZ(chest, pelvis, -0.12, 0.12);
  oval("dog-coat", [0, 0.47, 0.02], [0.17, 0.16, 0.3], body);
  oval("dog-coat", [0, 0.45, -0.17], [0.17, 0.17, 0.15], rigid(chest));
  oval("dog-coat", [0, 0.46, 0.2], [0.16, 0.16, 0.15], rigid(pelvis));
  for (const z of [-0.12, 0.04, 0.18]) oval("dog-shade", [0, 0.34, z], [0.12, 0.06, 0.08], body);
  oval("dog-coat", [0, 0.48, -0.3], [0.14, 0.13, 0.08], blendY(chest, neck, 0.5, 0.6)); // ruff
  const collar = new THREE.TorusGeometry(0.105, 0.022, 6, 16); collar.rotateX(Math.PI / 2 + 0.6).translate(0, 0.6, -0.3);
  add(collar, "dog-collar", rigid(neck));
  oval("dog-tag", [0, 0.53, -0.4], [0.025, 0.03, 0.01], rigid(neck));
  // Head: round fluffy face, short muzzle, black button nose, pricked ears.
  oval("dog-coat", [0, 0.6, -0.31], [0.09, 0.11, 0.09], blendY(chest, neck, 0.5, 0.62));
  oval("dog-coat", [0, 0.72, -0.37], [0.15, 0.14, 0.14], rigid(head));
  for (const side of [-1, 1]) oval("dog-coat", [side * 0.1, 0.67, -0.42], [0.08, 0.08, 0.08], rigid(head)); // cheek fluff
  oval("dog-coat", [0, 0.67, -0.5], [0.075, 0.06, 0.08], rigid(head)); // muzzle
  oval("dog-nose", [0, 0.69, -0.575], [0.03, 0.022, 0.02], rigid(head));
  oval("dog-coat", [0, 0.625, -0.48], [0.06, 0.03, 0.07], rigid(jaw)); // chin
  oval("dog-mouth", [0, 0.64, -0.5], [0.045, 0.012, 0.045], rigid(jaw));
  oval("dog-tongue", [0, 0.628, -0.52], [0.03, 0.01, 0.035], rigid(jaw));
  for (const side of [-1, 1]) {
    oval("dog-eyes", [side * 0.058, 0.755, -0.495], [0.022, 0.025, 0.014], rigid(head));
    oval("dog-eye-shine", [side * 0.058 - 0.006, 0.765, -0.506], [0.007, 0.008, 0.004], rigid(head));
    const ear = side < 0 ? leftEar : rightEar;
    cone("dog-coat", [side * 0.09, 0.8, -0.35], [side * 0.11, 0.94, -0.35], 0.055, rigid(ear));
    cone("dog-shade", [side * 0.09, 0.81, -0.37], [side * 0.105, 0.92, -0.365], 0.03, rigid(ear));
  }
  // Tail: a stubby upright carrot.
  cone("dog-coat", [0, 0.54, 0.34], [0, 0.78, 0.4], 0.05, blendY(tail, tailTip, 0.62, 0.7));
  // Legs: short and fluffy, with round paws.
  for (const [key, [upper, lower]] of legs) {
    const at = absolute.get(upper.name)!; const back = key.startsWith("back");
    oval("dog-coat", [at.x, 0.33, at.z], [0.065, 0.13, back ? 0.09 : 0.07], blendY(lower, upper, 0.22, 0.32));
    oval("dog-coat", [at.x, 0.12, at.z + (back ? 0.03 : 0)], [0.05, 0.11, 0.05], rigid(lower));
    oval("dog-coat", [at.x, 0.03, at.z - 0.03 + (back ? 0.03 : 0)], [0.055, 0.035, 0.07], rigid(lower));
  }

  model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const [slot, geometries] of pieces) {
    const geometry = mergeGeometries(geometries); if (!geometry) throw new Error(`Unable to merge ${slot}`);
    const material = new THREE.MeshStandardMaterial({ color: DOG_COLORS[slot], roughness: 1, metalness: 0 }); material.name = slot;
    const mesh = new THREE.SkinnedMesh(geometry, material); mesh.name = slot; mesh.castShadow = true; mesh.receiveShadow = false;
    model.add(mesh); mesh.bind(skeleton); geometries.forEach((part) => part.dispose());
  }
  model.animations = createDogClips(new Map(bones.map((b) => [b.name, b.position.clone()])));
  return model;
}

type Rot = Partial<Record<DogBone, Vec3>>;
function pose(rot: Rot, pelvisMove: Vec3 = [0, 0, 0]): Pose {
  const complete: Record<string, Vec3> = {};
  for (const name of BONES) complete[name] = rot[name] ?? [0, 0, 0];
  return { rot: complete as Pose["rot"], move: { pelvis: pelvisMove } as Pose["move"] };
}
/** Sitting: rump down, chest up on straight front legs, hind legs folded under. */
function sitting(extra: Rot = {}, lift = 0): Pose {
  const tilt = 0.62;
  const rot: Rot = {
    pelvis: [tilt + lift, 0, 0], chest: [0.1, 0, 0], neck: [-0.45, 0, 0], head: [-0.25, 0, 0],
    front_left_upper: [-tilt - 0.1, 0, 0], front_right_upper: [-tilt - 0.1, 0, 0],
    back_left_upper: [0.75, 0, -0.12], back_right_upper: [0.75, 0, 0.12], back_left_lower: [-2.0, 0, 0], back_right_lower: [-2.0, 0, 0],
    tail: [-1.1, 0, 0], ...extra,
  };
  return pose(rot, [0, -0.14, 0.02]);
}

function createDogClips(bind: ReadonlyMap<string, THREE.Vector3>): THREE.AnimationClip[] {
  return [
    // Sitting up, tail sweeping slowly, looking about.
    cycleClip("sit", 4, (p) => sitting({ head: [-0.25 + 0.05 * wave(p * 2), 0.35 * wave(p), 0.1 * wave(p, 0.3)], tail: [-1.1, 0.25 * wave(p * 4), 0],
      chest: [0.1 + 0.015 * wave(p * 4), 0, 0] }), bind),
    // Lying flat on the bench, chin on paws, breathing.
    cycleClip("lie", 5, (p) => pose({
      pelvis: [0, 0, 0], chest: [0.02 * wave(p * 2), 0, 0], neck: [-0.5, 0.15, 0], head: [0.15, 0.1 * wave(p), 0.12],
      front_left_upper: [1.45, 0, 0], front_right_upper: [1.45, 0, 0], front_left_lower: [0.05, 0, 0], front_right_lower: [0.05, 0, 0],
      back_left_upper: [1.3, 0, -0.35], back_right_upper: [1.3, 0, 0.35], back_left_lower: [-2.3, 0, 0], back_right_lower: [-2.3, 0, 0],
      tail: [-1.3, 0.2, 0], left_ear: [-0.25, 0, -0.2], right_ear: [-0.25, 0, 0.2],
    }, [0, -0.25, 0.0]), bind),
    // Sitting up straight with ears pricked, head cocked at something interesting.
    cycleClip("alert", 2.2, (p) => sitting({ neck: [-0.3, 0, 0], head: [-0.15, 0, 0.3 * Math.sign(wave(p * 0.5)) * Math.min(1, Math.abs(wave(p * 0.5)) * 3)],
      left_ear: [0.15, 0, 0], right_ear: [0.15, 0, 0], tail: [-0.8, 0.12 * wave(p * 3), 0] }), bind),
    // Being stroked: leaning into the hand with the tail going like mad.
    cycleClip("happy", 0.8, (p) => sitting({ neck: [-0.35, 0.3, 0], head: [-0.05, 0.35, -0.25 + 0.06 * wave(p)], tail: [-0.9, 0.55 * wave(p * 2), 0],
      left_ear: [-0.35, 0, -0.25], right_ear: [-0.35, 0, 0.25], jaw: [-0.18, 0, 0] }), bind),
    // Standing up on the bench, barking: each yap dips the chest and snaps the jaw open.
    cycleClip("bark", 0.55, (p) => {
      const yap = pulse(p, 0.1);
      return pose({
        pelvis: [-0.06 * yap, 0, 0], chest: [-0.1 * yap, 0, 0], neck: [0.25 + 0.2 * yap, 0, 0], head: [0.05 + 0.1 * yap, 0, 0], jaw: [-0.5 * yap, 0, 0],
        front_left_upper: [0.15 * yap, 0, -0.08], front_right_upper: [0.15 * yap, 0, 0.08],
        back_left_upper: [-0.1, 0, -0.05], back_right_upper: [-0.1, 0, 0.05], back_left_lower: [0.15, 0, 0], back_right_lower: [0.15, 0, 0],
        tail: [-0.2, 0.35 * wave(p * 2), 0], left_ear: [0.2, 0, 0], right_ear: [0.2, 0, 0],
      }, [0, -0.03 * yap, 0]);
    }, bind),
    // Standing, tail wagging, weight shifting: ready to go.
    cycleClip("stand", 1.6, (p) => pose({
      neck: [0.2, 0.15 * wave(p * 0.5), 0], head: [0, 0.2 * wave(p * 0.5), 0], tail: [-0.3, 0.4 * wave(p * 2), 0],
      chest: [0.02 * wave(p), 0, 0], left_ear: [0.1, 0, 0], right_ear: [0.1, 0, 0],
    }), bind),
  ];
}
