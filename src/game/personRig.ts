import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type Point = [number, number, number];
export type Weight = (position: THREE.Vector3) => [number, number, number];

/** The head every adult shares, in janitor coordinates: face details are placed on its surface. */
export const HEAD_CENTER: Point = [0, 2.19, -0.035];
export const HEAD_RADII: Point = [0.27, 0.3, 0.248];

/**
 * Shared toolkit for adults on the janitor's 18-bone rig: the café people and the
 * townsfolk are both drawn with it. Geometry is authored at the janitor's size in
 * metres (Y up, facing -Z, feet at Y=0) and scaled by `k`; skin weights are read
 * in janitor coordinates before scaling. Pieces are merged into one skinned mesh
 * per palette slot, named after the slot so the toon loader can recolour them.
 * `detail` below 1 trims facets for crowds.
 */
export function createPersonRig<Slot extends string>(name: string, k: number, detail = 1) {
  const model = new THREE.Group();
  model.name = name;
  const bones: THREE.Bone[] = [];
  const bindPositions = new Map<string, THREE.Vector3>();
  function joint(boneName: string, position: Point, parent?: THREE.Bone): THREE.Bone {
    const bone = new THREE.Bone();
    bone.name = boneName;
    const absolute = new THREE.Vector3(...position).multiplyScalar(k);
    bone.position.copy(absolute);
    if (parent) bone.position.sub(bindPositions.get(parent.name)!);
    (parent ?? model).add(bone);
    bones.push(bone);
    bindPositions.set(boneName, absolute);
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
  const pieces = new Map<Slot, THREE.BufferGeometry[]>();
  const facets = (count: number, minimum: number) => detail === 1 ? count : Math.max(minimum, Math.round(count * detail));

  function add(geometry: THREE.BufferGeometry, slot: Slot, weight: Weight): void {
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
  function oval(slot: Slot, center: Point, radii: Point, weight: Weight, tilt: number | Point = 0): void {
    // Small details need far fewer facets than the head and hips.
    const segments = facets(Math.round(THREE.MathUtils.clamp(10 + Math.max(...radii) * 50, 10, 24)), 8);
    const geometry = new THREE.SphereGeometry(1, segments, Math.max(detail === 1 ? 8 : 6, Math.round(segments * 0.66)));
    const [rx, ry, rz] = typeof tilt === "number" ? [0, 0, tilt] : tilt;
    geometry.scale(...radii).rotateX(rx).rotateY(ry).rotateZ(rz).translate(...center);
    add(geometry, slot, weight);
  }
  function garment(slot: Slot, profile: [number, number][], depth: number, center: Point, weight: Weight, phiStart = 0, phiLength = Math.PI * 2): void {
    const curve = new THREE.SplineCurve(profile.map(([y, radius]) => new THREE.Vector2(radius, y)));
    const geometry = new THREE.LatheGeometry(curve.getPoints(facets(32, 12)), facets(32, 16), phiStart, phiLength);
    geometry.scale(1, 1, depth).translate(...center);
    add(geometry, slot, weight);
  }
  function tube(slot: Slot, from: Point, to: Point, radius: number, weight: Weight): void {
    const start = new THREE.Vector3(...from); const end = new THREE.Vector3(...to);
    const geometry = new THREE.CapsuleGeometry(radius, start.distanceTo(end), facets(8, 4), facets(20, 10));
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), start.clone().sub(end).normalize()));
    geometry.translate(...start.clone().add(end).multiplyScalar(0.5).toArray());
    add(geometry, slot, weight);
  }
  /** A point on the front of the face, `inset` metres in (+) or out (-) from the skin. */
  const onFace = (x: number, y: number, inset = 0): Point => {
    const u = x / HEAD_RADII[0], v = (y - HEAD_CENTER[1]) / HEAD_RADII[1];
    return [x, y, HEAD_CENTER[2] - HEAD_RADII[2] * Math.sqrt(Math.max(0, 1 - u * u - v * v)) + inset];
  };
  /**
   * Hair: a shell hugging the scalp, cut along a hairline that sits high on the
   * forehead and slopes down past the ears to the nape (`front`/`back` are heights
   * above the head's centre).
   */
  function hairShell(slot: Slot, scale: number, front: number, back: number): void {
    const sphere = new THREE.SphereGeometry(1, facets(48, 28), facets(32, 18));
    sphere.scale(HEAD_RADII[0] * scale, HEAD_RADII[1] * scale, HEAD_RADII[2] * scale);
    const position = sphere.getAttribute("position"); const index = sphere.getIndex()!;
    const ry = HEAD_RADII[1] * scale; const rz = HEAD_RADII[2] * scale;
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
    sphere.translate(HEAD_CENTER[0], HEAD_CENTER[1] + 0.012, HEAD_CENTER[2] + 0.006);
    add(sphere, slot, rigid(head));
  }
  /** Merges each slot into one skinned mesh bound to the skeleton. */
  function finish(colors: Readonly<Record<Slot, number>>, hidden: readonly Slot[] = []): void {
    model.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    for (const [slot, geometries] of pieces) {
      const geometry = mergeGeometries(geometries);
      if (!geometry) throw new Error(`Unable to merge ${slot}`);
      const material = new THREE.MeshStandardMaterial({ color: colors[slot], roughness: 1, metalness: 0 });
      material.name = slot;
      const mesh = new THREE.SkinnedMesh(geometry, material);
      mesh.name = slot;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      if (hidden.includes(slot)) mesh.visible = false;
      model.add(mesh);
      mesh.bind(skeleton);
      geometries.forEach((part) => part.dispose());
    }
  }
  /** Bind positions keyed by bone name, which the clip builders need. */
  const bindPose = () => new Map(bones.map((bone) => [bone.name, bone.position.clone()]));
  return { model, bones, root, hips, spine, chest, neck, head, joint, rigid, blendY, torsoWeight, add, oval, garment, tube, onFace, hairShell, finish, bindPose };
}
export type PersonRig<Slot extends string> = ReturnType<typeof createPersonRig<Slot>>;
