import * as THREE from "three";
import { createWorldAssetView, SplashPadView } from "./PlazaWorld.ts";
import { JanitorView } from "./JanitorView.ts";
import { SplashKidView } from "./SplashKidView.ts";
import { CafePersonView } from "./CafePersonView.ts";
import { DogView, TownspersonView } from "./TownsfolkView.ts";
import { RiggedCharacterView } from "./RiggedCharacterView.ts";
import type { SyncState, UpdatePresentation } from "./CafePropsView.ts";
import { OcclusionFadeGroupRegistry } from "./OcclusionFadeGroups.ts";
import { isWorldChunkPlayable, WORLD_CHUNK_SIZE, type WorldArea, type WorldInstance } from "./worldLayout.ts";
import { getWorldAsset } from "./worldAssets.ts";
import type { WorldSnapshot } from "./simulation/Simulation.ts";

const LITTER_PICKER_ASSET_ID = "prop.litter-picker";
const LITTER_PICKER_GROUND_ROTATION_X = Math.PI / 2;

/**
 * Where each prop hangs from the goose's beak: its origin relative to the bill tip
 * (goose frame: +x right, +y up, +z back toward the body) and any turn. Most props
 * are gripped by their top edge; the picker is held by the middle like a dog's bone.
 */
const BEAK_GRIPS: Readonly<Record<string, Readonly<{ offset: THREE.Vector3Tuple; rotation?: THREE.Vector3Tuple }>>> = {
  [LITTER_PICKER_ASSET_ID]: { offset: [0.8, 0, 0], rotation: [0, 0, Math.PI / 2] },
  "prop.beer-can": { offset: [0, -0.12, 0] },
  "prop.trash-bag": { offset: [0, -0.57, 0.02] },
  "litter.chip-bag": { offset: [0, 0, -0.03], rotation: [Math.PI / 2, 0, 0] },
  "litter.crumpled-paper": { offset: [0, -0.08, -0.02] },
  "litter.food-tray": { offset: [0, -0.06, -0.12] },
  "coffee.tip-jar": { offset: [0, -0.23, 0.01] },
  "coffee.croissant": { offset: [0, -0.045, -0.02] },
  "coffee.counter-croissant": { offset: [0, -0.045, -0.02] },
  "coffee.mug": { offset: [0, -0.1, 0.01] },
  "coffee.order-cup": { offset: [0, -0.17, 0.01] },
};
/** How people hold things: the prop sits `inward` of the palm (toward their middle) and `below` it. */
const HAND_GRIPS: Readonly<Record<string, Readonly<{ inward: number; below: number }>>> = {
  "coffee.mug": { inward: 0.075, below: 0.06 },
  "coffee.order-cup": { inward: 0.06, below: 0.09 },
  "coffee.tip-jar": { inward: 0.09, below: 0.12 },
};
const DEFAULT_HAND_GRIP = { inward: 0.05, below: 0.05 };
const HAND_POINT = new THREE.Vector3();
const HAND_RIGHT = new THREE.Vector3();
const DEFAULT_BEAK_GRIP: Readonly<{ offset: THREE.Vector3Tuple; rotation?: THREE.Vector3Tuple }> = { offset: [0, -0.08, 0] };

type GameplayView = SplashPadView | JanitorView | SplashKidView | CafePersonView | TownspersonView | DogView;

export class WorldView extends THREE.Group {
  readonly instances = new Map<string, THREE.Group>();
  readonly occlusionFadeGroups = new OcclusionFadeGroupRegistry();
  private activeArea?: WorldArea;
  private editorFocus?: Readonly<{ x: number; z: number }>;
  private readonly playableOnly: boolean;
  private presentationViews: GameplayView[] = [];
  private presentationUpdates: UpdatePresentation[] = [];
  private readonly handHeld: { wrapper: THREE.Group; socket: THREE.Object3D; personId: string; assetId?: string; sipping: boolean }[] = [];
  private readonly gameplayViews = new Map<string, GameplayView>();

  constructor(area: WorldArea, playableOnly = false) {
    super();
    this.playableOnly = playableOnly;
    this.applyArea(area);
  }

  applyArea(area: WorldArea): void {
    this.activeArea = area;
    this.occlusionFadeGroups.clear();
    for (const wrapper of this.instances.values()) {
      if (wrapper.parent && wrapper.parent !== this) wrapper.parent.remove(wrapper);
    }
    this.clear();
    this.instances.clear();
    this.presentationViews = [];
    this.presentationUpdates = [];
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
    wrapper.rotation.set(
      instance.assetId === LITTER_PICKER_ASSET_ID ? LITTER_PICKER_GROUND_ROTATION_X : 0,
      instance.transform.rotationY,
      0,
    );
    const view = createWorldAssetView(
      instance.assetId,
      registerOcclusion ? this.occlusionFadeGroups : new OcclusionFadeGroupRegistry(),
      instance.id,
    );
    wrapper.add(view);
    if (view instanceof SplashPadView || view instanceof JanitorView || view instanceof SplashKidView || view instanceof CafePersonView
      || view instanceof TownspersonView || view instanceof DogView) {
      this.presentationViews.push(view);
      this.gameplayViews.set(instance.id, view);
    }
    if (typeof view.userData.update === "function") this.presentationUpdates.push(view.userData.update as UpdatePresentation);
    this.instances.set(instance.id, wrapper);
    this.add(wrapper);
    return wrapper;
  }

  updatePresentation(delta: number): void {
    for (const view of this.presentationViews) view.update(delta);
    for (const update of this.presentationUpdates) update(delta);
    this.placeHandHeldItems();
  }

  /**
   * People hold cups upright by the handle (or around the middle), off to the
   * side of the palm rather than through it. While sipping, the drink tips
   * toward the mouth as the hand rises.
   */
  private placeHandHeldItems(): void {
    if (this.handHeld.length > 0) this.updateMatrixWorld(true);
    for (const held of this.handHeld) {
      const person = this.instances.get(held.personId); if (!person) continue;
      const socket = held.socket.getWorldPosition(HAND_POINT);
      this.worldToLocal(socket);
      const heading = person.rotation.y;
      const right = HAND_RIGHT.set(Math.cos(heading), 0, -Math.sin(heading));
      const grip = HAND_GRIPS[held.assetId ?? ""] ?? DEFAULT_HAND_GRIP;
      // How far the hand has come up from the table toward the face.
      const raised = held.sipping ? THREE.MathUtils.clamp((socket.y - person.position.y - 1.25) / 0.45, 0, 1) : 0;
      held.wrapper.position.copy(socket).addScaledVector(right, -grip.inward);
      // Lifted to the lips, the cup rides a little higher in the hand so the rim meets the mouth.
      held.wrapper.position.y -= grip.below * (1 - raised * 0.9);
      held.wrapper.rotation.set(raised * 1.05, heading, 0, "YXZ");
    }
  }

  syncGameplay(snapshot: WorldSnapshot, gooseMouthSocket?: THREE.Object3D): void {
    this.handHeld.length = 0;
    const janitor = snapshot.janitor;
    const janitorView = janitor ? this.gameplayViews.get(janitor.id) : undefined;
    // A person sipping lifts the drink from their table into their hand, for looks only.
    const sipping = new Map<string, string>();
    const cafePeople = snapshot.cafePeople ?? [];
    for (const person of cafePeople) {
      if (person.activity !== "sipping" || !person.tableSurfaceId) continue;
      const drink = snapshot.entities.filter((entity) => entity.tags?.includes("drink") && !entity.holderId && entity.restingOn === person.tableSurfaceId
        && entity.condition === "full")
        .sort((a, b) => Math.hypot(a.position.x - person.position.x, a.position.z - person.position.z)
          - Math.hypot(b.position.x - person.position.x, b.position.z - person.position.z))[0];
      if (drink) sipping.set(drink.id, person.id);
    }
    const present = new Set(snapshot.entities.map((entity) => entity.id));
    for (const instance of this.activeArea?.instances ?? []) {
      // An authored carryable the simulation no longer has here was carried to another area.
      if (!present.has(instance.id) && getWorldAsset(instance.assetId)?.carryable) {
        const wrapper = this.instances.get(instance.id); if (wrapper) wrapper.visible = false;
      }
    }
    for (const entity of snapshot.entities) {
      let wrapper = this.instances.get(entity.id);
      const assetId = this.activeArea?.instances.find((instance) => instance.id === entity.id)?.assetId ?? entity.assetId;
      if (!wrapper && assetId && getWorldAsset(assetId)) {
        // Items that arrived from another area have no authored instance here.
        wrapper = this.addInstance({ id: entity.id, assetId, label: entity.label,
          transform: { x: entity.position.x, y: entity.position.y, z: entity.position.z, rotationY: entity.heading } }, false);
      }
      if (!wrapper) continue;
      wrapper.visible = entity.containedBy === undefined;
      const sync = wrapper.children[0]?.userData.syncState;
      if (typeof sync === "function") (sync as SyncState)(entity);
      const socket = entity.holderId === janitor?.id && janitorView instanceof JanitorView
        ? janitorView.getHandSocket("right") : undefined;
      const personId = entity.holderId && entity.holderId !== "goose" && entity.holderId !== janitor?.id ? entity.holderId : sipping.get(entity.id);
      const personView = personId ? this.gameplayViews.get(personId) : undefined;
      const personSocket = personView instanceof RiggedCharacterView ? personView.getHandSocket("right") : undefined;
      if (socket && (assetId === "prop.trash-bag" || assetId === "prop.litter-picker")) {
        if (wrapper.parent !== socket) socket.add(wrapper);
        wrapper.position.set(0, assetId === "prop.litter-picker" ? -1.48 : -0.58, 0);
        wrapper.rotation.set(0, 0, 0);
      } else if (personSocket && personId) {
        // Placed each frame after the person's pose updates; see `placeHandHeldItems`.
        if (wrapper.parent !== this) this.add(wrapper);
        this.handHeld.push({ wrapper, socket: personSocket, personId, assetId, sipping: sipping.has(entity.id) });
      } else if (entity.holderId === "goose" && gooseMouthSocket) {
        if (wrapper.parent !== gooseMouthSocket) gooseMouthSocket.add(wrapper);
        const grip = (assetId ? BEAK_GRIPS[assetId] : undefined) ?? DEFAULT_BEAK_GRIP;
        wrapper.position.set(...grip.offset);
        wrapper.rotation.set(...(grip.rotation ?? [0, 0, 0]));
      } else {
        if (wrapper.parent !== this) this.add(wrapper);
        wrapper.position.set(entity.position.x, entity.position.y, entity.position.z);
        wrapper.rotation.set(
          assetId === LITTER_PICKER_ASSET_ID ? LITTER_PICKER_GROUND_ROTATION_X : 0,
          entity.heading,
          0,
        );
      }
      const view = this.gameplayViews.get(entity.id);
      if (view instanceof SplashPadView && entity.active !== undefined) view.setActive(entity.active);
    }
    if (janitor) {
      const wrapper = this.instances.get(janitor.id); const view = this.gameplayViews.get(janitor.id);
      if (wrapper) { wrapper.position.set(janitor.position.x, janitor.position.y, janitor.position.z); wrapper.rotation.y = janitor.heading; }
      if (view instanceof JanitorView) view.setActivity(janitor.activity, janitor.stolenToolId !== undefined);
    }
    for (const child of snapshot.splashKids) {
      const wrapper = this.instances.get(child.id); const view = this.gameplayViews.get(child.id);
      if (wrapper) { wrapper.position.set(child.position.x, child.position.y, child.position.z); wrapper.rotation.y = child.heading; }
      if (view instanceof SplashKidView) view.setState(child);
    }
    for (const person of cafePeople) {
      const wrapper = this.instances.get(person.id); const view = this.gameplayViews.get(person.id);
      if (wrapper) { wrapper.position.set(person.position.x, person.position.y, person.position.z); wrapper.rotation.y = person.heading; }
      if (view instanceof CafePersonView) view.setState(person);
      else if (view instanceof TownspersonView) view.setPatronState(person);
    }
    for (const person of snapshot.townsfolk ?? []) {
      const wrapper = this.instances.get(person.id); const view = this.gameplayViews.get(person.id);
      if (wrapper) { wrapper.position.set(person.position.x, person.position.y, person.position.z); wrapper.rotation.y = person.heading; }
      if (view instanceof TownspersonView) view.setState(person);
    }
    for (const dog of snapshot.dogs ?? []) {
      const wrapper = this.instances.get(dog.id); const view = this.gameplayViews.get(dog.id);
      if (wrapper) { wrapper.position.set(dog.position.x, dog.position.y, dog.position.z); wrapper.rotation.y = dog.heading; }
      if (view instanceof DogView) view.setState(dog);
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
