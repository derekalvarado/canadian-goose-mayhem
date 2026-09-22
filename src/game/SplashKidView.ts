import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { RiggedCharacterView, type CharacterLoader } from "./RiggedCharacterView.ts";
import { SPLASH_KID_COLORS, type SplashKidVariant } from "./SplashKidModel.ts";
import type { SplashKidState } from "./simulation/Simulation.ts";

const MODEL_URLS: Record<SplashKidVariant, string> = {
  runner: new URL("../../assets/characters/kids/models/splash-kid-runner.glb", import.meta.url).href,
  boots: new URL("../../assets/characters/kids/models/splash-kid-boots.glb", import.meta.url).href,
};
const sourcePromises = new Map<SplashKidVariant, Promise<GLTF>>();
function loadModel(variant: SplashKidVariant): Promise<GLTF> {
  const pending = sourcePromises.get(variant);
  if (pending) return pending;
  const next = new GLTFLoader().loadAsync(MODEL_URLS[variant]).catch((error: unknown) => { sourcePromises.delete(variant); throw error; });
  sourcePromises.set(variant, next); return next;
}

/** Presentation for a simulation-owned splash-pad child. */
export class SplashKidView extends RiggedCharacterView {
  readonly variant: SplashKidVariant;

  constructor(variant: SplashKidVariant, loader?: CharacterLoader) {
    super({
      name: `splash kid ${variant}`, errorLabel: `the ${variant} splash-pad kid`, palette: SPLASH_KID_COLORS[variant],
      loader: loader ?? (typeof window === "undefined" ? undefined : () => loadModel(variant)),
    });
    this.variant = variant;
    this.userData.characterVariant = variant;
  }

  setState(state: SplashKidState): void {
    this.userData.gameplayState = state.activity;
    const clip = state.activity === "playing" || state.activity === "frightened" ? "run"
      : state.activity === "walking-away" || state.activity === "returning" ? "walk"
      : state.activity === "crying" ? "cry"
      : state.activity === "disappointed" && state.activitySecondsRemaining > 0.75 ? "hands_up"
      : state.activity === "disappointed" ? "stomp" : "idle";
    this.playAnimation(clip, 0.14);
  }
}
