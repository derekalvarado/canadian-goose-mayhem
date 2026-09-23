import { getWorldAsset, type WorldAssetCollider } from "../worldAssets.ts";
import type { WorldArea, WorldInstance } from "../worldLayout.ts";
import type { Position } from "./Simulation.ts";

/**
 * Narrow physics boundary for the first interaction spike. It intentionally
 * handles only 2D ground-plane bodies; a production rigid-body backend can
 * replace this implementation without changing authored IDs or callers.
 */
export type PhysicsBodyType = "kinematic" | "dynamic";

export interface PhysicsBodyDefinition {
  readonly id: string;
  readonly type: PhysicsBodyType;
  readonly position: Readonly<Position>;
  readonly radius: number;
  readonly mass?: number;
}

export interface PhysicsBodySnapshot {
  readonly id: string;
  readonly type: PhysicsBodyType;
  readonly position: Readonly<Position>;
  readonly velocity: Readonly<Position>;
  readonly radius: number;
}

export interface PhysicsHit {
  readonly bodyId: string;
  readonly position: Readonly<Position>;
  readonly normal: Readonly<{ x: number; z: number }>;
  readonly distance: number;
}

export interface PhysicsAdapter {
  createBody(definition: PhysicsBodyDefinition): void;
  removeBody(id: string): void;
  moveKinematic(id: string, position: Readonly<Position>): void;
  applyImpulse(id: string, impulse: Readonly<Position>): void;
  step(delta: number): void;
  overlapCircle(position: Readonly<Position>, radius: number, ignoreId?: string): readonly string[];
  sweepCircle(start: Readonly<Position>, end: Readonly<Position>, radius: number, ignoreId?: string): PhysicsHit | undefined;
  snapshot(): readonly PhysicsBodySnapshot[];
}

interface MutableBody {
  readonly type: PhysicsBodyType;
  readonly radius: number;
  readonly mass: number;
  readonly position: Position;
  readonly velocity: Position;
}

interface StaticCollider {
  readonly bodyId: string;
  readonly instance: WorldInstance;
  readonly collider: WorldAssetCollider;
}

interface Point2d { readonly x: number; readonly z: number }

function localPoint(instance: WorldInstance, x: number, z: number): Point2d {
  const dx = x - instance.transform.x;
  const dz = z - instance.transform.z;
  const cosine = Math.cos(instance.transform.rotationY);
  const sine = Math.sin(instance.transform.rotationY);
  return { x: dx * cosine - dz * sine, z: dx * sine + dz * cosine };
}

function worldDirection(instance: WorldInstance, x: number, z: number): Point2d {
  const cosine = Math.cos(instance.transform.rotationY);
  const sine = Math.sin(instance.transform.rotationY);
  return { x: x * cosine + z * sine, z: -x * sine + z * cosine };
}

function normalized(x: number, z: number): Point2d {
  const length = Math.hypot(x, z);
  return length > 1e-8 ? { x: x / length, z: z / length } : { x: 0, z: 1 };
}

function collides(point: Point2d, radius: number, collider: WorldAssetCollider): boolean {
  if (collider.shape === "circle") {
    return Math.hypot(point.x - collider.x, point.z - collider.z) <= (collider.radius ?? 0) + radius;
  }
  return Math.abs(point.x - collider.x) <= (collider.halfWidth ?? 0) + radius
    && Math.abs(point.z - collider.z) <= (collider.halfDepth ?? 0) + radius;
}

function collisionNormal(instance: WorldInstance, point: Point2d, collider: WorldAssetCollider): Point2d {
  if (collider.shape === "circle") {
    const local = normalized(point.x - collider.x, point.z - collider.z);
    const world = worldDirection(instance, local.x, local.z);
    return normalized(world.x, world.z);
  }
  const dx = point.x - collider.x;
  const dz = point.z - collider.z;
  const xPenetration = (collider.halfWidth ?? 0) - Math.abs(dx);
  const zPenetration = (collider.halfDepth ?? 0) - Math.abs(dz);
  const local = xPenetration < zPenetration
    ? { x: Math.sign(dx) || 1, z: 0 }
    : { x: 0, z: Math.sign(dz) || 1 };
  const world = worldDirection(instance, local.x, local.z);
  return normalized(world.x, world.z);
}

/**
 * Deterministic authored-collider spike. This is deliberately not presented
 * as the final rigid-body solution: it provides stable body IDs, fixed stepping,
 * overlap queries, and swept ground-plane checks for evaluating a backend.
 */
export class AuthoredPhysicsAdapter implements PhysicsAdapter {
  private readonly staticColliders: readonly StaticCollider[];
  private readonly bodies = new Map<string, MutableBody>();

  constructor(area: WorldArea) {
    this.staticColliders = area.instances.flatMap((instance) => {
      const asset = getWorldAsset(instance.assetId);
      return asset ? asset.colliders.map((collider) => ({ bodyId: instance.id, instance, collider })) : [];
    });
  }

  createBody(definition: PhysicsBodyDefinition): void {
    if (this.bodies.has(definition.id) || this.staticColliders.some((collider) => collider.bodyId === definition.id)) {
      throw new Error(`Duplicate physics body ID: ${definition.id}`);
    }
    if (!Number.isFinite(definition.radius) || definition.radius <= 0) throw new Error(`Invalid physics radius: ${definition.id}`);
    this.bodies.set(definition.id, {
      type: definition.type,
      radius: definition.radius,
      mass: definition.mass && definition.mass > 0 ? definition.mass : 1,
      position: { ...definition.position },
      velocity: { x: 0, y: 0, z: 0 },
    });
  }

  removeBody(id: string): void {
    this.bodies.delete(id);
  }

  moveKinematic(id: string, position: Readonly<Position>): void {
    const body = this.bodies.get(id);
    if (!body) throw new Error(`Unknown physics body: ${id}`);
    if (body.type !== "kinematic") throw new Error(`Physics body is not kinematic: ${id}`);
    const hit = this.sweepCircle(body.position, position, body.radius, id);
    if (!hit) Object.assign(body.position, position);
  }

  applyImpulse(id: string, impulse: Readonly<Position>): void {
    const body = this.bodies.get(id);
    if (!body) throw new Error(`Unknown physics body: ${id}`);
    if (body.type !== "dynamic") throw new Error(`Physics body is not dynamic: ${id}`);
    body.velocity.x += impulse.x / body.mass;
    body.velocity.y += impulse.y / body.mass;
    body.velocity.z += impulse.z / body.mass;
  }

  step(delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    for (const [id, body] of this.bodies) {
      if (body.type !== "dynamic") continue;
      const start = { ...body.position };
      const end = {
        x: body.position.x + body.velocity.x * delta,
        y: body.position.y + body.velocity.y * delta,
        z: body.position.z + body.velocity.z * delta,
      };
      const hit = this.sweepCircle(start, end, body.radius, id);
      if (!hit) {
        Object.assign(body.position, end);
        continue;
      }
      Object.assign(body.position, start);
      const intoSurface = body.velocity.x * hit.normal.x + body.velocity.z * hit.normal.z;
      if (intoSurface < 0) {
        body.velocity.x -= intoSurface * hit.normal.x;
        body.velocity.z -= intoSurface * hit.normal.z;
      }
    }
  }

  overlapCircle(position: Readonly<Position>, radius: number, ignoreId?: string): readonly string[] {
    const ids = new Set<string>();
    for (const staticCollider of this.staticColliders) {
      if (staticCollider.bodyId === ignoreId) continue;
      if (collides(localPoint(staticCollider.instance, position.x, position.z), radius, staticCollider.collider)) ids.add(staticCollider.bodyId);
    }
    for (const [id, body] of this.bodies) {
      if (id === ignoreId) continue;
      if (Math.hypot(position.x - body.position.x, position.z - body.position.z) <= radius + body.radius) ids.add(id);
    }
    return [...ids].sort();
  }

  sweepCircle(start: Readonly<Position>, end: Readonly<Position>, radius: number, ignoreId?: string): PhysicsHit | undefined {
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    const steps = Math.max(1, Math.ceil(distance / 0.08));
    for (let index = 0; index <= steps; index += 1) {
      const progress = index / steps;
      const position = {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
        z: start.z + (end.z - start.z) * progress,
      };
      const staticHit = this.staticColliders.find((candidate) => candidate.bodyId !== ignoreId
        && collides(localPoint(candidate.instance, position.x, position.z), radius, candidate.collider));
      if (staticHit) {
        const local = localPoint(staticHit.instance, position.x, position.z);
        const normal = collisionNormal(staticHit.instance, local, staticHit.collider);
        return { bodyId: staticHit.bodyId, position, normal, distance: distance * progress };
      }
      for (const [id, body] of this.bodies) {
        if (id === ignoreId) continue;
        if (Math.hypot(position.x - body.position.x, position.z - body.position.z) <= radius + body.radius) {
          const normal = normalized(position.x - body.position.x, position.z - body.position.z);
          return { bodyId: id, position, normal, distance: distance * progress };
        }
      }
    }
    return undefined;
  }

  snapshot(): readonly PhysicsBodySnapshot[] {
    return [...this.bodies.entries()].map(([id, body]) => ({
      id,
      type: body.type,
      position: { ...body.position },
      velocity: { ...body.velocity },
      radius: body.radius,
    }));
  }
}
