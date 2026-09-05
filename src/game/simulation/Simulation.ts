import { Objectives, type ObjectiveDefinition } from "./Objectives.ts";

export interface Position { x: number; y: number; z: number }
export interface PlayerState {
  readonly id: "goose";
  readonly position: Readonly<Position>;
  readonly velocity: Readonly<Position>;
  readonly heading: number;
  readonly speed: number;
  readonly turnAmount: number;
}

/** Movement is already transformed from camera space into world space. */
export interface PlayerCommand {
  readonly moveX: number;
  readonly moveZ: number;
  readonly hurry: boolean;
  readonly honkPressed: boolean;
}

export type GameplayEvent =
  | { readonly type: "goose-honked"; readonly actorId: "goose"; readonly position: Readonly<Position> }
  | { readonly type: "objective-completed"; readonly objectiveId: string };

/** The current forest adapter can be replaced without changing input or rendering. */
export interface WorldRules {
  readonly spawn: Readonly<Position>;
  readonly spawnHeading: number;
  readonly objectives: readonly ObjectiveDefinition<PlayerState>[];
  resolveMovement(current: Readonly<Position>, proposed: Readonly<Position>, output: Position): void;
}

export const FIXED_STEP = 1 / 60;
export const WALK_SPEED = 3.45;
export const HURRY_SPEED = 5.7;
const MAX_STEPS_PER_FRAME = 8;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Owns gameplay state. No meshes, browser APIs, audio, or UI are allowed here. */
export class Simulation {
  private readonly rules: WorldRules;
  private readonly objectives: Objectives<PlayerState>;
  private readonly position: Position = { x: 0, y: 0, z: 0 };
  private readonly velocity: Position = { x: 0, y: 0, z: 0 };
  private heading = 0;
  private turnAmount = 0;
  private accumulator = 0;
  private honkQueued = false;
  private tickCount = 0;

  constructor(rules: WorldRules) {
    this.rules = rules;
    this.objectives = new Objectives(rules.objectives);
    this.reset();
  }

  get elapsed(): number { return this.tickCount * FIXED_STEP; }

  get player(): PlayerState {
    return {
      id: "goose", position: { ...this.position }, velocity: { ...this.velocity },
      heading: this.heading, speed: Math.hypot(this.velocity.x, this.velocity.z),
      turnAmount: this.turnAmount,
    };
  }

  isObjectiveComplete(id: string): boolean { return this.objectives.isComplete(id); }

  /** Edges survive frames with no tick and fire once across catch-up ticks. */
  advance(delta: number, command: PlayerCommand): GameplayEvent[] {
    if (!Number.isFinite(delta) || delta <= 0) return [];
    this.honkQueued ||= command.honkPressed;
    this.accumulator += Math.min(delta, FIXED_STEP * MAX_STEPS_PER_FRAME);
    const events: GameplayEvent[] = [];
    while (this.accumulator + 1e-10 >= FIXED_STEP) {
      this.accumulator = Math.max(0, this.accumulator - FIXED_STEP);
      this.step(command, events);
    }
    return events;
  }

  /** Pausing discards pending inputs/time, but preserves the village state. */
  suspend(): void {
    this.accumulator = 0;
    this.honkQueued = false;
  }

  reset(): void {
    Object.assign(this.position, this.rules.spawn);
    Object.assign(this.velocity, { x: 0, y: 0, z: 0 });
    this.heading = this.rules.spawnHeading;
    this.turnAmount = 0;
    this.tickCount = 0;
    this.suspend();
    this.objectives.reset();
  }

  private step(command: PlayerCommand, events: GameplayEvent[]): void {
    const x = Number.isFinite(command.moveX) ? command.moveX : 0;
    const z = Number.isFinite(command.moveZ) ? command.moveZ : 0;
    const length = Math.hypot(x, z);
    const scale = 1 / Math.max(1, length);
    const hasInput = length * length > 0.001;
    const speed = command.hurry ? HURRY_SPEED : WALK_SPEED;
    const smoothing = 1 - Math.exp(-(hasInput ? 11 : 16) * FIXED_STEP);
    this.velocity.x += ((hasInput ? x * scale * speed : 0) - this.velocity.x) * smoothing;
    this.velocity.z += ((hasInput ? z * scale * speed : 0) - this.velocity.z) * smoothing;

    const proposed = {
      x: this.position.x + this.velocity.x * FIXED_STEP,
      y: this.position.y,
      z: this.position.z + this.velocity.z * FIXED_STEP,
    };
    const resolved = { ...this.position };
    this.rules.resolveMovement(this.position, proposed, resolved);
    if (Math.abs(resolved.x - proposed.x) > 0.001) this.velocity.x *= 0.12;
    if (Math.abs(resolved.z - proposed.z) > 0.001) this.velocity.z *= 0.12;
    Object.assign(this.position, resolved);

    this.turnAmount = 0;
    if (Math.hypot(this.velocity.x, this.velocity.z) > 0.08) {
      const target = Math.atan2(-this.velocity.x, -this.velocity.z);
      const difference = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
      const previous = this.heading;
      this.heading += difference * Math.min(1, FIXED_STEP * 10.5);
      const angularVelocity = (this.heading - previous) / FIXED_STEP;
      this.turnAmount = clamp(difference * 1.8, -1, 1) + clamp(angularVelocity * 0.02, -0.25, 0.25);
    }

    if (this.honkQueued) {
      events.push({ type: "goose-honked", actorId: "goose", position: { ...this.position } });
      this.honkQueued = false;
    }
    this.tickCount += 1;
    for (const objectiveId of this.objectives.evaluate(this.player)) {
      events.push({ type: "objective-completed", objectiveId });
    }
  }
}
