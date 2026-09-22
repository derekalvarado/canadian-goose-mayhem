import * as THREE from "three";
import { createWorldAssetView, SplashPadView } from "./PlazaWorld.ts";
import { JanitorView } from "./JanitorView.ts";
import { SplashKidView } from "./SplashKidView.ts";
import { OcclusionFadeGroupRegistry } from "./OcclusionFadeGroups.ts";
import { isWorldChunkPlayable, WORLD_CHUNK_SIZE, type WorldArea, type WorldInstance } from "./worldLayout.ts";
import { getWorldAsset } from "./worldAssets.ts";
import type { WorldSnapshot } from "./simulation/Simulation.ts";

export class WorldView extends THREE.Group {
  readonly instances = new Map<string, THREE.Group>();
  readonly occlusionFadeGroups = new OcclusionFadeGroupRegistry();
  private activeArea?: WorldArea;
  private editorFocus?: Readonly<{ x: number; z: number }>;
  private readonly playableOnly: boolean;
  private presentationViews: (SplashPadView | JanitorView | SplashKidView)[] = [];
  private readonly gameplayViews = new Map<string, SplashPadView | JanitorView | SplashKidView>();

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
    this.presentationViews = [];
    this.gameplayViews.clear();
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
    const view = createWorldAssetView(
      instance.assetId,
      registerOcclusion ? this.occlusionFadeGroups : new OcclusionFadeGroupRegistry(),
      instance.id,
    );
    wrapper.add(view);
    if (view instanceof SplashPadView || view instanceof JanitorView || view instanceof SplashKidView) {
      this.presentationViews.push(view);
      this.gameplayViews.set(instance.id, view);
    }
    this.instances.set(instance.id, wrapper);
    this.add(wrapper);
    return wrapper;
  }

  updatePresentation(delta: number): void {
    for (const view of this.presentationViews) view.update(delta);
  }

  syncGameplay(snapshot: WorldSnapshot): void {
    const janitor = snapshot.janitor;
    const janitorView = janitor ? this.gameplayViews.get(janitor.id) : undefined;
    for (const entity of snapshot.entities) {
      const wrapper = this.instances.get(entity.id); if (!wrapper) continue;
      wrapper.visible = entity.containedBy === undefined;
      const assetId = this.activeArea?.instances.find((instance) => instance.id === entity.id)?.assetId;
      const socket = entity.holderId === janitor?.id && janitorView instanceof JanitorView
        ? janitorView.getHandSocket("right") : undefined;
      if (socket && (assetId === "prop.trash-bag" || assetId === "prop.litter-picker")) {
        if (wrapper.parent !== socket) socket.add(wrapper);
        wrapper.position.set(0, assetId === "prop.litter-picker" ? -1.48 : -0.58, 0);
        wrapper.rotation.set(0, 0, 0);
      } else {
        if (wrapper.parent !== this) this.add(wrapper);
        wrapper.position.set(entity.position.x, entity.position.y, entity.position.z);
        wrapper.rotation.set(0, entity.heading, 0);
      }
      const view = this.gameplayViews.get(entity.id);
      if (view instanceof SplashPadView && entity.active !== undefined) view.setActive(entity.active);
    }
    if (janitor) {
      const wrapper = this.instances.get(janitor.id); const view = this.gameplayViews.get(janitor.id);
      if (wrapper) { wrapper.position.set(janitor.position.x, janitor.position.y, janitor.position.z); wrapper.rotation.y = janitor.heading; }
      if (view instanceof JanitorView) view.setActivity(janitor.activity);
    }
    for (const child of snapshot.splashKids) {
      const wrapper = this.instances.get(child.id); const view = this.gameplayViews.get(child.id);
      if (wrapper) { wrapper.position.set(child.position.x, child.position.y, child.position.z); wrapper.rotation.y = child.heading; }
      if (view instanceof SplashKidView) view.setState(child);
    }
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
