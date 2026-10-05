import * as THREE from "three";
import type { OcclusionFadeGroupRegistry } from "./OcclusionFadeGroups.ts";

/**
 * Pieces whose bounding radius is under this many meters cast no shadow. Under the
 * faint storybook sun their shadows are barely visible, but each one is a draw call.
 */
const SMALL_SHADOW_RADIUS = 0.35;

const DEFAULT_ON_BEFORE_COMPILE = THREE.Material.prototype.onBeforeCompile;
const TO_ROOT = new THREE.Matrix4();
const PIECE_MATRIX = new THREE.Matrix4();
const NORMAL_MATRIX = new THREE.Matrix3();
const POINT = new THREE.Vector3();
const SCALE = new THREE.Vector3();

interface Piece {
  readonly mesh: THREE.Mesh;
  readonly matrix: THREE.Matrix4;
}

/** Stops tiny pieces casting shadows. Skinned characters keep theirs. */
export function dropSmallShadows(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.castShadow || (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    mesh.matrixWorld.decompose(POINT, new THREE.Quaternion(), SCALE);
    const scale = Math.max(Math.abs(SCALE.x), Math.abs(SCALE.y), Math.abs(SCALE.z));
    if (mesh.geometry.boundingSphere!.radius * scale < SMALL_SHADOW_RADIUS) mesh.castShadow = false;
  });
}

/** Whether a mesh is plain colored geometry that can be drawn as part of a combined mesh. */
function bakeable(mesh: THREE.Mesh): mesh is THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial> {
  if (mesh.constructor !== THREE.Mesh || Array.isArray(mesh.material)) return false;
  const material = mesh.material as THREE.Material;
  if (!(material instanceof THREE.MeshToonMaterial) || !material.visible || material.vertexColors) return false;
  if (material.map || material.alphaMap || material.emissiveMap || material.onBeforeCompile !== DEFAULT_ON_BEFORE_COMPILE) return false;
  const geometry = mesh.geometry;
  return Boolean(geometry.attributes.position && geometry.attributes.normal)
    && Object.keys(geometry.morphAttributes).length === 0
    && geometry.drawRange.start === 0 && geometry.drawRange.count === Infinity;
}

/** Everything about a toon material except its color, which moves into the vertices. */
function materialKey(m: THREE.MeshToonMaterial): string {
  return [m.side, m.transparent, m.opacity, m.alphaTest, m.depthWrite, m.depthTest, m.blending, m.colorWrite,
    m.emissive.getHex(), m.emissiveIntensity, m.gradientMap?.uuid, m.wireframe, m.fog, m.toneMapped,
    m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits].join(",");
}

function mergePieces(pieces: readonly Piece[]): THREE.BufferGeometry {
  let vertexCount = 0; let indexCount = 0;
  for (const { mesh } of pieces) {
    vertexCount += mesh.geometry.attributes.position.count;
    indexCount += mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let base = 0; let cursor = 0;
  for (const { mesh, matrix } of pieces) {
    const geometry = mesh.geometry; const position = geometry.attributes.position; const normal = geometry.attributes.normal;
    const color = mesh.material as THREE.MeshToonMaterial;
    NORMAL_MATRIX.getNormalMatrix(matrix);
    for (let i = 0; i < position.count; i += 1) {
      POINT.fromBufferAttribute(position, i).applyMatrix4(matrix).toArray(positions, (base + i) * 3);
      POINT.fromBufferAttribute(normal, i).applyMatrix3(NORMAL_MATRIX).normalize().toArray(normals, (base + i) * 3);
      color.color.toArray(colors, (base + i) * 3);
    }
    // A mirrored piece turns its triangles inside out unless their winding flips too.
    const mirrored = matrix.determinant() < 0;
    const count = geometry.index?.count ?? position.count;
    for (let i = 0; i < count; i += 3) {
      const a = geometry.index ? geometry.index.getX(i) : i;
      const b = geometry.index ? geometry.index.getX(i + 1) : i + 1;
      const c = geometry.index ? geometry.index.getX(i + 2) : i + 2;
      indices[cursor++] = base + a;
      indices[cursor++] = base + (mirrored ? c : b);
      indices[cursor++] = base + (mirrored ? b : c);
    }
    base += position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Combines the plain colored pieces of an object that never moves into a few
 * meshes, one per kind of surface, with each piece's color kept in its vertices.
 * Pieces in different camera-fade groups stay apart so they still fade separately.
 * Only call this for views whose parts are never moved, hidden, or recolored.
 */
export function bakeStaticMeshes(root: THREE.Object3D, fadeGroups?: OcclusionFadeGroupRegistry): void {
  root.updateMatrixWorld(true);
  TO_ROOT.copy(root.matrixWorld).invert();
  const buckets = new Map<string, Piece[]>();
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !bakeable(mesh)) return;
    const key = [materialKey(mesh.material), mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, mesh.frustumCulled,
      fadeGroups?.groupForMesh(mesh)?.id ?? ""].join("|");
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, bucket = []);
    bucket.push({ mesh, matrix: PIECE_MATRIX.multiplyMatrices(TO_ROOT, mesh.matrixWorld).clone() });
  });
  for (const pieces of buckets.values()) {
    if (pieces.length < 2) continue;
    const first = pieces[0].mesh;
    const material = (first.material as THREE.MeshToonMaterial).clone();
    material.color.set(0xffffff);
    material.vertexColors = true;
    const merged = new THREE.Mesh(mergePieces(pieces), material);
    merged.name = "baked-static";
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    merged.renderOrder = first.renderOrder;
    merged.frustumCulled = first.frustumCulled;
    root.add(merged);
    fadeGroups?.replaceMeshes(pieces.map((piece) => piece.mesh), merged);
    for (const { mesh } of pieces) mesh.removeFromParent();
  }
}
