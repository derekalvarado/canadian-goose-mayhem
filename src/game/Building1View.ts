import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";

const MODEL_URLS = [
  new URL("../../assets/props/building1.glb", import.meta.url).href,
  new URL("../../assets/props/building2.glb", import.meta.url).href,
  new URL("../../assets/props/building3.glb", import.meta.url).href,
  new URL("../../assets/props/building4.glb", import.meta.url).href,
  new URL("../../assets/props/building5.glb", import.meta.url).href,
];
const COLORS: Readonly<Record<string, number>> = {
  "Building brick": PALETTE.building1.brick,
  "Building brick accent": PALETTE.building1.brickAccent,
  "Building limestone": PALETTE.building1.limestone,
  "Building glass": PALETTE.building1.glass,
  "Building frames": PALETTE.building1.frames,
  "Building awning": PALETTE.building1.awning,
  "Building awning seams": PALETTE.building1.awningSeams,
  "Building roof": PALETTE.building1.roof,
};
const modelPromises = new Map<number, Promise<THREE.Group>>();
function loadModel(variant: number): Promise<THREE.Group> {
  let promise = modelPromises.get(variant);
  if (!promise) {
    promise = new GLTFLoader().loadAsync(MODEL_URLS[variant - 1]).then((gltf) => gltf.scene).catch((error: unknown) => {
      modelPromises.delete(variant);
      throw error;
    });
    modelPromises.set(variant, promise);
  }
  return promise;
}

/** Stable meshes keep async loading compatible with editor previews and camera fading. */
export class Building1View extends THREE.Group {
  readonly ready: Promise<void>;

  constructor(loader?: () => Promise<THREE.Group>, variant = 1) {
    super();
    this.name = `Old Town storefront ${variant}`;
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
    this.ready = (loader ?? (() => loadModel(variant)))().then((source) => {
      source.updateMatrixWorld(true);
      source.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
        const target = meshes.get(object.material.name);
        if (!target) throw new Error(`Unknown building material: ${object.material.name}`);
        target.geometry.dispose();
        target.geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        target.castShadow = this.userData.editorIgnore !== true;
      });
    });
    void this.ready.catch((error: unknown) => console.error("Unable to load building1", error));
  }
}
