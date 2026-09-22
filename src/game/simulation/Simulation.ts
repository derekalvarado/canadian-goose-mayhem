import { Objectives, type ObjectiveDefinition } from "./Objectives.ts";

export interface Position { x: number; y: number; z: number }
export interface PlayerState {
  readonly id: "goose"; readonly position: Readonly<Position>; readonly velocity: Readonly<Position>;
  readonly heading: number; readonly speed: number; readonly turnAmount: number;
  readonly wingsSpread: boolean; readonly aggressive: boolean; readonly spooked: boolean;
  readonly heldEntityId?: string;
}
export interface GoosePoop { readonly id: string; readonly position: Readonly<Position> }
export interface PlayerCommand {
  readonly moveX: number; readonly moveZ: number; readonly hurry: boolean; readonly honkPressed: boolean;
  readonly interactPressed?: boolean; readonly wingsSpread?: boolean; readonly aggressive?: boolean;
}
export interface CarryableDefinition { readonly interactionRange: number; readonly carryHeight: number; readonly carryDistance: number }
export interface ControllerDefinition { readonly targetId: string; readonly interactionPoint: Readonly<Position>; readonly interactionRange: number }
export interface WorldEntityDefinition {
  readonly id: string; readonly label: string; readonly position: Readonly<Position>; readonly heading?: number;
  readonly active?: boolean; readonly controller?: ControllerDefinition; readonly carryable?: CarryableDefinition;
}
export interface WorldEntityState {
  readonly id: string; readonly label: string; readonly position: Readonly<Position>; readonly heading: number;
  readonly active?: boolean; readonly holderId?: "goose";
}
export type JanitorActivity = "guarding" | "shooing" | "walking-to-pad" | "inspecting" | "scratching" | "returning";
export interface JanitorDefinition {
  readonly id: string; readonly position: Readonly<Position>; readonly heading: number;
  readonly guardPosition: Readonly<Position>; readonly investigationPosition: Readonly<Position>;
  readonly observedTargetId: string; readonly walkSpeed: number; readonly guardRadius: number;
  readonly noticeRadius: number; readonly inspectSeconds: number; readonly scratchSeconds: number; readonly shooSeconds: number;
}
export interface JanitorState {
  readonly id: string; readonly position: Readonly<Position>; readonly heading: number;
  readonly activity: JanitorActivity; readonly activitySecondsRemaining: number;
}
export type SplashKidActivity = "playing" | "disappointed" | "walking-away" | "away" | "frightened" | "crying" | "returning";
export interface SplashKidDefinition {
  readonly id: string; readonly position: Readonly<Position>; readonly heading: number;
  readonly observedTargetId: string; readonly playRoute: readonly Readonly<Position>[];
  readonly retreatPositions: readonly Readonly<Position>[]; readonly playSpeed: number; readonly fleeSpeed: number;
  readonly threatRadius: number; readonly disappointedSeconds: number; readonly crySeconds: number;
}
export interface SplashKidState {
  readonly id: string; readonly position: Readonly<Position>; readonly heading: number;
  readonly activity: SplashKidActivity; readonly activitySecondsRemaining: number;
}
export interface ObjectiveZoneDefinition { readonly id: string; readonly position: Readonly<Position>; readonly radius: number; readonly factId: string; readonly guardedBy?: string }
export interface WorldSnapshot {
  readonly player: PlayerState; readonly entities: readonly WorldEntityState[];
  readonly janitor?: JanitorState; readonly splashKids: readonly SplashKidState[]; readonly durableFacts: readonly string[];
}
export type GameplayEvent =
  | { readonly type: "goose-honked"; readonly actorId: "goose"; readonly position: Readonly<Position> }
  | { readonly type: "goose-pooped"; readonly actorId: "goose"; readonly poopId: string; readonly position: Readonly<Position> }
  | { readonly type: "entity-grabbed"; readonly actorId: "goose"; readonly entityId: string }
  | { readonly type: "entity-dropped"; readonly actorId: "goose"; readonly entityId: string; readonly position: Readonly<Position> }
  | { readonly type: "device-state-changed"; readonly actorId: "goose" | string; readonly controllerId?: string; readonly targetId: string; readonly active: boolean }
  | { readonly type: "goose-shooed"; readonly actorId: string; readonly position: Readonly<Position> }
  | { readonly type: "splash-kid-frightened"; readonly actorId: string; readonly position: Readonly<Position> }
  | { readonly type: "objective-completed"; readonly objectiveId: string };
export interface WorldRules {
  readonly spawn: Readonly<Position>; readonly spawnHeading: number;
  readonly objectives: readonly ObjectiveDefinition<WorldSnapshot>[];
  readonly entities?: readonly WorldEntityDefinition[]; readonly janitor?: JanitorDefinition;
  readonly splashKids?: readonly SplashKidDefinition[];
  readonly objectiveZones?: readonly ObjectiveZoneDefinition[];
  resolveMovement(current: Readonly<Position>, proposed: Readonly<Position>, output: Position): void;
}

interface MutableEntity {
  readonly definition: WorldEntityDefinition; readonly position: Position; heading: number;
  active?: boolean; holderId?: "goose";
}
interface MutableJanitor {
  readonly definition: JanitorDefinition; readonly position: Position; heading: number;
  activity: JanitorActivity; activitySecondsRemaining: number;
}
interface MutableSplashKid {
  readonly definition: SplashKidDefinition; readonly position: Position; heading: number;
  activity: SplashKidActivity; activitySecondsRemaining: number; routeIndex: number; destination?: Position;
}

export const FIXED_STEP = 1 / 60;
export const WALK_SPEED = 3.45;
export const HURRY_SPEED = 5.7;
export const GOOSE_POOP_IDLE_SECONDS = 10;
export const MAX_GOOSE_POOPS = 10;
const MAX_STEPS_PER_FRAME = 8;
const SHOO_PUSH_SECONDS = 0.72;
const SHOO_PUSH_SPEED = 3.25;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const distance2d = (left: Readonly<Position>, right: Readonly<Position>): number => Math.hypot(left.x - right.x, left.z - right.z);

/** Owns gameplay state. No meshes, browser APIs, audio, or UI are allowed here. */
export class Simulation {
  private readonly rules: WorldRules;
  private readonly objectives: Objectives<WorldSnapshot>;
  private readonly position: Position = { x: 0, y: 0, z: 0 };
  private readonly velocity: Position = { x: 0, y: 0, z: 0 };
  private readonly pushDirection: Position = { x: 0, y: 0, z: 0 };
  private readonly entitiesById = new Map<string, MutableEntity>();
  private readonly durableFacts = new Set<string>();
  private readonly poopRecords: GoosePoop[] = [];
  private readonly splashKids: MutableSplashKid[] = [];
  private janitor?: MutableJanitor;
  private heading = 0; private turnAmount = 0; private wingsSpread = false; private aggressive = false;
  private accumulator = 0; private honkQueued = false; private interactionQueued = false;
  private tickCount = 0; private idleSeconds = 0; private poopSequence = 0;
  private heldEntityId?: string; private spookedSeconds = 0;

  constructor(rules: WorldRules) {
    this.rules = rules;
    this.objectives = new Objectives(rules.objectives);
    for (const definition of rules.entities ?? []) {
      if (this.entitiesById.has(definition.id)) throw new Error(`Duplicate world entity ID: ${definition.id}`);
      this.entitiesById.set(definition.id, { definition, position: { ...definition.position }, heading: definition.heading ?? 0, active: definition.active });
    }
    for (const entity of this.entitiesById.values()) {
      const targetId = entity.definition.controller?.targetId;
      if (!targetId) continue;
      const target = this.entitiesById.get(targetId);
      if (!target || target.active === undefined) throw new Error(`Controller ${entity.definition.id} has invalid target: ${targetId}`);
    }
    if (rules.janitor) {
      if (!this.entitiesById.has(rules.janitor.observedTargetId)) throw new Error(`Janitor has invalid observed target: ${rules.janitor.observedTargetId}`);
      this.janitor = { definition: rules.janitor, position: { ...rules.janitor.position }, heading: rules.janitor.heading, activity: "guarding", activitySecondsRemaining: 0 };
    }
    for (const definition of rules.splashKids ?? []) {
      if (this.entitiesById.has(definition.id) || this.splashKids.some((child) => child.definition.id === definition.id)) throw new Error(`Duplicate splash kid ID: ${definition.id}`);
      const target = this.entitiesById.get(definition.observedTargetId);
      if (!target || target.active === undefined) throw new Error(`Splash kid ${definition.id} has invalid observed target: ${definition.observedTargetId}`);
      if (definition.playRoute.length === 0 || definition.retreatPositions.length === 0) throw new Error(`Splash kid ${definition.id} needs play and retreat positions`);
      this.splashKids.push({ definition, position: { ...definition.position }, heading: definition.heading,
        activity: "playing", activitySecondsRemaining: 0, routeIndex: Math.min(1, definition.playRoute.length - 1) });
    }
    this.reset();
  }

  get elapsed(): number { return this.tickCount * FIXED_STEP; }
  get player(): PlayerState {
    return { id: "goose", position: { ...this.position }, velocity: { ...this.velocity }, heading: this.heading,
      speed: Math.hypot(this.velocity.x, this.velocity.z), turnAmount: this.turnAmount,
      wingsSpread: this.wingsSpread, aggressive: this.aggressive, spooked: this.spookedSeconds > 0,
      heldEntityId: this.heldEntityId };
  }
  get world(): WorldSnapshot {
    return { player: this.player, entities: [...this.entitiesById.values()].map((entity) => ({
      id: entity.definition.id, label: entity.definition.label, position: { ...entity.position }, heading: entity.heading,
      active: entity.active, holderId: entity.holderId,
    })), janitor: this.janitor ? { id: this.janitor.definition.id, position: { ...this.janitor.position },
      heading: this.janitor.heading, activity: this.janitor.activity,
      activitySecondsRemaining: this.janitor.activitySecondsRemaining } : undefined,
      splashKids: this.splashKids.map((child) => ({ id: child.definition.id, position: { ...child.position }, heading: child.heading,
        activity: child.activity, activitySecondsRemaining: child.activitySecondsRemaining })),
      durableFacts: [...this.durableFacts] };
  }
  get objectiveList(): readonly Readonly<{ id: string; description: string; completed: boolean }>[] {
    return this.rules.objectives.map((objective) => ({ id: objective.id, description: objective.description, completed: this.objectives.isComplete(objective.id) }));
  }
  get goosePoops(): readonly GoosePoop[] { return this.poopRecords.map((poop) => ({ id: poop.id, position: { ...poop.position } })); }
  get interactionHint(): string | undefined {
    if (this.heldEntityId) return `Drop ${this.entitiesById.get(this.heldEntityId)?.definition.label ?? "item"}`;
    const candidate = this.findInteractionCandidate();
    if (!candidate) return undefined;
    if (candidate.definition.controller) {
      const target = this.entitiesById.get(candidate.definition.controller.targetId);
      return `${target?.active ? "Turn off" : "Turn on"} ${candidate.definition.label}`;
    }
    return candidate.definition.carryable ? `Pick up ${candidate.definition.label}` : undefined;
  }
  isObjectiveComplete(id: string): boolean { return this.objectives.isComplete(id); }

  /** Edges survive frames with no tick and fire once across catch-up ticks. */
  advance(delta: number, command: PlayerCommand): GameplayEvent[] {
    if (!Number.isFinite(delta) || delta <= 0) return [];
    this.honkQueued ||= command.honkPressed;
    this.interactionQueued ||= command.interactPressed === true;
    this.accumulator += Math.min(delta, FIXED_STEP * MAX_STEPS_PER_FRAME);
    const events: GameplayEvent[] = [];
    while (this.accumulator + 1e-10 >= FIXED_STEP) {
      this.accumulator = Math.max(0, this.accumulator - FIXED_STEP);
      this.step(command, events);
    }
    return events;
  }
  suspend(): void {
    this.accumulator = 0; this.honkQueued = false; this.interactionQueued = false;
    this.wingsSpread = false; this.aggressive = false;
  }
  reset(): void {
    Object.assign(this.position, this.rules.spawn); Object.assign(this.velocity, { x: 0, y: 0, z: 0 });
    Object.assign(this.pushDirection, { x: 0, y: 0, z: 0 }); this.heading = this.rules.spawnHeading;
    this.turnAmount = 0; this.wingsSpread = false; this.aggressive = false; this.tickCount = 0;
    this.idleSeconds = 0; this.poopSequence = 0; this.heldEntityId = undefined; this.spookedSeconds = 0;
    this.poopRecords.length = 0; this.durableFacts.clear();
    for (const entity of this.entitiesById.values()) {
      Object.assign(entity.position, entity.definition.position); entity.heading = entity.definition.heading ?? 0;
      entity.active = entity.definition.active; entity.holderId = undefined;
    }
    if (this.janitor) {
      Object.assign(this.janitor.position, this.janitor.definition.position); this.janitor.heading = this.janitor.definition.heading;
      this.janitor.activity = "guarding"; this.janitor.activitySecondsRemaining = 0;
    }
    for (const child of this.splashKids) {
      Object.assign(child.position, child.definition.position); child.heading = child.definition.heading;
      child.activity = "playing"; child.activitySecondsRemaining = 0;
      child.routeIndex = Math.min(1, child.definition.playRoute.length - 1); child.destination = undefined;
    }
    this.suspend(); this.objectives.reset();
  }

  private step(command: PlayerCommand, events: GameplayEvent[]): void {
    this.wingsSpread = command.wingsSpread === true; this.aggressive = command.aggressive === true;
    const interacted = this.interactionQueued;
    if (interacted) { this.resolveInteraction(events); this.interactionQueued = false; }
    const requestedX = Number.isFinite(command.moveX) ? command.moveX : 0;
    const requestedZ = Number.isFinite(command.moveZ) ? command.moveZ : 0;
    const length = Math.hypot(requestedX, requestedZ); const scale = 1 / Math.max(1, length);
    const acceptingMovement = this.spookedSeconds <= 0;
    const hasInput = acceptingMovement && length * length > 0.001;
    const speed = command.hurry ? HURRY_SPEED : WALK_SPEED;
    const smoothing = 1 - Math.exp(-(hasInput ? 11 : 16) * FIXED_STEP);
    this.velocity.x += ((hasInput ? requestedX * scale * speed : 0) - this.velocity.x) * smoothing;
    this.velocity.z += ((hasInput ? requestedZ * scale * speed : 0) - this.velocity.z) * smoothing;
    const pushScale = this.spookedSeconds > 0 ? SHOO_PUSH_SPEED * (this.spookedSeconds / SHOO_PUSH_SECONDS) : 0;
    const proposed = { x: this.position.x + (this.velocity.x + this.pushDirection.x * pushScale) * FIXED_STEP,
      y: this.position.y, z: this.position.z + (this.velocity.z + this.pushDirection.z * pushScale) * FIXED_STEP };
    const resolved = { ...this.position }; this.rules.resolveMovement(this.position, proposed, resolved);
    if (Math.abs(resolved.x - proposed.x) > 0.001) this.velocity.x *= 0.12;
    if (Math.abs(resolved.z - proposed.z) > 0.001) this.velocity.z *= 0.12;
    Object.assign(this.position, resolved); this.spookedSeconds = Math.max(0, this.spookedSeconds - FIXED_STEP);
    this.turnAmount = 0;
    if (Math.hypot(this.velocity.x, this.velocity.z) > 0.08 && this.spookedSeconds <= 0) {
      const target = Math.atan2(-this.velocity.x, -this.velocity.z);
      const difference = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
      const previous = this.heading; this.heading += difference * Math.min(1, FIXED_STEP * 10.5);
      const angularVelocity = (this.heading - previous) / FIXED_STEP;
      this.turnAmount = clamp(difference * 1.8, -1, 1) + clamp(angularVelocity * 0.02, -0.25, 0.25);
    }
    this.syncHeldEntity();
    const honked = this.honkQueued;
    if (honked) { events.push({ type: "goose-honked", actorId: "goose", position: { ...this.position } }); this.honkQueued = false; }
    this.updateSplashKids(events);
    this.updateJanitor(events);
    for (const zone of this.rules.objectiveZones ?? []) {
      const guarded = zone.guardedBy === this.janitor?.definition.id
        && (this.janitor?.activity === "guarding" || this.janitor?.activity === "shooing");
      if (!guarded && distance2d(this.position, zone.position) <= zone.radius) this.durableFacts.add(zone.factId);
    }
    if (hasInput || honked || interacted || this.wingsSpread || this.aggressive || this.spookedSeconds > 0) this.idleSeconds = 0;
    else { this.idleSeconds += FIXED_STEP; if (this.idleSeconds + 1e-10 >= GOOSE_POOP_IDLE_SECONDS) this.leavePoop(events); }
    this.tickCount += 1;
    for (const objectiveId of this.objectives.evaluate(this.world)) events.push({ type: "objective-completed", objectiveId });
  }

  private resolveInteraction(events: GameplayEvent[]): void {
    if (this.heldEntityId) { this.dropHeldEntity(events); return; }
    const candidate = this.findInteractionCandidate(); if (!candidate) return;
    const controller = candidate.definition.controller;
    if (controller) {
      const target = this.entitiesById.get(controller.targetId); if (!target || target.active === undefined) return;
      target.active = !target.active;
      events.push({ type: "device-state-changed", actorId: "goose", controllerId: candidate.definition.id, targetId: target.definition.id, active: target.active });
      return;
    }
    if (!candidate.definition.carryable || candidate.holderId) return;
    candidate.holderId = "goose"; this.heldEntityId = candidate.definition.id; this.syncHeldEntity();
    events.push({ type: "entity-grabbed", actorId: "goose", entityId: candidate.definition.id });
  }
  private findInteractionCandidate(): MutableEntity | undefined {
    return [...this.entitiesById.values()].flatMap((entity) => {
      const control = entity.definition.controller; const carryable = entity.definition.carryable;
      if (!control && !carryable) return [];
      const point = control?.interactionPoint ?? entity.position;
      const range = control?.interactionRange ?? carryable?.interactionRange ?? 0;
      const distance = distance2d(this.position, point);
      return distance <= range && !entity.holderId ? [{ entity, distance }] : [];
    }).sort((left, right) => left.distance - right.distance || left.entity.definition.id.localeCompare(right.entity.definition.id))[0]?.entity;
  }
  private syncHeldEntity(): void {
    if (!this.heldEntityId) return;
    const entity = this.entitiesById.get(this.heldEntityId); const carryable = entity?.definition.carryable;
    if (!entity || !carryable) return;
    entity.position.x = this.position.x - Math.sin(this.heading) * carryable.carryDistance;
    entity.position.y = this.position.y + carryable.carryHeight;
    entity.position.z = this.position.z - Math.cos(this.heading) * carryable.carryDistance;
    entity.heading = this.heading;
  }
  private dropHeldEntity(events: GameplayEvent[]): void {
    if (!this.heldEntityId) return;
    const entity = this.entitiesById.get(this.heldEntityId); if (!entity) return;
    entity.holderId = undefined; entity.position.x = this.position.x - Math.sin(this.heading) * 0.62;
    entity.position.y = this.position.y; entity.position.z = this.position.z - Math.cos(this.heading) * 0.62;
    events.push({ type: "entity-dropped", actorId: "goose", entityId: entity.definition.id, position: { ...entity.position } });
    this.heldEntityId = undefined;
  }

  private updateJanitor(events: GameplayEvent[]): void {
    const janitor = this.janitor; if (!janitor) return;
    const definition = janitor.definition; const target = this.entitiesById.get(definition.observedTargetId);
    if (!target || target.active === undefined) return;
    if (!target.active && (janitor.activity === "guarding" || janitor.activity === "returning")
      && distance2d(janitor.position, definition.investigationPosition) <= definition.noticeRadius) {
      janitor.activity = "walking-to-pad"; janitor.activitySecondsRemaining = 0;
    } else if (target.active && (janitor.activity === "walking-to-pad" || janitor.activity === "inspecting")) {
      janitor.activity = "scratching"; janitor.activitySecondsRemaining = definition.scratchSeconds;
    }
    switch (janitor.activity) {
      case "walking-to-pad":
        if (this.moveJanitorToward(definition.investigationPosition)) { janitor.activity = "inspecting"; janitor.activitySecondsRemaining = definition.inspectSeconds; }
        break;
      case "inspecting":
        janitor.activitySecondsRemaining = Math.max(0, janitor.activitySecondsRemaining - FIXED_STEP);
        if (janitor.activitySecondsRemaining <= 0) {
          target.active = true;
          events.push({ type: "device-state-changed", actorId: definition.id, targetId: target.definition.id, active: true });
          janitor.activity = "returning";
        }
        break;
      case "scratching":
        janitor.activitySecondsRemaining = Math.max(0, janitor.activitySecondsRemaining - FIXED_STEP);
        if (janitor.activitySecondsRemaining <= 0) janitor.activity = "returning";
        break;
      case "returning": if (this.moveJanitorToward(definition.guardPosition)) janitor.activity = "guarding"; break;
      case "shooing":
        janitor.activitySecondsRemaining = Math.max(0, janitor.activitySecondsRemaining - FIXED_STEP);
        if (janitor.activitySecondsRemaining <= 0) janitor.activity = "guarding";
        break;
      case "guarding": if (distance2d(this.position, definition.guardPosition) <= definition.guardRadius) this.shooGoose(events); break;
    }
  }
  private updateSplashKids(events: GameplayEvent[]): void {
    for (const child of this.splashKids) {
      const definition = child.definition; const target = this.entitiesById.get(definition.observedTargetId);
      if (!target || target.active === undefined) continue;
      const threatened = (this.aggressive || this.wingsSpread) && distance2d(child.position, this.position) <= definition.threatRadius;
      if (threatened && child.activity !== "frightened" && child.activity !== "crying") {
        child.activity = "frightened"; child.activitySecondsRemaining = 0;
        child.destination = { ...definition.retreatPositions.reduce((best, candidate) =>
          distance2d(candidate, this.position) > distance2d(best, this.position) ? candidate : best) };
        events.push({ type: "splash-kid-frightened", actorId: definition.id, position: { ...child.position } });
      }
      if (child.activity === "frightened") {
        if (child.destination && this.moveSplashKidToward(child, child.destination, definition.fleeSpeed)) {
          child.activity = "crying"; child.activitySecondsRemaining = definition.crySeconds;
        }
        continue;
      }
      if (child.activity === "crying") {
        child.activitySecondsRemaining = threatened ? definition.crySeconds : Math.max(0, child.activitySecondsRemaining - FIXED_STEP);
        if (child.activitySecondsRemaining <= 0) {
          if (target.active) { child.activity = "returning"; child.destination = { ...definition.playRoute[0] }; }
          else child.activity = "away";
        }
        continue;
      }
      if (!target.active) {
        if (child.activity === "playing" || child.activity === "returning") {
          child.activity = "disappointed"; child.activitySecondsRemaining = definition.disappointedSeconds; child.destination = undefined;
        } else if (child.activity === "disappointed") {
          child.activitySecondsRemaining = Math.max(0, child.activitySecondsRemaining - FIXED_STEP);
          if (child.activitySecondsRemaining <= 0) {
            child.activity = "walking-away";
            child.destination = { ...definition.retreatPositions.reduce((best, candidate) =>
              distance2d(candidate, child.position) < distance2d(best, child.position) ? candidate : best) };
          }
        } else if (child.activity === "walking-away" && child.destination
          && this.moveSplashKidToward(child, child.destination, definition.playSpeed)) child.activity = "away";
        continue;
      }
      if (child.activity === "disappointed" || child.activity === "walking-away" || child.activity === "away") {
        child.activity = "returning"; child.activitySecondsRemaining = 0; child.destination = { ...definition.playRoute[0] };
      }
      if (child.activity === "returning") {
        if (child.destination && this.moveSplashKidToward(child, child.destination, definition.playSpeed)) {
          child.activity = "playing"; child.routeIndex = Math.min(1, definition.playRoute.length - 1); child.destination = undefined;
        }
        continue;
      }
      if (child.activity === "playing") {
        const destination = definition.playRoute[child.routeIndex];
        if (this.moveSplashKidToward(child, destination, definition.playSpeed)) child.routeIndex = (child.routeIndex + 1) % definition.playRoute.length;
      }
    }
  }
  private moveSplashKidToward(child: MutableSplashKid, destination: Readonly<Position>, speed: number): boolean {
    const dx = destination.x - child.position.x; const dz = destination.z - child.position.z;
    const distance = Math.hypot(dx, dz); const step = speed * FIXED_STEP;
    if (distance <= step) { Object.assign(child.position, destination); return true; }
    child.heading = Math.atan2(-dx, -dz); child.position.x += dx / distance * step; child.position.z += dz / distance * step;
    return false;
  }
  private moveJanitorToward(destination: Readonly<Position>): boolean {
    const janitor = this.janitor!; const dx = destination.x - janitor.position.x; const dz = destination.z - janitor.position.z;
    const distance = Math.hypot(dx, dz); const step = janitor.definition.walkSpeed * FIXED_STEP;
    if (distance <= step) { Object.assign(janitor.position, destination); return true; }
    janitor.heading = Math.atan2(-dx, -dz); janitor.position.x += dx / distance * step; janitor.position.z += dz / distance * step;
    return false;
  }
  private shooGoose(events: GameplayEvent[]): void {
    const janitor = this.janitor!; const dx = this.position.x - janitor.position.x; const dz = this.position.z - janitor.position.z;
    const length = Math.max(0.0001, Math.hypot(dx, dz)); this.pushDirection.x = dx / length; this.pushDirection.z = dz / length;
    this.spookedSeconds = SHOO_PUSH_SECONDS; this.velocity.x = 0; this.velocity.z = 0; janitor.heading = Math.atan2(-dx, -dz);
    janitor.activity = "shooing"; janitor.activitySecondsRemaining = janitor.definition.shooSeconds;
    this.dropHeldEntity(events); events.push({ type: "goose-shooed", actorId: janitor.definition.id, position: { ...this.position } });
  }
  private leavePoop(events: GameplayEvent[]): void {
    this.idleSeconds = 0; const id = `goose-poop-${this.poopSequence++}`;
    const position = { x: this.position.x + Math.sin(this.heading) * 0.34, y: this.position.y, z: this.position.z + Math.cos(this.heading) * 0.34 };
    this.poopRecords.push({ id, position }); if (this.poopRecords.length > MAX_GOOSE_POOPS) this.poopRecords.shift();
    events.push({ type: "goose-pooped", actorId: "goose", poopId: id, position: { ...position } });
  }
}
