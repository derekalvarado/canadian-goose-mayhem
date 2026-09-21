import { getWorldAsset, type WorldAssetCollider } from "./worldAssets.ts";
import { CENTRAL_PLAZA_AREA_ID, isWorldChunkPlayable, type WorldArea, type WorldInstance } from "./worldLayout.ts";
import type { Position, WorldEntityDefinition, WorldRules } from "./simulation/Simulation.ts";

export const WORLD_GOOSE_RADIUS = 0.34;
export const MAX_WALKABLE_STEP = 0.22;
export const ENTER_SHOP_OBJECTIVE_ID = "plaza.enter-north-shop";
export const ENTER_SHOP_FACT_ID = "plaza.entered-north-shop";

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
  // Preserve usable entry points when an older authored square is restored.
  const entrance = [{ x: -24, z: -3 }, { x: 11.5, z: 10.5 }, { x: -12, z: -3 }]
    .find(point => isWorldAreaPlayable(area, point.x, point.z));
  if (!entrance) throw new Error("Central plaza has no clear entrance; clear a spawn location in the world editor");
  const entities: WorldEntityDefinition[] = area.instances.flatMap((item) => {
    const asset = getWorldAsset(item.assetId); if (!asset) return [];
    const link = area.controlLinks.find((candidate) => candidate.controllerId === item.id);
    const offset = asset.controller?.interactionOffset;
    const cosine = Math.cos(item.transform.rotationY); const sine = Math.sin(item.transform.rotationY);
    const interactionPoint = offset ? {
      x: item.transform.x + offset.x * cosine + offset.z * sine,
      y: item.transform.y + offset.y,
      z: item.transform.z - offset.x * sine + offset.z * cosine,
    } : undefined;
    if (!asset.activeTarget && !asset.carryable && !(asset.controller && link && interactionPoint)) return [];
    return [{
      id: item.id, label: item.label, position: { x: item.transform.x, y: item.transform.y, z: item.transform.z },
      heading: item.transform.rotationY, active: asset.activeTarget?.initialActive,
      controller: asset.controller && link && interactionPoint ? { targetId: link.targetId, interactionPoint, interactionRange: asset.controller.range } : undefined,
      carryable: asset.carryable,
    }];
  });
  const janitorInstance = area.instances.find((item) => getWorldAsset(item.assetId)?.gameplayRole === "janitor");
  const entranceInstance = area.instances.find((item) => getWorldAsset(item.assetId)?.gameplayRole === "shop-entrance");
  const splashPad = area.instances.find((item) => getWorldAsset(item.assetId)?.activeTarget);
  const janitor = janitorInstance && entranceInstance && splashPad ? {
    id: janitorInstance.id,
    position: { x: janitorInstance.transform.x, y: janitorInstance.transform.y, z: janitorInstance.transform.z },
    heading: janitorInstance.transform.rotationY,
    guardPosition: { x: janitorInstance.transform.x, y: janitorInstance.transform.y, z: janitorInstance.transform.z },
    investigationPosition: { x: splashPad.transform.x - 4.7, y: splashPad.transform.y, z: splashPad.transform.z },
    observedTargetId: splashPad.id, walkSpeed: 2.2, guardRadius: 1.75, noticeRadius: 24,
    inspectSeconds: 3, scratchSeconds: 3, shooSeconds: 0.82,
  } : undefined;
  const objectiveZones = entranceInstance ? [{ id: entranceInstance.id,
    position: { x: entranceInstance.transform.x, y: entranceInstance.transform.y, z: entranceInstance.transform.z },
    radius: 0.72, factId: ENTER_SHOP_FACT_ID, guardedBy: janitorInstance?.id }] : [];
  return {
    spawn: { ...entrance, y: getWorldGroundHeight(area, entrance.x, entrance.z)! }, spawnHeading: 0,
    resolveMovement: (current, proposed, output) => { resolveWorldAreaMovement(area, current, proposed, output); },
    entities, janitor, objectiveZones,
    objectives: [{ id: ENTER_SHOP_OBJECTIVE_ID, description: "Sneak into the north shop", isSatisfied: (world) => world.durableFacts.includes(ENTER_SHOP_FACT_ID) }],
  };
}

export { CENTRAL_PLAZA_AREA_ID };
