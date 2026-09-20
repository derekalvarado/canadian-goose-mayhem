import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";

const MODEL_URL = new URL("../../assets/props/trash_can.glb", import.meta.url).href;
const COLORS: Readonly<Record<string, number>> = {
  "Charcoal recessed body": PALETTE.trashCan.body,
  "Charcoal vertical ribs": PALETTE.trashCan.ribs,
  "Charcoal lid and base": PALETTE.trashCan.lid,
  "Dark opening": PALETTE.trashCan.opening,
};
let modelPromise: Promise<THREE.Group> | undefined;
function loadModel(): Promise<THREE.Group> {
  modelPromise ??= new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => gltf.scene).catch((error: unknown) => {
    modelPromise = undefined;
    throw error;
  });
  return modelPromise;
}

/** Ground-centered static prop; each placement owns its materials and transform. */
export class TrashCanView extends THREE.Group {
  readonly ready: Promise<void>;

  constructor(loader?: () => Promise<THREE.Group>) {
    super();
    this.name = "Trash can";
    // Rule tests can construct a world without fetching browser assets.
    if (!loader && typeof window === "undefined") {
      this.ready = Promise.resolve();
      return;
    }
    this.ready = (loader ?? loadModel)().then((source) => {
      const model = source.clone(true);
      // The editor marks the persistent view before the asynchronous GLB arrives.
      const preview = this.userData.editorIgnore === true;
      model.traverse((object) => {
        if (preview) object.userData.editorIgnore = true;
        if (!(object instanceof THREE.Mesh)) return;
        const convert = (material: THREE.Material): THREE.MeshToonMaterial => toonMaterial(
          COLORS[material.name] ?? PALETTE.trashCan.body,
          { transparent: preview, opacity: preview ? 0.45 : 1 },
        );
        object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
        object.castShadow = !preview;
        object.receiveShadow = false;
      });
      this.add(model);
    });
    void this.ready.catch((error: unknown) => console.error("Unable to load the trash can model", error));
  }
}
