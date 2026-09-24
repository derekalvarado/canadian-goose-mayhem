import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { RiggedCharacterView, type CharacterLoader } from "./RiggedCharacterView.ts";
import { SPLASH_KID_COLORS, SPLASH_KID_MOUTHS, type SplashKidVariant } from "./SplashKidModel.ts";
import type { SplashKidState } from "./simulation/Simulation.ts";

const MODEL_URLS: Record<SplashKidVariant, string> = {
  runner: new URL("../../assets/characters/kids/models/splash-kid-runner.glb", import.meta.url).href,
  boots: new URL("../../assets/characters/kids/models/splash-kid-boots.glb", import.meta.url).href,
  floaties: new URL("../../assets/characters/kids/models/splash-kid-floaties.glb", import.meta.url).href,
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
    void this.ready.then(() => this.setMouth(false)).catch(() => undefined);
  }

  /** Swaps the smile for an open wailing mouth. Presentation only. */
  private setMouth(wail: boolean): void {
    const smile = this.getObjectByName(SPLASH_KID_MOUTHS.smile); const open = this.getObjectByName(SPLASH_KID_MOUTHS.wail);
    if (smile) smile.visible = !wail;
    if (open) open.visible = wail;
  }

  setState(state: SplashKidState): void {
    this.userData.gameplayState = state.activity;
    this.setMouth(state.activity === "frightened" || state.activity === "crying");
    const clip = state.activity === "playing" ? "skip"
      : state.activity === "splashing" ? "splash"
      : state.activity === "frightened" ? "flee"
      : state.activity === "walking-away" || state.activity === "returning" ? "walk"
      : state.activity === "crying" ? "cry"
      : state.activity === "disappointed" && state.activitySecondsRemaining > 0.75 ? "hands_up"
      : state.activity === "disappointed" ? "stomp" : "idle";
    this.playAnimation(clip, 0.14);
  }
}
