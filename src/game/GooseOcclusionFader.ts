import * as THREE from "three";
import { type OcclusionFadeGroup, OcclusionFadeGroupRegistry } from "./OcclusionFadeGroups.ts";

const FADED_OPACITY = 0.34;
const FADE_SPEED = 16;
const RESTORE_EPSILON = 0.005;

interface FadedMesh {
  readonly originalMaterial: THREE.Material | THREE.Material[];
  readonly fadedMaterial: THREE.Material | THREE.Material[];
  opacity: number;
}

function cloneTransparent(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  const clone = (source: THREE.Material): THREE.Material => {
    const faded = source.clone();
    faded.transparent = true;
    faded.depthWrite = false;
    return faded;
  };
  return Array.isArray(material) ? material.map(clone) : clone(material);
}

function setOpacity(material: THREE.Material | THREE.Material[], opacity: number): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const entry of materials) {
    entry.opacity = opacity;
    entry.needsUpdate = true;
  }
}

function disposeMaterials(material: THREE.Material | THREE.Material[]): void {
  for (const entry of Array.isArray(material) ? material : [material]) entry.dispose();
}

/**
 * Keeps the player readable when foreground scenery lies between the follow
 * camera and the goose. This is deliberately view-only: world collision and
 * gameplay visibility remain authored in the simulation.
 */
export class GooseOcclusionFader {
  private readonly groups: OcclusionFadeGroupRegistry;
  private readonly raycaster = new THREE.Raycaster();
  private readonly sample = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly blockedGroups = new Set<OcclusionFadeGroup>();
  private readonly fadedGroups = new Map<OcclusionFadeGroup, Map<THREE.Mesh, FadedMesh>>();

  constructor(groups: OcclusionFadeGroupRegistry) {
    this.groups = groups;
  }

  update(world: THREE.Object3D, camera: THREE.Camera, goose: THREE.Object3D, delta: number): void {
    this.blockedGroups.clear();
    world.updateWorldMatrix(true, true);
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(this.raycaster.ray.origin);

    // A small set of body/head samples avoids revealing scenery when only an
    // empty point beside the goose is visible.
    for (const [x, y, z] of [[0, 0.6, 0], [-0.3, 0.55, 0], [0.3, 0.55, 0], [0, 1.25, -0.15]] as const) {
      this.sample.set(x, y, z);
      goose.localToWorld(this.sample);
      this.direction.subVectors(this.sample, this.raycaster.ray.origin);
      const distance = this.direction.length();
      if (distance === 0) continue;

      this.raycaster.set(this.raycaster.ray.origin, this.direction.multiplyScalar(1 / distance));
      for (const hit of this.raycaster.intersectObjects(this.groups.meshesForRaycast(), false)) {
        if (hit.distance >= distance - 0.04 || !(hit.object instanceof THREE.Mesh)) continue;
        const group = this.groups.groupForMesh(hit.object);
        if (group) this.blockedGroups.add(group);
      }
    }

    const fadeStep = 1 - Math.exp(-FADE_SPEED * Math.max(0, delta));
    for (const group of this.blockedGroups) this.fade(group, fadeStep);
    for (const [group, meshes] of this.fadedGroups) {
      if (this.blockedGroups.has(group)) continue;
      let restored = true;
      for (const state of meshes.values()) {
        state.opacity += (1 - state.opacity) * fadeStep;
        setOpacity(state.fadedMaterial, state.opacity);
        restored &&= state.opacity >= 1 - RESTORE_EPSILON;
      }
      if (restored) this.restore(group, meshes);
    }
  }

  private fade(group: OcclusionFadeGroup, fadeStep: number): void {
    let meshes = this.fadedGroups.get(group);
    if (!meshes) {
      meshes = new Map();
      for (const mesh of group.meshes) {
        const originalMaterial = mesh.material;
        const state: FadedMesh = {
          originalMaterial,
          fadedMaterial: cloneTransparent(originalMaterial),
          opacity: 1,
        };
        mesh.material = state.fadedMaterial;
        meshes.set(mesh, state);
      }
      this.fadedGroups.set(group, meshes);
    }
    for (const state of meshes.values()) {
      state.opacity += (FADED_OPACITY - state.opacity) * fadeStep;
      setOpacity(state.fadedMaterial, state.opacity);
    }
  }

  private restore(group: OcclusionFadeGroup, meshes: Map<THREE.Mesh, FadedMesh>): void {
    for (const [mesh, state] of meshes) {
      mesh.material = state.originalMaterial;
      disposeMaterials(state.fadedMaterial);
    }
    this.fadedGroups.delete(group);
  }
}
