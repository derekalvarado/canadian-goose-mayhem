import * as THREE from "three";
import { createWorldAssetView } from "./PlazaWorld.ts";
import { OcclusionFadeGroupRegistry } from "./OcclusionFadeGroups.ts";
import { isWorldChunkPlayable, WORLD_CHUNK_SIZE, type WorldArea, type WorldInstance } from "./worldLayout.ts";
import { getWorldAsset } from "./worldAssets.ts";

export class WorldView extends THREE.Group {
  readonly instances = new Map<string, THREE.Group>();
  readonly occlusionFadeGroups = new OcclusionFadeGroupRegistry();
  private activeArea?: WorldArea;
  private editorFocus?: Readonly<{ x: number; z: number }>;
  private readonly playableOnly: boolean;

  constructor(area: WorldArea, playableOnly = false) {
    super();
    this.playableOnly = playableOnly;
    this.applyArea(area);
  }

  applyArea(area: WorldArea): void {
    this.activeArea = area;
    this.occlusionFadeGroups.clear();
    this.clear();
    this.instances.clear();
    for (const instance of area.instances) {
      if (!this.playableOnly || isWorldChunkPlayable(area, instance.transform.x, instance.transform.z)) this.addInstance(instance);
    }
    this.updateEditorChunkVisibility();
  }

  addInstance(instance: WorldInstance, registerOcclusion = true): THREE.Group {
    const wrapper = new THREE.Group();
    wrapper.name = instance.label;
    wrapper.userData.worldInstanceId = instance.id;
    const pivotOffset = getWorldAsset(instance.assetId)?.pivotOffset ?? { x: 0, z: 0 };
    wrapper.userData.worldPivotOffset = pivotOffset;
    wrapper.position.set(instance.transform.x + pivotOffset.x, instance.transform.y, instance.transform.z + pivotOffset.z);
    wrapper.rotation.y = instance.transform.rotationY;
    wrapper.add(createWorldAssetView(
      instance.assetId,
      registerOcclusion ? this.occlusionFadeGroups : new OcclusionFadeGroupRegistry(),
      instance.id,
    ));
    this.instances.set(instance.id, wrapper);
    this.add(wrapper);
    return wrapper;
  }

  /** Keeps large authoring worlds responsive while leaving a local chunk halo visible. */
  setEditorChunkFocus(x: number, z: number): void {
    this.editorFocus = { x, z };
    this.updateEditorChunkVisibility();
  }

  private updateEditorChunkVisibility(): void {
    if (this.playableOnly || !this.activeArea || !this.editorFocus) return;
    const focus = this.editorFocus;
    const focusChunkX = Math.floor(focus.x / WORLD_CHUNK_SIZE); const focusChunkZ = Math.floor(focus.z / WORLD_CHUNK_SIZE);
    for (const instance of this.activeArea.instances) {
      const group = this.instances.get(instance.id); if (!group) continue;
      const chunkX = Math.floor(instance.transform.x / WORLD_CHUNK_SIZE); const chunkZ = Math.floor(instance.transform.z / WORLD_CHUNK_SIZE);
      group.visible = Math.abs(chunkX - focusChunkX) <= 2 && Math.abs(chunkZ - focusChunkZ) <= 2;
    }
  }
}
