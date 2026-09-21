import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { GOOSE_COLORS } from "./GooseModel.ts";
import { toonMaterial } from "./toonMaterial.ts";

const MODEL_URL = new URL("../../assets/characters/goose/models/canada-goose.glb", import.meta.url).href;
const HELD_CLIPS = ["wings_spread", "aggressive"] as const;
type HeldClip = typeof HELD_CLIPS[number];

let sourcePromise: Promise<GLTF> | undefined;
function loadModel(): Promise<GLTF> {
  sourcePromise ??= new GLTFLoader().loadAsync(MODEL_URL).catch((error: unknown) => {
    sourcePromise = undefined;
    throw error;
  });
  return sourcePromise;
}

/** Rigged player-character view. Gameplay owns movement and held pose state. */
export class Goose extends THREE.Group {
  readonly ready: Promise<void>;
  private mixer?: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly heldActions = new Map<HeldClip, THREE.AnimationAction>();
  private readonly poseProgress: Record<HeldClip, number> = { wings_spread: 0, aggressive: 0 };
  private honkQueued = false;
  private spookQueued = false;

  constructor(loader?: () => Promise<Pick<GLTF, "scene" | "animations">>) {
    super();
    this.name = "goose";
    this.userData = { assetRole: "rigged-player-character", visualDetailTier: 6 };
    if (!loader && typeof window === "undefined") {
      this.ready = Promise.resolve();
      return;
    }
    this.ready = (loader ?? loadModel)().then((gltf) => {
      const model = clone(gltf.scene);
      const materials = new Map<string, THREE.MeshToonMaterial>();
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const convert = (source: THREE.Material): THREE.MeshToonMaterial => {
          let material = materials.get(source.name);
          if (!material) {
            const color = GOOSE_COLORS[source.name as keyof typeof GOOSE_COLORS];
            if (color === undefined) throw new Error(`Unknown goose material: ${source.name}`);
            material = toonMaterial(color);
            material.name = source.name;
            materials.set(source.name, material);
          }
          return material;
        };
        object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
        object.castShadow = true;
        object.receiveShadow = false;
        if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false;
      });
      this.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      for (const sourceClip of gltf.animations) {
        const clip = HELD_CLIPS.includes(sourceClip.name as HeldClip) || sourceClip.name === "honk" || sourceClip.name === "spooked"
          ? THREE.AnimationUtils.makeClipAdditive(sourceClip.clone())
          : sourceClip;
        this.actions.set(sourceClip.name, this.mixer.clipAction(clip));
      }
      for (const name of ["idle", "walk", "hurry"] as const) {
        this.actions.get(name)?.setLoop(THREE.LoopRepeat, Infinity).play();
      }
      for (const name of HELD_CLIPS) {
        const action = this.actions.get(name);
        if (!action) continue;
        action.setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).play();
        action.paused = true;
        action.time = 0;
        this.heldActions.set(name, action);
      }
      if (this.honkQueued) this.playHonk();
      if (this.spookQueued) this.playSpooked();
    });
    void this.ready.catch((error: unknown) => console.error("Unable to load the Canada goose model", error));
  }

  honk(): void {
    this.honkQueued = true;
    this.playHonk();
  }

  spook(): void {
    this.spookQueued = true;
    this.playSpooked();
  }

  update(
    delta: number,
    _elapsed: number,
    speedRatio: number,
    _turnAmount: number,
    wingsSpread: boolean,
    aggressive: boolean,
  ): void {
    if (!this.mixer) return;
    const moving = THREE.MathUtils.smoothstep(speedRatio, 0.02, 0.13);
    const hurrying = THREE.MathUtils.smoothstep(speedRatio, 0.62, 0.93);
    this.actions.get("idle")?.setEffectiveWeight(1 - moving);
    this.actions.get("walk")?.setEffectiveWeight(moving * (1 - hurrying));
    this.actions.get("hurry")?.setEffectiveWeight(moving * hurrying);
    this.advanceHeldPose("wings_spread", wingsSpread, delta);
    this.advanceHeldPose("aggressive", aggressive, delta);
    this.mixer.update(delta);
  }

  private advanceHeldPose(name: HeldClip, held: boolean, delta: number): void {
    const action = this.heldActions.get(name);
    if (!action) return;
    const target = held ? 1 : 0;
    const duration = action.getClip().duration;
    const step = duration > 0 ? delta / duration : 1;
    this.poseProgress[name] = target > this.poseProgress[name]
      ? Math.min(target, this.poseProgress[name] + step)
      : Math.max(target, this.poseProgress[name] - step);
    action.time = this.poseProgress[name] * duration;
  }

  private playHonk(): void {
    const action = this.actions.get("honk");
    if (!action) return;
    this.honkQueued = false;
    action.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1);
    action.clampWhenFinished = false;
    action.play();
  }

  private playSpooked(): void {
    const action = this.actions.get("spooked");
    if (!action) return;
    this.spookQueued = false;
    action.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1);
    action.clampWhenFinished = false;
    action.play();
  }
}
