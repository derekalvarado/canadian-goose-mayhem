import { getWorldAsset, type WorldAssetCollider } from "./worldAssets.ts";
import { CENTRAL_PLAZA_AREA_ID, FOUNTAIN_INSTANCE_ID, isWorldChunkPlayable, type WorldArea, type WorldInstance } from "./worldLayout.ts";
import type { Position, WorldRules } from "./simulation/Simulation.ts";
import { FOUNTAIN_OBJECTIVE_ID } from "./simulation/plaza.ts";

export const WORLD_GOOSE_RADIUS = 0.34;
export const MAX_WALKABLE_STEP = 0.22;

function local(instance: WorldInstance, x: number, z: number): { x: number; z: number } {
  const dx = x - instance.transform.x; const dz = z - instance.transform.z;
  const c = Math.cos(instance.transform.rotationY); const s = Math.sin(instance.transform.rotationY);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
function overlaps(localPoint: { x: number; z: number }, collider: WorldAssetCollider): boolean {
  if (collider.shape === "circle") { const dx = localPoint.x - collider.x; const dz = localPoint.z - collider.z; const radius = (collider.radius ?? 0) + WORLD_GOOSE_RADIUS; return dx * dx + dz * dz < radius * radius; }
  return Math.abs(localPoint.x - collider.x) < (collider.halfWidth ?? 0) + WORLD_GOOSE_RADIUS && Math.abs(localPoint.z - collider.z) < (collider.halfDepth ?? 0) + WORLD_GOOSE_RADIUS;
}
function isInsideAsset(instance: WorldInstance, x: number, z: number): boolean {
  const asset = getWorldAsset(instance.assetId); if (!asset) return false;
  const point = local(instance, x, z);
  return Math.abs(point.x) <= asset.halfWidth && Math.abs(point.z) <= asset.halfDepth;
}
/** Returns the topmost authored walking surface at a point, with stable tie-breaking. */
export function getWorldGroundHeight(area: WorldArea, x: number, z: number): number | undefined {
  const candidates = area.instances.flatMap((instance) => {
    const asset = getWorldAsset(instance.assetId);
    return asset?.surfaceHeight === undefined || !isInsideAsset(instance, x, z) ? [] : [{ height: instance.transform.y + asset.surfaceHeight, priority: asset.surfacePriority ?? 0, id: instance.id }];
  });
  candidates.sort((left, right) => right.priority - left.priority || right.height - left.height || left.id.localeCompare(right.id));
  return candidates[0]?.height;
}
export function isWorldAreaPlayable(area: WorldArea, x: number, z: number): boolean {
  if (!isWorldChunkPlayable(area, x, z) || getWorldGroundHeight(area, x, z) === undefined) return false;
  return !area.instances.some((instance) => {
    const asset = getWorldAsset(instance.assetId); if (!asset || asset.colliders.length === 0) return false;
    const point = local(instance, x, z); return asset.colliders.some((collider) => overlaps(point, collider));
  });
}
export function resolveWorldAreaMovement<T extends Position>(area: WorldArea, current: Readonly<Position>, proposed: Readonly<Position>, output: T): T {
  for (const [x, z] of [[proposed.x, proposed.z], [proposed.x, current.z], [current.x, proposed.z], [current.x, current.z]] as const) {
    const height = getWorldGroundHeight(area, x, z);
    if (height !== undefined && Math.abs(height - current.y) <= MAX_WALKABLE_STEP && isWorldAreaPlayable(area, x, z)) return Object.assign(output, { x, y: height, z });
  }
  return Object.assign(output, current);
}
export function findWorldInstanceOverlaps(area: WorldArea, instanceId: string): string[] {
  const selected = area.instances.find((item) => item.id === instanceId); if (!selected) return [];
  const asset = getWorldAsset(selected.assetId); if (!asset) return [];
  if (asset.warnForOverlap === false) return [];
  return area.instances.filter((other) => {
    if (other.id === selected.id) return false;
    const otherAsset = getWorldAsset(other.assetId); if (!otherAsset || otherAsset.warnForOverlap === false) return false;
    return Math.hypot(selected.transform.x - other.transform.x, selected.transform.z - other.transform.z) < (Math.hypot(asset.halfWidth, asset.halfDepth) + Math.hypot(otherAsset.halfWidth, otherAsset.halfDepth)) * 0.82;
  }).map((item) => item.id);
}
export function createCentralPlazaRules(area: WorldArea): WorldRules {
  const fountain = area.instances.find((item) => item.id === FOUNTAIN_INSTANCE_ID);
  if (!fountain) throw new Error("Central plaza is missing its goose fountain");
  const radius = getWorldAsset(fountain.assetId)?.colliders.find((item) => item.shape === "circle")?.radius ?? 3.35;
  // Preserve usable entry points when an older authored square is restored.
  const entrance = [{ x: -24, z: -3 }, { x: 11.5, z: 10.5 }, { x: -12, z: -3 }]
    .find(point => isWorldAreaPlayable(area, point.x, point.z));
  if (!entrance) throw new Error("Central plaza has no clear entrance; clear a spawn location in the world editor");
  return { spawn: { ...entrance, y: getWorldGroundHeight(area, entrance.x, entrance.z)! }, spawnHeading: 0, resolveMovement: (current, proposed, output) => { resolveWorldAreaMovement(area, current, proposed, output); }, objectives: [{ id: FOUNTAIN_OBJECTIVE_ID, description: "Find the goose fountain", isSatisfied: ({ position }) => Math.hypot(position.x - fountain.transform.x, position.z - fountain.transform.z) <= radius + 2.15 }] };
}

export { CENTRAL_PLAZA_AREA_ID };
