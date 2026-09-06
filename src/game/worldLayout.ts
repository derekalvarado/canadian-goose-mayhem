import canonicalWorldLayoutJson from "./content/world-layout.json" with { type: "json" };
import { PLAZA_LAYOUT_STORAGE_KEY, type PlazaLayout, validatePlazaLayout } from "./plazaLayout.ts";
import { getWorldAsset } from "./worldAssets.ts";

export const WORLD_LAYOUT_SCHEMA_VERSION = 2;
export const WORLD_LAYOUT_STORAGE_KEY = "goose-game-2.world-layout.v1";
export const CENTRAL_PLAZA_AREA_ID = "old-town-square.central-plaza";
export const FOUNTAIN_INSTANCE_ID = "plaza.goose-fountain";
export const WORLD_CHUNK_SIZE = 64;

export interface WorldTransform { x: number; y: number; z: number; rotationY: number }
export interface WorldInstance { id: string; assetId: string; label: string; transform: WorldTransform }
export interface WorldChunk { x: number; z: number; playable: boolean }
export interface WorldArea { id: string; label: string; chunks: WorldChunk[]; instances: WorldInstance[] }
export interface WorldLayout { schemaVersion: number; worldId: string; canonicalRevision: number; units: "meters"; coordinateSystem: "right-handed-y-up"; areas: WorldArea[] }
export interface WorldLayoutStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function finite(value: unknown, path: string): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`); return value; }
function validId(value: unknown, path: string): string { if (typeof value !== "string" || !/^[a-z0-9][a-z0-9.-]*$/.test(value)) throw new Error(`${path} must be a stable lowercase ID`); return value; }
function cleanLabel(value: unknown, path: string): string { if (typeof value !== "string" || value.trim() === "") throw new Error(`${path} must be a non-empty string`); return value.trim(); }

export function worldChunkCoordinates(x: number, z: number): Readonly<{ x: number; z: number }> { return { x: Math.floor(x / WORLD_CHUNK_SIZE), z: Math.floor(z / WORLD_CHUNK_SIZE) }; }
export function worldChunkKey(x: number, z: number): string { return `${x},${z}`; }
function legacyChunks(instances: readonly WorldInstance[], playable: boolean): WorldChunk[] {
  const chunks = new Map<string, WorldChunk>();
  for (const item of instances) { const coordinate = worldChunkCoordinates(item.transform.x, item.transform.z); chunks.set(worldChunkKey(coordinate.x, coordinate.z), { ...coordinate, playable }); }
  return [...chunks.values()];
}

function validateChunks(value: unknown, areaId: string): WorldChunk[] {
  if (!Array.isArray(value)) throw new Error(`${areaId}.chunks must be an array`);
  const seen = new Set<string>();
  return value.map((item, index) => { if (!record(item)) throw new Error(`${areaId}.chunks[${index}] must be an object`); const x = finite(item.x, `${areaId}.chunks[${index}].x`); const z = finite(item.z, `${areaId}.chunks[${index}].z`); if (!Number.isInteger(x) || !Number.isInteger(z)) throw new Error(`${areaId}.chunks[${index}] coordinates must be integers`); if (typeof item.playable !== "boolean") throw new Error(`${areaId}.chunks[${index}].playable must be boolean`); const key = worldChunkKey(x, z); if (seen.has(key)) throw new Error(`Duplicate chunk: ${key}`); seen.add(key); return { x, z, playable: item.playable }; });
}

export function validateWorldLayout(value: unknown): WorldLayout {
  if (!record(value)) throw new Error("World layout must be a JSON object");
  const sourceSchema = value.schemaVersion;
  if (sourceSchema !== 1 && sourceSchema !== WORLD_LAYOUT_SCHEMA_VERSION) throw new Error(`Unsupported world schema: ${String(sourceSchema)}`);
  if (value.units !== "meters" || value.coordinateSystem !== "right-handed-y-up") throw new Error("World coordinate system is not supported");
  const worldId = validId(value.worldId, "worldId"); const canonicalRevision = finite(value.canonicalRevision, "canonicalRevision");
  if (!Number.isInteger(canonicalRevision) || canonicalRevision < 1) throw new Error("canonicalRevision must be a positive integer");
  if (!Array.isArray(value.areas) || value.areas.length === 0) throw new Error("World must contain at least one area");
  const areaIds = new Set<string>(); const instanceIds = new Set<string>();
  const areas = value.areas.map((candidate, areaIndex) => {
    if (!record(candidate)) throw new Error(`areas[${areaIndex}] must be an object`);
    const id = validId(candidate.id, `areas[${areaIndex}].id`); if (areaIds.has(id)) throw new Error(`Duplicate area ID: ${id}`); areaIds.add(id);
    if (!Array.isArray(candidate.instances)) throw new Error(`${id}.instances must be an array`);
    let instances = candidate.instances.map((item, index) => {
      if (!record(item)) throw new Error(`${id}.instances[${index}] must be an object`);
      const instanceId = validId(item.id, `${id}.instances[${index}].id`); if (instanceIds.has(instanceId)) throw new Error(`Duplicate instance ID: ${instanceId}`); instanceIds.add(instanceId);
      let assetId = validId(item.assetId, `${instanceId}.assetId`);
      if (instanceId === "plaza.paving" && assetId === "plaza.paving-patch") assetId = "plaza.paving-base";
      if (!getWorldAsset(assetId)) throw new Error(`Unknown world asset: ${assetId}`);
      if (!record(item.transform)) throw new Error(`${instanceId}.transform must be an object`);
      const x = finite(item.transform.x, `${instanceId}.transform.x`); const y = finite(item.transform.y, `${instanceId}.transform.y`); const z = finite(item.transform.z, `${instanceId}.transform.z`); const rotationY = finite(item.transform.rotationY, `${instanceId}.transform.rotationY`);
      if (Math.abs(x) > 10_000_000 || Math.abs(y) > 1000 || Math.abs(z) > 10_000_000) throw new Error(`${instanceId}.transform is outside supported editing limits`);
      return { id: instanceId, assetId, label: cleanLabel(item.label, `${instanceId}.label`), transform: { x, y, z, rotationY } };
    });
    instances = migrateLegacyPlanterCluster(instances, instanceIds);
    const chunks = sourceSchema === 1 ? legacyChunks(instances, id === CENTRAL_PLAZA_AREA_ID) : validateChunks(candidate.chunks, id);
    return { id, label: cleanLabel(candidate.label, `${id}.label`), chunks, instances };
  });
  if (!areaIds.has(CENTRAL_PLAZA_AREA_ID)) throw new Error("World must contain the central plaza area");
  return { schemaVersion: WORLD_LAYOUT_SCHEMA_VERSION, worldId, canonicalRevision, units: "meters", coordinateSystem: "right-handed-y-up", areas };
}

function instance(id: string, assetId: string, label: string, x: number, z: number, rotationY = 0): WorldInstance { return { id, assetId, label, transform: { x, y: 0, z, rotationY } }; }
const LEGACY_PLANTER_PARTS = [
  { id: "plaza.planter-east-north", assetId: "plaza.planter-east-north", label: "East north planter", x: 19.35, z: -7.2 },
  { id: "plaza.planter-east-south", assetId: "plaza.planter-east-south", label: "East south planter", x: 19.35, z: 6.2 },
  { id: "plaza.planter-south", assetId: "plaza.planter-south", label: "South planter", x: 7.8, z: 16.7 },
] as const;

function migrateLegacyPlanterCluster(instances: WorldInstance[], instanceIds: Set<string>): WorldInstance[] {
  const legacy = instances.find((item) => item.assetId === "plaza.planter-cluster");
  if (!legacy) return instances;
  instanceIds.delete(legacy.id);
  const cosine = Math.cos(legacy.transform.rotationY);
  const sine = Math.sin(legacy.transform.rotationY);
  const replacements = LEGACY_PLANTER_PARTS.map((part) => {
    const x = legacy.transform.x + part.x * cosine + part.z * sine;
    const z = legacy.transform.z - part.x * sine + part.z * cosine;
    const replacement = instance(part.id, part.assetId, part.label, x, z, legacy.transform.rotationY);
    replacement.transform.y = legacy.transform.y;
    if (instanceIds.has(replacement.id)) throw new Error(`Duplicate instance ID: ${replacement.id}`);
    instanceIds.add(replacement.id);
    return replacement;
  });
  const index = instances.indexOf(legacy);
  return [...instances.slice(0, index), ...replacements, ...instances.slice(index + 1)];
}

export function migratePlazaLayout(layout: PlazaLayout): WorldLayout {
  const l = validatePlazaLayout(layout); const group = l.groups;
  const instances = [
    instance("plaza.paving", "plaza.paving-base", "Plaza paving", 0, 0), instance("plaza.buildings", "plaza.building-frontage", "Building frontage", 0, 0),
    instance(FOUNTAIN_INSTANCE_ID, "plaza.goose-fountain", group["plaza.goose-fountain"].label, group["plaza.goose-fountain"].position.x, group["plaza.goose-fountain"].position.z, group["plaza.goose-fountain"].rotationY),
    instance("plaza.splash-pad", "plaza.splash-pad", group["plaza.splash-pad"].label, group["plaza.splash-pad"].position.x, group["plaza.splash-pad"].position.z, group["plaza.splash-pad"].rotationY),
    instance("plaza.play-area", "plaza.play-area", group["plaza.play-area"].label, group["plaza.play-area"].position.x, group["plaza.play-area"].position.z, group["plaza.play-area"].rotationY),
    instance("plaza.pavilion-stage", "plaza.pavilion-stage", group["plaza.pavilion-stage"].label, group["plaza.pavilion-stage"].position.x, group["plaza.pavilion-stage"].position.z, group["plaza.pavilion-stage"].rotationY),
    ...(["plaza.cafe-table-1", "plaza.cafe-table-2", "plaza.cafe-table-3"] as const).map((id) => instance(id, "plaza.cafe-table-set", group[id].label, group[id].position.x, group[id].position.z, group[id].rotationY)),
    instance("plaza.planter-east-north", "plaza.planter-east-north", "East north planter", 19.35, -7.2), instance("plaza.planter-east-south", "plaza.planter-east-south", "East south planter", 19.35, 6.2), instance("plaza.planter-south", "plaza.planter-south", "South planter", 7.8, 16.7), instance("plaza.trees", "plaza.tree-cluster", "Tree cluster", 0, 0), instance("plaza.lights", "plaza.string-lights", "String lights", 0, 0),
  ];
  return validateWorldLayout({ schemaVersion: 2, worldId: "old-town-square", canonicalRevision: l.canonicalRevision, units: "meters", coordinateSystem: "right-handed-y-up", areas: [{ id: CENTRAL_PLAZA_AREA_ID, label: "Central Plaza", chunks: [{ x: -1, z: -1, playable: true }, { x: 0, z: -1, playable: true }, { x: -1, z: 0, playable: true }, { x: 0, z: 0, playable: true }], instances }] });
}

export const CANONICAL_WORLD_LAYOUT = validateWorldLayout(canonicalWorldLayoutJson);
export function cloneWorldLayout(layout: WorldLayout): WorldLayout { return validateWorldLayout(JSON.parse(JSON.stringify(layout)) as unknown); }
export function serializeWorldLayout(layout: WorldLayout): string { return `${JSON.stringify(validateWorldLayout(layout), null, 2)}\n`; }
function storage(): WorldLayoutStorage | undefined { try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; } }
export function loadWorldLayout(store = storage()): WorldLayout { try { const saved = store?.getItem(WORLD_LAYOUT_STORAGE_KEY); if (saved) return validateWorldLayout(JSON.parse(saved)); const legacy = store?.getItem(PLAZA_LAYOUT_STORAGE_KEY); return legacy ? migratePlazaLayout(validatePlazaLayout(JSON.parse(legacy))) : cloneWorldLayout(CANONICAL_WORLD_LAYOUT); } catch (error) { console.warn("Ignoring invalid saved world layout", error); return cloneWorldLayout(CANONICAL_WORLD_LAYOUT); } }
export function saveWorldLayout(layout: WorldLayout, store = storage()): boolean { try { if (!store) return false; store.setItem(WORLD_LAYOUT_STORAGE_KEY, serializeWorldLayout(layout)); return true; } catch (error) { console.warn("Could not save world layout", error); return false; } }
export function resetWorldLayout(store = storage()): WorldLayout { try { store?.removeItem(WORLD_LAYOUT_STORAGE_KEY); store?.removeItem(PLAZA_LAYOUT_STORAGE_KEY); } catch { /* storage is optional */ } return cloneWorldLayout(CANONICAL_WORLD_LAYOUT); }
export function getWorldArea(layout: WorldLayout, areaId = CENTRAL_PLAZA_AREA_ID): WorldArea { const area = layout.areas.find((item) => item.id === areaId); if (!area) throw new Error(`Missing world area: ${areaId}`); return area; }
export function addWorldArea(layout: WorldLayout, id: string, label: string): WorldArea { validId(id, "area ID"); if (layout.areas.some((area) => area.id === id)) throw new Error(`Area already exists: ${id}`); const area = { id, label: cleanLabel(label, "area label"), chunks: [], instances: [] }; layout.areas.push(area); return area; }
export function deleteWorldArea(layout: WorldLayout, id: string): void { if (id === CENTRAL_PLAZA_AREA_ID) throw new Error("The central plaza cannot be deleted"); const index = layout.areas.findIndex((area) => area.id === id); if (index < 0) throw new Error(`Unknown area: ${id}`); layout.areas.splice(index, 1); }
export function getWorldChunk(area: WorldArea, x: number, z: number): WorldChunk | undefined { return area.chunks.find((chunk) => chunk.x === x && chunk.z === z); }
export function ensureWorldChunk(area: WorldArea, x: number, z: number, playable = false): WorldChunk { const existing = getWorldChunk(area, x, z); if (existing) return existing; const chunk = { x, z, playable }; area.chunks.push(chunk); return chunk; }
export function toggleWorldChunkPlayable(area: WorldArea, x: number, z: number): WorldChunk { const chunk = ensureWorldChunk(area, x, z); chunk.playable = !chunk.playable; return chunk; }
export function isWorldChunkPlayable(area: WorldArea, x: number, z: number): boolean { const coordinate = worldChunkCoordinates(x, z); return getWorldChunk(area, coordinate.x, coordinate.z)?.playable === true; }
export function createInstance(area: WorldArea, assetId: string, id: string, x: number, z: number): WorldInstance { const asset = getWorldAsset(assetId); if (!asset) throw new Error(`Unknown world asset: ${assetId}`); const item = instance(id, assetId, asset.label, x, z); area.instances.push(item); const chunk = worldChunkCoordinates(x, z); ensureWorldChunk(area, chunk.x, chunk.z); return item; }
/** Areas are unbounded while authoring; this only guards malformed vertical transforms. */
export function clampWorldInstance(instance: WorldInstance): void { if (!Number.isFinite(instance.transform.x) || !Number.isFinite(instance.transform.z)) throw new Error("Instance position must be finite"); instance.transform.y = Math.max(-1000, Math.min(1000, instance.transform.y)); }
