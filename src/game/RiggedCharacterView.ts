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

/** Shared presentation shell for independently cloned, toon-shaded humanoid rigs. */
export class RiggedCharacterView extends THREE.Group {
  readonly ready: Promise<void>;
  private mixer?: THREE.AnimationMixer;
  private currentAction?: THREE.AnimationAction;
  private readonly actions = new Map<string, THREE.AnimationAction>();

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
            material = toonMaterial(color, { transparent: preview, opacity: preview ? 0.45 : 1 });
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

  getHandSocket(side: "left" | "right"): THREE.Object3D | undefined {
    return this.getObjectByName(`${side}_hand_socket`);
  }

  update(delta: number): void { this.mixer?.update(delta); }
}
