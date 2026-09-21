import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { JANITOR_COLORS } from "./JanitorModel.ts";
import { toonMaterial } from "./toonMaterial.ts";
import type { JanitorActivity } from "./simulation/Simulation.ts";

const MODEL_URL = new URL("../../assets/characters/janitor/models/janitor-street-sweeper.glb", import.meta.url).href;
let sourcePromise: Promise<GLTF> | undefined;
function loadModel(): Promise<GLTF> {
  sourcePromise ??= new GLTFLoader().loadAsync(MODEL_URL).catch((error: unknown) => {
    sourcePromise = undefined;
    throw error;
  });
  return sourcePromise;
}

type JanitorClip = "idle" | "walk" | "look" | "shoo" | "inspect" | "scratch";

/** Animation is presentation only; simulation owns movement and activity. */
export class JanitorView extends THREE.Group {
  readonly ready: Promise<void>;
  private mixer?: THREE.AnimationMixer;
  private currentAction?: THREE.AnimationAction;
  private readonly actions = new Map<string, THREE.AnimationAction>();

  constructor(loader?: () => Promise<Pick<GLTF, "scene" | "animations">>) {
    super();
    this.name = "street janitor";
    this.userData = { assetRole: "rigged-character", visualDetailTier: 3, gameplayState: "none" };
    if (!loader && typeof window === "undefined") {
      this.ready = Promise.resolve();
      return;
    }
    this.ready = (loader ?? loadModel)().then((gltf) => {
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
            const color = JANITOR_COLORS[source.name as keyof typeof JANITOR_COLORS];
            if (color === undefined) throw new Error(`Unknown janitor material: ${source.name}`);
            material = toonMaterial(color, { transparent: preview, opacity: preview ? 0.45 : 1 });
            material.name = source.name;
            materials.set(source.name, material);
          }
          return material;
        };
        object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
        object.castShadow = !preview;
        object.receiveShadow = false;
        // The small NPC can pose outside its rest bounds; do not cull bent limbs.
        if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false;
      });
      this.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
      this.playAnimation("idle", 0);
    });
    void this.ready.catch((error: unknown) => console.error("Unable to load the street janitor", error));
  }

  /** Call after ready. Walk is an in-place rig demonstration, not NPC locomotion. */
  playAnimation(name: JanitorClip, fadeSeconds = 0.2): void {
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

  setActivity(activity: JanitorActivity): void {
    this.userData.gameplayState = activity;
    const clip: JanitorClip = activity === "walking-to-pad" || activity === "returning" ? "walk"
      : activity === "shooing" ? "shoo"
      : activity === "inspecting" || activity === "scratching" ? "scratch" : "idle";
    this.playAnimation(clip, 0.18);
  }

  getHandSocket(side: "left" | "right"): THREE.Object3D | undefined {
    return this.getObjectByName(`${side}_hand_socket`);
  }

  update(delta: number): void {
    this.mixer?.update(delta);
  }
}
