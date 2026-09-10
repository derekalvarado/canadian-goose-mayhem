import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";

const MODEL_URL = new URL("../../assets/props/deciduous_tree.glb", import.meta.url).href;
let modelPromise: Promise<THREE.Group> | undefined;
function loadModel(): Promise<THREE.Group> {
  modelPromise ??= new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => gltf.scene).catch((error: unknown) => {
    modelPromise = undefined;
    throw error;
  });
  return modelPromise;
}

/** Stable meshes let editor previews and camera fading work before the GLB arrives. */
export class DeciduousTreeView extends THREE.Group {
  readonly ready: Promise<void>;

  constructor(loader?: () => Promise<THREE.Group>) {
    super();
    this.name = "Deciduous tree";
    const meshes = new Map<string, THREE.Mesh>();
    for (const [name, color] of [
      ["Deciduous foliage", PALETTE.green.deciduous],
      ["Deciduous trunk", PALETTE.earth.wood],
    ] as const) {
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
        if (!target) return;
        target.geometry.dispose();
        // Bake the GLB's Y-up transform, retaining a ground-centered view pivot.
        target.geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        target.castShadow = this.userData.editorIgnore !== true;
      });
    });
    void this.ready.catch((error: unknown) => console.error("Unable to load the deciduous tree model", error));
  }
}
