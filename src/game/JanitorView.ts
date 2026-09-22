import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { JANITOR_COLORS } from "./JanitorModel.ts";
import { RiggedCharacterView, type CharacterLoader } from "./RiggedCharacterView.ts";
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

/** Animation is presentation only; simulation owns movement and activity. */
export class JanitorView extends RiggedCharacterView {
  constructor(loader?: CharacterLoader) {
    super({
      name: "street janitor", errorLabel: "the street janitor", palette: JANITOR_COLORS,
      loader: loader ?? (typeof window === "undefined" ? undefined : loadModel),
    });
  }

  setActivity(activity: JanitorActivity): void {
    this.userData.gameplayState = activity;
    const clip = activity === "walking-to-pad" || activity === "returning" || activity === "walking-to-trash"
      || activity === "walking-to-litter" || activity === "retrieving-tool" ? "walk"
      : activity === "pursuing-tool" || activity === "chasing-goose" ? "walk"
      : activity === "shooing" ? "shoo"
      : activity === "emptying-trash" || activity === "picking-litter" ? "inspect"
      : activity === "reacting" ? "look"
      : activity === "inspecting" || activity === "scratching" ? "scratch" : "idle";
    this.playAnimation(clip, 0.18);
  }
}
