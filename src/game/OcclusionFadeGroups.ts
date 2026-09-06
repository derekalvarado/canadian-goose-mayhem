import * as THREE from "three";

/** A visual unit that must fade as one when it obstructs the player camera. */
export interface OcclusionFadeGroup {
  readonly id: string;
  readonly meshes: readonly THREE.Mesh[];
}

/**
 * Authored rendering metadata for foreground occlusion. Gameplay collision and
 * visibility do not consult this registry.
 */
export class OcclusionFadeGroupRegistry {
  private readonly groupsById = new Map<string, OcclusionFadeGroup>();
  private readonly groupsByMesh = new Map<THREE.Mesh, OcclusionFadeGroup>();

  register(id: string, root: THREE.Object3D): OcclusionFadeGroup {
    if (this.groupsById.has(id)) throw new Error(`Duplicate occlusion fade group: ${id}`);

    const meshes: THREE.Mesh[] = [];
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    if (meshes.length === 0) throw new Error(`Occlusion fade group has no meshes: ${id}`);
    for (const mesh of meshes) {
      const existing = this.groupsByMesh.get(mesh);
      if (existing) throw new Error(`Mesh is already in occlusion fade group: ${existing.id}`);
    }

    const group: OcclusionFadeGroup = { id, meshes };
    this.groupsById.set(id, group);
    for (const mesh of meshes) this.groupsByMesh.set(mesh, group);
    return group;
  }

  groupForMesh(mesh: THREE.Mesh): OcclusionFadeGroup | undefined {
    return this.groupsByMesh.get(mesh);
  }

  groupById(id: string): OcclusionFadeGroup | undefined {
    return this.groupsById.get(id);
  }

  clear(): void {
    this.groupsById.clear();
    this.groupsByMesh.clear();
  }
}
