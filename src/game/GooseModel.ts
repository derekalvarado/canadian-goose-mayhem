import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "./palette.ts";

/** Palette slots are kept by name through GLB export and replaced by toon materials at runtime. */
export const GOOSE_COLORS = {
  "goose-brown": PALETTE.goose.canadaBrown,
  "goose-brown-light": PALETTE.goose.canadaBrownLight,
  "goose-brown-dark": PALETTE.goose.canadaBrownDark,
  "goose-black": PALETTE.goose.black,
  "goose-white": PALETTE.goose.white,
  "goose-highlight": PALETTE.goose.highlight,
} as const;

type ColorSlot = keyof typeof GOOSE_COLORS;
type Point = [number, number, number];
type Weight = (position: THREE.Vector3, vertexIndex?: number) => [number, number, number];

export const GOOSE_HEIGHT_METERS = 0.95;
const AUTHORED_GOOSE_MIN_Y = 0.025;
const AUTHORED_GOOSE_MAX_Y = 1.245;

/** Smooth, 0.95-meter-tall Canada goose, grounded at Y=0 and facing -Z. */
export function createGooseModel(): THREE.Group {
  const model = new THREE.Group();
  model.name = "canada-goose";
  model.userData = {
    assetRole: "rigged-player-character",
    visualDetailTier: 6,
    forward: "-Z",
    source: "assets/characters/goose/goose.blend",
  };

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
  const body = joint("body", [0, 0.35, 0.06], root);
  const chest = joint("chest", [0, 0.42, -0.2], body);
  const neck1 = joint("neck_1", [0, 0.49, -0.26], chest);
  const neck2 = joint("neck_2", [0, 0.62, -0.31], neck1);
  const neck3 = joint("neck_3", [0, 0.75, -0.32], neck2);
  const neck4 = joint("neck_4", [0, 0.88, -0.36], neck3);
  const neck5 = joint("neck_5", [0, 0.99, -0.44], neck4);
  const neck6 = joint("neck_6", [0, 1.08, -0.54], neck5);
  const head = joint("head", [0, 1.12, -0.62], neck6);
  const lowerBill = joint("lower_bill", [0, 1.08, -0.73], head);
  const leftWing = joint("left_wing", [-0.23, 0.45, -0.06], body);
  const leftWingTip = joint("left_wing_tip", [-0.24, 0.42, 0.44], leftWing);
  const rightWing = joint("right_wing", [0.23, 0.45, -0.06], body);
  const rightWingTip = joint("right_wing_tip", [0.24, 0.42, 0.44], rightWing);
  const leftLeg = joint("left_leg", [-0.1, 0.23, 0.06], body);
  const rightLeg = joint("right_leg", [0.1, 0.23, 0.06], body);

  const rigid = (bone: THREE.Bone): Weight => () => [bones.indexOf(bone), bones.indexOf(bone), 0];
  const blend = (a: THREE.Bone, b: THREE.Bone, amount: number): [number, number, number] => [
    bones.indexOf(a), bones.indexOf(b), THREE.MathUtils.clamp(amount, 0, 1),
  ];
  const pieces = new Map<ColorSlot, THREE.BufferGeometry[]>();
  function add(geometry: THREE.BufferGeometry, slot: ColorSlot, weight: Weight): void {
    geometry.deleteAttribute("uv");
    const positions = geometry.getAttribute("position");
    const position = new THREE.Vector3();
    const indices: number[] = [];
    const weights: number[] = [];
    for (let index = 0; index < positions.count; index += 1) {
      position.fromBufferAttribute(positions, index);
      const [a, b, amount] = weight(position, index);
      indices.push(a, b, 0, 0);
      weights.push(1 - amount, amount, 0, 0);
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    const bucket = pieces.get(slot) ?? [];
    bucket.push(geometry);
    pieces.set(slot, bucket);
  }
  function oval(slot: ColorSlot, center: Point, radii: Point, weight: Weight, rotation: Point = [0, 0, 0]): void {
    const geometry = new THREE.SphereGeometry(1, 32, 22);
    geometry.scale(...radii).rotateX(rotation[0]).rotateY(rotation[1]).rotateZ(rotation[2]).translate(...center);
    add(geometry, slot, weight);
  }

  oval("goose-brown", [0, 0.37, 0.07], [0.3, 0.22, 0.42], rigid(body));
  oval("goose-brown-light", [0, 0.4, -0.2], [0.225, 0.235, 0.24], (p) =>
    blend(body, chest, THREE.MathUtils.smoothstep(-p.z, 0.02, 0.24)));
  oval("goose-brown-light", [0, 0.245, 0.08], [0.225, 0.09, 0.335], rigid(body));

  const neckBones = [neck1, neck2, neck3, neck4, neck5, neck6];
  const neckPoints = neckBones.map((bone) => bindPositions.get(bone.name)!.clone());
  const neckCurve = new THREE.CatmullRomCurve3(neckPoints, false, "centripetal");
  const neckGeometry = new THREE.TubeGeometry(neckCurve, 72, 0.078, 20, false);
  const neckRings = Array.from({ length: 73 }, (_, index) => neckCurve.getPointAt(index / 72));
  const neckWeight: Weight = (position, vertexIndex) => {
    // Every vertex of a tube ring must share weights. Weighting by each surface
    // vertex's height distorted the cross-section into lumps when bending low.
    const center = vertexIndex === undefined ? position : neckRings[Math.floor(vertexIndex / 21)];
    for (let index = 0; index < neckPoints.length - 1; index += 1) {
      const low = neckPoints[index];
      const high = neckPoints[index + 1];
      if (center.y <= high.y || index === neckPoints.length - 2) {
        return blend(neckBones[index], neckBones[index + 1],
          (center.y - low.y) / (high.y - low.y));
      }
    }
    return rigid(neck6)(position);
  };
  add(neckGeometry, "goose-black", neckWeight);

  oval("goose-black", [0, 1.13, -0.625], [0.12, 0.115, 0.142], rigid(head));
  // The white chinstrap stays close to the skull as one broad marking.
  for (const side of [-1, 1] as const) {
    oval("goose-white", [side * 0.093, 1.095, -0.635], [0.035, 0.068, 0.09], rigid(head), [0, 0, side * 0.18]);
    oval("goose-black", [side * 0.108, 1.16, -0.705], [0.011, 0.018, 0.009], rigid(head));
    oval("goose-highlight", [side * 0.111, 1.167, -0.712], [0.0035, 0.005, 0.003], rigid(head));
  }
  oval("goose-white", [0, 1.077, -0.612], [0.082, 0.032, 0.085], rigid(head));
  oval("goose-black", [0, 1.105, -0.755], [0.092, 0.035, 0.145], rigid(head));
  oval("goose-black", [0, 1.074, -0.75], [0.086, 0.024, 0.12], rigid(lowerBill));
  for (const side of [-1, 1] as const) {
    oval("goose-highlight", [side * 0.038, 1.119, -0.878], [0.006, 0.003, 0.004], rigid(head));
  }

  const wingWeight = (rootBone: THREE.Bone, tipBone: THREE.Bone): Weight => (position) =>
    blend(rootBone, tipBone, THREE.MathUtils.smoothstep(position.z, 0.06, 0.42));
  oval("goose-brown", [-0.235, 0.42, 0.15], [0.118, 0.14, 0.335], wingWeight(leftWing, leftWingTip), [-0.1, 0, -0.08]);
  oval("goose-brown", [0.235, 0.42, 0.15], [0.118, 0.14, 0.335], wingWeight(rightWing, rightWingTip), [-0.1, 0, 0.08]);

  const tailOutline = new THREE.Shape();
  tailOutline.moveTo(-0.13, 0);
  tailOutline.quadraticCurveTo(-0.11, 0.2, -0.07, 0.31);
  tailOutline.quadraticCurveTo(0, 0.345, 0.07, 0.31);
  tailOutline.quadraticCurveTo(0.11, 0.2, 0.13, 0);
  tailOutline.closePath();
  const tail = new THREE.ExtrudeGeometry(tailOutline, {
    depth: 0.035, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 2,
    curveSegments: 12, steps: 1,
  });
  tail.rotateX(Math.PI / 2).translate(0, 0.4, 0.43);
  add(tail, "goose-brown-dark", rigid(body));

  function foot(side: -1 | 1, bone: THREE.Bone): void {
    const x = side * 0.1;
    const ankle = new THREE.CylinderGeometry(0.027, 0.031, 0.2, 14);
    ankle.translate(x, 0.13, 0.06);
    add(ankle, "goose-black", rigid(bone));
    const shape = new THREE.Shape();
    shape.moveTo(-0.035, 0.04);
    shape.lineTo(-0.11, -0.105);
    shape.quadraticCurveTo(-0.105, -0.13, -0.075, -0.115);
    shape.lineTo(-0.012, -0.055);
    shape.lineTo(0, -0.145);
    shape.quadraticCurveTo(0.01, -0.17, 0.028, -0.14);
    shape.lineTo(0.05, -0.055);
    shape.lineTo(0.115, -0.108);
    shape.quadraticCurveTo(0.135, -0.12, 0.128, -0.09);
    shape.lineTo(0.04, 0.04);
    shape.closePath();
    // Give the webbing enough upward thickness to remain visible over the plaza's
    // raised paver geometry while keeping the sole on the authored ground plane.
    const webThickness = 0.02;
    const web = new THREE.ExtrudeGeometry(shape, {
      depth: webThickness,
      bevelEnabled: false,
      curveSegments: 5,
      steps: 1,
    });
    if (!web.index) web.setIndex(Array.from({ length: web.getAttribute("position").count }, (_, index) => index));
    web.rotateX(Math.PI / 2).translate(x, 0.025 + webThickness, -0.015);
    add(web, "goose-black", rigid(bone));
  }
  foot(-1, leftLeg);
  foot(1, rightLeg);

  model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const [slot, geometries] of pieces) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error(`Unable to merge goose geometry for ${slot}`);
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({ color: GOOSE_COLORS[slot], roughness: 1, metalness: 0 });
    material.name = slot;
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = slot;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    model.add(mesh);
    mesh.bind(skeleton);
    geometries.forEach((part) => part.dispose());
  }
  model.animations = createGooseClips(bindPositions);
  const meterScale = GOOSE_HEIGHT_METERS / (AUTHORED_GOOSE_MAX_Y - AUTHORED_GOOSE_MIN_Y);
  model.scale.setScalar(meterScale);
  model.position.y = -AUTHORED_GOOSE_MIN_Y * meterScale;
  model.userData.heightMeters = GOOSE_HEIGHT_METERS;
  return model;
}

function createGooseClips(bindPositions: ReadonlyMap<string, THREE.Vector3>): THREE.AnimationClip[] {
  const rotation = (bone: string, times: number[], angles: Point[]): THREE.QuaternionKeyframeTrack => {
    const values = angles.flatMap((angle) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...angle)).toArray());
    return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
  };
  const position = (bone: string, times: number[], offsets: Point[]): THREE.VectorKeyframeTrack => {
    const bind = bindPositions.get(bone)!;
    const values = offsets.flatMap(([x, y, z]) => [bind.x + x, bind.y + y, bind.z + z]);
    return new THREE.VectorKeyframeTrack(`${bone}.position`, times, values);
  };
  // Body is a root child, so its absolute bind position is also its local position.
  const idleTimes = [0, 1.2, 2.4, 3.6, 4.8];
  const idle = new THREE.AnimationClip("idle", 4.8, [
    position("body", idleTimes, [[0, 0, 0], [0, 0.006, 0], [0, 0, 0], [0, 0.005, 0], [0, 0, 0]]),
    rotation("neck_4", idleTimes, [[0, 0, 0], [0, 0.03, 0.015], [0, 0, 0], [0, -0.035, -0.012], [0, 0, 0]]),
    rotation("head", idleTimes, [[0, -0.12, 0], [0.02, 0.2, 0], [0, 0.12, 0], [-0.015, -0.2, 0], [0, -0.12, 0]]),
  ]);

  const gaitTimes = [0, 0.2, 0.4, 0.6, 0.8];
  const walk = new THREE.AnimationClip("walk", 0.8, [
    position("body", gaitTimes, [[0, 0.004, 0], [0, 0.018, 0], [0, 0.004, 0], [0, 0.018, 0], [0, 0.004, 0]]),
    rotation("body", gaitTimes, [[0, 0, -0.03], [0, 0, 0], [0, 0, 0.03], [0, 0, 0], [0, 0, -0.03]]),
    rotation("left_leg", gaitTimes, [[0.52, 0, 0], [0, 0, 0], [-0.52, 0, 0], [0, 0, 0], [0.52, 0, 0]]),
    rotation("right_leg", gaitTimes, [[-0.52, 0, 0], [0, 0, 0], [0.52, 0, 0], [0, 0, 0], [-0.52, 0, 0]]),
    rotation("neck_1", gaitTimes, [[-0.025, 0, 0], [0.02, 0, 0], [-0.025, 0, 0], [0.02, 0, 0], [-0.025, 0, 0]]),
    rotation("left_wing", gaitTimes, [[0, 0, 0.03], [0, 0, 0], [0, 0, 0.02], [0, 0, 0], [0, 0, 0.03]]),
    rotation("right_wing", gaitTimes, [[0, 0, -0.03], [0, 0, 0], [0, 0, -0.02], [0, 0, 0], [0, 0, -0.03]]),
  ]);

  const hurryTimes = [0, 0.1375, 0.275, 0.4125, 0.55];
  const hurry = new THREE.AnimationClip("hurry", 0.55, [
    position("body", hurryTimes, [[0, 0.005, 0], [0, 0.03, 0], [0, 0.005, 0], [0, 0.03, 0], [0, 0.005, 0]]),
    rotation("body", hurryTimes, [[-0.03, 0, -0.055], [-0.02, 0, 0], [-0.03, 0, 0.055], [-0.02, 0, 0], [-0.03, 0, -0.055]]),
    rotation("left_leg", hurryTimes, [[0.75, 0, 0], [0, 0, 0], [-0.75, 0, 0], [0, 0, 0], [0.75, 0, 0]]),
    rotation("right_leg", hurryTimes, [[-0.75, 0, 0], [0, 0, 0], [0.75, 0, 0], [0, 0, 0], [-0.75, 0, 0]]),
    rotation("left_wing", hurryTimes, [[-0.08, -0.04, 0.05], [-0.02, 0, 0.02], [-0.08, -0.04, 0.05], [-0.02, 0, 0.02], [-0.08, -0.04, 0.05]]),
    rotation("right_wing", hurryTimes, [[-0.08, 0.04, -0.05], [-0.02, 0, -0.02], [-0.08, 0.04, -0.05], [-0.02, 0, -0.02], [-0.08, 0.04, -0.05]]),
  ]);

  const honkTimes = [0, 0.09, 0.24, 0.45, 0.72];
  const honk = new THREE.AnimationClip("honk", 0.72, [
    rotation("lower_bill", honkTimes, [[0, 0, 0], [0.42, 0, 0], [0.31, 0, 0], [0.4, 0, 0], [0, 0, 0]]),
    rotation("head", honkTimes, [[0, 0, 0], [-0.12, 0, 0], [-0.06, 0, 0], [-0.1, 0, 0], [0, 0, 0]]),
    rotation("neck_5", honkTimes, [[0, 0, 0], [-0.055, 0, 0], [-0.025, 0, 0], [-0.04, 0, 0], [0, 0, 0]]),
  ]);

  const wingTimes = [0, 0.12, 0.52, 0.68, 0.9];
  const wingsSpread = new THREE.AnimationClip("wings_spread", 0.9, [
    rotation("left_wing", wingTimes, [[0, 0, 0], [0.08, 0.12, 0.04], [-0.78, -1.58, -0.18], [-0.58, -1.46, -0.12], [-0.66, -1.5, -0.15]]),
    rotation("right_wing", wingTimes, [[0, 0, 0], [0.08, -0.12, -0.04], [-0.78, 1.58, 0.18], [-0.58, 1.46, 0.12], [-0.66, 1.5, 0.15]]),
    rotation("left_wing_tip", wingTimes, [[0, 0, 0], [0, 0, 0], [-0.24, -0.3, -0.12], [-0.15, -0.2, -0.07], [-0.19, -0.24, -0.09]]),
    rotation("right_wing_tip", wingTimes, [[0, 0, 0], [0, 0, 0], [-0.24, 0.3, 0.12], [-0.15, 0.2, 0.07], [-0.19, 0.24, 0.09]]),
    rotation("body", wingTimes, [[0, 0, 0], [0.035, 0, 0], [-0.04, 0, 0], [-0.015, 0, 0], [-0.025, 0, 0]]),
    rotation("neck_1", wingTimes, [[0, 0, 0], [0.025, 0, 0], [-0.06, 0, 0], [-0.03, 0, 0], [-0.04, 0, 0]]),
  ]);

  const aggressiveTimes = [0, 0.13, 0.48, 0.64, 0.8];
  const aggressive = new THREE.AnimationClip("aggressive", 0.8, [
    position("body", aggressiveTimes, [[0, 0, 0], [0, 0.006, 0], [0, -0.025, -0.01], [0, -0.018, -0.008], [0, -0.022, -0.01]]),
    rotation("neck_1", aggressiveTimes, [[0, 0, 0], [0.08, 0, 0], [-0.88, 0, 0], [-0.75, 0, 0], [-0.8, 0, 0]]),
    rotation("neck_2", aggressiveTimes, [[0, 0, 0], [0.05, 0, 0], [-0.57, 0, 0], [-0.45, 0, 0], [-0.5, 0, 0]]),
    rotation("neck_3", aggressiveTimes, [[0, 0, 0], [0.02, 0, 0], [-0.14, 0, 0], [-0.07, 0, 0], [-0.1, 0, 0]]),
    rotation("neck_4", aggressiveTimes, [[0, 0, 0], [-0.02, 0, 0], [0.63, 0, 0], [0.5, 0, 0], [0.55, 0, 0]]),
    rotation("neck_5", aggressiveTimes, [[0, 0, 0], [-0.04, 0, 0], [0.64, 0, 0], [0.5, 0, 0], [0.55, 0, 0]]),
    rotation("neck_6", aggressiveTimes, [[0, 0, 0], [-0.05, 0, 0], [0.48, 0, 0], [0.35, 0, 0], [0.4, 0, 0]]),
    rotation("head", aggressiveTimes, [[0, 0, 0], [-0.05, 0, 0], [0.43, 0, 0], [0.31, 0, 0], [0.35, 0, 0]]),
    rotation("left_wing", aggressiveTimes, [[0, 0, 0], [0, 0, 0], [-0.08, -0.13, 0.08], [-0.04, -0.09, 0.05], [-0.06, -0.11, 0.06]]),
    rotation("right_wing", aggressiveTimes, [[0, 0, 0], [0, 0, 0], [-0.08, 0.13, -0.08], [-0.04, 0.09, -0.05], [-0.06, 0.11, -0.06]]),
  ]);

  const spookedTimes = [0, 0.1, 0.26, 0.48, 0.72];
  const spooked = new THREE.AnimationClip("spooked", 0.72, [
    position("body", spookedTimes, [[0, 0, 0], [0, 0.045, 0.04], [0, 0.02, 0.09], [0, 0.008, 0.035], [0, 0, 0]]),
    rotation("body", spookedTimes, [[0, 0, 0], [0.22, 0, 0.12], [0.12, 0, -0.1], [0.04, 0, 0.04], [0, 0, 0]]),
    rotation("neck_1", spookedTimes, [[0, 0, 0], [0.34, 0, 0], [0.18, 0, 0], [0.08, 0, 0], [0, 0, 0]]),
    rotation("neck_2", spookedTimes, [[0, 0, 0], [-0.28, 0, 0], [-0.12, 0, 0], [-0.05, 0, 0], [0, 0, 0]]),
    rotation("head", spookedTimes, [[0, 0, 0], [-0.2, 0.22, 0], [-0.08, -0.18, 0], [-0.03, 0.08, 0], [0, 0, 0]]),
    rotation("left_wing", spookedTimes, [[0, 0, 0], [-0.36, -0.58, -0.12], [-0.18, -0.28, -0.06], [-0.06, -0.08, -0.02], [0, 0, 0]]),
    rotation("right_wing", spookedTimes, [[0, 0, 0], [-0.36, 0.58, 0.12], [-0.18, 0.28, 0.06], [-0.06, 0.08, 0.02], [0, 0, 0]]),
  ]);

  return [idle, walk, hurry, honk, wingsSpread, aggressive, spooked];
}
