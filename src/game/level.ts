interface Position { x: number; y: number; z: number }

export const CLEARING_CENTER_Z = 2;
export const CLEARING_RADIUS_X = 12.6;
export const CLEARING_RADIUS_Z = 10.8;
export const GOOSE_RADIUS = 0.48;
export const EXIT_Z = -25.8;

export interface CircleObstacle {
  x: number;
  z: number;
  radius: number;
}

export const OBSTACLES: readonly CircleObstacle[] = [
  { x: -5.35, z: -1.55, radius: 1.02 },
  { x: 5.35, z: 3.7, radius: 0.82 },
  { x: -2.55, z: 4.55, radius: 1.18 },
  { x: 6.8, z: -3.5, radius: 0.72 },
] as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function pathCenterAt(z: number): number {
  const t = clamp((-z - 7.2) / 25, 0, 1);
  return 0.25 + 2.45 * t + Math.sin(t * Math.PI) * 0.55;
}

export function pathHalfWidthAt(z: number): number {
  const t = clamp((-z - 7.2) / 25, 0, 1);
  return 2.05 + t * 0.38;
}

export function isOnPath(x: number, z: number, padding = 0): boolean {
  if (z > -6.7 || z < -33.5) return false;
  return Math.abs(x - pathCenterAt(z)) <= pathHalfWidthAt(z) - padding;
}

export function isInClearing(x: number, z: number, padding = 0): boolean {
  const radiusX = CLEARING_RADIUS_X - padding;
  const radiusZ = CLEARING_RADIUS_Z - padding;
  const normalizedX = x / radiusX;
  const normalizedZ = (z - CLEARING_CENTER_Z) / radiusZ;
  return normalizedX * normalizedX + normalizedZ * normalizedZ <= 1;
}

export function isPlayable(x: number, z: number, padding = GOOSE_RADIUS): boolean {
  return isInClearing(x, z, padding) || isOnPath(x, z, padding * 0.55);
}

function overlapsObstacle(x: number, z: number, obstacle: CircleObstacle): boolean {
  const dx = x - obstacle.x;
  const dz = z - obstacle.z;
  const minimumDistance = obstacle.radius + GOOSE_RADIUS;
  return dx * dx + dz * dz < minimumDistance * minimumDistance;
}

function isUnblocked(x: number, z: number): boolean {
  return !OBSTACLES.some((obstacle) => overlapsObstacle(x, z, obstacle));
}

export function resolveLevelMovement<T extends Position>(
  current: Readonly<Position>,
  proposed: Readonly<Position>,
  output: T,
): T {
  const candidates: ReadonlyArray<readonly [number, number]> = [
    [proposed.x, proposed.z],
    [proposed.x, current.z],
    [current.x, proposed.z],
    [current.x, current.z],
  ];

  for (const [x, z] of candidates) {
    if (isPlayable(x, z) && isUnblocked(x, z)) {
      return Object.assign(output, { x, y: current.y, z });
    }
  }

  return Object.assign(output, current);
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
