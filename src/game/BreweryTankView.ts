import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";

const MODEL_URL = new URL("../../assets/props/brewery_tank.glb", import.meta.url).href;
const COLORS: Readonly<Record<string, number>> = {
  "Tank shell": PALETTE.breweryTank.shell,
  "Tank brass": PALETTE.breweryTank.brass,
  "Tank frame": PALETTE.breweryTank.frame,
  "Tank frame brace": PALETTE.breweryTank.brace,
  "Tank footing": PALETTE.breweryTank.footing,
  "Tank railing": PALETTE.breweryTank.railing,
  "Tank service pipe": PALETTE.breweryTank.pipe,
  "Tank mural sky": PALETTE.breweryTank.muralSky,
  "Tank mural blue": PALETTE.breweryTank.muralBlue,
  "Tank mural teal": PALETTE.breweryTank.muralTeal,
  "Tank mural green": PALETTE.breweryTank.muralGreen,
  "Tank mural forest": PALETTE.breweryTank.muralForest,
  "Tank mural gold": PALETTE.breweryTank.muralGold,
  "Tank mural orange": PALETTE.breweryTank.muralOrange,
  "Tank mural rust": PALETTE.breweryTank.muralRust,
  "Tank mural cream": PALETTE.breweryTank.muralCream,
  "Tank mural slate": PALETTE.breweryTank.muralSlate,
};
let modelPromise: Promise<THREE.Group> | undefined;
function loadModel(): Promise<THREE.Group> {
  modelPromise ??= new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => gltf.scene).catch((error: unknown) => {
    modelPromise = undefined;
    throw error;
  });
  return modelPromise;
}

/** Stable meshes keep async loading compatible with editor previews and camera fading. */
export class BreweryTankView extends THREE.Group {
  readonly ready: Promise<void>;

  constructor(loader?: () => Promise<THREE.Group>) {
    super();
    this.name = "Brewery fermentation tank";
    const meshes = new Map<string, THREE.Mesh>();
    for (const [name, color] of Object.entries(COLORS)) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), toonMaterial(color));
      mesh.name = name;
      mesh.castShadow = true;
      meshes.set(name, mesh);
      this.add(mesh);
    }
    if (!loader && typeof window === "undefined") {
      this.ready = Promise.resolve();
      return;
    }
    this.ready = (loader ?? loadModel)().then((source) => {
      source.updateMatrixWorld(true);
      source.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
        const target = meshes.get(object.material.name);
        if (!target) throw new Error(`Unknown brewery tank material: ${object.material.name}`);
        target.geometry.dispose();
        // Bake the GLB's Y-up transform, retaining a ground-centered view pivot.
        target.geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        target.castShadow = this.userData.editorIgnore !== true;
      });
    });
    void this.ready.catch((error: unknown) => console.error("Unable to load the brewery tank model", error));
  }
}
