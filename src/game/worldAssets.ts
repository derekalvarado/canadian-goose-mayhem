/**
 * Source-owned catalog metadata. Layout files intentionally reference these
 * stable IDs rather than serialising meshes or material recipes.
 */
export type WorldAssetCategory = "ground" | "architecture" | "landmark" | "furniture" | "planting" | "lighting" | "character" | "prop" | "gameplay";

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
  /** Local visual pivot offset used when an asset's authored transform is not its mesh center. */
  readonly pivotOffset?: Readonly<{ x: number; z: number }>;
  /** Large compositional layers should not create meaningless overlap warnings. */
  readonly warnForOverlap?: boolean;
  /** A walkable surface's top height relative to its instance transform. */
  readonly surfaceHeight?: number;
  /** Higher surfaces win when authored tiles overlap. */
  readonly surfacePriority?: number;
  /** A simulation-owned boolean state that authored controls may target. */
  readonly activeTarget?: Readonly<{ initialActive: boolean }>;
  /** Local handle point and reach used by the common interaction resolver. */
  readonly controller?: Readonly<{ interactionOffset: Readonly<{ x: number; y: number; z: number }>; range: number }>;
  /** Common grab/drop capability; the renderer never decides ownership. */
  readonly carryable?: Readonly<{ interactionRange: number; carryHeight: number; carryDistance: number; stealableWhileHeld?: boolean }>;
  /** Shared simulation affordance used to build deterministic janitor routes. */
  readonly cleanupRole?: "trash-can" | "litter" | "trash-bag" | "litter-picker";
  /** How close a worker gets before using this cleanup affordance. */
  readonly cleanupRange?: number;
  readonly gameplayRole?: "janitor" | "splash-kid" | "shop-entrance";
}

/** Evenly spaced circle colliders tracing a diagonal wall or fence, ends included. */
function circlesAlong(x0: number, z0: number, x1: number, z1: number, count: number, radius: number): WorldAssetCollider[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return { shape: "circle", x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, radius };
  });
}

export const WORLD_ASSETS: readonly WorldAssetDefinition[] = [
  { assetId: "plaza.paving-patch", label: "Paving patch", category: "ground", halfWidth: 4, halfDepth: 4, colliders: [], surfaceHeight: 0, surfacePriority: 1 },
  { assetId: "plaza.paving-patch-large", label: "Large paving patch", category: "ground", halfWidth: 8, halfDepth: 8, colliders: [], surfaceHeight: 0, surfacePriority: 1 },
  { assetId: "plaza.paving-base", label: "Plaza paving base", category: "ground", halfWidth: 22, halfDepth: 18, colliders: [], warnForOverlap: false, surfaceHeight: 0, surfacePriority: 1 },
  { assetId: "coffee.shop-floor", label: "Coffee shop floor", category: "ground", halfWidth: 9, halfDepth: 7, colliders: [], warnForOverlap: false, surfaceHeight: 0, surfacePriority: 10 },
  { assetId: "coffee.wall-long", label: "Coffee shop long wall", category: "architecture", halfWidth: 8.8, halfDepth: 0.18, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 8.8, halfDepth: 0.18 }], occludesCamera: true, warnForOverlap: false },
  { assetId: "coffee.wall-side", label: "Coffee shop side wall", category: "architecture", halfWidth: 0.18, halfDepth: 6.8, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 0.18, halfDepth: 6.8 }], occludesCamera: true, warnForOverlap: false },
  { assetId: "coffee.wall-door-wing", label: "Coffee shop front wall", category: "architecture", halfWidth: 3.5, halfDepth: 0.18, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 3.5, halfDepth: 0.18 }], occludesCamera: true, warnForOverlap: false },
  { assetId: "coffee.front-door", label: "Coffee shop front door", category: "architecture", halfWidth: 2.1, halfDepth: 0.18, colliders: [], warnForOverlap: false },
  { assetId: "coffee.wall-board", label: "Coffee shop menu board", category: "furniture", halfWidth: 1.7, halfDepth: 0.08, colliders: [], warnForOverlap: false },
  { assetId: "coffee.counter", label: "Coffee shop counter", category: "furniture", halfWidth: 3.1, halfDepth: 0.75, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 3.1, halfDepth: 0.75 }], occludesCamera: true },
  { assetId: "coffee.table", label: "Coffee shop table", category: "furniture", halfWidth: 0.5, halfDepth: 0.5, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 0.48, halfDepth: 0.48 }] },
  { assetId: "coffee.chair", label: "Coffee shop chair", category: "furniture", halfWidth: 0.32, halfDepth: 0.32, colliders: [{ shape: "circle", x: 0, z: 0, radius: 0.28 }] },
  { assetId: "coffee.placeholder-person", label: "Coffee shop placeholder person", category: "character", halfWidth: 0.32, halfDepth: 0.32, colliders: [], warnForOverlap: false },
  { assetId: "street.sidewalk-tile", label: "Sidewalk tile", category: "ground", halfWidth: 4, halfDepth: 4, colliders: [], surfaceHeight: 0, surfacePriority: 3 },
  { assetId: "street.road-tile", label: "Lowered road tile", category: "ground", halfWidth: 4, halfDepth: 4, colliders: [], surfaceHeight: -0.15, surfacePriority: 2 },
  { assetId: "street.curb-straight", label: "Straight curb", category: "ground", halfWidth: 4, halfDepth: 0.2, colliders: [] },
  { assetId: "street.manhole-cover", label: "Sewer manhole cover", category: "ground", halfWidth: 0.4, halfDepth: 0.4, colliders: [], warnForOverlap: false },
  { assetId: "plaza.building-frontage", label: "Building frontage", category: "architecture", halfWidth: 22, halfDepth: 22, colliders: [], occludesCamera: true, pivotOffset: { x: 0, z: -20 }, warnForOverlap: false },
  { assetId: "street.building1", label: "Building 1 — arched brick storefront", category: "architecture", halfWidth: 3.45, halfDepth: 3.45, colliders: [{ shape: "box", x: 0, z: -0.184, halfWidth: 3.289, halfDepth: 3.197 }], occludesCamera: true },
  { assetId: "street.building2", label: "Café with striped awning", category: "architecture", halfWidth: 3.45, halfDepth: 3.72, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 3.35, halfDepth: 3.16 }], occludesCamera: true },
  { assetId: "street.building3", label: "Paired-window shop", category: "architecture", halfWidth: 3.45, halfDepth: 3.42, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 3.35, halfDepth: 3.16 }], occludesCamera: true },
  { assetId: "street.building4", label: "Brick arcade", category: "architecture", halfWidth: 3.85, halfDepth: 3.72, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 3.75, halfDepth: 3.16 }], occludesCamera: true },
  { assetId: "street.building5", label: "Sage townhouse", category: "architecture", halfWidth: 3.15, halfDepth: 3.7, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 3.05, halfDepth: 3.16 }], occludesCamera: true },
  { assetId: "oldtown.miller-block", label: "Miller Block — historic brick corner", category: "architecture", halfWidth: 8.2, halfDepth: 5.1, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 7.99, halfDepth: 4.07 }], occludesCamera: true },
  { assetId: "oldtown.coopersmith-block", label: "CooperSmith’s — glazed canopy block", category: "architecture", halfWidth: 8.9, halfDepth: 5.8, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 8.69, halfDepth: 4.07 }], occludesCamera: true },
  { assetId: "oldtown.coopersmith-pub", label: "CooperSmith’s — tapered pub & umbrella patio", category: "architecture", halfWidth: 6.1, halfDepth: 10.8, colliders: [
    // Brick block: the full-width rear, then boxes stepping in under the
    // diagonal facade, with small circles sealing the sawtooth along it.
    { shape: "box", x: 0.5, z: -5, halfWidth: 5.5, halfDepth: 5.6 },
    { shape: "box", x: -0.4125, z: 1.45, halfWidth: 4.5875, halfDepth: 0.85 },
    { shape: "box", x: -1.325, z: 3.15, halfWidth: 3.675, halfDepth: 0.85 },
    { shape: "box", x: -2.2375, z: 4.85, halfWidth: 2.7625, halfDepth: 0.85 },
    { shape: "box", x: -3.15, z: 6.55, halfWidth: 1.85, halfDepth: 0.85 },
    ...circlesAlong(-1.3, 7.4, 5.8, 0.786, 17, 0.25),
    // Patio fence; the gap in the left run (z 7.6–8.7) is the gate.
    { shape: "box", x: -5.45, z: 6.2, halfWidth: 0.45, halfDepth: 0.05 },
    { shape: "box", x: -5.9, z: 6.9, halfWidth: 0.05, halfDepth: 0.7 },
    { shape: "box", x: -5.9, z: 8.95, halfWidth: 0.05, halfDepth: 0.25 },
    ...circlesAlong(-5.9, 9.2, -4.6, 10.6, 7, 0.1),
    { shape: "box", x: 0.6, z: 10.6, halfWidth: 5.2, halfDepth: 0.05 },
    { shape: "box", x: 5.8, z: 5.693, halfWidth: 0.05, halfDepth: 4.907 },
    // Pergola posts and the umbrella tables (poles stand in the tables).
    { shape: "circle", x: 0.4836, z: 8.7451, radius: 0.08 },
    { shape: "circle", x: 2.9715, z: 6.4277, radius: 0.08 },
    { shape: "circle", x: 5.4593, z: 4.1103, radius: 0.08 },
    ...[[-4.1, 9.6], [-1.7, 9.6], [0.7, 9.6], [3.1, 9.6], [1, 7.1], [3.4, 7.1], [4, 4.8]].map(([x, z]) => ({ shape: "circle" as const, x, z, radius: 0.4 })),
  ], occludesCamera: true },
  { assetId: "oldtown.stage", label: "Old Town performance stage", category: "landmark", halfWidth: 7, halfDepth: 3.65, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 6.3, halfDepth: 2.7 }], occludesCamera: true },
  { assetId: "oldtown.brewery-tank", label: "Brewery fermentation tank", category: "landmark", halfWidth: 2.5, halfDepth: 2.5, colliders: [{ shape: "circle", x: 0, z: 0, radius: 2.5 }], occludesCamera: true },
  { assetId: "oldtown.bench", label: "Old Town bench", category: "furniture", halfWidth: 1.125, halfDepth: 0.35, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 1.125, halfDepth: 0.35 }], occludesCamera: false },
  { assetId: "oldtown.flower-bed", label: "Stone-edged flower bed", category: "planting", halfWidth: 2.375, halfDepth: 0.925, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 2.375, halfDepth: 0.925 }], occludesCamera: false },
  { assetId: "oldtown.lamp", label: "Old Town banner lamp", category: "lighting", halfWidth: 1, halfDepth: 0.24, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 0.17, halfDepth: 0.17 }], occludesCamera: false },
  { assetId: "oldtown.fireplace", label: "Communal fireplace", category: "furniture", halfWidth: 1.4, halfDepth: 0.7, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 1.4, halfDepth: 0.7 }], occludesCamera: false },
  { assetId: "oldtown.gas-meter-bank", label: "Wall-mounted gas meter bank", category: "prop", halfWidth: 2.2, halfDepth: 0.6, colliders: [
    { shape: "box", x: -1.45, z: -0.38, halfWidth: 0.75, halfDepth: 0.22 },
    { shape: "box", x: 0.72, z: -0.07, halfWidth: 1.45, halfDepth: 0.53 },
  ], occludesCamera: false },
  { assetId: "oldtown.shade-tree", label: "Old Town shade tree", category: "planting", halfWidth: 3.6, halfDepth: 2.736, colliders: [{ shape: "circle", x: 0, z: 0, radius: 0.4824 }], occludesCamera: true },
  { assetId: "oldtown.oval-inlay", label: "Oval plaza paving inlay", category: "ground", halfWidth: 13.76, halfDepth: 8, colliders: [], warnForOverlap: false },
  { assetId: "oldtown.light-span", label: "Old Town festoon span", category: "lighting", halfWidth: 0.1, halfDepth: 8.1, colliders: [], warnForOverlap: false },
  { assetId: "plaza.corner-market-building", label: "Corner market building", category: "architecture", halfWidth: 7.8, halfDepth: 6.8, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 7.25, halfDepth: 6.1 }], occludesCamera: true },
  { assetId: "plaza.goose-fountain", label: "Goose fountain", category: "landmark", halfWidth: 3.45, halfDepth: 3.45, colliders: [{ shape: "circle", x: 0, z: 0, radius: 3.35 }] },
  { assetId: "plaza.splash-pad", label: "Splash pad", category: "landmark", halfWidth: 4.9, halfDepth: 4.9, colliders: [], activeTarget: { initialActive: true } },
  { assetId: "plaza.play-area", label: "Play area", category: "landmark", halfWidth: 6.75, halfDepth: 3.25, colliders: [
    { shape: "box", x: 0, z: -3, halfWidth: 6.5, halfDepth: 0.25 },
    { shape: "box", x: 0, z: 3, halfWidth: 6.5, halfDepth: 0.25 },
    { shape: "box", x: -6.5, z: 0, halfWidth: 0.25, halfDepth: 3 },
    { shape: "box", x: 6.5, z: -1.35, halfWidth: 0.25, halfDepth: 1.65 },
    { shape: "circle", x: -3.1, z: -0.1, radius: 0.72 },
    { shape: "circle", x: 1.3, z: 0, radius: 0.92 },
  ] },
  { assetId: "plaza.pavilion-stage", label: "Stage and pavilion", category: "landmark", halfWidth: 7.4, halfDepth: 2.75, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 6.8, halfDepth: 2.25 }], occludesCamera: true },
  { assetId: "plaza.cafe-table-set", label: "Café table set", category: "furniture", halfWidth: 1.0, halfDepth: 0.44, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 0.96, halfDepth: 0.4 }] },
  { assetId: "street.trash-can", label: "Trash can", category: "furniture", halfWidth: 0.46, halfDepth: 0.46, colliders: [{ shape: "circle", x: 0, z: 0, radius: 0.46 }], cleanupRole: "trash-can", cleanupRange: 1.2 },
  { assetId: "plaza.street-janitor", label: "Street janitor", category: "character", halfWidth: 0.72, halfDepth: 0.72, colliders: [], warnForOverlap: false, gameplayRole: "janitor" },
  { assetId: "plaza.splash-kid-runner", label: "Splash-pad kid — runner", category: "character", halfWidth: 0.38, halfDepth: 0.38, colliders: [], warnForOverlap: false, gameplayRole: "splash-kid" },
  { assetId: "plaza.splash-kid-boots", label: "Splash-pad kid — yellow boots", category: "character", halfWidth: 0.38, halfDepth: 0.38, colliders: [], warnForOverlap: false, gameplayRole: "splash-kid" },
  { assetId: "plaza.splash-kid-floaties", label: "Splash-pad kid — water wings", category: "character", halfWidth: 0.38, halfDepth: 0.38, colliders: [], warnForOverlap: false, gameplayRole: "splash-kid" },
  { assetId: "plaza.splash-faucet", label: "Splash-pad faucet", category: "gameplay", halfWidth: 0.4, halfDepth: 0.28, colliders: [{ shape: "circle", x: 0, z: 0, radius: 0.2 }], warnForOverlap: false, controller: { interactionOffset: { x: 0, y: 0.58, z: -0.19 }, range: 1.05 } },
  { assetId: "prop.beer-can", label: "Little beer can", category: "prop", halfWidth: 0.09, halfDepth: 0.09, colliders: [], warnForOverlap: false, carryable: { interactionRange: 0.95, carryHeight: 0.72, carryDistance: 0.54 } },
  { assetId: "prop.trash-bag", label: "Janitor's trash bag", category: "prop", halfWidth: 0.24, halfDepth: 0.18, colliders: [], warnForOverlap: false, cleanupRole: "trash-bag", carryable: { interactionRange: 1, carryHeight: 0.68, carryDistance: 0.48, stealableWhileHeld: true } },
  { assetId: "prop.litter-picker", label: "Janitor's litter picker", category: "prop", halfWidth: 0.12, halfDepth: 0.78, colliders: [], warnForOverlap: false, cleanupRole: "litter-picker", carryable: { interactionRange: 1.5, carryHeight: 0.16, carryDistance: 0.45, stealableWhileHeld: true } },
  { assetId: "litter.chip-bag", label: "Chip bag", category: "prop", halfWidth: 0.16, halfDepth: 0.11, colliders: [], warnForOverlap: false, cleanupRole: "litter", cleanupRange: 0.72, carryable: { interactionRange: 0.9, carryHeight: 0.7, carryDistance: 0.5 } },
  { assetId: "litter.crumpled-paper", label: "Crumpled paper", category: "prop", halfWidth: 0.12, halfDepth: 0.12, colliders: [], warnForOverlap: false, cleanupRole: "litter", cleanupRange: 0.72, carryable: { interactionRange: 0.9, carryHeight: 0.7, carryDistance: 0.5 } },
  { assetId: "litter.food-tray", label: "Paper food tray", category: "prop", halfWidth: 0.22, halfDepth: 0.16, colliders: [], warnForOverlap: false, cleanupRole: "litter", cleanupRange: 0.72, carryable: { interactionRange: 0.9, carryHeight: 0.68, carryDistance: 0.5 } },
  { assetId: "gameplay.shop-entrance", label: "Shop entrance", category: "gameplay", halfWidth: 0.72, halfDepth: 0.42, colliders: [], warnForOverlap: false, gameplayRole: "shop-entrance" },
  { assetId: "plaza.planter-cluster", label: "Planter cluster", category: "planting", halfWidth: 22, halfDepth: 18, colliders: [
    { shape: "box", x: 19.35, z: -7.2, halfWidth: 1.45, halfDepth: 3.3 },
    { shape: "box", x: 19.35, z: 6.2, halfWidth: 1.45, halfDepth: 3.1 },
    { shape: "box", x: 7.8, z: 16.7, halfWidth: 3.5, halfDepth: 1.3 },
  ], warnForOverlap: false },
  { assetId: "plaza.planter-east-north", label: "East north planter", category: "planting", halfWidth: 1.45, halfDepth: 3.3, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 1.45, halfDepth: 3.3 }], warnForOverlap: false },
  { assetId: "plaza.planter-east-south", label: "East south planter", category: "planting", halfWidth: 1.45, halfDepth: 3.1, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 1.45, halfDepth: 3.1 }], warnForOverlap: false },
  { assetId: "plaza.planter-south", label: "South planter", category: "planting", halfWidth: 3.5, halfDepth: 1.3, colliders: [{ shape: "box", x: 0, z: 0, halfWidth: 3.5, halfDepth: 1.3 }], warnForOverlap: false },
  { assetId: "nature.deciduous-tree", label: "Deciduous tree", category: "planting", halfWidth: 5, halfDepth: 3.8, colliders: [{ shape: "circle", x: 0, z: 0, radius: 0.67 }], occludesCamera: true },
  { assetId: "plaza.tree-cluster", label: "Tree cluster", category: "planting", halfWidth: 22, halfDepth: 18, colliders: [] , occludesCamera: true, warnForOverlap: false },
  { assetId: "plaza.string-lights", label: "String-light span", category: "lighting", halfWidth: 19, halfDepth: 11, colliders: [], warnForOverlap: false },
] as const;

export const WORLD_ASSET_IDS = WORLD_ASSETS.map((asset) => asset.assetId);

export function getWorldAsset(assetId: string): WorldAssetDefinition | undefined {
  return WORLD_ASSETS.find((asset) => asset.assetId === assetId);
}
