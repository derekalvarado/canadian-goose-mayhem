import * as THREE from "three";

const TOON_BANDS = new THREE.DataTexture(
  new Uint8Array([0, 128, 255]),
  3,
  1,
  THREE.RedFormat,
);
TOON_BANDS.minFilter = THREE.NearestFilter;
TOON_BANDS.magFilter = THREE.NearestFilter;
TOON_BANDS.generateMipmaps = false;
TOON_BANDS.needsUpdate = true;

/**
 * Use for every character and solid world prop, including future imported meshes.
 * Paired with one neutral sun and uniform ambient light, this produces exactly
 * three tones: shadow, midtone, and the original palette color. Smooth normals
 * retain rounded 3D silhouettes without continuous lighting gradients.
 */
export function toonMaterial(
  color: number,
  options: Partial<THREE.MeshToonMaterialParameters> = {},
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    ...options,
    gradientMap: TOON_BANDS,
  });
}
