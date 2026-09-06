/**
 * Source-owned catalog metadata. Layout files intentionally reference these
 * stable IDs rather than serialising meshes or material recipes.
 */
export type WorldAssetCategory = "ground" | "architecture" | "landmark" | "furniture" | "planting" | "lighting";

export interface WorldAssetCollider {
  readonly shape: "box" | "circle";
  readonly x: number;
  readonly z: number;
  readonly halfWidth?: number;
  readonly halfDepth?: number;
  readonly radius?: number;
}

export interface WorldAssetDefinition {
  readonly assetId: string;
  readonly label: string;
  readonly category: WorldAssetCategory;
  /** Axis-aligned local footprint used for placement bounds and overlap warnings. */
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly colliders: readonly WorldAssetCollider[];
  readonly occludesCamera?: boolean;
  /** Large compositional layers should not create meaningless overlap warnings. */
  readonly warnForOverlap?: boolean;
  /** A walkable surface's top height relative to its instance transform. */
  readonly surfaceHeight?: number;
  /** Higher surfaces win when authored tiles overlap. */
  readonly surfacePriority?: number;
}

export const WORLD_ASSETS: readonly WorldAssetDefinition[] = [
  { assetId: "plaza.paving-patch", label: "Paving patch", category: "ground", halfWidth: 4, halfDepth: 4, colliders: [], surfaceHeight: 0, surfacePriority: 1 },
  { assetId: "plaza.paving-base", label: "Plaza paving base", category: "ground", halfWidth: 22, halfDepth: 18, colliders: [], warnForOverlap: false, surfaceHeight: 0, surfacePriority: 1 },
  { assetId: "street.sidewalk-tile", label: "Sidewalk tile", category: "ground", halfWidth: 4, halfDepth: 4, colliders: [], surfaceHeight: 0, surfacePriority: 3 },
  { assetId: "street.road-tile", label: "Lowered road tile", category: "ground", halfWidth: 4, halfDepth: 4, colliders: [], surfaceHeight: -0.15, surfacePriority: 2 },
  { assetId: "street.curb-straight", label: "Straight curb", category: "ground", halfWidth: 4, halfDepth: 0.2, colliders: [] },
  { assetId: "plaza.building-frontage", label: "Building frontage", category: "architecture", halfWidth: 22, halfDepth: 22, colliders: [], occludesCamera: true, warnForOverlap: false },
  { assetId: "plaza.goose-fountain", label: "Goose fountain", category: "landmark", halfWidth: 3.45, halfDepth: 3.45, colliders: [{ shape: "circle", x: 0, z: 0, radius: 3.35 }] },
  { assetId: "plaza.splash-pad", label: "Splash pad", category: "landmark", halfWidth: 4.9, halfDepth: 4.9, colliders: [] },
  { assetId: "plaza.play-area", label: "Play area", category: "landmark", halfWidth: 6.75, halfDepth: 3.25, colliders: [
    { shape: "box", x: 0, z: -3, halfWidth: 6.5, halfDepth: 0.25 },
    { shape: "box", x: 0, z: 3, halfWidth: 6.5, halfDepth: 0.25 },
    { shape: "box", x: -6.5, z: 0, halfWidth: 0.25, halfDepth: 3 },
    { shape: "box", x: 6.5, z: -1.35, halfWidth: 0.25, halfDepth: 1.65 },
    { shape: "circle", x: -3.1, z: -0.1, radius: 0.72 },
    { shape: "circle", x: 1.3, z: 0, radius: 0.92 },
  ] },
  { assetId: "plaza.pavilion-stage", label: "Stage and pavilion", category: "landmark", halfWidth: 7.4, halfDepth: 2.75, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 6.8, halfDepth: 2.25 }], occludesCamera: true },
  { assetId: "plaza.cafe-table-set", label: "Café table set", category: "furniture", halfWidth: 1.25, halfDepth: 1.25, colliders: [{ shape: "circle", x: 0, z: 0, radius: 1.18 }] },
  { assetId: "plaza.planter-cluster", label: "Planter cluster", category: "planting", halfWidth: 22, halfDepth: 18, colliders: [
    { shape: "box", x: 19.35, z: -7.2, halfWidth: 1.45, halfDepth: 3.3 },
    { shape: "box", x: 19.35, z: 6.2, halfWidth: 1.45, halfDepth: 3.1 },
    { shape: "box", x: 7.8, z: 16.7, halfWidth: 3.5, halfDepth: 1.3 },
  ], warnForOverlap: false },
  { assetId: "plaza.tree-cluster", label: "Tree cluster", category: "planting", halfWidth: 22, halfDepth: 18, colliders: [] , occludesCamera: true, warnForOverlap: false },
  { assetId: "plaza.string-lights", label: "String-light span", category: "lighting", halfWidth: 19, halfDepth: 11, colliders: [], warnForOverlap: false },
] as const;

export const WORLD_ASSET_IDS = WORLD_ASSETS.map((asset) => asset.assetId);

export function getWorldAsset(assetId: string): WorldAssetDefinition | undefined {
  return WORLD_ASSETS.find((asset) => asset.assetId === assetId);
}
