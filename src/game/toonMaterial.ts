import * as THREE from "three";

/** Shared by the plaza and the character studio: only 8% directional contrast. */
export const STORYBOOK_LIGHTING = { ambient: Math.PI * 0.92, sun: Math.PI * 0.08 } as const;

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
const FLAT_BANDS = TOON_BANDS.clone();
FLAT_BANDS.image = { data: new Uint8Array([255, 255, 255]), width: 3, height: 1 };
FLAT_BANDS.needsUpdate = true;

/**
 * Use for every character and solid world prop, including future imported meshes.
 * Mostly flat storybook color, with a small directional contribution for world
 * depth and faint cast shadows. Characters can opt into completely flat surfaces.
 */
export function toonMaterial(
  color: number,
  options: Partial<THREE.MeshToonMaterialParameters> = {},
  flatSurface = false,
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    ...options,
    gradientMap: flatSurface ? FLAT_BANDS : TOON_BANDS,
  });
}
