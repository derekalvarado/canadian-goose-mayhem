import { Objectives, type ObjectiveDefinition } from "./Objectives.ts";
import { CafeCrew, type CafeCrewDefinition, type CafePersonState, type CafeWorld } from "./cafeCrew.ts";

export interface Position { x: number; y: number; z: number }
export type PlayerId = "goose" | "goose-2";
export interface PlayerState {
  readonly id: PlayerId; readonly position: Readonly<Position>; readonly velocity: Readonly<Position>;
  readonly heading: number; readonly speed: number; readonly turnAmount: number;
  readonly wingsSpread: boolean; readonly sneaking: boolean; readonly threatening: boolean; readonly spooked: boolean;
  readonly heldEntityId?: string;
}
export interface GoosePoop { readonly id: string; readonly position: Readonly<Position> }
export interface PlayerCommand {
  readonly moveX: number; readonly moveZ: number; readonly hurry: boolean; readonly honkPressed: boolean;
  readonly interactPressed?: boolean; readonly wingsSpread?: boolean; readonly sneaking?: boolean; readonly threatening?: boolean;
}
export interface CarryableDefinition {
  readonly interactionRange: number; readonly carryHeight: number; readonly carryDistance: number;
  readonly stealableWhileHeld?: boolean;
  /** Heavy items keep the goose from hurrying while it carries them. */
  readonly maxCarrySpeed?: number;
}
export interface ControllerDefinition {
  readonly targetId: string; readonly interactionPoint: Readonly<Position>; readonly interactionRange: number;
  /** A momentary control (a bell) only switches its target on; someone else switches it back off. */
  readonly momentary?: boolean;
  /** Verb shown in the interaction prompt for a momentary control, e.g. "Ring". */
  readonly verb?: string;
}
/** Capabilities that tasks and people look for instead of hard-coded object IDs. */
export type EntityTag = "drink" | "pastry" | "tip-jar" | "music" | "order-cup" | "house" | "bell";
export type EntityCondition = "clean" | "full" | "empty" | "spilled";
/** A flat top (table, counter, shelf) that dropped or placed items rest on. */
export interface PlacementSurface {
  readonly id: string; readonly kind: "table" | "counter" | "shelf";
  readonly position: Readonly<Position>; readonly rotationY: number;
  readonly halfWidth: number; readonly halfDepth: number; readonly height: number;
}
export type CleanupRole = "trash-can" | "litter" | "trash-bag" | "litter-picker";
export interface CleanupDefinition {
  readonly role: CleanupRole; readonly routeOrder?: number; readonly interactionRange?: number;
  /** Authored plaza waypoints for this routine stop; this is not a general navigation mesh. */
  readonly routeWaypoints?: readonly Readonly<Position>[];
}
export interface WorldEntityDefinition {
  readonly id: string; readonly label: string; readonly position: Readonly<Position>; readonly heading?: number;
  /** Optional catalog ID used by presentation when a carryable crosses an area boundary. */
  readonly assetId?: string;
  readonly active?: boolean; readonly controller?: ControllerDefinition; readonly carryable?: CarryableDefinition;
  readonly cleanup?: CleanupDefinition;
  readonly tags?: readonly EntityTag[];
  /** The area this object was authored in; lets tasks notice when it has been carried elsewhere. */
  readonly homeAreaId?: string;
  /** An item the world cannot work without (a janitor's tool): it returns home rather than stay stranded in another area. */
  readonly essential?: boolean;
  readonly condition?: EntityCondition;
}
export interface WorldEntityState {
  readonly id: string; readonly label: string; readonly position: Readonly<Position>; readonly heading: number;
  readonly assetId?: string;
  readonly active?: boolean; readonly holderId?: string; readonly containedBy?: string; readonly serviceCount: number;
  readonly tags: readonly EntityTag[]; readonly homeAreaId?: string;
  readonly condition?: EntityCondition; readonly orderFor?: string;
  readonly restingOn?: string; readonly restingKind?: PlacementSurface["kind"];
}
export type CleanupPhase = "trash" | "litter";
export type JanitorActivity =
  | "guarding" | "walking-to-trash" | "emptying-trash" | "walking-to-litter" | "picking-litter"
  | "walking-to-pad" | "inspecting" | "scratching" | "returning" | "reacting"
  | "pursuing-tool" | "retrieving-tool" | "chasing-goose" | "shooing";
export interface JanitorCleanupDefinition {
  readonly emptySeconds: number; readonly pickupSeconds: number; readonly reactionSeconds: number;
  readonly toolSearchSeconds: number; readonly shooRadius: number; readonly shooReach: number;
  readonly jogSpeed: number; readonly fumbleRadius: number;
}
export interface JanitorDefinition {
  readonly id: string; readonly position: Readonly<Position>; readonly heading: number;
  readonly guardPosition: Readonly<Position>; readonly investigationPosition: Readonly<Position>;
  readonly observedTargetId: string; readonly walkSpeed: number; readonly guardRadius: number;
  readonly noticeRadius: number; readonly inspectSeconds: number; readonly scratchSeconds: number; readonly shooSeconds: number;
  readonly cleanup?: JanitorCleanupDefinition;
}
export interface JanitorState {
  readonly id: string; readonly position: Readonly<Position>; readonly heading: number;
  readonly activity: JanitorActivity; readonly activitySecondsRemaining: number;
  readonly cleanupPhase?: CleanupPhase; readonly targetEntityId?: string; readonly heldToolId?: string;
  /** Set while the goose has, or has dropped, the janitor's tool and he is going after it. */
  readonly stolenToolId?: string;
  readonly completedTrashIdsThisLap: readonly string[];
}
export type SplashKidActivity = "playing" | "splashing" | "disappointed" | "walking-away" | "away" | "frightened" | "crying" | "returning";
export interface SplashKidDefinition {
  readonly id: string; readonly position: Readonly<Position>; readonly heading: number;
  readonly observedTargetId: string; readonly playRoute: readonly Readonly<Position>[];
  readonly retreatPositions: readonly Readonly<Position>[]; readonly playSpeed: number; readonly fleeSpeed: number;
  readonly threatRadius: number; readonly disappointedSeconds: number; readonly crySeconds: number;
  /** Seconds spent splashing in place at each play-route stop; 0 or absent keeps the kid moving. */
  readonly splashSeconds?: number;
}
export interface SplashKidState {
  readonly id: string; readonly position: Readonly<Position>; readonly heading: number;
  readonly activity: SplashKidActivity; readonly activitySecondsRemaining: number;
}
export interface ObjectiveZoneDefinition { readonly id: string; readonly position: Readonly<Position>; readonly radius: number; readonly factId: string; readonly guardedBy?: string }
export interface AreaTransitionDefinition {
  readonly id: string;
  readonly toAreaId: string;
  readonly triggerPosition: Readonly<Position>;
  readonly triggerRadius: number;
  readonly targetPosition: Readonly<Position>;
  readonly targetHeading: number;
}
export interface WorldSnapshot {
  readonly areaId: string;
  /** Primary player alias retained for existing objectives and presentation. */
  readonly player: PlayerState; readonly players: readonly PlayerState[]; readonly entities: readonly WorldEntityState[];
  readonly janitor?: JanitorState; readonly splashKids: readonly SplashKidState[]; readonly durableFacts: readonly string[];
  readonly cafePeople: readonly CafePersonState[];
}
export type GameplayEvent =
  | { readonly type: "goose-honked"; readonly actorId: PlayerId; readonly position: Readonly<Position> }
  | { readonly type: "goose-pooped"; readonly actorId: PlayerId; readonly poopId: string; readonly position: Readonly<Position> }
  | { readonly type: "entity-grabbed"; readonly actorId: string; readonly entityId: string }
  | { readonly type: "entity-dropped"; readonly actorId: string; readonly entityId: string; readonly position: Readonly<Position> }
  | { readonly type: "entity-recovered"; readonly actorId: string; readonly entityId: string; readonly position: Readonly<Position> }
  | { readonly type: "device-state-changed"; readonly actorId: "goose" | string; readonly controllerId?: string; readonly targetId: string; readonly active: boolean }
  | { readonly type: "trash-can-emptied"; readonly actorId: string; readonly entityId: string }
  | { readonly type: "litter-picked-up"; readonly actorId: string; readonly entityId: string; readonly containerId: string }
  | { readonly type: "janitor-fumbled"; readonly actorId: string; readonly entityId: string }
  | { readonly type: "goose-shooed"; readonly actorId: string; readonly targetId?: PlayerId; readonly position: Readonly<Position> }
  | { readonly type: "splash-kid-frightened"; readonly actorId: string; readonly position: Readonly<Position> }
  | { readonly type: "person-startled"; readonly actorId: string; readonly position: Readonly<Position> }
  | { readonly type: "drink-spilled"; readonly actorId: string; readonly entityId: string; readonly position: Readonly<Position> }
  | { readonly type: "order-called"; readonly actorId: string; readonly entityId: string; readonly forActorId: string; readonly position: Readonly<Position> }
  | { readonly type: "area-transition-requested"; readonly transitionId: string; readonly toAreaId: string; readonly targetPosition: Readonly<Position>; readonly targetHeading: number }
  | { readonly type: "objective-completed"; readonly objectiveId: string };
export interface WorldRules {
  readonly areaId?: string;
  readonly spawn: Readonly<Position>; readonly spawnHeading: number;
  readonly objectives: readonly ObjectiveDefinition<WorldSnapshot>[];
  readonly entities?: readonly WorldEntityDefinition[]; readonly janitor?: JanitorDefinition;
  readonly splashKids?: readonly SplashKidDefinition[];
  readonly objectiveZones?: readonly ObjectiveZoneDefinition[];
  readonly transitions?: readonly AreaTransitionDefinition[];
  readonly surfaces?: readonly PlacementSurface[];
  readonly cafe?: CafeCrewDefinition;
  resolveMovement(current: Readonly<Position>, proposed: Readonly<Position>, output: Position): void;
}

export interface SimulationAreaState {
  readonly areaId: string;
  readonly entities: readonly SimulationEntityState[];
}
export interface SimulationEntityState {
  readonly id: string;
  readonly definition: WorldEntityDefinition;
  readonly position: Readonly<Position>;
  readonly heading: number;
  readonly active?: boolean;
  readonly holderId?: string;
  readonly containedBy?: string;
  readonly serviceCount: number;
  readonly condition?: EntityCondition;
  readonly orderFor?: string;
  readonly restingOn?: string;
}
export interface SimulationSessionState {
  readonly durableFacts: readonly string[];
  /** Tasks already crossed off; restored silently so they are never reported twice. */
  readonly completedObjectiveIds?: readonly string[];
  /** Per-area entity snapshots let carried and dropped objects survive scene swaps. */
  readonly areaStates?: readonly SimulationAreaState[];
}

interface MutableEntity {
  readonly definition: WorldEntityDefinition; readonly position: Position; heading: number;
  active?: boolean; holderId?: string; containedBy?: string; serviceCount: number;
  condition?: EntityCondition; orderFor?: string; restingOn?: string;
}
type JanitorResume = Readonly<{ activity: JanitorActivity; targetEntityId?: string }>;
interface MutableJanitor {
  readonly definition: JanitorDefinition; readonly position: Position; heading: number;
  activity: JanitorActivity; activitySecondsRemaining: number; cleanupPhase?: CleanupPhase;
  trashIndex: number; litterIndex: number; targetEntityId?: string; resume?: JanitorResume;
  routeEntityId?: string; routeWaypointIndex: number;
  stolenToolId?: string; toolSearchSecondsRemaining: number; reactionReason?: "fumble" | "theft";
  targetPlayerId?: PlayerId;
  shooCooldownRemaining: number; completedTrashIdsThisLap: string[];
}
interface MutableSplashKid {
  readonly definition: SplashKidDefinition; readonly position: Position; heading: number;
  activity: SplashKidActivity; activitySecondsRemaining: number; routeIndex: number; destination?: Position;
}
interface MutableSecondPlayer {
  readonly id: "goose-2";
  readonly spawn: Position;
  readonly position: Position;
  readonly previousPosition: Position;
  readonly velocity: Position;
  heading: number;
  previousHeading: number;
  turnAmount: number;
  wingsSpread: boolean;
  sneaking: boolean;
  threatening: boolean;
  heldEntityId?: string;
  honkQueued: boolean;
  interactionQueued: boolean;
}
interface PlayerActorView {
  readonly id: PlayerId;
  readonly position: Position;
  readonly velocity: Position;
  readonly heldEntityId?: string;
  readonly wingsSpread: boolean;
  readonly threatening: boolean;
}

export const FIXED_STEP = 1 / 60;
export const WALK_SPEED = 3.45;
export const HURRY_SPEED = 5.7;
export const GOOSE_POOP_IDLE_SECONDS = 10;
export const MAX_GOOSE_POOPS = 10;
const MAX_STEPS_PER_FRAME = 8;
const SHOO_PUSH_SECONDS = 0.72;
const SHOO_PUSH_SPEED = 3.25;
const SHOO_COOLDOWN_SECONDS = 1.2;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const distance2d = (left: Readonly<Position>, right: Readonly<Position>): number => Math.hypot(left.x - right.x, left.z - right.z);

/** Owns gameplay state. No meshes, browser APIs, audio, or UI are allowed here. */
export class Simulation {
  private readonly rules: WorldRules;
  private readonly objectives: Objectives<WorldSnapshot>;
  private readonly position: Position = { x: 0, y: 0, z: 0 };
  private readonly previousPosition: Position = { x: 0, y: 0, z: 0 };
  private previousHeading = 0;
  private readonly velocity: Position = { x: 0, y: 0, z: 0 };
  private readonly pushDirection: Position = { x: 0, y: 0, z: 0 };
  private readonly entitiesById = new Map<string, MutableEntity>();
  private readonly persistedAreaStates = new Map<string, Map<string, SimulationEntityState>>();
  private readonly cleanupRoutes = new Map<CleanupRole, string[]>();
  private readonly durableFacts = new Set<string>();
  private readonly poopRecords: GoosePoop[] = [];
  private readonly splashKids: MutableSplashKid[] = [];
  private readonly surfaces: readonly PlacementSurface[];
  private janitor?: MutableJanitor;
  private readonly cafe?: CafeCrew;
  private heading = 0; private turnAmount = 0; private wingsSpread = false; private sneaking = false; private threatening = false;
  private accumulator = 0; private honkQueued = false; private interactionQueued = false;
  private tickCount = 0; private idleSeconds = 0; private poopSequence = 0;
  private heldEntityId?: string; private spookedSeconds = 0;
  private secondPlayer?: MutableSecondPlayer;

  constructor(rules: WorldRules, sessionState?: SimulationSessionState) {
    this.rules = rules;
    this.objectives = new Objectives(rules.objectives);
    this.surfaces = rules.surfaces ?? [];
    for (const definition of rules.entities ?? []) {
      if (this.entitiesById.has(definition.id)) throw new Error(`Duplicate world entity ID: ${definition.id}`);
      this.entitiesById.set(definition.id, { definition, position: { ...definition.position }, heading: definition.heading ?? 0,
        active: definition.active, serviceCount: 0, condition: definition.condition, restingOn: this.surfaceAt(definition.position)?.id });
    }
    for (const role of ["trash-can", "litter", "trash-bag", "litter-picker"] as const) {
      this.cleanupRoutes.set(role, [...this.entitiesById.values()].filter((entity) => entity.definition.cleanup?.role === role)
        .sort((left, right) => (left.definition.cleanup?.routeOrder ?? Number.MAX_SAFE_INTEGER)
          - (right.definition.cleanup?.routeOrder ?? Number.MAX_SAFE_INTEGER)
          || left.definition.id.localeCompare(right.definition.id)).map((entity) => entity.definition.id));
    }
    for (const entity of this.entitiesById.values()) {
      const targetId = entity.definition.controller?.targetId;
      if (!targetId) continue;
      const target = this.entitiesById.get(targetId);
      if (!target || target.active === undefined) throw new Error(`Controller ${entity.definition.id} has invalid target: ${targetId}`);
    }
    if (rules.janitor) {
      if (!this.entitiesById.has(rules.janitor.observedTargetId)) throw new Error(`Janitor has invalid observed target: ${rules.janitor.observedTargetId}`);
      if (rules.janitor.cleanup) {
        if (this.route("trash-can").length === 0) throw new Error("Janitor cleanup needs at least one trash can");
        if (this.route("trash-bag").length !== 1 || this.route("litter-picker").length !== 1) throw new Error("Janitor cleanup needs exactly one trash bag and litter picker");
      }
      this.janitor = { definition: rules.janitor, position: { ...rules.janitor.position }, heading: rules.janitor.heading,
        activity: "guarding", activitySecondsRemaining: 0, trashIndex: 0, litterIndex: 0,
        toolSearchSecondsRemaining: 0, shooCooldownRemaining: 0, completedTrashIdsThisLap: [], routeWaypointIndex: 0 };
    }
    for (const definition of rules.splashKids ?? []) {
      if (this.entitiesById.has(definition.id) || this.splashKids.some((child) => child.definition.id === definition.id)) throw new Error(`Duplicate splash kid ID: ${definition.id}`);
      const target = this.entitiesById.get(definition.observedTargetId);
      if (!target || target.active === undefined) throw new Error(`Splash kid ${definition.id} has invalid observed target: ${definition.observedTargetId}`);
      if (definition.playRoute.length === 0 || definition.retreatPositions.length === 0) throw new Error(`Splash kid ${definition.id} needs play and retreat positions`);
      this.splashKids.push({ definition, position: { ...definition.position }, heading: definition.heading,
        activity: "playing", activitySecondsRemaining: 0, routeIndex: Math.min(1, definition.playRoute.length - 1) });
    }
    if (rules.cafe) this.cafe = new CafeCrew(rules.cafe);
    this.reset();
    if (sessionState) this.restoreSessionState(sessionState);
  }

  get elapsed(): number { return this.tickCount * FIXED_STEP; }
  /** Read-only samples for presentation interpolation, never collision inputs. */
  get previousPlayerTransform(): { position: Readonly<Position>; heading: number } {
    return { position: { ...this.previousPosition }, heading: this.previousHeading };
  }
  get interpolationAlpha(): number { return clamp(this.accumulator / FIXED_STEP, 0, 1); }
  get player(): PlayerState {
    return { id: "goose", position: { ...this.position }, velocity: { ...this.velocity }, heading: this.heading,
      speed: Math.hypot(this.velocity.x, this.velocity.z), turnAmount: this.turnAmount,
      wingsSpread: this.wingsSpread, sneaking: this.sneaking, threatening: this.threatening, spooked: this.spookedSeconds > 0,
      heldEntityId: this.heldEntityId };
  }
  get secondaryPlayer(): PlayerState | undefined {
    const player = this.secondPlayer;
    if (!player) return undefined;
    return { id: player.id, position: { ...player.position }, velocity: { ...player.velocity }, heading: player.heading,
      speed: Math.hypot(player.velocity.x, player.velocity.z), turnAmount: player.turnAmount,
      wingsSpread: player.wingsSpread, sneaking: player.sneaking, threatening: player.threatening, spooked: false,
      heldEntityId: player.heldEntityId };
  }
  get players(): readonly PlayerState[] {
    const second = this.secondaryPlayer;
    return second ? [this.player, second] : [this.player];
  }
  get previousSecondaryPlayerTransform(): { position: Readonly<Position>; heading: number } | undefined {
    const player = this.secondPlayer;
    return player ? { position: { ...player.previousPosition }, heading: player.previousHeading } : undefined;
  }
  get world(): WorldSnapshot {
    const janitorTool = this.janitor ? [...this.entitiesById.values()].find((entity) => entity.holderId === this.janitor?.definition.id
      && (entity.definition.cleanup?.role === "trash-bag" || entity.definition.cleanup?.role === "litter-picker")) : undefined;
    return { areaId: this.rules.areaId ?? "", player: this.player, players: this.players, entities: [...this.entitiesById.values()].map((entity) => ({
      id: entity.definition.id, label: entity.definition.label, position: { ...entity.position }, heading: entity.heading,
      assetId: entity.definition.assetId,
      active: entity.active, holderId: entity.holderId, containedBy: entity.containedBy, serviceCount: entity.serviceCount,
      tags: entity.definition.tags ?? [], homeAreaId: entity.definition.homeAreaId,
      condition: entity.condition, orderFor: entity.orderFor,
      restingOn: entity.restingOn, restingKind: entity.restingOn ? this.surface(entity.restingOn)?.kind : undefined,
    })), janitor: this.janitor ? { id: this.janitor.definition.id, position: { ...this.janitor.position },
      heading: this.janitor.heading, activity: this.janitor.activity,
      activitySecondsRemaining: this.janitor.activitySecondsRemaining, cleanupPhase: this.janitor.cleanupPhase,
      targetEntityId: this.janitor.targetEntityId, heldToolId: janitorTool?.definition.id,
      stolenToolId: this.janitor.stolenToolId,
      completedTrashIdsThisLap: [...this.janitor.completedTrashIdsThisLap] } : undefined,
      splashKids: this.splashKids.map((child) => ({ id: child.definition.id, position: { ...child.position }, heading: child.heading,
        activity: child.activity, activitySecondsRemaining: child.activitySecondsRemaining })),
      durableFacts: [...this.durableFacts], cafePeople: this.cafe?.snapshot() ?? [] };
  }
  get objectiveList(): readonly Readonly<{ id: string; description: string; areaId?: string; completed: boolean }>[] {
    return this.rules.objectives.map((objective) => ({ id: objective.id, description: objective.description, areaId: objective.areaId,
      completed: this.objectives.isComplete(objective.id) }));
  }
  get goosePoops(): readonly GoosePoop[] { return this.poopRecords.map((poop) => ({ id: poop.id, position: { ...poop.position } })); }
  get sessionState(): SimulationSessionState {
    const currentAreaId = this.rules.areaId ?? "";
    const currentEntities = new Map<string, SimulationEntityState>();
    for (const entity of this.entitiesById.values()) {
      currentEntities.set(entity.definition.id, {
        id: entity.definition.id,
        definition: entity.definition,
        position: { ...entity.position },
        heading: entity.heading,
        active: entity.active,
        holderId: entity.holderId,
        containedBy: entity.containedBy,
        serviceCount: entity.serviceCount,
        condition: entity.condition,
        orderFor: entity.orderFor,
        restingOn: entity.restingOn,
      });
    }
    const areaStates = new Map(this.persistedAreaStates);
    areaStates.set(currentAreaId, currentEntities);
    return {
      durableFacts: [...this.durableFacts],
      completedObjectiveIds: this.objectives.completedIds,
      areaStates: [...areaStates.entries()].map(([areaId, entities]) => ({ areaId, entities: [...entities.values()] })),
    };
  }
  get interactionHint(): string | undefined {
    return this.interactionHintFor("goose");
  }
  interactionHintFor(playerId: PlayerId): string | undefined {
    const heldEntityId = playerId === "goose" ? this.heldEntityId : this.secondPlayer?.heldEntityId;
    if (heldEntityId) return `Drop ${this.entitiesById.get(heldEntityId)?.definition.label ?? "item"}`;
    const actor = playerId === "goose" ? this.position : this.secondPlayer?.position;
    if (!actor) return undefined;
    const candidate = this.findInteractionCandidate(actor, playerId);
    if (!candidate) return undefined;
    const controller = candidate.definition.controller;
    if (controller) {
      if (controller.momentary) return `${controller.verb ?? "Use"} ${candidate.definition.label}`;
      const target = this.entitiesById.get(controller.targetId);
      return `${target?.active ? "Turn off" : "Turn on"} ${candidate.definition.label}`;
    }
    if (candidate.containedBy) return `Pull out ${candidate.definition.label}`;
    if (candidate.holderId) return `Steal ${candidate.definition.label}`;
    return candidate.definition.carryable ? `Pick up ${candidate.definition.label}` : undefined;
  }
  isObjectiveComplete(id: string): boolean { return this.objectives.isComplete(id); }

  /** Repositions the player after an authored area transition without resetting the session. */
  setPlayerTransform(position: Readonly<Position>, heading = this.rules.spawnHeading): void {
    Object.assign(this.position, position); Object.assign(this.velocity, { x: 0, y: 0, z: 0 });
    Object.assign(this.pushDirection, { x: 0, y: 0, z: 0 }); this.heading = heading;
    this.turnAmount = 0; this.idleSeconds = 0; this.spookedSeconds = 0;
    this.suspend(); this.syncOwnedEntities();
  }

  /** Adds the only supported additional player without changing single-player saves. */
  enableSecondPlayer(position?: Readonly<Position>, heading = this.rules.spawnHeading): PlayerState {
    if (!this.secondPlayer) {
      const desired = position ?? { x: this.position.x + 0.9, y: this.position.y, z: this.position.z };
      const resolved = { ...this.position };
      this.rules.resolveMovement(this.position, desired, resolved);
      this.secondPlayer = {
        id: "goose-2",
        spawn: { ...resolved },
        position: { ...resolved },
        previousPosition: { ...resolved },
        velocity: { x: 0, y: 0, z: 0 },
        heading,
        previousHeading: heading,
        turnAmount: 0,
        wingsSpread: false,
        sneaking: false,
        threatening: false,
        honkQueued: false,
        interactionQueued: false,
      };
      this.secondPlayer.heldEntityId = [...this.entitiesById.values()].find((entity) => entity.holderId === "goose-2")?.definition.id;
    }
    return this.secondaryPlayer!;
  }

  setSecondPlayerTransform(position: Readonly<Position>, heading = this.rules.spawnHeading): void {
    const player = this.secondPlayer;
    if (!player) throw new Error("Goose 2 is not active.");
    Object.assign(player.position, position);
    Object.assign(player.previousPosition, position);
    Object.assign(player.velocity, { x: 0, y: 0, z: 0 });
    player.heading = heading;
    player.previousHeading = heading;
    player.turnAmount = 0;
    this.syncOwnedEntities();
  }

  /** Edges survive frames with no tick and fire once across catch-up ticks. */
  advance(delta: number, command: PlayerCommand): GameplayEvent[] {
    return this.advancePlayers(delta, command);
  }

  advancePlayers(delta: number, primaryCommand: PlayerCommand, secondaryCommand?: PlayerCommand): GameplayEvent[] {
    if (!Number.isFinite(delta) || delta <= 0) return [];
    this.honkQueued ||= primaryCommand.honkPressed;
    this.interactionQueued ||= primaryCommand.interactPressed === true;
    if (this.secondPlayer && secondaryCommand) {
      this.secondPlayer.honkQueued ||= secondaryCommand.honkPressed;
      this.secondPlayer.interactionQueued ||= secondaryCommand.interactPressed === true;
    }
    this.accumulator += Math.min(delta, FIXED_STEP * MAX_STEPS_PER_FRAME);
    const events: GameplayEvent[] = [];
    while (this.accumulator + 1e-10 >= FIXED_STEP) {
      this.accumulator = Math.max(0, this.accumulator - FIXED_STEP);
      this.step(primaryCommand, events, secondaryCommand);
    }
    return events;
  }
  suspend(): void {
    this.accumulator = 0; this.honkQueued = false; this.interactionQueued = false;
    Object.assign(this.previousPosition, this.position); this.previousHeading = this.heading;
    this.wingsSpread = false; this.sneaking = false; this.threatening = false;
    if (this.secondPlayer) {
      this.secondPlayer.honkQueued = false; this.secondPlayer.interactionQueued = false;
      Object.assign(this.secondPlayer.previousPosition, this.secondPlayer.position);
      this.secondPlayer.previousHeading = this.secondPlayer.heading;
      this.secondPlayer.wingsSpread = false; this.secondPlayer.sneaking = false; this.secondPlayer.threatening = false;
      Object.assign(this.secondPlayer.velocity, { x: 0, y: 0, z: 0 });
    }
  }
  reset(): void {
    Object.assign(this.position, this.rules.spawn); Object.assign(this.velocity, { x: 0, y: 0, z: 0 });
    Object.assign(this.pushDirection, { x: 0, y: 0, z: 0 }); this.heading = this.rules.spawnHeading;
    Object.assign(this.previousPosition, this.position); this.previousHeading = this.heading;
    this.turnAmount = 0; this.wingsSpread = false; this.sneaking = false; this.threatening = false; this.tickCount = 0;
    this.idleSeconds = 0; this.poopSequence = 0; this.heldEntityId = undefined; this.spookedSeconds = 0;
    if (this.secondPlayer) {
      const player = this.secondPlayer;
      Object.assign(player.position, player.spawn); Object.assign(player.previousPosition, player.spawn);
      Object.assign(player.velocity, { x: 0, y: 0, z: 0 });
      player.heading = this.rules.spawnHeading; player.previousHeading = player.heading; player.turnAmount = 0;
      player.wingsSpread = false; player.sneaking = false; player.threatening = false;
      player.heldEntityId = undefined; player.honkQueued = false; player.interactionQueued = false;
    }
    this.poopRecords.length = 0; this.durableFacts.clear();
    for (const entity of this.entitiesById.values()) {
      Object.assign(entity.position, entity.definition.position); entity.heading = entity.definition.heading ?? 0;
      entity.active = entity.definition.active; entity.holderId = undefined; entity.containedBy = undefined; entity.serviceCount = 0;
      entity.condition = entity.definition.condition; entity.orderFor = undefined; entity.restingOn = this.surfaceAt(entity.position)?.id;
    }
    this.cafe?.reset();
    if (this.janitor) {
      const janitor = this.janitor;
      Object.assign(janitor.position, janitor.definition.position); janitor.heading = janitor.definition.heading;
      janitor.activity = "guarding"; janitor.activitySecondsRemaining = 0; janitor.cleanupPhase = undefined;
      janitor.trashIndex = 0; janitor.litterIndex = 0; janitor.targetEntityId = undefined; janitor.resume = undefined;
      janitor.routeEntityId = undefined; janitor.routeWaypointIndex = 0;
      janitor.stolenToolId = undefined; janitor.toolSearchSecondsRemaining = 0; janitor.reactionReason = undefined;
      janitor.targetPlayerId = undefined;
      janitor.shooCooldownRemaining = 0; janitor.completedTrashIdsThisLap = [];
      if (janitor.definition.cleanup) this.beginPass("trash");
    }
    for (const child of this.splashKids) {
      Object.assign(child.position, child.definition.position); child.heading = child.definition.heading;
      child.activity = "playing"; child.activitySecondsRemaining = 0;
      child.routeIndex = Math.min(1, child.definition.playRoute.length - 1); child.destination = undefined;
    }
    this.suspend(); this.objectives.reset(); this.syncOwnedEntities();
  }

  private step(command: PlayerCommand, events: GameplayEvent[], secondaryCommand?: PlayerCommand): void {
    Object.assign(this.previousPosition, this.position); this.previousHeading = this.heading;
    if (this.secondPlayer) {
      Object.assign(this.secondPlayer.previousPosition, this.secondPlayer.position);
      this.secondPlayer.previousHeading = this.secondPlayer.heading;
    }
    this.wingsSpread = command.wingsSpread === true; this.sneaking = command.sneaking === true; this.threatening = command.threatening === true;
    const interacted = this.interactionQueued;
    if (interacted) { this.resolveInteraction(events, "goose"); this.interactionQueued = false; }
    if (this.secondPlayer?.interactionQueued) { this.resolveInteraction(events, "goose-2"); this.secondPlayer.interactionQueued = false; }
    const requestedX = Number.isFinite(command.moveX) ? command.moveX : 0;
    const requestedZ = Number.isFinite(command.moveZ) ? command.moveZ : 0;
    const length = Math.hypot(requestedX, requestedZ); const scale = 1 / Math.max(1, length);
    const acceptingMovement = this.spookedSeconds <= 0;
    const hasInput = acceptingMovement && length * length > 0.001;
    const heldMaxSpeed = this.heldEntityId ? this.entitiesById.get(this.heldEntityId)?.definition.carryable?.maxCarrySpeed : undefined;
    const speed = Math.min(command.hurry ? HURRY_SPEED : WALK_SPEED, heldMaxSpeed ?? Infinity);
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
    this.moveSecondPlayer(secondaryCommand);
    this.syncOwnedEntities();
    const honked = this.honkQueued;
    if (honked) { events.push({ type: "goose-honked", actorId: "goose", position: { ...this.position } }); this.honkQueued = false; }
    const secondHonked = this.secondPlayer?.honkQueued === true;
    if (secondHonked && this.secondPlayer) {
      events.push({ type: "goose-honked", actorId: "goose-2", position: { ...this.secondPlayer.position } });
      this.secondPlayer.honkQueued = false;
    }
    this.updateSplashKids(events);
    this.updateJanitor(events, honked || secondHonked);
    this.cafe?.update(this.cafeWorld(events, honked || secondHonked), events, FIXED_STEP);
    this.syncOwnedEntities();
    for (const zone of this.rules.objectiveZones ?? []) {
      const guarded = zone.guardedBy === this.janitor?.definition.id
        && (this.janitor?.activity === "guarding" || this.janitor?.activity === "shooing");
      if (!guarded && distance2d(this.position, zone.position) <= zone.radius) this.durableFacts.add(zone.factId);
    }
    if (hasInput || honked || interacted || this.wingsSpread || this.sneaking || this.threatening || this.spookedSeconds > 0) this.idleSeconds = 0;
    else { this.idleSeconds += FIXED_STEP; if (this.idleSeconds + 1e-10 >= GOOSE_POOP_IDLE_SECONDS) this.leavePoop(events); }
    this.tickCount += 1;
    for (const objectiveId of this.objectives.evaluate(this.world)) events.push({ type: "objective-completed", objectiveId });
    for (const transition of this.rules.transitions ?? []) {
      const crossedIntoTrigger = distance2d(this.previousPosition, transition.triggerPosition) > transition.triggerRadius
        && distance2d(this.position, transition.triggerPosition) <= transition.triggerRadius;
      if (crossedIntoTrigger) {
        events.push({ type: "area-transition-requested", transitionId: transition.id, toAreaId: transition.toAreaId,
          targetPosition: { ...transition.targetPosition }, targetHeading: transition.targetHeading });
        break;
      }
    }
  }

  private moveSecondPlayer(command?: PlayerCommand): void {
    const player = this.secondPlayer;
    if (!player) return;
    if (!command) {
      player.wingsSpread = false; player.sneaking = false; player.threatening = false; player.turnAmount = 0;
      Object.assign(player.velocity, { x: 0, y: 0, z: 0 });
      return;
    }
    player.wingsSpread = command?.wingsSpread === true;
    player.sneaking = command?.sneaking === true;
    player.threatening = command?.threatening === true;
    const requestedX = Number.isFinite(command.moveX) ? command.moveX : 0;
    const requestedZ = Number.isFinite(command.moveZ) ? command.moveZ : 0;
    const length = Math.hypot(requestedX, requestedZ); const scale = 1 / Math.max(1, length);
    const hasInput = length * length > 0.001;
    const heldMaxSpeed = player.heldEntityId ? this.entitiesById.get(player.heldEntityId)?.definition.carryable?.maxCarrySpeed : undefined;
    const speed = Math.min(command.hurry ? HURRY_SPEED : WALK_SPEED, heldMaxSpeed ?? Infinity);
    const smoothing = 1 - Math.exp(-(hasInput ? 11 : 16) * FIXED_STEP);
    player.velocity.x += ((hasInput ? requestedX * scale * speed : 0) - player.velocity.x) * smoothing;
    player.velocity.z += ((hasInput ? requestedZ * scale * speed : 0) - player.velocity.z) * smoothing;
    const proposed = { x: player.position.x + player.velocity.x * FIXED_STEP, y: player.position.y,
      z: player.position.z + player.velocity.z * FIXED_STEP };
    const resolved = { ...player.position };
    this.rules.resolveMovement(player.position, proposed, resolved);
    if (Math.abs(resolved.x - proposed.x) > 0.001) player.velocity.x *= 0.12;
    if (Math.abs(resolved.z - proposed.z) > 0.001) player.velocity.z *= 0.12;
    // Geese are controlled characters, not ghosts. Block the mover rather than
    // introducing an order-dependent push when their body circles would overlap.
    if (distance2d(resolved, this.position) >= 0.42) Object.assign(player.position, resolved);
    else Object.assign(player.velocity, { x: 0, y: 0, z: 0 });
    player.turnAmount = 0;
    if (Math.hypot(player.velocity.x, player.velocity.z) > 0.08) {
      const target = Math.atan2(-player.velocity.x, -player.velocity.z);
      const difference = Math.atan2(Math.sin(target - player.heading), Math.cos(target - player.heading));
      const previous = player.heading;
      player.heading += difference * Math.min(1, FIXED_STEP * 10.5);
      const angularVelocity = (player.heading - previous) / FIXED_STEP;
      player.turnAmount = clamp(difference * 1.8, -1, 1) + clamp(angularVelocity * 0.02, -0.25, 0.25);
    }
  }

  private restoreSessionState(state: SimulationSessionState): void {
    for (const areaState of state.areaStates ?? []) {
      this.persistedAreaStates.set(areaState.areaId, new Map(areaState.entities.map((entity) => [entity.id, entity])));
    }
    this.durableFacts.clear();
    for (const fact of state.durableFacts) this.durableFacts.add(fact);
    this.objectives.restore(state.completedObjectiveIds ?? []);
    const currentAreaId = this.rules.areaId ?? "";
    const currentEntities = this.persistedAreaStates.get(currentAreaId) ?? new Map<string, SimulationEntityState>();
    this.persistedAreaStates.set(currentAreaId, currentEntities);

    for (const [areaId, entities] of this.persistedAreaStates) {
      if (areaId === currentAreaId) continue;
      for (const [entityId, entity] of entities) {
        // A goose-held item belongs to the area it is entering. Move it out of the
        // source area's snapshot so dropping it there later does not duplicate it.
        if (entity.holderId === "goose" || entity.holderId === "goose-2") {
          entities.delete(entityId);
          currentEntities.set(entityId, entity);
          continue;
        }
        const authored = this.entitiesById.get(entityId);
        if (!authored || currentEntities.has(entityId)) continue;
        // An essential item left behind elsewhere walks home instead of stranding this area's routine.
        if (authored.definition.essential && authored.definition.homeAreaId === currentAreaId) { entities.delete(entityId); continue; }
        // Otherwise the object lives in the other area now: never rebuild a second copy at home.
        this.entitiesById.delete(entityId);
      }
    }
    for (const entityState of currentEntities.values()) {
      let entity = this.entitiesById.get(entityState.id);
      if (!entity) {
        entity = {
          definition: entityState.definition,
          position: { ...entityState.position },
          heading: entityState.heading,
          serviceCount: entityState.serviceCount,
        };
        this.entitiesById.set(entityState.id, entity);
      } else {
        Object.assign(entity.position, entityState.position);
        entity.heading = entityState.heading;
        entity.serviceCount = entityState.serviceCount;
      }
      entity.active = entityState.active;
      entity.holderId = entityState.holderId;
      entity.containedBy = entityState.containedBy;
      entity.condition = entityState.condition;
      entity.orderFor = entityState.orderFor;
      entity.restingOn = entityState.restingOn && this.surface(entityState.restingOn) ? entityState.restingOn : undefined;
      // People other than the janitor restart their routine on entry, so nothing may stay in their hands.
      if (entity.holderId && entity.holderId !== "goose" && entity.holderId !== "goose-2" && entity.holderId !== this.janitor?.definition.id) {
        entity.holderId = undefined;
        const home = entity.definition.homeAreaId === currentAreaId;
        if (home) { Object.assign(entity.position, entity.definition.position); entity.heading = entity.definition.heading ?? 0; }
        entity.restingOn = this.surfaceAt(entity.position)?.id;
      }
      if (entity.holderId === "goose") this.heldEntityId = entity.definition.id;
      if (entity.holderId === "goose-2" && this.secondPlayer) this.secondPlayer.heldEntityId = entity.definition.id;
    }
    this.syncOwnedEntities();
  }

  private resolveInteraction(events: GameplayEvent[], playerId: PlayerId): void {
    const actor = playerId === "goose" ? this.position : this.secondPlayer?.position;
    const heldEntityId = playerId === "goose" ? this.heldEntityId : this.secondPlayer?.heldEntityId;
    if (!actor) return;
    if (heldEntityId) { this.dropHeldEntity(events, playerId); return; }
    const candidate = this.findInteractionCandidate(actor, playerId); if (!candidate) return;
    const controller = candidate.definition.controller;
    if (controller) {
      const target = this.entitiesById.get(controller.targetId); if (!target || target.active === undefined) return;
      if (controller.momentary && target.active) return;
      target.active = !target.active;
      events.push({ type: "device-state-changed", actorId: playerId, controllerId: candidate.definition.id, targetId: target.definition.id, active: target.active });
      return;
    }
    if (!candidate.definition.carryable) return;
    const previousHolder = candidate.holderId;
    if (previousHolder && !candidate.definition.carryable.stealableWhileHeld) return;
    if (previousHolder) this.releaseEntity(candidate, false);
    candidate.containedBy = undefined;
    this.acquireEntity(candidate, playerId);
    if (previousHolder === this.janitor?.definition.id) this.onJanitorToolStolen(candidate);
    else if (previousHolder) this.cafe?.onItemTaken(candidate.definition.id, previousHolder);
    events.push({ type: "entity-grabbed", actorId: playerId, entityId: candidate.definition.id });
  }
  private findInteractionCandidate(actorPosition: Readonly<Position>, playerId: PlayerId): MutableEntity | undefined {
    return [...this.entitiesById.values()].flatMap((entity) => {
      const control = entity.definition.controller; const carryable = entity.definition.carryable;
      if (!control && !carryable) return [];
      if (entity.holderId && (!carryable?.stealableWhileHeld || entity.holderId === playerId
        || entity.holderId === "goose" || entity.holderId === "goose-2")) return [];
      const container = entity.containedBy ? this.entitiesById.get(entity.containedBy) : undefined;
      if (entity.containedBy && (!container || container.holderId)) return [];
      const point = control?.interactionPoint ?? container?.position ?? entity.position;
      const range = control?.interactionRange ?? carryable?.interactionRange ?? 0;
      const distance = distance2d(actorPosition, point);
      return distance <= range ? [{ entity, distance, contained: entity.containedBy ? 0 : 1 }] : [];
    }).sort((left, right) => left.distance - right.distance || left.contained - right.contained
      || left.entity.definition.id.localeCompare(right.entity.definition.id))[0]?.entity;
  }
  private acquireEntity(entity: MutableEntity, actorId: string): boolean {
    if (entity.holderId || entity.containedBy || !entity.definition.carryable) return false;
    entity.holderId = actorId; entity.restingOn = undefined;
    if (actorId === "goose") this.heldEntityId = entity.definition.id;
    else if (actorId === "goose-2" && this.secondPlayer) this.secondPlayer.heldEntityId = entity.definition.id;
    return true;
  }
  private releaseEntity(entity: MutableEntity, placeAtHome: boolean): void {
    if (entity.holderId === "goose" && this.heldEntityId === entity.definition.id) this.heldEntityId = undefined;
    if (entity.holderId === "goose-2" && this.secondPlayer?.heldEntityId === entity.definition.id) this.secondPlayer.heldEntityId = undefined;
    entity.holderId = undefined;
    if (placeAtHome) {
      Object.assign(entity.position, entity.definition.position); entity.heading = entity.definition.heading ?? 0;
      entity.restingOn = this.surfaceAt(entity.position)?.id;
    }
  }
  private surface(id: string): PlacementSurface | undefined { return this.surfaces.find((surface) => surface.id === id); }
  /** The highest authored top under a point, if any. Items resting there sit at its height. */
  private surfaceAt(point: Readonly<{ x: number; z: number }>): PlacementSurface | undefined {
    let best: PlacementSurface | undefined;
    for (const surface of this.surfaces) {
      const dx = point.x - surface.position.x; const dz = point.z - surface.position.z;
      const c = Math.cos(surface.rotationY); const s = Math.sin(surface.rotationY);
      const localX = dx * c - dz * s; const localZ = dx * s + dz * c;
      if (Math.abs(localX) > surface.halfWidth || Math.abs(localZ) > surface.halfDepth) continue;
      if (!best || surface.height > best.height) best = surface;
    }
    return best;
  }
  /** One release rule for everyone: an item set down over a table, counter, or shelf rests on it; otherwise on the floor. */
  private placeEntity(entity: MutableEntity, at: Readonly<{ x: number; z: number }>, heading: number, floorY: number): void {
    const surface = this.surfaceAt(at);
    entity.position.x = at.x; entity.position.z = at.z; entity.position.y = surface ? surface.position.y + surface.height : floorY;
    entity.heading = heading; entity.restingOn = surface?.id;
  }
  private syncOwnedEntities(): void {
    const janitor = this.janitor;
    for (const entity of this.entitiesById.values()) {
      const carryable = entity.definition.carryable;
      if (!carryable) continue;
      if (entity.holderId === "goose") {
        entity.position.x = this.position.x - Math.sin(this.heading) * carryable.carryDistance;
        entity.position.y = this.position.y + carryable.carryHeight;
        entity.position.z = this.position.z - Math.cos(this.heading) * carryable.carryDistance;
        entity.heading = this.heading;
      } else if (this.secondPlayer && entity.holderId === "goose-2") {
        entity.position.x = this.secondPlayer.position.x - Math.sin(this.secondPlayer.heading) * carryable.carryDistance;
        entity.position.y = this.secondPlayer.position.y + carryable.carryHeight;
        entity.position.z = this.secondPlayer.position.z - Math.cos(this.secondPlayer.heading) * carryable.carryDistance;
        entity.heading = this.secondPlayer.heading;
      } else if (janitor && entity.holderId === janitor.definition.id) {
        entity.position.x = janitor.position.x - Math.sin(janitor.heading) * carryable.carryDistance;
        entity.position.y = janitor.position.y + carryable.carryHeight;
        entity.position.z = janitor.position.z - Math.cos(janitor.heading) * carryable.carryDistance;
        entity.heading = janitor.heading;
      } else if (entity.holderId && this.cafe?.holdsFor(entity.holderId, entity.position)) {
        entity.heading = this.cafe.headingOf(entity.holderId) ?? entity.heading;
      } else if (entity.containedBy) {
        const container = this.entitiesById.get(entity.containedBy);
        if (container) { Object.assign(entity.position, container.position); entity.heading = container.heading; }
      }
    }
  }
  private dropHeldEntity(events: GameplayEvent[], playerId: PlayerId = "goose"): void {
    const player = playerId === "goose" ? { position: this.position, heading: this.heading, heldEntityId: this.heldEntityId }
      : this.secondPlayer;
    if (!player?.heldEntityId) return;
    const entity = this.entitiesById.get(player.heldEntityId); if (!entity) return;
    this.releaseEntity(entity, false);
    this.placeEntity(entity, { x: player.position.x - Math.sin(player.heading) * 0.62, z: player.position.z - Math.cos(player.heading) * 0.62 },
      player.heading, player.position.y);
    events.push({ type: "entity-dropped", actorId: playerId, entityId: entity.definition.id, position: { ...entity.position } });
  }

  private route(role: CleanupRole): readonly string[] { return this.cleanupRoutes.get(role) ?? []; }
  private janitorTool(role: "trash-bag" | "litter-picker"): MutableEntity { return this.entitiesById.get(this.route(role)[0])!; }
  private phaseTool(janitor: MutableJanitor): MutableEntity {
    return this.janitorTool(janitor.cleanupPhase === "trash" ? "trash-bag" : "litter-picker");
  }
  private beginPass(phase: CleanupPhase): void {
    const janitor = this.janitor!;
    janitor.cleanupPhase = phase; janitor.targetEntityId = undefined; janitor.resume = undefined;
    janitor.stolenToolId = undefined; janitor.toolSearchSecondsRemaining = 0;
    if (phase === "trash") {
      janitor.trashIndex = 0; janitor.completedTrashIdsThisLap = [];
      janitor.targetEntityId = this.route("trash-can")[0];
    } else {
      janitor.litterIndex = 0; this.selectNextLitterTarget();
    }
    janitor.activity = "retrieving-tool";
  }
  private selectNextLitterTarget(): boolean {
    const janitor = this.janitor!; const route = this.route("litter");
    while (janitor.litterIndex < route.length) {
      const candidate = this.entitiesById.get(route[janitor.litterIndex]);
      if (candidate && !candidate.holderId && !candidate.containedBy) {
        janitor.targetEntityId = candidate.definition.id; return true;
      }
      janitor.litterIndex += 1;
    }
    janitor.targetEntityId = undefined; return false;
  }
  private releasePhaseTool(): void {
    const janitor = this.janitor!; const tool = this.phaseTool(janitor);
    if (tool.holderId === janitor.definition.id) this.releaseEntity(tool, true);
  }
  private startCurrentCleanupTarget(): void {
    const janitor = this.janitor!;
    if (janitor.cleanupPhase === "trash") {
      janitor.targetEntityId = this.route("trash-can")[janitor.trashIndex];
      janitor.activity = "walking-to-trash";
      return;
    }
    if (this.selectNextLitterTarget()) janitor.activity = "walking-to-litter";
    else { this.releasePhaseTool(); this.beginPass("trash"); }
  }
  private rememberCleanupTask(): void {
    const janitor = this.janitor!;
    if (!janitor.resume) janitor.resume = { activity: janitor.activity, targetEntityId: janitor.targetEntityId };
  }
  private beginReturnToTask(): void {
    const janitor = this.janitor!;
    janitor.activity = "returning"; janitor.activitySecondsRemaining = 0;
  }
  private resumeCleanupTask(): void {
    const janitor = this.janitor!; const resume = janitor.resume;
    janitor.resume = undefined; janitor.reactionReason = undefined;
    if (resume?.targetEntityId) janitor.targetEntityId = resume.targetEntityId;
    const target = janitor.targetEntityId ? this.entitiesById.get(janitor.targetEntityId) : undefined;
    if (janitor.cleanupPhase === "trash") {
      if (!target || target.definition.cleanup?.role !== "trash-can") this.startCurrentCleanupTarget();
      else janitor.activity = "walking-to-trash";
    } else if (!target || target.holderId || target.containedBy) {
      if (target) janitor.litterIndex = Math.max(janitor.litterIndex, this.route("litter").indexOf(target.definition.id) + 1);
      this.startCurrentCleanupTarget();
    } else janitor.activity = "walking-to-litter";
  }
  private playerActor(id: PlayerId): PlayerActorView | undefined {
    if (id === "goose") return { id, position: this.position, velocity: this.velocity, heldEntityId: this.heldEntityId,
      wingsSpread: this.wingsSpread, threatening: this.threatening };
    const player = this.secondPlayer;
    return player ? { id, position: player.position, velocity: player.velocity, heldEntityId: player.heldEntityId,
      wingsSpread: player.wingsSpread, threatening: player.threatening } : undefined;
  }
  private nearestPlayer(from: Readonly<Position>, predicate: (player: PlayerActorView) => boolean = () => true): PlayerActorView | undefined {
    return ([this.playerActor("goose"), this.playerActor("goose-2")].filter((player): player is PlayerActorView => Boolean(player))
      .filter(predicate).sort((left, right) => distance2d(from, left.position) - distance2d(from, right.position)
        || left.id.localeCompare(right.id)))[0];
  }
  private onJanitorToolStolen(entity: MutableEntity): void {
    const janitor = this.janitor; const cleanup = janitor?.definition.cleanup;
    if (!janitor || !cleanup || (entity.definition.cleanup?.role !== "trash-bag" && entity.definition.cleanup?.role !== "litter-picker")) return;
    this.rememberCleanupTask(); janitor.stolenToolId = entity.definition.id;
    janitor.toolSearchSecondsRemaining = cleanup.toolSearchSeconds;
    janitor.activity = "reacting"; janitor.reactionReason = "theft";
    janitor.activitySecondsRemaining = cleanup.reactionSeconds;
  }
  private recoverStolenTool(events: GameplayEvent[]): void {
    const janitor = this.janitor!; const tool = janitor.stolenToolId ? this.entitiesById.get(janitor.stolenToolId) : undefined;
    if (!tool) return;
    if (tool.holderId === "goose" || tool.holderId === "goose-2") this.releaseEntity(tool, false);
    tool.containedBy = undefined; this.releaseEntity(tool, true);
    janitor.stolenToolId = undefined;
    events.push({ type: "entity-recovered", actorId: janitor.definition.id, entityId: tool.definition.id, position: { ...tool.position } });
    janitor.activity = "retrieving-tool";
  }
  private updateToolRecovery(events: GameplayEvent[]): boolean {
    const janitor = this.janitor!; const cleanup = janitor.definition.cleanup!;
    const tool = janitor.stolenToolId ? this.entitiesById.get(janitor.stolenToolId) : this.phaseTool(janitor);
    if (!tool) return false;
    if (tool.holderId === janitor.definition.id) {
      janitor.stolenToolId = undefined; janitor.toolSearchSecondsRemaining = 0; this.resumeCleanupTask(); return true;
    }
    if (janitor.stolenToolId) {
      janitor.toolSearchSecondsRemaining = Math.max(0, janitor.toolSearchSecondsRemaining - FIXED_STEP);
      if (janitor.toolSearchSecondsRemaining <= 0) { this.recoverStolenTool(events); return true; }
    }
    if (tool.holderId === "goose" || tool.holderId === "goose-2") {
      const player = this.playerActor(tool.holderId);
      if (!player) return false;
      janitor.targetPlayerId = player.id;
      janitor.activity = "pursuing-tool";
      if (this.moveJanitorToward(player.position, cleanup.jogSpeed) || distance2d(janitor.position, player.position) <= cleanup.shooReach) {
        this.shooGoose(events, true, player.id);
      }
      return true;
    }
    janitor.activity = "retrieving-tool";
    const reached = janitor.stolenToolId
      ? this.moveJanitorToward(tool.position, cleanup.jogSpeed)
      : this.moveJanitorAlongCleanupRoute(tool, 0);
    if (reached) {
      this.acquireEntity(tool, janitor.definition.id); janitor.stolenToolId = undefined; janitor.toolSearchSecondsRemaining = 0;
      if (janitor.resume) this.resumeCleanupTask(); else this.startCurrentCleanupTarget();
    }
    return true;
  }

  private updateJanitor(events: GameplayEvent[], honked: boolean): void {
    const janitor = this.janitor; if (!janitor) return;
    const definition = janitor.definition; const observedTarget = this.entitiesById.get(definition.observedTargetId);
    if (!observedTarget || observedTarget.active === undefined) return;
    janitor.shooCooldownRemaining = Math.max(0, janitor.shooCooldownRemaining - FIXED_STEP);
    if (!definition.cleanup) { this.updateLegacyJanitor(events, observedTarget); return; }
    const cleanup = definition.cleanup;

    if (janitor.activity === "reacting") {
      janitor.activitySecondsRemaining = Math.max(0, janitor.activitySecondsRemaining - FIXED_STEP);
      if (janitor.activitySecondsRemaining <= 0) {
        if (janitor.reactionReason === "theft") janitor.activity = "pursuing-tool";
        else this.beginReturnToTask();
      }
      return;
    }
    if (janitor.activity === "shooing") {
      janitor.activitySecondsRemaining = Math.max(0, janitor.activitySecondsRemaining - FIXED_STEP);
      if (janitor.activitySecondsRemaining <= 0) {
        if (janitor.stolenToolId) janitor.activity = "retrieving-tool";
        else this.beginReturnToTask();
      }
      return;
    }
    if (janitor.activity === "pursuing-tool" || janitor.activity === "retrieving-tool" || this.phaseTool(janitor).holderId !== definition.id) {
      if (this.updateToolRecovery(events)) return;
    }
    if (janitor.activity === "chasing-goose") {
      const player = this.playerActor(janitor.targetPlayerId ?? "goose") ?? this.nearestPlayer(janitor.position);
      if (player && (this.moveJanitorToward(player.position, cleanup.jogSpeed) || distance2d(janitor.position, player.position) <= cleanup.shooReach)) {
        this.shooGoose(events, false, player.id);
      }
      return;
    }
    const startlingPlayer = this.nearestPlayer(janitor.position, (player) => honked || player.wingsSpread || player.threatening);
    if (janitor.activity === "picking-litter" && startlingPlayer
      && distance2d(janitor.position, startlingPlayer.position) <= cleanup.fumbleRadius) {
      const entityId = janitor.targetEntityId; if (!entityId) return;
      this.rememberCleanupTask(); janitor.activity = "reacting"; janitor.reactionReason = "fumble";
      janitor.activitySecondsRemaining = cleanup.reactionSeconds;
      events.push({ type: "janitor-fumbled", actorId: definition.id, entityId }); return;
    }
    const working = janitor.activity === "walking-to-trash" || janitor.activity === "emptying-trash"
      || janitor.activity === "walking-to-litter" || janitor.activity === "picking-litter" || janitor.activity === "returning";
    const nearbyPlayer = this.nearestPlayer(janitor.position);
    if (working && nearbyPlayer && janitor.shooCooldownRemaining <= 0 && distance2d(janitor.position, nearbyPlayer.position) <= cleanup.shooRadius) {
      this.rememberCleanupTask(); janitor.targetPlayerId = nearbyPlayer.id; janitor.activity = "chasing-goose"; return;
    }
    if (!observedTarget.active && working && !janitor.resume
      && distance2d(janitor.position, definition.investigationPosition) <= definition.noticeRadius) {
      this.rememberCleanupTask(); janitor.activity = "walking-to-pad"; janitor.activitySecondsRemaining = 0;
    } else if (observedTarget.active && (janitor.activity === "walking-to-pad" || janitor.activity === "inspecting")) {
      janitor.activity = "scratching"; janitor.activitySecondsRemaining = definition.scratchSeconds;
    }
    switch (janitor.activity) {
      case "walking-to-pad":
        if (this.moveJanitorToward(definition.investigationPosition)) { janitor.activity = "inspecting"; janitor.activitySecondsRemaining = definition.inspectSeconds; }
        break;
      case "inspecting":
        janitor.activitySecondsRemaining = Math.max(0, janitor.activitySecondsRemaining - FIXED_STEP);
        if (janitor.activitySecondsRemaining <= 0) {
          observedTarget.active = true;
          events.push({ type: "device-state-changed", actorId: definition.id, targetId: observedTarget.definition.id, active: true });
          this.beginReturnToTask();
        }
        break;
      case "scratching":
        janitor.activitySecondsRemaining = Math.max(0, janitor.activitySecondsRemaining - FIXED_STEP);
        if (janitor.activitySecondsRemaining <= 0) this.beginReturnToTask();
        break;
      case "returning": {
        const target = janitor.resume?.targetEntityId ? this.entitiesById.get(janitor.resume.targetEntityId) : undefined;
        const destination = target?.position ?? definition.guardPosition;
        if (this.moveJanitorToward(destination)) this.resumeCleanupTask();
        break;
      }
      case "walking-to-trash": {
        const target = janitor.targetEntityId ? this.entitiesById.get(janitor.targetEntityId) : undefined;
        if (!target) { this.startCurrentCleanupTarget(); break; }
        if (this.moveJanitorAlongCleanupRoute(target, target.definition.cleanup?.interactionRange ?? 0)) {
          janitor.activity = "emptying-trash"; janitor.activitySecondsRemaining = cleanup.emptySeconds;
        }
        break;
      }
      case "emptying-trash": {
        janitor.activitySecondsRemaining = Math.max(0, janitor.activitySecondsRemaining - FIXED_STEP);
        if (janitor.activitySecondsRemaining > 0) break;
        const target = janitor.targetEntityId ? this.entitiesById.get(janitor.targetEntityId) : undefined;
        if (target) {
          target.serviceCount += 1; janitor.completedTrashIdsThisLap.push(target.definition.id);
          events.push({ type: "trash-can-emptied", actorId: definition.id, entityId: target.definition.id });
        }
        janitor.trashIndex += 1;
        if (janitor.trashIndex >= this.route("trash-can").length) { this.releasePhaseTool(); this.beginPass("litter"); }
        else this.startCurrentCleanupTarget();
        break;
      }
      case "walking-to-litter": {
        const target = janitor.targetEntityId ? this.entitiesById.get(janitor.targetEntityId) : undefined;
        if (!target || target.holderId || target.containedBy) {
          janitor.litterIndex += 1; this.startCurrentCleanupTarget(); break;
        }
        if (this.moveJanitorAlongCleanupRoute(target, target.definition.cleanup?.interactionRange ?? 0)) {
          janitor.activity = "picking-litter"; janitor.activitySecondsRemaining = cleanup.pickupSeconds;
        }
        break;
      }
      case "picking-litter": {
        const target = janitor.targetEntityId ? this.entitiesById.get(janitor.targetEntityId) : undefined;
        if (!target || target.holderId || target.containedBy) { janitor.litterIndex += 1; this.startCurrentCleanupTarget(); break; }
        janitor.activitySecondsRemaining = Math.max(0, janitor.activitySecondsRemaining - FIXED_STEP);
        if (janitor.activitySecondsRemaining > 0) break;
        const bag = this.janitorTool("trash-bag"); target.containedBy = bag.definition.id; target.serviceCount += 1;
        Object.assign(target.position, bag.position);
        events.push({ type: "litter-picked-up", actorId: definition.id, entityId: target.definition.id, containerId: bag.definition.id });
        janitor.litterIndex += 1; this.startCurrentCleanupTarget();
        break;
      }
      case "guarding": this.beginPass("trash"); break;
      default: break;
    }
  }
  private updateLegacyJanitor(events: GameplayEvent[], target: MutableEntity): void {
    const janitor = this.janitor!; const definition = janitor.definition;
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
      case "guarding": {
        const player = this.nearestPlayer(definition.guardPosition);
        if (player && distance2d(player.position, definition.guardPosition) <= definition.guardRadius) this.shooGoose(events, false, player.id);
        break;
      }
      default: break;
    }
  }
  private updateSplashKids(events: GameplayEvent[]): void {
    for (const child of this.splashKids) {
      const definition = child.definition; const target = this.entitiesById.get(definition.observedTargetId);
      if (!target || target.active === undefined) continue;
      const threat = this.nearestPlayer(child.position, (player) => player.threatening || player.wingsSpread);
      const threatened = Boolean(threat && distance2d(child.position, threat.position) <= definition.threatRadius);
      if (threatened && child.activity !== "frightened" && child.activity !== "crying") {
        child.activity = "frightened"; child.activitySecondsRemaining = 0;
        child.destination = this.chooseSplashKidRetreat(child, threat?.position);
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
        if (child.activity === "playing" || child.activity === "splashing" || child.activity === "returning") {
          child.activity = "disappointed"; child.activitySecondsRemaining = definition.disappointedSeconds; child.destination = undefined;
        } else if (child.activity === "disappointed") {
          child.activitySecondsRemaining = Math.max(0, child.activitySecondsRemaining - FIXED_STEP);
          if (child.activitySecondsRemaining <= 0) {
            child.activity = "walking-away";
            child.destination = this.chooseSplashKidRetreat(child);
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
      if (child.activity === "splashing") {
        child.activitySecondsRemaining = Math.max(0, child.activitySecondsRemaining - FIXED_STEP);
        if (child.activitySecondsRemaining <= 0) child.activity = "playing";
        continue;
      }
      if (child.activity === "playing") {
        const destination = definition.playRoute[child.routeIndex];
        if (this.moveSplashKidToward(child, destination, definition.playSpeed)) {
          child.routeIndex = (child.routeIndex + 1) % definition.playRoute.length;
          if ((definition.splashSeconds ?? 0) > 0) { child.activity = "splashing"; child.activitySecondsRemaining = definition.splashSeconds!; }
        }
      }
    }
  }
  /**
   * Scatter instead of flocking: prefer spots on the far side of the kid from the goose
   * (or simply nearby when walking off), and avoid spots another kid is already heading to.
   */
  private chooseSplashKidRetreat(child: MutableSplashKid, threat?: Readonly<Position>): Position {
    const claimed = this.splashKids.filter((other) => other !== child && other.destination
      && (other.activity === "frightened" || other.activity === "walking-away" || other.activity === "crying" || other.activity === "away"))
      .map((other) => other.destination!);
    const awayX = threat ? child.position.x - threat.x : 0; const awayZ = threat ? child.position.z - threat.z : 0;
    const awayLength = Math.hypot(awayX, awayZ);
    let best = child.definition.retreatPositions[0]; let bestScore = -Infinity;
    for (const candidate of child.definition.retreatPositions) {
      const dx = candidate.x - child.position.x; const dz = candidate.z - child.position.z; const distance = Math.hypot(dx, dz);
      let score = -distance;
      if (threat) {
        // Running toward the goose is worst; running straight away from it is best.
        const alignment = awayLength > 1e-6 && distance > 1e-6 ? (dx * awayX + dz * awayZ) / (distance * awayLength) : 0;
        score = alignment * 6 + distance2d(candidate, threat) * 0.5 - distance * 0.25;
      }
      if (claimed.some((spot) => distance2d(spot, candidate) < 1.5)) score -= 20;
      if (score > bestScore) { bestScore = score; best = candidate; }
    }
    return { ...best };
  }
  private moveSplashKidToward(child: MutableSplashKid, destination: Readonly<Position>, speed: number): boolean {
    const dx = destination.x - child.position.x; const dz = destination.z - child.position.z;
    const distance = Math.hypot(dx, dz); const step = speed * FIXED_STEP;
    if (distance <= step) { Object.assign(child.position, destination); return true; }
    child.heading = Math.atan2(-dx, -dz); child.position.x += dx / distance * step; child.position.z += dz / distance * step;
    return false;
  }
  private moveJanitorToward(destination: Readonly<Position>, speed = this.janitor!.definition.walkSpeed): boolean {
    const janitor = this.janitor!; const dx = destination.x - janitor.position.x; const dz = destination.z - janitor.position.z;
    const distance = Math.hypot(dx, dz); const step = speed * FIXED_STEP;
    if (distance <= step) { Object.assign(janitor.position, destination); return true; }
    janitor.heading = Math.atan2(-dx, -dz);
    janitor.position.x += dx / distance * step; janitor.position.z += dz / distance * step;
    return false;
  }
  private moveJanitorIntoCleanupRange(target: MutableEntity): boolean {
    const range = target.definition.cleanup?.interactionRange ?? 0;
    const distance = distance2d(this.janitor!.position, target.position);
    if (distance <= range) return true;
    const janitor = this.janitor!;
    this.moveJanitorToward(target.position);
    return distance2d(janitor.position, target.position) <= range;
  }
  private moveJanitorAlongCleanupRoute(target: MutableEntity, range: number): boolean {
    const janitor = this.janitor!; const waypoints = target.definition.cleanup?.routeWaypoints ?? [];
    if (janitor.routeEntityId !== target.definition.id) {
      janitor.routeEntityId = target.definition.id;
      janitor.routeWaypointIndex = waypoints.reduce((closest, waypoint, index) =>
        distance2d(janitor.position, waypoint) < distance2d(janitor.position, waypoints[closest]) ? index : closest, 0);
    }
    while (janitor.routeWaypointIndex < waypoints.length
      && distance2d(janitor.position, waypoints[janitor.routeWaypointIndex]) <= 0.001) janitor.routeWaypointIndex += 1;
    const waypoint = waypoints[janitor.routeWaypointIndex];
    if (waypoint) {
      if (this.moveJanitorToward(waypoint)) janitor.routeWaypointIndex += 1;
      return false;
    }
    if (range > 0) return this.moveJanitorIntoCleanupRange(target);
    return this.moveJanitorToward(target.position);
  }
  private shooGoose(events: GameplayEvent[], retrievingTool: boolean, playerId: PlayerId = "goose"): void {
    const janitor = this.janitor!;
    const player = this.playerActor(playerId); if (!player) return;
    janitor.heading = Math.atan2(-(player.position.x - janitor.position.x), -(player.position.z - janitor.position.z));
    if (!retrievingTool && janitor.definition.cleanup) this.rememberCleanupTask();
    janitor.activity = "shooing"; janitor.activitySecondsRemaining = janitor.definition.shooSeconds; janitor.shooCooldownRemaining = SHOO_COOLDOWN_SECONDS;
    this.pushGooseAway(janitor.definition.id, janitor.position, events, playerId);
  }
  /** The shared non-violent setback: a short push away from someone, which makes the goose let go. */
  private pushGooseAway(actorId: string, from: Readonly<Position>, events: GameplayEvent[], playerId: PlayerId = "goose"): void {
    const player = this.playerActor(playerId); if (!player) return;
    const dx = player.position.x - from.x; const dz = player.position.z - from.z;
    const length = Math.max(0.0001, Math.hypot(dx, dz));
    if (playerId === "goose") {
      this.pushDirection.x = dx / length; this.pushDirection.z = dz / length;
      this.spookedSeconds = SHOO_PUSH_SECONDS;
    }
    player.velocity.x = 0; player.velocity.z = 0;
    this.dropHeldEntity(events, playerId);
    events.push({ type: "goose-shooed", actorId, targetId: playerId, position: { ...player.position } });
  }
  /** The narrow view of the world café people act through; every grab and release uses the goose's rules. */
  private cafeWorld(events: GameplayEvent[], honked: boolean): CafeWorld {
    const view = (entity: MutableEntity) => ({
      id: entity.definition.id, position: { ...entity.position }, homePosition: { ...entity.definition.position },
      holderId: entity.holderId, containedBy: entity.containedBy, condition: entity.condition, orderFor: entity.orderFor,
      restingOn: entity.restingOn, restingKind: entity.restingOn ? this.surface(entity.restingOn)?.kind : undefined,
      tags: entity.definition.tags ?? [], active: entity.active, interactionPoint: entity.definition.controller?.interactionPoint,
    });
    const geese = ([this.playerActor("goose"), this.playerActor("goose-2")].filter((player): player is PlayerActorView => Boolean(player)))
      .map((player) => ({ id: player.id, position: { ...player.position }, heldEntityId: player.heldEntityId,
        startling: honked || player.wingsSpread || player.threatening }));
    return {
      goose: geese[0], geese,
      entity: (id) => { const entity = this.entitiesById.get(id); return entity ? view(entity) : undefined; },
      entities: () => [...this.entitiesById.values()].map(view),
      surface: (id) => this.surface(id),
      acquire: (entityId, actorId) => {
        const entity = this.entitiesById.get(entityId);
        if (!entity || !this.acquireEntity(entity, actorId)) return false;
        events.push({ type: "entity-grabbed", actorId, entityId });
        return true;
      },
      place: (entityId, actorId, at, heading) => {
        const entity = this.entitiesById.get(entityId); if (!entity || entity.holderId !== actorId) return false;
        this.releaseEntity(entity, false); this.placeEntity(entity, at, heading, at.y);
        events.push({ type: "entity-dropped", actorId, entityId, position: { ...entity.position } });
        return true;
      },
      setCondition: (entityId, condition, orderFor) => {
        const entity = this.entitiesById.get(entityId); if (!entity) return;
        entity.condition = condition; entity.orderFor = orderFor;
      },
      setActive: (entityId, active, actorId) => {
        const entity = this.entitiesById.get(entityId); if (!entity || entity.active === undefined || entity.active === active) return;
        entity.active = active;
        events.push({ type: "device-state-changed", actorId, targetId: entityId, active });
      },
      pushGoose: (actorId, from, playerId) => this.pushGooseAway(actorId, from, events, playerId ?? "goose"),
      recordFact: (factId) => { this.durableFacts.add(factId); },
      emit: (event) => { events.push(event); },
    };
  }
  private leavePoop(events: GameplayEvent[]): void {
    this.idleSeconds = 0; const id = `goose-poop-${this.poopSequence++}`;
    const position = { x: this.position.x + Math.sin(this.heading) * 0.34, y: this.position.y, z: this.position.z + Math.cos(this.heading) * 0.34 };
    this.poopRecords.push({ id, position }); if (this.poopRecords.length > MAX_GOOSE_POOPS) this.poopRecords.shift();
    events.push({ type: "goose-pooped", actorId: "goose", poopId: id, position: { ...position } });
  }
}
