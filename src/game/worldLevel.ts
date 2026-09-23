import { getWorldAsset, type WorldAssetCollider } from "./worldAssets.ts";
import { CENTRAL_PLAZA_AREA_ID, COFFEE_SHOP_AREA_ID, isWorldChunkPlayable, type WorldArea, type WorldAreaTransition, type WorldInstance } from "./worldLayout.ts";
import type { AreaTransitionDefinition, Position, WorldEntityDefinition, WorldRules } from "./simulation/Simulation.ts";

export const WORLD_GOOSE_RADIUS = 0.34;
export const MAX_WALKABLE_STEP = 0.22;
export const ENTER_SHOP_OBJECTIVE_ID = "plaza.enter-north-shop";
export const ENTER_SHOP_FACT_ID = "plaza.entered-north-shop";

/** Hand-authored service corridors keep this contained routine out of plaza props without adding general navigation. */
const PLAZA_CLEANUP_ROUTES: Readonly<Record<string, readonly Readonly<Position>[]>> = {
  "plaza.janitor-trash-bag": [position(-20.5, -4.5), position(-17.5, -5), position(-13.5, -4.5), position(2, 6), position(14, -4), position(19, 10), position(20.5, 12)],
  "oldtown.bin-3": [position(20.5, 12), position(21.5, 8.5)],
  "oldtown.bin-2": [position(18, 7.5), position(7.5, -6), position(7.5, -7.5), position(8.5, -9.5), position(11.5, -10), position(13, -10)],
  "oldtown.bin-1": [position(10, -10), position(7, -8.5), position(6.5, -6.5), position(-12, 7), position(-11.5, 9.5)],
  "oldtown.bin-0": [position(-20, 0.5), position(-21, -5.5)],
  "plaza.janitor-litter-picker": [position(-20.5, -4.5)],
  "plaza.litter-chip-bag": [position(-17.5, -5)],
  "plaza.litter-crumpled-paper": [position(-13.5, -4.5), position(2, 6)],
  "plaza.litter-food-tray": [position(14, -4)],
};

/** Route order starts beside the worker and ends beside the first litter stop. */
const PLAZA_CLEANUP_ORDER: Readonly<Record<string, number>> = {
  "oldtown.bin-3": 0,
  "oldtown.bin-2": 1,
  "oldtown.bin-1": 2,
  "oldtown.bin-0": 3,
};

function position(x: number, z: number): Position { return { x, y: 0, z }; }

function local(instance: WorldInstance, x: number, z: number): { x: number; z: number } {
  const dx = x - instance.transform.x; const dz = z - instance.transform.z;
  const c = Math.cos(instance.transform.rotationY); const s = Math.sin(instance.transform.rotationY);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
function worldPoint(instance: WorldInstance, x: number, z: number): Position {
  const c = Math.cos(instance.transform.rotationY); const s = Math.sin(instance.transform.rotationY);
  return { x: instance.transform.x + x * c + z * s, y: instance.transform.y, z: instance.transform.z - x * s + z * c };
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
function createAreaTransitions(area: WorldArea, transitions: readonly WorldAreaTransition[]): AreaTransitionDefinition[] {
  return transitions.filter((transition) => transition.fromAreaId === area.id).map((transition) => {
    const source = area.instances.find((instance) => instance.id === transition.fromInstanceId);
    if (!source) throw new Error(`Transition ${transition.id} has no source instance in ${area.id}`);
    return {
      id: transition.id,
      toAreaId: transition.toAreaId,
      triggerPosition: { x: source.transform.x, y: source.transform.y, z: source.transform.z },
      triggerRadius: transition.triggerRadius,
      targetPosition: transition.targetPosition,
      targetHeading: transition.targetHeading,
    };
  });
}

export function createCentralPlazaRules(area: WorldArea, transitions: readonly WorldAreaTransition[] = []): WorldRules {
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
    if (!asset.activeTarget && !asset.carryable && !asset.cleanupRole && !(asset.controller && link && interactionPoint)) return [];
    return [{
      id: item.id, label: item.label, position: { x: item.transform.x, y: item.transform.y, z: item.transform.z },
      assetId: item.assetId,
      heading: item.transform.rotationY, active: asset.activeTarget?.initialActive,
      controller: asset.controller && link && interactionPoint ? { targetId: link.targetId, interactionPoint, interactionRange: asset.controller.range } : undefined,
      carryable: asset.carryable,
      cleanup: asset.cleanupRole ? { role: asset.cleanupRole, routeOrder: PLAZA_CLEANUP_ORDER[item.id], interactionRange: asset.cleanupRange,
        routeWaypoints: PLAZA_CLEANUP_ROUTES[item.id] } : undefined,
    }];
  });
  const janitorInstance = area.instances.find((item) => getWorldAsset(item.assetId)?.gameplayRole === "janitor");
  const entranceInstance = area.instances.find((item) => getWorldAsset(item.assetId)?.gameplayRole === "shop-entrance");
  const splashPad = area.instances.find((item) => getWorldAsset(item.assetId)?.activeTarget);
  const hasCleanupRoute = entities.some((entity) => entity.cleanup?.role === "trash-can")
    && entities.filter((entity) => entity.cleanup?.role === "trash-bag").length === 1
    && entities.filter((entity) => entity.cleanup?.role === "litter-picker").length === 1;
  const janitor = janitorInstance && entranceInstance && splashPad ? {
    id: janitorInstance.id,
    position: { x: janitorInstance.transform.x, y: janitorInstance.transform.y, z: janitorInstance.transform.z },
    heading: janitorInstance.transform.rotationY,
    guardPosition: { x: janitorInstance.transform.x, y: janitorInstance.transform.y, z: janitorInstance.transform.z },
    investigationPosition: { x: splashPad.transform.x - 4.7, y: splashPad.transform.y, z: splashPad.transform.z },
    observedTargetId: splashPad.id, walkSpeed: 2.2, guardRadius: 1.75, noticeRadius: 24,
    inspectSeconds: 3, scratchSeconds: 3, shooSeconds: 0.82,
    cleanup: hasCleanupRoute ? {
      emptySeconds: 1.8, pickupSeconds: 1.35, reactionSeconds: 0.75, toolSearchSeconds: 8,
      shooRadius: 2.6, shooReach: 1.05, jogSpeed: 3.35, fumbleRadius: 3.4,
    } : undefined,
  } : undefined;
  const splashKids = splashPad ? area.instances.filter((item) => getWorldAsset(item.assetId)?.gameplayRole === "splash-kid")
    .map((item, index) => {
      const routes = [
        [[-1.35,-0.85], [0.8,1.25], [1.55,-0.45], [-0.45,1.55]],
        [[0.9,1.15], [-1.4,0.55], [0.35,-1.45], [1.5,0.2]],
        [[1.2,-1.1], [-0.85,-1.45], [-1.55,0.25], [0.4,1.35]],
      ] as const;
      const route = routes[index % routes.length].map(([x, z]) => worldPoint(splashPad, x, z));
      return {
        id: item.id, position: { x: item.transform.x, y: item.transform.y, z: item.transform.z }, heading: item.transform.rotationY,
        observedTargetId: splashPad.id, playRoute: route,
        retreatPositions: [[5.8,4.7], [5.8,-4.7], [-5.8,4.7], [-5.8,-4.7]].map(([x, z]) => worldPoint(splashPad, x, z)),
        playSpeed: 1.35 + index * 0.08, fleeSpeed: 3.15, threatRadius: 4.4,
        disappointedSeconds: 2, crySeconds: 3,
      };
    }) : [];
  const objectiveZones = entranceInstance ? [{ id: entranceInstance.id,
    position: { x: entranceInstance.transform.x, y: entranceInstance.transform.y, z: entranceInstance.transform.z },
    radius: 0.72, factId: ENTER_SHOP_FACT_ID, guardedBy: janitorInstance?.id }] : [];
  return {
    areaId: area.id,
    spawn: { ...entrance, y: getWorldGroundHeight(area, entrance.x, entrance.z)! }, spawnHeading: 0,
    resolveMovement: (current, proposed, output) => { resolveWorldAreaMovement(area, current, proposed, output); },
    entities, janitor, splashKids, objectiveZones,
    objectives: [{ id: ENTER_SHOP_OBJECTIVE_ID, description: "Sneak into the coffee shop", isSatisfied: (world) => world.durableFacts.includes(ENTER_SHOP_FACT_ID) }],
    transitions: createAreaTransitions(area, transitions),
  };
}

function authoredSpawn(area: WorldArea, candidates: readonly Readonly<{ x: number; z: number }>[]): Position {
  const point = candidates.find((candidate) => isWorldAreaPlayable(area, candidate.x, candidate.z));
  if (!point) throw new Error(`${area.label} has no clear playable spawn; add a floor and clear an entrance`);
  return { x: point.x, y: getWorldGroundHeight(area, point.x, point.z) ?? 0, z: point.z };
}

export function createCoffeeShopRules(area: WorldArea, transitions: readonly WorldAreaTransition[] = []): WorldRules {
  const spawn = authoredSpawn(area, [
    { x: 0, z: 5.6 },
    { x: 0, z: 4.4 },
    { x: 3.2, z: 5.6 },
    { x: -3.2, z: 5.6 },
  ]);
  return {
    areaId: area.id,
    spawn,
    spawnHeading: Math.PI,
    objectives: [],
    transitions: createAreaTransitions(area, transitions),
    resolveMovement: (current, proposed, output) => { resolveWorldAreaMovement(area, current, proposed, output); },
  };
}

/** Fallback rules keep newly authored non-plaza areas testable before they gain bespoke gameplay. */
export function createAuthoredAreaRules(area: WorldArea, transitions: readonly WorldAreaTransition[] = []): WorldRules {
  const spawn = authoredSpawn(area, [
    { x: 0, z: 0 },
    { x: 0, z: 2 },
    { x: 2, z: 0 },
    { x: -2, z: 0 },
  ]);
  return {
    areaId: area.id,
    spawn,
    spawnHeading: 0,
    objectives: [],
    transitions: createAreaTransitions(area, transitions),
    resolveMovement: (current, proposed, output) => { resolveWorldAreaMovement(area, current, proposed, output); },
  };
}

export function createWorldRules(area: WorldArea, transitions: readonly WorldAreaTransition[] = []): WorldRules {
  if (area.id === CENTRAL_PLAZA_AREA_ID) return createCentralPlazaRules(area, transitions);
  if (area.id === COFFEE_SHOP_AREA_ID) return createCoffeeShopRules(area, transitions);
  return createAuthoredAreaRules(area, transitions);
}

export { CENTRAL_PLAZA_AREA_ID };
