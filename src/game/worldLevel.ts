import { getWorldAsset, type WorldAssetCollider } from "./worldAssets.ts";
import { CENTRAL_PLAZA_AREA_ID, COFFEE_SHOP_AREA_ID, isWorldChunkPlayable, type WorldArea, type WorldAreaTransition, type WorldInstance } from "./worldLayout.ts";
import { SPLASH_KID_FLEE_SPEED, SPLASH_KID_PLAY_SPEEDS, splashKidVariantOf } from "./splashKidTuning.ts";
import { BAKER_TUNING, BARISTA_TUNING, cafeVariantOf, CUSTOMER_SHARED_TUNING, CUSTOMER_TUNING } from "./cafeTuning.ts";
import { ENTER_SHOP_FACT_ID, ENTER_SHOP_OBJECTIVE_ID, VILLAGE_TASKS } from "./challenges.ts";
import type { AreaTransitionDefinition, PlacementSurface, Position, WorldEntityDefinition, WorldRules } from "./simulation/Simulation.ts";
import type { BaristaDefinition, CafeCrewDefinition, CafeRoutes, CustomerDefinition, PatronDefinition, PatronService, WorkerDefinition, WorkerStation, WorkerTask } from "./simulation/cafeCrew.ts";
import type { DogDefinition, TownGraph, TownSeat, TownsfolkDefinition, TownspersonDefinition, TownSpot } from "./simulation/townsfolk.ts";
import type { MusicianDefinition } from "./simulation/musician.ts";
import { MUSICIAN_STAGE_PLACES, MUSICIAN_TUNING } from "./musicianTuning.ts";
import { BENCH_SEAT_HEIGHT, CAFE_PATRON, DOG_TUNING, TOWNSFOLK_PASTIME_SECONDS, TOWNSFOLK_PASTIMES, TOWNSFOLK_REACTIONS, TOWNSFOLK_RUNNERS, TOWNSFOLK_WALK_SPEEDS,
  TOWNSFOLK_WALKER, townsfolkLookOf } from "./townsfolkTuning.ts";

export const WORLD_GOOSE_RADIUS = 0.34;
export const MAX_WALKABLE_STEP = 0.22;
export { ENTER_SHOP_FACT_ID, ENTER_SHOP_OBJECTIVE_ID };

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
/** How far out in front of the stage the goose starts in the square. */
const PLAZA_SPAWN_STAGE_DISTANCE = 8;

function local(instance: WorldInstance, x: number, z: number): { x: number; z: number } {
  const dx = x - instance.transform.x; const dz = z - instance.transform.z;
  const c = Math.cos(instance.transform.rotationY); const s = Math.sin(instance.transform.rotationY);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
function worldPoint(instance: WorldInstance, x: number, z: number): Position {
  const c = Math.cos(instance.transform.rotationY); const s = Math.sin(instance.transform.rotationY);
  return { x: instance.transform.x + x * c + z * s, y: instance.transform.y, z: instance.transform.z - x * s + z * c };
}
function inside(localPoint: { x: number; z: number }, collider: WorldAssetCollider): boolean {
  if (collider.shape === "circle") { const dx = localPoint.x - collider.x; const dz = localPoint.z - collider.z; const radius = collider.radius ?? 0; return dx * dx + dz * dz < radius * radius; }
  return Math.abs(localPoint.x - collider.x) < (collider.halfWidth ?? 0) && Math.abs(localPoint.z - collider.z) < (collider.halfDepth ?? 0);
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
  return findWorldPlacementOverlaps(area, selected.assetId, selected.transform.x, selected.transform.z, instanceId);
}
/** Overlap warnings for a prospective placement, e.g. the editor's drag ghost. */
export function findWorldPlacementOverlaps(area: WorldArea, assetId: string, x: number, z: number, ignoreId?: string): string[] {
  const asset = getWorldAsset(assetId); if (!asset) return [];
  if (asset.warnForOverlap === false) return [];
  return area.instances.filter((other) => {
    if (other.id === ignoreId) return false;
    const otherAsset = getWorldAsset(other.assetId); if (!otherAsset || otherAsset.warnForOverlap === false) return false;
    return Math.hypot(x - other.transform.x, z - other.transform.z) < (Math.hypot(asset.halfWidth, asset.halfDepth) + Math.hypot(otherAsset.halfWidth, otherAsset.halfDepth)) * 0.82;
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

/** Flat tops (tables, counters, shelves) that dropped or placed items rest on. */
export function createAreaSurfaces(area: WorldArea): PlacementSurface[] {
  return area.instances.flatMap((item) => {
    const surface = getWorldAsset(item.assetId)?.placementSurface; if (!surface) return [];
    const center = worldPoint(item, surface.x ?? 0, surface.z ?? 0);
    return [{ id: item.id, kind: surface.kind, position: center, rotationY: item.transform.rotationY,
      halfWidth: surface.halfWidth, halfDepth: surface.halfDepth, height: surface.height }];
  });
}

function surfaceUnder(surfaces: readonly PlacementSurface[], x: number, z: number): PlacementSurface | undefined {
  return surfaces.filter((surface) => {
    const dx = x - surface.position.x; const dz = z - surface.position.z;
    const c = Math.cos(surface.rotationY); const s = Math.sin(surface.rotationY);
    return Math.abs(dx * c - dz * s) <= surface.halfWidth && Math.abs(dx * s + dz * c) <= surface.halfDepth;
  }).sort((left, right) => right.height - left.height)[0];
}

/** Interactive objects in an area, built from catalog capabilities; items placed on a top rest at its height. */
export function createAreaEntities(area: WorldArea, surfaces: readonly PlacementSurface[] = createAreaSurfaces(area)): WorldEntityDefinition[] {
  return area.instances.flatMap((item) => {
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
    const surface = asset.carryable ? surfaceUnder(surfaces, item.transform.x, item.transform.z) : undefined;
    return [{
      id: item.id, label: item.label,
      position: { x: item.transform.x, y: surface ? surface.position.y + surface.height : item.transform.y, z: item.transform.z },
      assetId: item.assetId,
      heading: item.transform.rotationY, active: asset.activeTarget?.initialActive,
      controller: asset.controller && link && interactionPoint ? { targetId: link.targetId, interactionPoint, interactionRange: asset.controller.range,
        momentary: asset.controller.momentary, verb: asset.controller.verb } : undefined,
      carryable: asset.carryable,
      cleanup: asset.cleanupRole ? { role: asset.cleanupRole, routeOrder: PLAZA_CLEANUP_ORDER[item.id], interactionRange: asset.cleanupRange,
        routeWaypoints: PLAZA_CLEANUP_ROUTES[item.id] } : undefined,
      tags: asset.tags, homeAreaId: area.id, essential: asset.essential, condition: asset.initialCondition,
    }];
  });
}

export function createCentralPlazaRules(area: WorldArea, transitions: readonly WorldAreaTransition[] = []): WorldRules {
  // Start out front of the stage, facing it, so the musician is close by; the
  // older entry points remain fallbacks when an authored square has no clear spot there.
  const stage = area.instances.find((item) => item.assetId === "oldtown.stage");
  const stageFront = stage ? worldPoint(stage, 0, PLAZA_SPAWN_STAGE_DISTANCE) : undefined;
  const entrance = [...(stageFront ? [stageFront] : []), { x: -24, z: -3 }, { x: 11.5, z: 10.5 }, { x: -12, z: -3 }]
    .find(point => isWorldAreaPlayable(area, point.x, point.z));
  if (!entrance) throw new Error("Central plaza has no clear entrance; clear a spawn location in the world editor");
  const surfaces = createAreaSurfaces(area);
  const entities = createAreaEntities(area, surfaces);
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
    observedTargetId: splashPad.id, walkSpeed: 1.76, guardRadius: 1.75, noticeRadius: 24,
    inspectSeconds: 3, scratchSeconds: 3, shooSeconds: 0.82,
    cleanup: hasCleanupRoute ? {
      emptySeconds: 1.8, pickupSeconds: 1.35, reactionSeconds: 0.75, toolSearchSeconds: 8,
      shooRadius: 2.6, shooReach: 1.05, jogSpeed: 3, fumbleRadius: 3.4,
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
        // Spread around the pad so a scare scatters the kids; the faucet side (-x) stays clear.
        retreatPositions: [[5.8,4.7], [5.8,-4.7], [-5.8,4.7], [-5.8,-4.7], [6.4,0], [0,6.2], [0,-6.2]].map(([x, z]) => worldPoint(splashPad, x, z)),
        playSpeed: SPLASH_KID_PLAY_SPEEDS[splashKidVariantOf(item.assetId) ?? "boots"], fleeSpeed: SPLASH_KID_FLEE_SPEED, threatRadius: 4.4,
        disappointedSeconds: 2, crySeconds: 3, splashSeconds: [3.2, 2.6, 3.8][index % 3],
      };
    }) : [];
  const walk = createWalkMap(area);
  const objectiveZones = entranceInstance ? [{ id: entranceInstance.id,
    position: { x: entranceInstance.transform.x, y: entranceInstance.transform.y, z: entranceInstance.transform.z },
    radius: 0.72, factId: ENTER_SHOP_FACT_ID, guardedBy: janitorInstance?.id }] : [];
  return {
    areaId: area.id,
    spawn: { x: entrance.x, y: getWorldGroundHeight(area, entrance.x, entrance.z)!, z: entrance.z },
    spawnHeading: stage && entrance === stageFront ? Math.atan2(-(stage.transform.x - entrance.x), -(stage.transform.z - entrance.z)) : 0,
    resolveMovement: (current, proposed, output) => { resolveWorldAreaMovement(area, current, proposed, output); },
    entities, janitor, splashKids, objectiveZones, surfaces, townsfolk: createPlazaTownsfolk(area, splashPad, entranceInstance, walk),
    musician: createPlazaMusician(area, entities, walk),
    objectives: VILLAGE_TASKS,
    transitions: createAreaTransitions(area, transitions),
  };
}

// --- Townsfolk ----------------------------------------------------------------------------------

/** Places people keep off while walking about: the splash pad (kids play there) and the playground. */
const PEDESTRIAN_KEEP_OUT = new Set(["plaza.splash-pad", "plaza.play-area"]);
const PEDESTRIAN_CLEARANCE = 0.4;
const TOWN_GRID_SPACING = 1.25;

/**
 * Where people may stand, sampled once onto a fine grid from the same catalog data
 * the goose's movement uses (ground surfaces, colliders, playable chunks), plus the
 * keep-out landmarks. Open means playable, not the lowered road, and not kept out.
 */
export interface WalkMap {
  open(x: number, z: number): boolean;
  /** Open with a little elbow room all round. */
  clear(x: number, z: number): boolean;
  segmentClear(a: Readonly<Position>, b: Readonly<Position>): boolean;
  /** Open all along the way, without the elbow room: fine for a single person's straight walk. */
  segmentOpen(a: Readonly<Position>, b: Readonly<Position>): boolean;
}
const WALK_CELL = 0.25;
export function createWalkMap(area: WorldArea): WalkMap {
  const keepOut = area.instances.filter((item) => PEDESTRIAN_KEEP_OUT.has(item.assetId));
  const grounds = area.instances.filter((item) => getWorldAsset(item.assetId)?.surfaceHeight !== undefined);
  const extent = (item: WorldInstance) => { const asset = getWorldAsset(item.assetId)!; return Math.hypot(asset.halfWidth, asset.halfDepth); };
  if (grounds.length === 0) return { open: () => false, clear: () => false, segmentClear: () => false, segmentOpen: () => false };
  const minX = Math.min(...grounds.map((item) => item.transform.x - extent(item))); const maxX = Math.max(...grounds.map((item) => item.transform.x + extent(item)));
  const minZ = Math.min(...grounds.map((item) => item.transform.z - extent(item))); const maxZ = Math.max(...grounds.map((item) => item.transform.z + extent(item)));
  const width = Math.ceil((maxX - minX) / WALK_CELL) + 1; const depth = Math.ceil((maxZ - minZ) / WALK_CELL) + 1;
  const priority = new Float32Array(width * depth).fill(-Infinity); const height = new Float32Array(width * depth).fill(NaN);
  const blocked = new Uint8Array(width * depth);
  const cellX = (i: number) => minX + i * WALK_CELL; const cellZ = (j: number) => minZ + j * WALK_CELL;
  /** Visits every cell whose centre lies within `radius` of the instance origin. */
  const cellsNear = (item: WorldInstance, radius: number, visit: (index: number, localX: number, localZ: number) => void) => {
    const i0 = Math.max(0, Math.floor((item.transform.x - radius - minX) / WALK_CELL)); const i1 = Math.min(width - 1, Math.ceil((item.transform.x + radius - minX) / WALK_CELL));
    const j0 = Math.max(0, Math.floor((item.transform.z - radius - minZ) / WALK_CELL)); const j1 = Math.min(depth - 1, Math.ceil((item.transform.z + radius - minZ) / WALK_CELL));
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) {
      const point = local(item, cellX(i), cellZ(j)); visit(j * width + i, point.x, point.z);
    }
  };
  for (const item of grounds) {
    const asset = getWorldAsset(item.assetId)!; const surface = item.transform.y + asset.surfaceHeight!; const rank = asset.surfacePriority ?? 0;
    cellsNear(item, extent(item), (index, x, z) => {
      if (Math.abs(x) > asset.halfWidth || Math.abs(z) > asset.halfDepth) return;
      if (rank > priority[index] || (rank === priority[index] && surface > height[index])) { priority[index] = rank; height[index] = surface; }
    });
  }
  for (const item of area.instances) {
    const asset = getWorldAsset(item.assetId); if (!asset || asset.colliders.length === 0) continue;
    const radius = Math.max(...asset.colliders.map((collider) => Math.hypot(collider.x, collider.z)
      + (collider.shape === "circle" ? collider.radius ?? 0 : Math.hypot(collider.halfWidth ?? 0, collider.halfDepth ?? 0)))) + WORLD_GOOSE_RADIUS;
    cellsNear(item, radius, (index, x, z) => { if (asset.colliders.some((collider) => overlaps({ x, z }, collider))) blocked[index] = 1; });
  }
  for (const item of keepOut) cellsNear(item, extent(item), (index, x, z) => {
    const asset = getWorldAsset(item.assetId)!; if (Math.abs(x) <= asset.halfWidth && Math.abs(z) <= asset.halfDepth) blocked[index] = 1;
  });
  const open = (x: number, z: number) => {
    const i = Math.round((x - minX) / WALK_CELL); const j = Math.round((z - minZ) / WALK_CELL);
    if (i < 0 || j < 0 || i >= width || j >= depth) return false;
    const index = j * width + i;
    return blocked[index] === 0 && height[index] >= -0.01 && isWorldChunkPlayable(area, x, z);
  };
  const clear = (x: number, z: number) => open(x, z)
    && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => open(x + dx * PEDESTRIAN_CLEARANCE, z + dz * PEDESTRIAN_CLEARANCE));
  const along = (test: (x: number, z: number) => boolean) => (a: Readonly<Position>, b: Readonly<Position>) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z); const steps = Math.max(1, Math.ceil(length / 0.25));
    for (let step = 1; step < steps; step += 1) { const t = step / steps; if (!test(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false; }
    return true;
  };
  return { open, clear, segmentClear: along(clear), segmentOpen: along(open) };
}

/**
 * A walking graph over the square's open paving, rebuilt from the layout so it
 * follows the editor: a grid of clear points joined where the way between them is
 * clear, plus the extra points people head for (bench fronts, viewing spots, doors).
 */
export function createTownGraph(area: WorldArea, destinations: readonly Readonly<Position>[], walk = createWalkMap(area)): TownGraph {
  const grounds = area.instances.filter((item) => getWorldAsset(item.assetId)?.surfaceHeight !== undefined);
  if (grounds.length === 0) return { nodes: [], edges: [] };
  const reach = (item: WorldInstance) => { const asset = getWorldAsset(item.assetId)!; return Math.max(asset.halfWidth, asset.halfDepth); };
  const minX = Math.min(...grounds.map((item) => item.transform.x - reach(item))); const maxX = Math.max(...grounds.map((item) => item.transform.x + reach(item)));
  const minZ = Math.min(...grounds.map((item) => item.transform.z - reach(item))); const maxZ = Math.max(...grounds.map((item) => item.transform.z + reach(item)));
  const nodes: Position[] = []; const grid = new Map<string, number>();
  for (let gx = Math.ceil(minX / TOWN_GRID_SPACING); gx * TOWN_GRID_SPACING <= maxX; gx += 1) {
    for (let gz = Math.ceil(minZ / TOWN_GRID_SPACING); gz * TOWN_GRID_SPACING <= maxZ; gz += 1) {
      const x = gx * TOWN_GRID_SPACING; const z = gz * TOWN_GRID_SPACING;
      if (!walk.clear(x, z)) continue;
      grid.set(`${gx},${gz}`, nodes.length); nodes.push(position(x, z));
    }
  }
  const edges: [number, number][] = [];
  for (const [key, index] of grid) {
    const [gx, gz] = key.split(",").map(Number);
    for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const other = grid.get(`${gx + dx},${gz + dz}`);
      if (other !== undefined && walk.segmentOpen(nodes[index], nodes[other])) edges.push([index, other]);
    }
  }
  const gridCount = nodes.length;
  for (const destination of destinations) {
    const index = nodes.length; nodes.push(position(destination.x, destination.z));
    const near = nodes.slice(0, gridCount).map((node, other) => ({ other, distance: Math.hypot(node.x - destination.x, node.z - destination.z) }))
      .filter((candidate) => candidate.distance < TOWN_GRID_SPACING * 2).sort((a, b) => a.distance - b.distance);
    let linked = 0;
    for (const { other } of near) {
      if (linked >= 3) break;
      // The last step onto a door or seat front may brush a facade or bench; only the approach must be clear.
      if (walk.segmentClear(nodes[other], destination)) { edges.push([index, other]); linked += 1; }
    }
    if (linked === 0 && near[0]) edges.push([index, near[0].other]);
  }
  return { nodes, edges };
}

/** Whether a point joins the main walking network (not a pocket hemmed in by furniture). */
function onMainNetwork(graph: TownGraph): (point: Readonly<Position>) => boolean {
  const links = graph.nodes.map((): number[] => []);
  for (const [a, b] of graph.edges) { links[a].push(b); links[b].push(a); }
  const group = new Int32Array(graph.nodes.length).fill(-1); const sizes: number[] = [];
  for (let seed = 0; seed < graph.nodes.length; seed += 1) {
    if (group[seed] >= 0) continue;
    const id = sizes.length; let size = 0; const stack = [seed]; group[seed] = id;
    while (stack.length > 0) { const node = stack.pop()!; size += 1; for (const next of links[node]) if (group[next] < 0) { group[next] = id; stack.push(next); } }
    sizes.push(size);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  return (point) => {
    let best = -1; let bestDistance = Infinity;
    graph.nodes.forEach((node, index) => { const d = Math.hypot(node.x - point.x, node.z - point.z); if (d < bestDistance) { bestDistance = d; best = index; } });
    return best >= 0 && group[best] === main;
  };
}

/** Two seats on each bench, facing out from its backrest, with a clear spot in front to stand. */
function benchSeats(area: WorldArea, walk: WalkMap): TownSeat[] {
  return area.instances.filter((item) => item.assetId === "oldtown.bench").flatMap((bench) => [-0.52, 0.52].flatMap((x, index) => {
    const seatAt = worldPoint(bench, x, 0.04); const approach = worldPoint(bench, x, 0.95);
    if (!walk.open(approach.x, approach.z)) return [];
    return [{ id: `${bench.id}#${index}`, position: { ...seatAt, y: bench.transform.y }, heading: bench.transform.rotationY + Math.PI, approach }];
  }));
}

function createPlazaTownsfolk(area: WorldArea, splashPad?: WorldInstance, entrance?: WorldInstance, walk = createWalkMap(area)): TownsfolkDefinition | undefined {
  const parents = area.instances.filter((item) => getWorldAsset(item.assetId)?.gameplayRole === "town-parent");
  const walkers = area.instances.filter((item) => getWorldAsset(item.assetId)?.gameplayRole === "town-walker");
  const dogInstances = area.instances.filter((item) => getWorldAsset(item.assetId)?.gameplayRole === "town-dog");
  if (parents.length + walkers.length + dogInstances.length === 0) return undefined;
  const seats = benchSeats(area, walk);
  const distance = (a: Readonly<{ x: number; z: number }>, b: Readonly<{ x: number; z: number }>) => Math.hypot(a.x - b.x, a.z - b.z);
  const at = (item: WorldInstance): Position => ({ x: item.transform.x, y: item.transform.y, z: item.transform.z });
  const watch = splashPad ? at(splashPad) : undefined;

  // A parent authored by a bench sits on its nearest seat; the rest stand where they were placed.
  const people: TownspersonDefinition[] = [];
  const parentSeats = new Map<string, TownSeat>();
  for (const item of parents) {
    const look = townsfolkLookOf(item.assetId); if (!look) continue;
    const seat = seats.filter((candidate) => distance(candidate.position, item.transform) < 1.3 && ![...parentSeats.values()].includes(candidate))
      .sort((a, b) => distance(a.position, item.transform) - distance(b.position, item.transform))[0];
    if (seat) parentSeats.set(item.id, seat);
    people.push({ id: item.id, look, role: "parent", position: seat ? { ...seat.position } : at(item), heading: seat ? seat.heading : item.transform.rotationY,
      walkSpeed: TOWNSFOLK_WALK_SPEEDS[look], seat, watch, pastimes: TOWNSFOLK_PASTIMES[look] });
  }
  // The dog keeps the nearest parent company: on the bench beside them (to their right, where they can stroke it), or at their feet.
  const dogs: DogDefinition[] = []; const dogSpots: Position[] = [];
  for (const item of dogInstances) {
    const owner = people.filter((person) => distance(person.position, item.transform) < 4)
      .sort((a, b) => distance(a.position, item.transform) - distance(b.position, item.transform))[0];
    let spot = at(item); let heading = item.transform.rotationY;
    if (owner?.seat) {
      const right = { x: Math.cos(owner.seat.heading), z: -Math.sin(owner.seat.heading) };
      const beside = { x: owner.seat.position.x + right.x * 0.95, z: owner.seat.position.z + right.z * 0.95 };
      const bench = area.instances.find((candidate) => candidate.assetId === "oldtown.bench" && isInsideAsset(candidate, beside.x, beside.z));
      if (bench) { spot = { x: beside.x, y: bench.transform.y + BENCH_SEAT_HEIGHT, z: beside.z }; heading = owner.seat.heading; }
    }
    dogSpots.push(spot);
    dogs.push({ id: item.id, position: spot, heading, ownerId: owner?.id, ...DOG_TUNING });
  }
  for (const item of walkers) {
    const look = townsfolkLookOf(item.assetId); if (!look) continue;
    people.push({ id: item.id, look, role: "walker", position: at(item), heading: item.transform.rotationY,
      walkSpeed: TOWNSFOLK_WALK_SPEEDS[look], runs: TOWNSFOLK_RUNNERS.includes(look), pastimes: TOWNSFOLK_PASTIMES[look] });
  }

  // Seats free for passers-by: not a parent's, and not where the dog is.
  const freeSeats = seats.filter((seat) => ![...parentSeats.values()].includes(seat) && !dogSpots.some((spot) => distance(spot, seat.position) < 0.6));
  // Places worth stopping at: around the fountain and along the splash pad, facing in.
  const sights: TownSpot[] = [];
  const ringAround = (item: WorldInstance, radius: number, count: number) => {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const x = item.transform.x + Math.sin(angle) * radius; const z = item.transform.z + Math.cos(angle) * radius;
      if (walk.clear(x, z)) sights.push({ position: position(x, z), heading: Math.atan2(-(item.transform.x - x), -(item.transform.z - z)) });
    }
  };
  const squares = area.instances.filter((item) => item.assetId === "plaza.paving-base");
  const fountain = area.instances.find((item) => item.assetId === "plaza.goose-fountain");
  if (fountain) ringAround(fountain, 4.4, 8);
  if (splashPad) ringAround(splashPad, (getWorldAsset(splashPad.assetId)?.halfWidth ?? 4.9) + 1.1, 8);
  const doors: TownSpot[] = entrance ? [{ position: worldPoint(entrance, 0, 0.35), heading: entrance.transform.rotationY }] : [];
  const graph = createTownGraph(area, [...freeSeats.map((seat) => seat.approach), ...sights.map((spot) => spot.position), ...doors.map((door) => door.position),
    ...parents.map(at), ...walkers.map(at)], walk);
  // Only offer places people can actually get to.
  const reachable = onMainNetwork(graph);
  return {
    people, dogs, graph, seats: freeSeats.filter((seat) => reachable(seat.approach)), sights: sights.filter((spot) => reachable(spot.position)),
    doors: doors.filter((door) => reachable(door.position)),
    reactions: TOWNSFOLK_REACTIONS, pastimeSeconds: TOWNSFOLK_PASTIME_SECONDS, walker: TOWNSFOLK_WALKER,
    canStand: walk.open, canPass: walk.segmentOpen,
    // Passers-by keep to the paved squares rather than the approaches behind the shops.
    roams: (x, z) => squares.length === 0 || squares.some((item) => isInsideAsset(item, x, z)),
  };
}

// --- Sight ---------------------------------------------------------------------------------------

const SIGHT_CELL = 0.25;
/**
 * Whether anything that blocks sight (walls, buildings, the brewery tank) stands
 * between two points, rasterised once from the catalog's sight shapes. Separate
 * from walking: a bench stops the goose but nobody's view.
 */
export function createSightMap(area: WorldArea): (a: Readonly<{ x: number; z: number }>, b: Readonly<{ x: number; z: number }>) => boolean {
  const blockers = area.instances.flatMap((item) => {
    const asset = getWorldAsset(item.assetId); if (!asset?.blocksSight) return [];
    const shapes = asset.sightBlockers ?? asset.colliders;
    return shapes.length > 0 ? [{ item, shapes }] : [];
  });
  if (blockers.length === 0) return () => true;
  const reach = (shapes: readonly WorldAssetCollider[]) => Math.max(...shapes.map((shape) => Math.hypot(shape.x, shape.z)
    + (shape.shape === "circle" ? shape.radius ?? 0 : Math.hypot(shape.halfWidth ?? 0, shape.halfDepth ?? 0))));
  const minX = Math.min(...blockers.map(({ item, shapes }) => item.transform.x - reach(shapes)));
  const maxX = Math.max(...blockers.map(({ item, shapes }) => item.transform.x + reach(shapes)));
  const minZ = Math.min(...blockers.map(({ item, shapes }) => item.transform.z - reach(shapes)));
  const maxZ = Math.max(...blockers.map(({ item, shapes }) => item.transform.z + reach(shapes)));
  const width = Math.ceil((maxX - minX) / SIGHT_CELL) + 1; const depth = Math.ceil((maxZ - minZ) / SIGHT_CELL) + 1;
  const blocked = new Uint8Array(width * depth);
  for (const { item, shapes } of blockers) {
    const radius = reach(shapes);
    const i0 = Math.max(0, Math.floor((item.transform.x - radius - minX) / SIGHT_CELL)); const i1 = Math.min(width - 1, Math.ceil((item.transform.x + radius - minX) / SIGHT_CELL));
    const j0 = Math.max(0, Math.floor((item.transform.z - radius - minZ) / SIGHT_CELL)); const j1 = Math.min(depth - 1, Math.ceil((item.transform.z + radius - minZ) / SIGHT_CELL));
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) {
      const point = local(item, minX + i * SIGHT_CELL, minZ + j * SIGHT_CELL);
      if (shapes.some((shape) => inside(point, shape))) blocked[j * width + i] = 1;
    }
  }
  const solid = (x: number, z: number) => {
    const i = Math.round((x - minX) / SIGHT_CELL); const j = Math.round((z - minZ) / SIGHT_CELL);
    return i >= 0 && j >= 0 && i < width && j < depth && blocked[j * width + i] === 1;
  };
  return (a, b) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z); const steps = Math.max(1, Math.ceil(length / (SIGHT_CELL * 0.8)));
    for (let step = 1; step < steps; step += 1) { const t = step / steps; if (solid(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false; }
    return true;
  };
}

// --- Street musician ------------------------------------------------------------------------------

/**
 * The musician plays on the stage nearest where they were placed, beside their
 * guitar's stand; the way down the steps, the break spot, and the places they
 * search all follow the stage, so moving it in the editor brings them along.
 */
function createPlazaMusician(area: WorldArea, entities: readonly WorldEntityDefinition[], walk: WalkMap): MusicianDefinition | undefined {
  const item = area.instances.find((candidate) => getWorldAsset(candidate.assetId)?.gameplayRole === "musician");
  if (!item) return undefined;
  const near = (point: Readonly<{ x: number; z: number }>) => Math.hypot(point.x - item.transform.x, point.z - item.transform.z);
  const guitar = entities.filter((entity) => entity.tags?.includes("guitar") && entity.carryable?.drag).sort((a, b) => near(a.position) - near(b.position))[0];
  if (!guitar) return undefined;
  const stage = area.instances.filter((candidate) => candidate.assetId === "oldtown.stage" && isInsideAsset(candidate, item.transform.x, item.transform.z))[0];
  const places = MUSICIAN_STAGE_PLACES;
  const ground = (point: Readonly<{ x: number; z: number }>): Position => position(point.x, point.z);
  /** The nearest open paving to a point, so a moved stage never strands anyone. */
  const openNear = (point: Position): Position => {
    if (walk.clear(point.x, point.z)) return point;
    for (let radius = 0.5; radius <= 4; radius += 0.5) for (let index = 0; index < 12; index += 1) {
      const angle = index / 12 * Math.PI * 2; const x = point.x + Math.sin(angle) * radius; const z = point.z + Math.cos(angle) * radius;
      if (walk.clear(x, z)) return position(x, z);
    }
    return point;
  };
  const homeY = stage ? stage.transform.y + places.stageTop : item.transform.y;
  const home = { position: { x: item.transform.x, y: homeY, z: item.transform.z }, heading: item.transform.rotationY };
  let stageExit: Position[] = [];
  let breakAt: Position; let searchSpots: Position[];
  if (stage) {
    const at = local(stage, item.transform.x, item.transform.z);
    const across = Math.max(-4.5, Math.min(4.5, at.x));
    stageExit = [{ ...home.position }, { ...worldPoint(stage, across, places.stepsTop), y: homeY }, openNear(ground(worldPoint(stage, across, places.stepsFoot)))];
    breakAt = openNear(ground(worldPoint(stage, places.breakSpot.x, places.breakSpot.z)));
    searchSpots = places.searchSpots.map((spot) => ground(worldPoint(stage, spot.x, spot.z))).filter((spot) => walk.clear(spot.x, spot.z));
  } else {
    breakAt = openNear(position(item.transform.x - Math.sin(home.heading) * 8, item.transform.z - Math.cos(home.heading) * 8));
    searchSpots = [];
  }
  const graph = createTownGraph(area, [...stageExit.slice(-1), breakAt, ...searchSpots], walk);
  return {
    id: item.id, home, stageExit, guitarId: guitar.id, standPosition: { ...guitar.position },
    breakSpot: { position: breakAt, heading: Math.atan2(-(guitar.position.x - breakAt.x), -(guitar.position.z - breakAt.z)) },
    searchSpots, graph, canPass: walk.segmentOpen, canSee: createSightMap(area), tuning: MUSICIAN_TUNING,
  };
}

function authoredSpawn(area: WorldArea, candidates: readonly Readonly<{ x: number; z: number }>[]): Position {
  const point = candidates.find((candidate) => isWorldAreaPlayable(area, candidate.x, candidate.z));
  if (!point) throw new Error(`${area.label} has no clear playable spawn; add a floor and clear an entrance`);
  return { x: point.x, y: getWorldGroundHeight(area, point.x, point.z) ?? 0, z: point.z };
}

/** Aisle points people walk between: behind the counter, around its ends, and between the tables. */
const COFFEE_SHOP_ROUTES: CafeRoutes = {
  nodes: [
    position(-7.65, -4.75), position(-7.65, -1), position(-7.65, 2.75), // 0-2 behind the counter
    position(-5.1, -4.75), position(-5.1, -1), position(-5.1, 2.75), // 3-5 customer side of the counter
    position(-0.3, -1.35), position(3.75, -1.35), position(7.6, -1.35), // 6-8 middle aisle
    position(-0.3, -6), position(3.75, -6), position(7.6, -6), // 9-11 along the north wall
    position(-0.3, 3.7), position(3.75, 3.7), position(7.6, 3.7), // 12-14 near the front windows
    position(0, 5.6), // 15 front door
    position(-6.5, -6.2), position(-6.5, -7.9), // 16-17 either side of the kitchen doorway
    position(-6.8, -9.2), position(-6.8, -11.9), position(-2.2, -11.9), position(-2.2, -9.2), // 18-21 around the kitchen prep table
  ],
  edges: [[0, 1], [1, 2], [0, 3], [2, 5], [3, 4], [4, 5], [4, 6], [3, 9], [5, 12], [6, 7], [7, 8], [9, 10], [10, 11],
    [12, 13], [13, 14], [6, 9], [6, 12], [7, 10], [7, 13], [8, 11], [8, 14], [12, 15], [5, 15],
    [0, 16], [3, 16], [9, 16], [16, 17], [17, 18], [18, 19], [19, 20], [20, 21], [21, 18]],
};

/** What a kitchen worker does at each piece of equipment, in the order they visit them. */
const KITCHEN_STATIONS: Readonly<Record<string, WorkerTask>> = {
  "coffee.prep-table": "kneading", "coffee.kitchen-oven": "baking", "coffee.pastry-rack": "stocking", "coffee.kitchen-sink": "washing",
};

function createCoffeeShopCrew(area: WorldArea, surfaces: readonly PlacementSurface[], entities: readonly WorldEntityDefinition[],
  exitPoint?: Readonly<Position>): CafeCrewDefinition | undefined {
  const counter = area.instances.find((item) => item.assetId === "coffee.counter");
  const baristaInstance = area.instances.find((item) => getWorldAsset(item.assetId)?.gameplayRole === "barista");
  // Counter-local frame: +z faces the customers, -z is the barista's walkway.
  const station = (x: number, z: number, facingCustomers: boolean) => counter
    ? { position: worldPoint(counter, x, z), heading: counter.transform.rotationY + (facingCustomers ? Math.PI : 0) } : undefined;
  let barista: BaristaDefinition | undefined;
  if (counter && baristaInstance) {
    const corners = [[-3.1, -2.4], [3.1, -2.4], [-3.1, -0.7], [3.1, -0.7]].map(([x, z]) => worldPoint(counter, x, z));
    barista = {
      id: baristaInstance.id, variant: cafeVariantOf(baristaInstance.assetId) ?? "barista",
      position: { x: baristaInstance.transform.x, y: baristaInstance.transform.y, z: baristaInstance.transform.z }, heading: baristaInstance.transform.rotationY,
      register: station(1.8, -1.25, true)!, machine: station(0, -1.3, false)!, pickup: station(-2.5, -1.25, true)!,
      pickupApproach: worldPoint(counter, -2.5, 1.3),
      aisle: [worldPoint(counter, 3.6, -1.25), worldPoint(counter, -3.6, -1.25)],
      staffZone: { minX: Math.min(...corners.map((p) => p.x)), maxX: Math.max(...corners.map((p) => p.x)),
        minZ: Math.min(...corners.map((p) => p.z)) - 0.3, maxZ: Math.max(...corners.map((p) => p.z)) + 0.3 },
      ...BARISTA_TUNING, exitPoint,
    };
  }
  const tables = surfaces.filter((surface) => surface.kind === "table");
  const customers: CustomerDefinition[] = area.instances.filter((item) => getWorldAsset(item.assetId)?.gameplayRole === "cafe-customer").flatMap((item) => {
    const variant = cafeVariantOf(item.assetId); if (!variant || variant === "barista" || variant === "baker") return [];
    const seat = { x: item.transform.x, y: item.transform.y, z: item.transform.z };
    const table = tables.reduce<PlacementSurface | undefined>((best, surface) => !best
      || Math.hypot(surface.position.x - seat.x, surface.position.z - seat.z) < Math.hypot(best.position.x - seat.x, best.position.z - seat.z) ? surface : best, undefined);
    if (!table) return [];
    const toSeatX = seat.x - table.position.x; const toSeatZ = seat.z - table.position.z; const length = Math.hypot(toSeatX, toSeatZ) || 1;
    const drinkSpot = { x: table.position.x + toSeatX / length * 0.3 + toSeatZ / length * 0.25, y: table.position.y,
      z: table.position.z + toSeatZ / length * 0.3 - toSeatX / length * 0.25 };
    const mug = entities.find((entity) => entity.tags?.includes("drink") && !entity.tags.includes("order-cup")
      && surfaceUnder([table], entity.position.x, entity.position.z));
    return [{
      id: item.id, variant, seat, heading: item.transform.rotationY, tableSurfaceId: table.id, drinkSpot,
      drinkId: mug?.id, ordersDrinks: !mug, ...CUSTOMER_TUNING[variant], ...CUSTOMER_SHARED_TUNING,
    }];
  });
  // Kitchen staff stand in front of each work station, facing it, and work them in this order.
  const stationAssets = Object.keys(KITCHEN_STATIONS);
  const stations: WorkerStation[] = area.instances.filter((item) => stationAssets.includes(item.assetId))
    .sort((a, b) => stationAssets.indexOf(a.assetId) - stationAssets.indexOf(b.assetId) || a.id.localeCompare(b.id))
    .map((item) => ({ position: worldPoint(item, 0, (getWorldAsset(item.assetId)?.halfDepth ?? 0.5) + 0.55), heading: item.transform.rotationY,
      task: KITCHEN_STATIONS[item.assetId] }));
  const workers: WorkerDefinition[] = stations.length === 0 ? [] : area.instances
    .filter((item) => getWorldAsset(item.assetId)?.gameplayRole === "cafe-worker").map((item) => ({
      id: item.id, variant: cafeVariantOf(item.assetId) ?? "baker",
      position: { x: item.transform.x, y: item.transform.y, z: item.transform.z }, heading: item.transform.rotationY,
      stations, walkSpeed: BAKER_TUNING.walkSpeed, stationSeconds: BAKER_TUNING.stationSeconds, guardRadius: BAKER_TUNING.guardRadius,
      startleRadius: BAKER_TUNING.startleRadius, shooReach: BAKER_TUNING.shooReach, shooSeconds: BAKER_TUNING.shooSeconds,
    }));
  // Regulars share a table with a seated customer, so the empty table stays free for the goose's coffee break.
  const customerTables = new Set(customers.map((customer) => customer.tableSurfaceId));
  const seats = area.instances.filter((item) => item.assetId === "coffee.chair"
    && !customers.some((customer) => Math.hypot(customer.seat.x - item.transform.x, customer.seat.z - item.transform.z) < 0.3)
    && customerTables.has(tables.reduce<PlacementSurface | undefined>((best, surface) => !best || Math.hypot(surface.position.x - item.transform.x, surface.position.z - item.transform.z)
      < Math.hypot(best.position.x - item.transform.x, best.position.z - item.transform.z) ? surface : best, undefined)?.id ?? ""))
    .map((item) => ({ position: { x: item.transform.x, y: item.transform.y, z: item.transform.z }, heading: item.transform.rotationY }));
  const patronInstances = area.instances.filter((item) => getWorldAsset(item.assetId)?.gameplayRole === "cafe-patron");
  const patrons: PatronDefinition[] = patronInstances.flatMap((item, index) => {
    const look = townsfolkLookOf(item.assetId); if (!look) return [];
    // Half are already sitting when the goose walks in; the rest arrive one after another.
    return [{ id: item.id, variant: look, walkSpeed: TOWNSFOLK_WALK_SPEEDS[look], startleRadius: TOWNSFOLK_REACTIONS.startleRadius,
      personalRadius: TOWNSFOLK_REACTIONS.personalRadius, orderSeconds: CAFE_PATRON.orderSeconds, staySeconds: CAFE_PATRON.staySeconds,
      awaySeconds: CAFE_PATRON.awaySeconds, firstVisitSeconds: index % 2 === 0 ? 0 : 3 + index * 6 }];
  });
  const patronService: PatronService | undefined = patrons.length > 0 && counter && exitPoint && seats.length > 0 ? {
    door: { x: exitPoint.x, y: exitPoint.y, z: exitPoint.z - 0.6 }, counter: { position: worldPoint(counter, 1.8, 1.3), heading: counter.transform.rotationY },
    seats, pastimeSeconds: TOWNSFOLK_PASTIME_SECONDS,
  } : undefined;
  return barista || customers.length > 0 || workers.length > 0 ? { barista, customers, workers, routes: COFFEE_SHOP_ROUTES,
    patrons: patronService ? patrons : [], patronService } : undefined;
}

export function createCoffeeShopRules(area: WorldArea, transitions: readonly WorldAreaTransition[] = []): WorldRules {
  const spawn = authoredSpawn(area, [
    { x: 0, z: 5.6 },
    { x: 0, z: 4.4 },
    { x: 3.2, z: 5.6 },
    { x: -3.2, z: 5.6 },
  ]);
  const surfaces = createAreaSurfaces(area);
  const entities = createAreaEntities(area, surfaces);
  const exits = createAreaTransitions(area, transitions);
  return {
    areaId: area.id,
    spawn,
    spawnHeading: Math.PI,
    objectives: VILLAGE_TASKS,
    entities, surfaces, cafe: createCoffeeShopCrew(area, surfaces, entities, exits[0]?.triggerPosition),
    transitions: exits,
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
    objectives: VILLAGE_TASKS,
    entities: createAreaEntities(area), surfaces: createAreaSurfaces(area),
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
