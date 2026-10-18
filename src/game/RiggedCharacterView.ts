import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { toonMaterial } from "./toonMaterial.ts";

export type CharacterLoader = () => Promise<Pick<GLTF, "scene" | "animations">>;

interface RiggedCharacterOptions {
  readonly name: string;
  readonly errorLabel: string;
  readonly palette: Readonly<Record<string, number>>;
  readonly loader?: CharacterLoader;
  readonly initialClip?: string;
}

/**
 * Turning is presentation only: gameplay may snap a heading in one tick, and the
 * body swings round to it over a moment, head first, so nobody spins on the spot.
 */
export const CHARACTER_TURNING = {
  /** Seconds for the body to cover most of a turn. */
  bodySeconds: 0.14,
  /** How far the head, neck and chest each lead the body into a turn, as fractions of the turn still to go. */
  headLead: 0.35, neckLead: 0.15, chestLead: 0.08,
  /** The face gets at most this far (radians) ahead of the body. */
  maxLead: 0.9,
} as const;
const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const LEAD_AXIS = new THREE.Vector3(0, 1, 0);
const LEAD_TURN = new THREE.Quaternion();

/** Shared presentation shell for independently cloned, toon-shaded humanoid rigs. */
export class RiggedCharacterView extends THREE.Group {
  readonly ready: Promise<void>;
  private mixer?: THREE.AnimationMixer;
  private currentAction?: THREE.AnimationAction;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  /** World facing the body has actually turned to; undefined until the first update. */
  private facing?: number;
  private readonly leadBones: { bone: THREE.Object3D; share: number; applied: number }[] = [];

  constructor(options: RiggedCharacterOptions) {
    super();
    this.name = options.name;
    this.userData = { assetRole: "rigged-character", visualDetailTier: 3, gameplayState: "none" };
    if (!options.loader) {
      this.ready = Promise.resolve();
      return;
    }
    this.ready = options.loader().then((gltf) => {
      // Object3D.clone alone would share bones between placed characters.
      const model = clone(gltf.scene);
      const preview = this.userData.editorIgnore === true;
      const materials = new Map<string, THREE.MeshToonMaterial>();
      model.traverse((object) => {
        if (preview) object.userData.editorIgnore = true;
        if (!(object instanceof THREE.Mesh)) return;
        const convert = (source: THREE.Material) => {
          let material = materials.get(source.name);
          if (!material) {
            const color = options.palette[source.name];
            if (color === undefined) throw new Error(`Unknown ${options.errorLabel} material: ${source.name}`);
            // A painted slot keeps its picture, which already holds its colours.
            const map = (source as THREE.MeshStandardMaterial).map ?? null;
            material = toonMaterial(map ? 0xffffff : color, { map, transparent: preview, opacity: preview ? 0.45 : 1 });
            material.name = source.name;
            materials.set(source.name, material);
          }
          return material;
        };
        object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
        object.castShadow = !preview;
        object.receiveShadow = false;
        if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false;
      });
      this.add(model);
      for (const [name, share] of [["head", CHARACTER_TURNING.headLead], ["neck", CHARACTER_TURNING.neckLead], ["chest", CHARACTER_TURNING.chestLead]] as const) {
        const bone = model.getObjectByName(name);
        if (bone instanceof THREE.Bone) this.leadBones.push({ bone, share, applied: 0 });
      }
      this.mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
      this.playAnimation(options.initialClip ?? "idle", 0);
    });
    void this.ready.catch((error: unknown) => console.error(`Unable to load ${options.errorLabel}`, error));
  }

  /** Clips are in-place; authoritative movement always comes from simulation state. */
  playAnimation(name: string, fadeSeconds = 0.2): void {
    const next = this.actions.get(name);
    if (!next || next === this.currentAction) return;
    const previous = this.currentAction;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (previous) {
      if (fadeSeconds > 0) { previous.fadeOut(fadeSeconds); next.fadeIn(fadeSeconds); }
      else previous.stop();
    }
    this.currentAction = next;
  }

  get activeClip(): string | undefined { return this.currentAction?.getClip().name; }

  getHandSocket(side: "left" | "right"): THREE.Object3D | undefined {
    return this.getObjectByName(`${side}_hand_socket`);
  }

  /** The heading gameplay gave this character (its placement's turn). */
  private get targetHeading(): number { return this.parent?.rotation.y ?? 0; }

  update(delta: number): void {
    const target = this.targetHeading;
    this.facing ??= target;
    if (delta > 0) this.facing += wrapAngle(target - this.facing) * (1 - Math.exp(-delta / CHARACTER_TURNING.bodySeconds));
    this.facing = wrapAngle(this.facing);
    this.rotation.y = wrapAngle(this.facing - target);
    // Clips that leave a bone alone would otherwise keep last frame's lead, so take it off first.
    for (const lead of this.leadBones) {
      if (lead.applied !== 0) lead.bone.quaternion.multiply(LEAD_TURN.setFromAxisAngle(LEAD_AXIS, -lead.applied));
      lead.applied = 0;
    }
    this.mixer?.update(delta);
    const { headLead, neckLead, chestLead, maxLead } = CHARACTER_TURNING;
    const most = maxLead / (headLead + neckLead + chestLead);
    const ahead = THREE.MathUtils.clamp(wrapAngle(target - this.facing), -most, most);
    for (const lead of this.leadBones) {
      lead.applied = ahead * lead.share;
      lead.bone.quaternion.multiply(LEAD_TURN.setFromAxisAngle(LEAD_AXIS, lead.applied));
    }
  }

  /** World facing of the body as drawn, which trails gameplay's heading through a turn. */
  get drawnHeading(): number { return this.targetHeading + this.rotation.y; }
}
