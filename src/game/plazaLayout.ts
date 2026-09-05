import canonicalLayoutJson from "./content/plaza-layout.json" with { type: "json" };

export const PLAZA_LAYOUT_SCHEMA_VERSION = 1;
export const PLAZA_LAYOUT_ID = "old-town-square.central-plaza";
export const PLAZA_LAYOUT_STORAGE_KEY = "goose-game-2.plaza-layout.v1";

export const PLAZA_GROUP_IDS = [
  "plaza.goose-fountain",
  "plaza.splash-pad",
  "plaza.play-area",
  "plaza.pavilion-stage",
  "plaza.cafe-table-1",
  "plaza.cafe-table-2",
  "plaza.cafe-table-3",
] as const;

export type PlazaGroupId = typeof PLAZA_GROUP_IDS[number];
export type PlazaGroupType = "fountain" | "splash-pad" | "play-area" | "stage" | "cafe-table-set";

export interface PlazaPosition {
  x: number;
  y: number;
  z: number;
}

export interface PlazaLayoutGroup {
  type: PlazaGroupType;
  label: string;
  position: PlazaPosition;
  rotationY: number;
}

export interface PlazaLayout {
  schemaVersion: number;
  layoutId: string;
  canonicalRevision: number;
  units: "meters";
  coordinateSystem: "right-handed-y-up";
  groups: Record<PlazaGroupId, PlazaLayoutGroup>;
}

export interface PlazaLayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const EXPECTED_GROUP_TYPES: Record<PlazaGroupId, PlazaGroupType> = {
  "plaza.goose-fountain": "fountain",
  "plaza.splash-pad": "splash-pad",
  "plaza.play-area": "play-area",
  "plaza.pavilion-stage": "stage",
  "plaza.cafe-table-1": "cafe-table-set",
  "plaza.cafe-table-2": "cafe-table-set",
  "plaza.cafe-table-3": "cafe-table-set",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}

function normalizeAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  const normalized = ((angle + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function validatePlazaLayout(value: unknown): PlazaLayout {
  if (!isRecord(value)) throw new Error("Layout must be a JSON object");
  if (value.schemaVersion !== PLAZA_LAYOUT_SCHEMA_VERSION) {
    throw new Error(`Unsupported layout schema: ${String(value.schemaVersion)}`);
  }
  if (value.layoutId !== PLAZA_LAYOUT_ID) throw new Error("Layout is for a different area");
  if (value.units !== "meters" || value.coordinateSystem !== "right-handed-y-up") {
    throw new Error("Layout coordinate system is not supported");
  }
  const canonicalRevision = requireFiniteNumber(value.canonicalRevision, "canonicalRevision");
  if (!Number.isInteger(canonicalRevision) || canonicalRevision < 1) {
    throw new Error("canonicalRevision must be a positive integer");
  }
  if (!isRecord(value.groups)) throw new Error("groups must be a JSON object");

  const unknownIds = Object.keys(value.groups).filter(
    (id) => !PLAZA_GROUP_IDS.includes(id as PlazaGroupId),
  );
  if (unknownIds.length > 0) throw new Error(`Unknown layout group: ${unknownIds[0]}`);

  const groups = {} as Record<PlazaGroupId, PlazaLayoutGroup>;
  for (const id of PLAZA_GROUP_IDS) {
    const candidate = value.groups[id];
    if (!isRecord(candidate)) throw new Error(`Missing layout group: ${id}`);
    if (candidate.type !== EXPECTED_GROUP_TYPES[id]) throw new Error(`Incorrect type for ${id}`);
    if (typeof candidate.label !== "string" || candidate.label.trim().length === 0) {
      throw new Error(`${id}.label must be a non-empty string`);
    }
    if (!isRecord(candidate.position)) throw new Error(`${id}.position must be an object`);
    const x = requireFiniteNumber(candidate.position.x, `${id}.position.x`);
    const y = requireFiniteNumber(candidate.position.y, `${id}.position.y`);
    const z = requireFiniteNumber(candidate.position.z, `${id}.position.z`);
    if (Math.abs(x) > 100 || Math.abs(y) > 10 || Math.abs(z) > 100) {
      throw new Error(`${id}.position is outside supported editing limits`);
    }
    groups[id] = {
      type: EXPECTED_GROUP_TYPES[id],
      label: candidate.label.trim(),
      position: { x, y: 0, z },
      rotationY: normalizeAngle(requireFiniteNumber(candidate.rotationY, `${id}.rotationY`)),
    };
  }

  return {
    schemaVersion: PLAZA_LAYOUT_SCHEMA_VERSION,
    layoutId: PLAZA_LAYOUT_ID,
    canonicalRevision,
    units: "meters",
    coordinateSystem: "right-handed-y-up",
    groups,
  };
}

export function clonePlazaLayout(layout: PlazaLayout): PlazaLayout {
  return validatePlazaLayout(JSON.parse(JSON.stringify(layout)) as unknown);
}

export function replacePlazaLayout(target: PlazaLayout, source: PlazaLayout): void {
  const validated = validatePlazaLayout(source);
  target.schemaVersion = validated.schemaVersion;
  target.layoutId = validated.layoutId;
  target.canonicalRevision = validated.canonicalRevision;
  target.units = validated.units;
  target.coordinateSystem = validated.coordinateSystem;
  for (const id of PLAZA_GROUP_IDS) {
    const next = validated.groups[id];
    target.groups[id] = {
      ...next,
      position: { ...next.position },
    };
  }
}

export const CANONICAL_PLAZA_LAYOUT = validatePlazaLayout(canonicalLayoutJson);

export function serializePlazaLayout(layout: PlazaLayout): string {
  return `${JSON.stringify(validatePlazaLayout(layout), null, 2)}\n`;
}

function browserStorage(): PlazaLayoutStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadPlazaLayout(storage = browserStorage()): PlazaLayout {
  if (!storage) return clonePlazaLayout(CANONICAL_PLAZA_LAYOUT);
  try {
    const saved = storage.getItem(PLAZA_LAYOUT_STORAGE_KEY);
    return saved ? validatePlazaLayout(JSON.parse(saved) as unknown) : clonePlazaLayout(CANONICAL_PLAZA_LAYOUT);
  } catch (error) {
    console.warn("Ignoring invalid saved plaza layout", error);
    return clonePlazaLayout(CANONICAL_PLAZA_LAYOUT);
  }
}

export function savePlazaLayout(layout: PlazaLayout, storage = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PLAZA_LAYOUT_STORAGE_KEY, serializePlazaLayout(layout));
    return true;
  } catch (error) {
    console.warn("Could not save plaza layout", error);
    return false;
  }
}

export function resetPlazaLayout(storage = browserStorage()): PlazaLayout {
  try {
    storage?.removeItem(PLAZA_LAYOUT_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not clear saved plaza layout", error);
  }
  return clonePlazaLayout(CANONICAL_PLAZA_LAYOUT);
}
