import {
  CANONICAL_PLAZA_LAYOUT,
  type PlazaGroupId,
  type PlazaLayout,
} from "./plazaLayout.ts";

interface Position { x: number; y: number; z: number }

export const PLAZA_HALF_WIDTH = 22;
export const PLAZA_MIN_Z = -18;
export const PLAZA_MAX_Z = 18;
// Matches the reduced rendered goose footprint while leaving authored plaza
// fixtures and their world-unit layout unchanged.
export const PLAZA_GOOSE_RADIUS = 0.34;

export interface PlazaCircleCollider {
  readonly id: string;
  readonly shape: "circle";
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface PlazaBoxCollider {
  readonly id: string;
  readonly shape: "box";
  readonly x: number;
  readonly z: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
}

export type PlazaCollider = PlazaCircleCollider | PlazaBoxCollider;

/** Fixed fixtures that are deliberately outside the editable feature set. */
export const PLAZA_STATIC_COLLIDERS: readonly PlazaBoxCollider[] = [
  { id: "plaza.planter-east-north", shape: "box", x: 19.35, z: -7.2, halfWidth: 1.45, halfDepth: 3.3 },
  { id: "plaza.planter-east-south", shape: "box", x: 19.35, z: 6.2, halfWidth: 1.45, halfDepth: 3.1 },
  { id: "plaza.planter-south", shape: "box", x: 7.8, z: 16.7, halfWidth: 3.5, halfDepth: 1.3 },
];

export const FOUNTAIN_RADIUS = 3.35;
export const SPLASH_PAD_RADIUS = 4.35;
export const PLAY_AREA_SIZE = { halfWidth: 6.5, halfDepth: 3 } as const;
export const PAVILION_SIZE = { halfWidth: 6.8, halfDepth: 2.25 } as const;

/** Colliders are local to their editable parent, so the whole authored group moves together. */
export const PLAZA_GROUP_COLLIDERS: Readonly<Record<PlazaGroupId, readonly PlazaCollider[]>> = {
  "plaza.goose-fountain": [
    { id: "plaza.goose-fountain.basin", shape: "circle", x: 0, z: 0, radius: FOUNTAIN_RADIUS },
  ],
  "plaza.splash-pad": [],
  "plaza.play-area": [
    { id: "plaza.play-wall-north", shape: "box", x: 0, z: -3, halfWidth: 6.5, halfDepth: 0.25 },
    { id: "plaza.play-wall-south", shape: "box", x: 0, z: 3, halfWidth: 6.5, halfDepth: 0.25 },
    { id: "plaza.play-wall-west", shape: "box", x: -6.5, z: 0, halfWidth: 0.25, halfDepth: 3 },
    { id: "plaza.play-wall-east", shape: "box", x: 6.5, z: -1.35, halfWidth: 0.25, halfDepth: 1.65 },
    { id: "plaza.play-bear", shape: "circle", x: -3.1, z: -0.1, radius: 0.72 },
    { id: "plaza.play-fish", shape: "circle", x: 1.3, z: 0, radius: 0.92 },
  ],
  "plaza.pavilion-stage": [
    { id: "plaza.pavilion-stage.platform", shape: "box", x: 0, z: 0, ...PAVILION_SIZE },
  ],
  "plaza.cafe-table-1": [
    { id: "plaza.cafe-table-1.set", shape: "circle", x: 0, z: 0, radius: 1.18 },
  ],
  "plaza.cafe-table-2": [
    { id: "plaza.cafe-table-2.set", shape: "circle", x: 0, z: 0, radius: 1.18 },
  ],
  "plaza.cafe-table-3": [
    { id: "plaza.cafe-table-3.set", shape: "circle", x: 0, z: 0, radius: 1.18 },
  ],
};

/** Visual extents used to keep complete groups inside the editable plaza. */
export const PLAZA_GROUP_EXTENTS: Readonly<Record<PlazaGroupId, Readonly<{ halfWidth: number; halfDepth: number }>>> = {
  "plaza.goose-fountain": { halfWidth: 3.45, halfDepth: 3.45 },
  "plaza.splash-pad": { halfWidth: 4.9, halfDepth: 4.9 },
  "plaza.play-area": { halfWidth: 6.75, halfDepth: 3.25 },
  "plaza.pavilion-stage": { halfWidth: 7.4, halfDepth: 2.75 },
  "plaza.cafe-table-1": { halfWidth: 1.25, halfDepth: 1.25 },
  "plaza.cafe-table-2": { halfWidth: 1.25, halfDepth: 1.25 },
  "plaza.cafe-table-3": { halfWidth: 1.25, halfDepth: 1.25 },
};

const defaultFountain = CANONICAL_PLAZA_LAYOUT.groups["plaza.goose-fountain"];
const defaultSplashPad = CANONICAL_PLAZA_LAYOUT.groups["plaza.splash-pad"];
export const FOUNTAIN = { ...defaultFountain.position, radius: FOUNTAIN_RADIUS } as const;
export const SPLASH_PAD = { ...defaultSplashPad.position, radius: SPLASH_PAD_RADIUS } as const;

function isInsideBoundary(x: number, z: number, padding: number): boolean {
  const withinRectangle =
    x >= -PLAZA_HALF_WIDTH + padding && x <= PLAZA_HALF_WIDTH - padding &&
    z >= PLAZA_MIN_Z + padding && z <= PLAZA_MAX_Z - padding;
  if (!withinRectangle) return false;

  const cornerInset = 4.2 + padding;
  if (z > PLAZA_MAX_Z - cornerInset) {
    const excessX = Math.abs(x) - (PLAZA_HALF_WIDTH - cornerInset);
    const excessZ = z - (PLAZA_MAX_Z - cornerInset);
    if (excessX > 0 && excessX + excessZ > cornerInset) return false;
  }
  return true;
}

export function worldToPlazaGroupLocal(
  layout: PlazaLayout,
  groupId: PlazaGroupId,
  x: number,
  z: number,
): Readonly<{ x: number; z: number }> {
  const group = layout.groups[groupId];
  const dx = x - group.position.x;
  const dz = z - group.position.z;
  const cosine = Math.cos(group.rotationY);
  const sine = Math.sin(group.rotationY);
  return { x: dx * cosine - dz * sine, z: dx * sine + dz * cosine };
}

export function plazaGroupLocalToWorld(
  layout: PlazaLayout,
  groupId: PlazaGroupId,
  x: number,
  z: number,
): Readonly<{ x: number; z: number }> {
  const group = layout.groups[groupId];
  const cosine = Math.cos(group.rotationY);
  const sine = Math.sin(group.rotationY);
  return {
    x: group.position.x + x * cosine + z * sine,
    z: group.position.z - x * sine + z * cosine,
  };
}

function overlapsCollider(localX: number, localZ: number, collider: PlazaCollider): boolean {
  if (collider.shape === "circle") {
    const dx = localX - collider.x;
    const dz = localZ - collider.z;
    const distance = collider.radius + PLAZA_GOOSE_RADIUS;
    return dx * dx + dz * dz < distance * distance;
  }
  return Math.abs(localX - collider.x) < collider.halfWidth + PLAZA_GOOSE_RADIUS &&
    Math.abs(localZ - collider.z) < collider.halfDepth + PLAZA_GOOSE_RADIUS;
}

export function isPlazaPlayable(
  x: number,
  z: number,
  padding = PLAZA_GOOSE_RADIUS,
  layout = CANONICAL_PLAZA_LAYOUT,
): boolean {
  if (!isInsideBoundary(x, z, padding)) return false;
  if (PLAZA_STATIC_COLLIDERS.some((collider) => overlapsCollider(x, z, collider))) return false;
  return !Object.entries(PLAZA_GROUP_COLLIDERS).some(([id, colliders]) => {
    const local = worldToPlazaGroupLocal(layout, id as PlazaGroupId, x, z);
    return colliders.some((collider) => overlapsCollider(local.x, local.z, collider));
  });
}

export function isNearGooseFountain(
  x: number,
  z: number,
  layout = CANONICAL_PLAZA_LAYOUT,
): boolean {
  const local = worldToPlazaGroupLocal(layout, "plaza.goose-fountain", x, z);
  return Math.hypot(local.x, local.z) <= FOUNTAIN_RADIUS + 2.15;
}

export function getRotatedGroupExtents(
  layout: PlazaLayout,
  groupId: PlazaGroupId,
): Readonly<{ halfWidth: number; halfDepth: number }> {
  const extents = PLAZA_GROUP_EXTENTS[groupId];
  const angle = layout.groups[groupId].rotationY;
  const cosine = Math.abs(Math.cos(angle));
  const sine = Math.abs(Math.sin(angle));
  return {
    halfWidth: extents.halfWidth * cosine + extents.halfDepth * sine,
    halfDepth: extents.halfWidth * sine + extents.halfDepth * cosine,
  };
}

export function clampPlazaGroupPlacement(layout: PlazaLayout, groupId: PlazaGroupId): void {
  const group = layout.groups[groupId];
  const extents = getRotatedGroupExtents(layout, groupId);
  group.position.x = Math.min(
    PLAZA_HALF_WIDTH - extents.halfWidth,
    Math.max(-PLAZA_HALF_WIDTH + extents.halfWidth, group.position.x),
  );
  group.position.z = Math.min(
    PLAZA_MAX_Z - extents.halfDepth,
    Math.max(PLAZA_MIN_Z + extents.halfDepth, group.position.z),
  );
  group.position.y = 0;
}

export function findPlazaGroupOverlaps(layout: PlazaLayout): ReadonlyArray<readonly [PlazaGroupId, PlazaGroupId]> {
  const ids = Object.keys(layout.groups) as PlazaGroupId[];
  const overlaps: Array<readonly [PlazaGroupId, PlazaGroupId]> = [];
  for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
      const leftId = ids[leftIndex];
      const rightId = ids[rightIndex];
      const left = layout.groups[leftId].position;
      const right = layout.groups[rightId].position;
      const leftSize = PLAZA_GROUP_EXTENTS[leftId];
      const rightSize = PLAZA_GROUP_EXTENTS[rightId];
      const leftRadius = Math.hypot(leftSize.halfWidth, leftSize.halfDepth);
      const rightRadius = Math.hypot(rightSize.halfWidth, rightSize.halfDepth);
      if (Math.hypot(left.x - right.x, left.z - right.z) < (leftRadius + rightRadius) * 0.82) {
        overlaps.push([leftId, rightId]);
      }
    }
  }
  return overlaps;
}

export function findPlazaStaticOverlaps(layout: PlazaLayout, groupId: PlazaGroupId): readonly string[] {
  const group = layout.groups[groupId];
  const extents = getRotatedGroupExtents(layout, groupId);
  return PLAZA_STATIC_COLLIDERS
    .filter((collider) =>
      Math.abs(group.position.x - collider.x) < extents.halfWidth + collider.halfWidth &&
      Math.abs(group.position.z - collider.z) < extents.halfDepth + collider.halfDepth)
    .map((collider) => collider.id);
}

export function resolvePlazaMovement<T extends Position>(
  current: Readonly<Position>,
  proposed: Readonly<Position>,
  output: T,
  layout = CANONICAL_PLAZA_LAYOUT,
): T {
  const candidates: ReadonlyArray<readonly [number, number]> = [
    [proposed.x, proposed.z],
    [proposed.x, current.z],
    [current.x, proposed.z],
    [current.x, current.z],
  ];
  for (const [x, z] of candidates) {
    if (isPlazaPlayable(x, z, PLAZA_GOOSE_RADIUS, layout)) {
      return Object.assign(output, { x, y: current.y, z });
    }
  }
  return Object.assign(output, current);
}
