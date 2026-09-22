import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { GOOSE_COLORS } from "./GooseModel.ts";
import { toonMaterial } from "./toonMaterial.ts";
import { GooseAnimationState, type GooseLocomotion } from "./GooseAnimation.ts";

const MODEL_URL = new URL("../../assets/characters/goose/models/canada-goose.glb", import.meta.url).href;
const HELD_CLIPS = ["wings_spread", "aggressive"] as const;
const WING_LOOPS = ["wing_flap", "wing_flutter"] as const;
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
  private grabQueued = false;
  private readonly animation = new GooseAnimationState();
  private readonly bones = new Map<string, THREE.Object3D>();
  private readonly baseRotations = new Map<string, THREE.Quaternion>();
  private readonly lookTarget = new THREE.Vector3();
  private hasLookTarget = false;
  private readonly localTarget = new THREE.Vector3();
  private readonly secondaryRotation = new THREE.Quaternion();
  private readonly secondaryEuler = new THREE.Euler();

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
            material = toonMaterial(color, {}, true);
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
      model.traverse((object) => {
        if (!(object instanceof THREE.Bone)) return;
        this.bones.set(object.name, object);
        this.baseRotations.set(object.name, object.quaternion.clone());
      });
      this.mixer = new THREE.AnimationMixer(model);
      for (const sourceClip of gltf.animations) {
        const clip = HELD_CLIPS.includes(sourceClip.name as HeldClip) || ["honk", "spooked", "grab", ...WING_LOOPS].includes(sourceClip.name)
          ? THREE.AnimationUtils.makeClipAdditive(sourceClip.clone())
          : sourceClip;
        this.actions.set(sourceClip.name, this.mixer.clipAction(clip));
      }
      for (const name of ["idle", "walk", "hurry", "sneak"] as const) {
        const action = this.actions.get(name);
        if (!action) continue;
        action.setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(name === "idle" ? 1 : 0).play();
        if (name !== "idle") action.paused = true;
      }
      for (const name of HELD_CLIPS) {
        const action = this.actions.get(name);
        if (!action) continue;
        action.setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).play();
        action.paused = true;
        action.time = 0;
        this.heldActions.set(name, action);
      }
      for (const name of WING_LOOPS) {
        this.actions.get(name)?.setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(0).play();
      }
      if (this.honkQueued) this.playHonk();
      if (this.spookQueued) this.playSpooked();
      if (this.grabQueued) this.playGrab();
      this.mixer.update(0);
      for (const [name, bone] of this.bones) this.baseRotations.get(name)!.copy(bone.quaternion);
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

  /** A resolved interaction is the only source of this one-shot. */
  grab(): void {
    this.grabQueued = true;
    this.playGrab();
  }

  /** Optional visible point of interest, in world coordinates. */
  setLookTarget(target?: Readonly<{ x: number; y: number; z: number }>): void {
    this.hasLookTarget = target !== undefined;
    if (target) this.lookTarget.copy(target);
  }

  update(
    delta: number,
    _elapsed: number,
    speedRatio: number,
    turnAmount: number,
    wingsSpread: boolean,
    aggressive: boolean,
  ): void {
    if (!this.mixer || !Number.isFinite(delta) || delta <= 0) return;
    const dt = Math.min(delta, 0.1);
    let yaw = turnAmount * 0.5;
    let pitch = 0;
    if (this.hasLookTarget) {
      this.updateWorldMatrix(true, false);
      this.localTarget.copy(this.lookTarget);
      this.worldToLocal(this.localTarget);
      yaw = Math.atan2(-this.localTarget.x, -this.localTarget.z);
      pitch = Math.atan2(this.localTarget.y - 0.8, Math.hypot(this.localTarget.x, this.localTarget.z));
    }
    this.animation.update(dt, speedRatio, turnAmount, wingsSpread, aggressive, yaw, pitch);
    for (const name of ["idle", "walk", "hurry", "sneak"] as GooseLocomotion[]) {
      const action = this.actions.get(name);
      if (!action) continue;
      action.setEffectiveWeight(this.animation.weights[name]);
      if (name !== "idle") action.time = this.animation.phase * action.getClip().duration;
    }
    this.advanceHeldPose("wings_spread", wingsSpread, dt);
    this.advanceHeldPose("aggressive", aggressive, dt);
    const flutter = THREE.MathUtils.smoothstep(this.animation.speed, 0.6, 1);
    const wingWeight = this.animation.wings ** 2;
    this.actions.get("wing_flap")?.setEffectiveWeight(wingWeight * (1 - flutter));
    this.actions.get("wing_flutter")?.setEffectiveWeight(wingWeight * flutter);
    // Mixer caches unchanged channels. Restore its base before layering so a
    // held pose/constant channel cannot accumulate rotations each render frame.
    for (const [name, bone] of this.bones) bone.quaternion.copy(this.baseRotations.get(name)!);
    this.mixer.update(dt);
    for (const [name, bone] of this.bones) this.baseRotations.get(name)!.copy(bone.quaternion);
    this.applySecondaryMotion();
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

  private playGrab(): void {
    const action = this.actions.get("grab");
    if (!action) return;
    this.grabQueued = false;
    action.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).play();
  }

  private rotateBone(name: string, x: number, y: number, z: number): void {
    const bone = this.bones.get(name);
    if (!bone) return;
    this.secondaryEuler.set(x, y, z);
    this.secondaryRotation.setFromEuler(this.secondaryEuler);
    bone.quaternion.multiply(this.secondaryRotation);
  }

  private applySecondaryMotion(): void {
    const state = this.animation;
    const attention = 1 - state.threat * 0.85;
    // Upper-neck layering leaves the authored planted feet untouched.
    for (let index = 3; index <= 6; index += 1) {
      this.rotateBone(`neck_${index}`, state.lookPitch * attention * 0.13,
        state.lookYaw * attention * 0.15, -state.turn * state.speed * 0.015);
    }
    this.rotateBone("head", state.lookPitch * attention * 0.48,
      state.lookYaw * attention * 0.4, -state.turn * 0.035);
    this.rotateBone("chest", -THREE.MathUtils.clamp(state.acceleration * 0.025, -0.04, 0.045),
      state.turn * 0.035, -state.turn * state.speed * 0.055);
    // Tail's local Y runs along its length; local -Z is the rig's yaw axis.
    this.rotateBone("tail", 0, 0, state.turn * 0.12);
  }
}
