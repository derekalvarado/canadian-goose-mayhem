import type { EntityCondition, EntityTag, GameplayEvent, PlacementSurface, Position } from "./Simulation.ts";

/**
 * Coffee-shop people: one barista with a work routine and several seated
 * customers. They act only through `CafeWorld`, which applies the same
 * grab/place rules the goose uses. Noticing is distance-based (no sight lines
 * yet), and walking follows an authored graph of aisle points, not a nav mesh.
 */

export const SPILLED_DRINK_FACT_ID = "cafe.drink-spilled";

export interface CafeEntity {
  readonly id: string; readonly position: Readonly<Position>; readonly homePosition: Readonly<Position>;
  readonly holderId?: string; readonly containedBy?: string;
  readonly condition?: EntityCondition; readonly orderFor?: string;
  readonly restingOn?: string; readonly restingKind?: PlacementSurface["kind"];
  readonly tags: readonly EntityTag[]; readonly active?: boolean; readonly interactionPoint?: Readonly<Position>;
}
export interface CafeWorld {
  readonly goose: Readonly<{ position: Readonly<Position>; heldEntityId?: string; startling: boolean }>;
  entity(id: string): CafeEntity | undefined;
  entities(): readonly CafeEntity[];
  surface(id: string): PlacementSurface | undefined;
  acquire(entityId: string, actorId: string): boolean;
  place(entityId: string, actorId: string, at: Readonly<Position>, heading: number): boolean;
  setCondition(entityId: string, condition: EntityCondition | undefined, orderFor?: string): void;
  setActive(entityId: string, active: boolean, actorId: string): void;
  pushGoose(actorId: string, from: Readonly<Position>): void;
  recordFact(factId: string): void;
  emit(event: GameplayEvent): void;
}

export interface CafeStation { readonly position: Readonly<Position>; readonly heading: number }
export interface CafeRoutes { readonly nodes: readonly Readonly<Position>[]; readonly edges: readonly (readonly [number, number])[] }
export interface CafeZone { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }

export interface BaristaDefinition {
  readonly id: string; readonly variant: string;
  readonly position: Readonly<Position>; readonly heading: number;
  /** Where she idles and takes orders, where she brews, and where finished orders go. */
  readonly register: CafeStation; readonly machine: CafeStation; readonly pickup: CafeStation;
  /** Floor spot on the counter's customer side where a customer collects an order. */
  readonly pickupApproach: Readonly<Position>;
  /** The walkway behind the counter; counter and shelf items are reached from here. */
  readonly aisle: readonly [Readonly<Position>, Readonly<Position>];
  /** Behind the counter: the goose is shooed out of here. */
  readonly staffZone: CafeZone;
  readonly walkSpeed: number; readonly jogSpeed: number;
  readonly noticeRadius: number; readonly shooReach: number; readonly chaseSeconds: number;
  readonly brewSeconds: number; readonly fixSeconds: number; readonly greetSeconds: number;
  readonly wipeSeconds: number; readonly shooSeconds: number; readonly startleRadius: number;
  /** The front door: when a timid customer is frightened she herds the goose out through it. */
  readonly exitPoint?: Readonly<Position>;
  /** How long she keeps herding after the last shove before giving up. */
  readonly evictSeconds: number;
}
export interface CustomerDefinition {
  readonly id: string; readonly variant: string;
  readonly seat: Readonly<Position>; readonly heading: number;
  readonly tableSurfaceId: string;
  /** Where on their table they set a drink down. */
  readonly drinkSpot: Readonly<Position>;
  /** Their own mug, if they came in with one. Customers without one order from the barista. */
  readonly drinkId?: string;
  readonly ordersDrinks: boolean;
  /** Customers who look up from their reading shoo a goose that comes right up to their table. */
  readonly guardsTable: boolean;
  /** Timid people get frightened (and the barista comes to their rescue); bold ones wave the goose off themselves. */
  readonly temperament: "timid" | "bold";
  readonly shooReach: number;
  readonly workSeconds: number; readonly sipSeconds: number; readonly sipsPerOrder: number;
  readonly startleRadius: number; readonly guardRadius: number; readonly walkSpeed: number;
}
export interface CafeCrewDefinition {
  readonly barista?: BaristaDefinition;
  readonly customers: readonly CustomerDefinition[];
  /** Kitchen staff who work a loop of stations and keep the goose out of their way. */
  readonly workers?: readonly WorkerDefinition[];
  readonly routes: CafeRoutes;
}

export type WorkerTask = "kneading" | "baking" | "stocking" | "washing";
export interface WorkerStation { readonly position: Readonly<Position>; readonly heading: number; readonly task: WorkerTask }
export interface WorkerDefinition {
  readonly id: string; readonly variant: string;
  readonly position: Readonly<Position>; readonly heading: number;
  readonly stations: readonly WorkerStation[];
  readonly walkSpeed: number; readonly stationSeconds: number;
  /** The goose may not come closer than this while they work; a honk or flap inside `startleRadius` also gets a shoo. */
  readonly guardRadius: number; readonly startleRadius: number; readonly shooReach: number; readonly shooSeconds: number;
}
export type WorkerActivity = WorkerTask | "walking" | "shooing";

export type BaristaActivity =
  | "idle" | "walking" | "brewing" | "serving" | "calling" | "clearing" | "returning-item"
  | "fixing-radio" | "greeting" | "wiping" | "chasing" | "shooing" | "startled";
export type CustomerActivity =
  | "working" | "sipping" | "looking-up" | "startled" | "dabbing" | "waiting" | "shooing"
  | "walking-to-pickup" | "returning-to-seat" | "puzzled";
export interface CafePersonState {
  readonly id: string; readonly role: "barista" | "customer" | "worker"; readonly variant: string;
  readonly position: Readonly<Position>; readonly heading: number;
  readonly activity: BaristaActivity | CustomerActivity | WorkerActivity; readonly activitySecondsRemaining: number;
  readonly seated: boolean; readonly heldEntityId?: string; readonly tableSurfaceId?: string;
  /** True when they walked this tick; presentation uses it to pick a walk or a standing clip. */
  readonly moving: boolean;
}

type BaristaJob =
  | { kind: "serve"; customerId: string; cupId: string; stage: "fetch" | "brew" | "deliver" | "call" }
  | { kind: "clear"; entityId: string; stage: "fetch" | "stow" }
  | { kind: "return"; entityId: string; stage: "fetch" | "stow" }
  | { kind: "radio"; entityId: string; stage: "go" | "fix" }
  | { kind: "bell"; entityId: string; stage: "go" | "greet" }
  | { kind: "wipe"; surfaceId: string; stage: "go" | "wipe" }
  | { kind: "chase" }
  | { kind: "shoo" }
  | { kind: "startled" }
  | { kind: "evict" }
  | { kind: "idle" };

interface Walker { readonly position: Position; heading: number; path: Position[]; pathTarget?: Position; replanSeconds: number; moved: boolean }
interface MutableBarista extends Walker {
  readonly definition: BaristaDefinition; job?: BaristaJob; timer: number; heldEntityId?: string;
  chaseCooldown: number; startleCooldown: number; readonly spills: string[];
  /** While above zero she is herding the goose out of the shop. */
  evictSeconds: number; shoveCooldown: number;
}
interface MutableWorker extends Walker {
  readonly definition: WorkerDefinition; activity: WorkerActivity; timer: number; stationIndex: number; shooCooldown: number; heldEntityId?: string;
}
interface MutableCustomer extends Walker {
  readonly definition: CustomerDefinition; activity: CustomerActivity; timer: number; heldEntityId?: string;
  sipsLeft: number; startleCooldown: number; resumeActivity: CustomerActivity;
}

const ARRIVE = 0.06;
const REPLAN_SECONDS = 0.4;
const REACH = 1.05;
const PICKUP_REACH = 1.6;
const distance2d = (a: Readonly<Position>, b: Readonly<Position>): number => Math.hypot(a.x - b.x, a.z - b.z);
const inZone = (zone: CafeZone, p: Readonly<Position>): boolean => p.x >= zone.minX && p.x <= zone.maxX && p.z >= zone.minZ && p.z <= zone.maxZ;

export class CafeCrew {
  private readonly definition: CafeCrewDefinition;
  private barista?: MutableBarista;
  private readonly customers: MutableCustomer[] = [];
  private readonly workers: MutableWorker[] = [];

  constructor(definition: CafeCrewDefinition) {
    this.definition = definition;
    const ids = [definition.barista?.id, ...definition.customers.map((customer) => customer.id),
      ...(definition.workers ?? []).map((worker) => worker.id)].filter(Boolean);
    if ((definition.workers ?? []).some((worker) => worker.stations.length === 0)) throw new Error("A café worker needs at least one station");
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate café person ID");
    if (definition.routes.edges.some(([a, b]) => !definition.routes.nodes[a] || !definition.routes.nodes[b])) throw new Error("Café route edge points at a missing node");
    this.reset();
  }

  reset(): void {
    const barista = this.definition.barista;
    this.barista = barista ? { definition: barista, position: { ...barista.position }, heading: barista.heading, path: [], replanSeconds: 0, moved: false,
      timer: 0, chaseCooldown: 0, startleCooldown: 0, spills: [], evictSeconds: 0, shoveCooldown: 0 } : undefined;
    this.customers.length = 0;
    for (const definition of this.definition.customers) {
      this.customers.push({ definition, position: { ...definition.seat }, heading: definition.heading, path: [], replanSeconds: 0, moved: false,
        activity: definition.ordersDrinks ? "waiting" : "working", resumeActivity: "working", timer: definition.workSeconds,
        sipsLeft: 0, startleCooldown: 0 });
    }
    this.workers.length = 0;
    for (const definition of this.definition.workers ?? []) {
      this.workers.push({ definition, position: { ...definition.position }, heading: definition.heading, path: [], replanSeconds: 0, moved: false,
        activity: "walking", timer: 0, stationIndex: 0, shooCooldown: 0 });
    }
  }

  snapshot(): CafePersonState[] {
    const people: CafePersonState[] = [];
    const barista = this.barista;
    if (barista) {
      people.push({ id: barista.definition.id, role: "barista", variant: barista.definition.variant, position: { ...barista.position },
        heading: barista.heading, activity: this.baristaActivity(barista), activitySecondsRemaining: barista.timer, seated: false,
        heldEntityId: barista.heldEntityId, moving: barista.moved });
    }
    for (const customer of this.customers) {
      people.push({ id: customer.definition.id, role: "customer", variant: customer.definition.variant, position: { ...customer.position },
        heading: customer.heading, activity: customer.activity, activitySecondsRemaining: customer.timer, seated: this.isSeated(customer),
        heldEntityId: customer.heldEntityId, tableSurfaceId: customer.definition.tableSurfaceId, moving: customer.moved });
    }
    for (const worker of this.workers) {
      people.push({ id: worker.definition.id, role: "worker", variant: worker.definition.variant, position: { ...worker.position },
        heading: worker.heading, activity: worker.activity, activitySecondsRemaining: worker.timer, seated: false, moving: worker.moved });
    }
    return people;
  }

  /** Writes where a held item sits for this person; false when the ID is not one of them. */
  holdsFor(actorId: string, out: Position): boolean {
    const person = this.person(actorId); if (!person) return false;
    out.x = person.position.x - Math.sin(person.heading) * 0.45;
    out.y = person.position.y + 1.3;
    out.z = person.position.z - Math.cos(person.heading) * 0.45;
    return true;
  }
  headingOf(actorId: string): number | undefined { return this.person(actorId)?.heading; }

  /** The goose snatched something straight out of someone's hands. */
  onItemTaken(entityId: string, fromActorId: string): void {
    const person = this.person(fromActorId);
    if (person?.heldEntityId === entityId) person.heldEntityId = undefined;
    if (this.barista && person === this.barista) this.barista.job = { kind: "chase" };
  }

  update(world: CafeWorld, events: GameplayEvent[], dt: number): void {
    for (const walker of [...this.customers, ...this.workers, ...(this.barista ? [this.barista] : [])]) walker.moved = false;
    for (const customer of this.customers) this.updateCustomer(customer, world, events, dt);
    for (const worker of this.workers) this.updateWorker(worker, world, dt);
    if (this.barista) this.updateBarista(this.barista, world, events, dt);
  }

  private person(id: string): MutableBarista | MutableCustomer | MutableWorker | undefined {
    if (this.barista?.definition.id === id) return this.barista;
    return this.customers.find((customer) => customer.definition.id === id) ?? this.workers.find((worker) => worker.definition.id === id);
  }

  // --- Kitchen workers ---------------------------------------------------------------------------

  /** Station to station around the kitchen; a goose underfoot gets waved off, then work resumes. */
  private updateWorker(worker: MutableWorker, world: CafeWorld, dt: number): void {
    const definition = worker.definition; const goose = world.goose;
    worker.shooCooldown = Math.max(0, worker.shooCooldown - dt);
    const gooseDistance = distance2d(worker.position, goose.position);
    const bothered = gooseDistance <= definition.guardRadius || (goose.startling && gooseDistance <= definition.startleRadius);
    if (bothered && worker.shooCooldown <= 0 && worker.activity !== "shooing") {
      this.face(worker, goose.position);
      if (gooseDistance <= definition.shooReach) world.pushGoose(definition.id, worker.position);
      worker.activity = "shooing"; worker.timer = definition.shooSeconds; worker.shooCooldown = definition.shooSeconds + 0.8;
      worker.path = [];
      return;
    }
    const station = definition.stations[worker.stationIndex];
    switch (worker.activity) {
      case "shooing":
        worker.timer -= dt;
        if (worker.timer <= 0) worker.activity = "walking";
        break;
      case "walking":
        if (this.walkTo(worker, station.position, definition.walkSpeed, dt, ARRIVE)) {
          Object.assign(worker.position, station.position); worker.heading = station.heading;
          worker.activity = station.task; worker.timer = definition.stationSeconds;
        }
        break;
      default:
        worker.timer -= dt;
        if (worker.timer <= 0) {
          worker.stationIndex = (worker.stationIndex + 1) % definition.stations.length;
          worker.activity = "walking"; worker.path = [];
        }
    }
  }

  // --- Barista -----------------------------------------------------------------------------------

  private baristaActivity(barista: MutableBarista): BaristaActivity {
    const job = barista.job; const moving = barista.path.length > 0;
    if (!job) return "idle";
    switch (job.kind) {
      case "serve": return job.stage === "brew" ? "brewing" : job.stage === "call" ? "calling" : job.stage === "deliver" ? "serving" : "walking";
      case "clear": return "clearing";
      case "return": return "returning-item";
      case "radio": return job.stage === "fix" ? "fixing-radio" : "walking";
      case "bell": return job.stage === "greet" ? "greeting" : "walking";
      case "wipe": return job.stage === "wipe" ? "wiping" : "walking";
      case "chase": return "chasing";
      case "shoo": return "shooing";
      case "startled": return "startled";
      case "evict": return barista.shoveCooldown > 0.4 ? "shooing" : "chasing";
      case "idle": return moving ? "walking" : "idle";
    }
  }

  private updateBarista(barista: MutableBarista, world: CafeWorld, events: GameplayEvent[], dt: number): void {
    const definition = barista.definition;
    barista.chaseCooldown = Math.max(0, barista.chaseCooldown - dt);
    barista.startleCooldown = Math.max(0, barista.startleCooldown - dt);
    if (barista.heldEntityId && world.entity(barista.heldEntityId)?.holderId !== definition.id) barista.heldEntityId = undefined;
    const goose = world.goose;
    const gooseDistance = distance2d(barista.position, goose.position);

    // A fright makes her fumble a full drink she is carrying.
    const carried = barista.heldEntityId ? world.entity(barista.heldEntityId) : undefined;
    if (goose.startling && carried?.condition === "full" && gooseDistance <= definition.startleRadius && barista.startleCooldown <= 0) {
      this.spill(barista, carried, world, events);
      barista.job = { kind: "startled" }; barista.timer = 0.9; barista.path = [];
      return;
    }

    barista.shoveCooldown = Math.max(0, barista.shoveCooldown - dt);
    if (barista.evictSeconds > 0 && barista.job?.kind !== "evict" && barista.job?.kind !== "startled") {
      barista.job = { kind: "evict" }; barista.path = []; barista.pathTarget = undefined;
    }
    if (barista.job?.kind !== "shoo" && barista.job?.kind !== "startled" && barista.job?.kind !== "evict" && barista.chaseCooldown <= 0) {
      const heldByGoose = goose.heldEntityId ? world.entity(goose.heldEntityId) : undefined;
      const theft = heldByGoose && this.isHouseItem(heldByGoose) && gooseDistance <= definition.noticeRadius;
      const intruding = inZone(definition.staffZone, goose.position) && gooseDistance <= definition.noticeRadius;
      if ((theft || intruding) && barista.job?.kind !== "chase") { barista.job = { kind: "chase" }; barista.timer = definition.chaseSeconds; barista.path = []; }
    }

    if (!barista.job || barista.job.kind === "idle") {
      const next = this.chooseBaristaJob(barista, world);
      if (next) { barista.job = next; barista.path = []; barista.pathTarget = undefined; }
      else if (!barista.job) barista.job = { kind: "idle" };
    }
    const job = barista.job!;
    switch (job.kind) {
      case "chase": {
        barista.timer -= dt;
        const heldByGoose = goose.heldEntityId ? world.entity(goose.heldEntityId) : undefined;
        const stillWanted = (heldByGoose && this.isHouseItem(heldByGoose)) || inZone(definition.staffZone, goose.position);
        if (barista.timer <= 0 || !stillWanted || gooseDistance > definition.noticeRadius * 1.6) { this.finishJob(barista); break; }
        if (gooseDistance <= definition.shooReach) {
          barista.heading = Math.atan2(-(goose.position.x - barista.position.x), -(goose.position.z - barista.position.z));
          world.pushGoose(definition.id, barista.position);
          barista.job = { kind: "shoo" }; barista.timer = definition.shooSeconds; barista.path = [];
          break;
        }
        this.walkTo(barista, goose.position, definition.jogSpeed, dt, definition.shooReach * 0.9);
        break;
      }
      case "evict": {
        barista.evictSeconds = Math.max(0, barista.evictSeconds - dt);
        if (barista.evictSeconds <= 0) { this.finishJob(barista); break; }
        if (gooseDistance <= definition.shooReach && barista.shoveCooldown <= 0) {
          // Each shove sends the goose along the aisles toward the front door.
          const toward = this.exitStep(goose.position, barista);
          const dx = toward.x - goose.position.x; const dz = toward.z - goose.position.z; const length = Math.hypot(dx, dz) || 1;
          this.face(barista, goose.position);
          world.pushGoose(definition.id, { x: goose.position.x - dx / length, y: goose.position.y, z: goose.position.z - dz / length });
          barista.shoveCooldown = 0.8; barista.evictSeconds = Math.max(barista.evictSeconds, definition.evictSeconds);
          barista.path = [];
        } else if (barista.shoveCooldown <= 0.4) this.walkTo(barista, goose.position, definition.jogSpeed, dt, definition.shooReach * 0.8);
        break;
      }
      case "shoo": case "startled":
        barista.timer -= dt;
        if (barista.timer <= 0) { barista.chaseCooldown = job.kind === "shoo" ? 1.2 : 0; barista.startleCooldown = 1.5; this.finishJob(barista); }
        break;
      case "serve": this.runServe(barista, job, world, dt); break;
      case "clear": case "return": this.runFetchAndStow(barista, job, world, dt); break;
      case "radio": {
        const radio = world.entity(job.entityId);
        if (!radio || radio.active) { this.finishJob(barista); break; }
        if (job.stage === "go") {
          if (this.walkTo(barista, radio.interactionPoint ?? radio.position, definition.walkSpeed, dt, 0.35)) {
            this.face(barista, radio.position); job.stage = "fix"; barista.timer = definition.fixSeconds;
          }
        } else {
          barista.timer -= dt;
          if (barista.timer <= 0) { world.setActive(radio.id, true, definition.id); this.finishJob(barista); }
        }
        break;
      }
      case "bell": {
        const bell = world.entity(job.entityId);
        if (!bell) { this.finishJob(barista); break; }
        if (job.stage === "go") {
          if (this.walkTo(barista, definition.register.position, definition.walkSpeed, dt, ARRIVE)) {
            barista.heading = definition.register.heading; job.stage = "greet"; barista.timer = definition.greetSeconds;
          }
        } else {
          barista.timer -= dt;
          if (barista.timer <= 0) { world.setActive(bell.id, false, definition.id); this.finishJob(barista); }
        }
        break;
      }
      case "wipe": {
        const surface = world.surface(job.surfaceId);
        if (!surface) { this.finishJob(barista); break; }
        if (job.stage === "go") {
          if (this.walkTo(barista, surface.position, definition.walkSpeed, dt, Math.max(surface.halfWidth, surface.halfDepth) + 0.55)) {
            this.face(barista, surface.position); job.stage = "wipe"; barista.timer = definition.wipeSeconds;
          }
        } else {
          barista.timer -= dt;
          if (barista.timer <= 0) { barista.spills.splice(barista.spills.indexOf(job.surfaceId), 1); this.finishJob(barista); }
        }
        break;
      }
      case "idle":
        if (this.walkTo(barista, definition.register.position, definition.walkSpeed, dt, ARRIVE)) barista.heading = definition.register.heading;
        break;
    }
  }

  private finishJob(barista: MutableBarista): void { barista.job = undefined; barista.path = []; barista.pathTarget = undefined; barista.timer = 0; }

  /** Jobs come from what she can see in the room, so any interruption simply re-reads the room. */
  private chooseBaristaJob(barista: MutableBarista, world: CafeWorld): BaristaJob | undefined {
    const entities = world.entities();
    const held = barista.heldEntityId ? world.entity(barista.heldEntityId) : undefined;
    if (held) {
      if (held.tags.includes("order-cup") && held.condition === "full" && held.orderFor) return { kind: "serve", customerId: held.orderFor, cupId: held.id, stage: "deliver" };
      if (held.tags.includes("order-cup") && held.condition === "clean") {
        const waiting = this.customers.find((customer) => this.wantsOrder(customer, entities));
        if (waiting) return { kind: "serve", customerId: waiting.definition.id, cupId: held.id, stage: "brew" };
        return { kind: "clear", entityId: held.id, stage: "stow" };
      }
      if (held.tags.includes("order-cup")) return { kind: "clear", entityId: held.id, stage: "stow" };
      return { kind: "return", entityId: held.id, stage: "stow" };
    }
    const radio = entities.find((entity) => entity.tags.includes("music") && entity.active === false);
    if (radio) return { kind: "radio", entityId: radio.id, stage: "go" };
    const bell = entities.find((entity) => entity.tags.includes("bell") && entity.active === true);
    if (bell) return { kind: "bell", entityId: bell.id, stage: "go" };
    const stray = entities.find((entity) => this.isHouseItem(entity) && !entity.tags.includes("order-cup") && !entity.holderId
      && distance2d(entity.position, entity.homePosition) > 0.05);
    if (stray) return { kind: "return", entityId: stray.id, stage: "fetch" };
    if (barista.spills.length > 0) return { kind: "wipe", surfaceId: barista.spills[0], stage: "go" };
    const dish = entities.find((entity) => entity.tags.includes("order-cup") && !entity.holderId && this.needsClearing(entity));
    if (dish) return { kind: "clear", entityId: dish.id, stage: "fetch" };
    const waiting = this.customers.find((customer) => this.wantsOrder(customer, entities));
    const cup = entities.find((entity) => entity.tags.includes("order-cup") && !entity.holderId && entity.condition === "clean" && entity.restingKind === "shelf");
    if (waiting && cup) return { kind: "serve", customerId: waiting.definition.id, cupId: cup.id, stage: "fetch" };
    return undefined;
  }

  private runServe(barista: MutableBarista, job: Extract<BaristaJob, { kind: "serve" }>, world: CafeWorld, dt: number): void {
    const definition = barista.definition; const cup = world.entity(job.cupId);
    if (!cup) { this.finishJob(barista); return; }
    if (job.stage === "fetch") {
      if (cup.holderId || cup.condition !== "clean") { this.finishJob(barista); return; }
      if (this.walkTo(barista, this.serviceSpot(barista, cup.position), definition.walkSpeed, dt, ARRIVE)) {
        this.face(barista, cup.position);
        if (world.acquire(cup.id, definition.id)) { barista.heldEntityId = cup.id; job.stage = "brew"; }
        else this.finishJob(barista);
      }
    } else if (job.stage === "brew") {
      if (cup.holderId !== definition.id) { this.finishJob(barista); return; }
      if (barista.timer <= 0 && this.walkTo(barista, definition.machine.position, definition.walkSpeed, dt, ARRIVE)) {
        barista.heading = definition.machine.heading; barista.timer = definition.brewSeconds + dt;
      }
      if (barista.timer > 0) {
        barista.timer -= dt;
        if (barista.timer <= 0) { world.setCondition(cup.id, "full", job.customerId); job.stage = "deliver"; barista.timer = 0; }
      }
    } else if (job.stage === "deliver") {
      if (cup.holderId !== definition.id) { this.finishJob(barista); return; }
      if (this.walkTo(barista, definition.pickup.position, definition.walkSpeed, dt, ARRIVE)) {
        barista.heading = definition.pickup.heading;
        const spot = this.pickupSpot(barista);
        if (world.place(cup.id, definition.id, spot, definition.pickup.heading)) {
          barista.heldEntityId = undefined; job.stage = "call"; barista.timer = 1.1;
          world.emit({ type: "order-called", actorId: definition.id, entityId: cup.id, forActorId: job.customerId,
            position: { ...(world.entity(cup.id)?.position ?? spot) } });
        } else this.finishJob(barista);
      }
    } else {
      barista.timer -= dt;
      if (barista.timer <= 0) this.finishJob(barista);
    }
  }

  private runFetchAndStow(barista: MutableBarista, job: Extract<BaristaJob, { kind: "clear" | "return" }>, world: CafeWorld, dt: number): void {
    const definition = barista.definition; const item = world.entity(job.entityId);
    if (!item) { barista.heldEntityId = undefined; this.finishJob(barista); return; }
    if (job.stage === "fetch") {
      if (item.holderId) { this.finishJob(barista); return; }
      const onTop = item.restingKind === "counter" || item.restingKind === "shelf";
      const target = onTop ? this.serviceSpot(barista, item.position) : item.position;
      if (this.walkTo(barista, target, definition.walkSpeed, dt, onTop ? ARRIVE : REACH)) {
        this.face(barista, item.position);
        if (world.acquire(item.id, definition.id)) { barista.heldEntityId = item.id; job.stage = "stow"; }
        else this.finishJob(barista);
      }
      return;
    }
    if (item.holderId !== definition.id) { this.finishJob(barista); return; }
    if (this.walkTo(barista, this.serviceSpot(barista, item.homePosition), definition.walkSpeed, dt, ARRIVE)) {
      this.face(barista, item.homePosition);
      if (job.kind === "clear") world.setCondition(item.id, "clean", undefined);
      if (world.place(item.id, definition.id, item.homePosition, 0)) barista.heldEntityId = undefined;
      this.finishJob(barista);
    }
  }

  /** The next aisle point on the way from the goose to the front door (or straight away from her without one). */
  private exitStep(from: Readonly<Position>, barista: MutableBarista): Position {
    const exit = barista.definition.exitPoint;
    if (!exit) return { x: from.x * 2 - barista.position.x, y: from.y, z: from.z * 2 - barista.position.z };
    if (distance2d(from, exit) < 2.5) return { ...exit };
    const path = this.route(from, exit);
    const next = path.find((point) => distance2d(point, from) > 0.6) ?? exit;
    return { ...next };
  }

  /** A frightened timid customer brings the barista running to herd the goose out. */
  private callForHelp(): void {
    if (this.barista) this.barista.evictSeconds = Math.max(this.barista.evictSeconds, this.barista.definition.evictSeconds);
  }

  /** Items that belong behind or on the counter: she chases them and puts them back. */
  private isHouseItem(entity: CafeEntity): boolean { return entity.tags.includes("house") || entity.tags.includes("order-cup"); }

  private needsClearing(cup: CafeEntity): boolean {
    if (cup.condition === "empty" || cup.condition === "spilled") return true;
    if (cup.condition === "clean") return cup.restingKind !== "shelf";
    // A full order is fine waiting at pickup or on its customer's table; anywhere else it has gone astray.
    if (cup.restingKind === "counter") return false;
    const owner = this.customers.find((customer) => customer.definition.id === cup.orderFor);
    return !owner || cup.restingOn !== owner.definition.tableSurfaceId;
  }

  private wantsOrder(customer: MutableCustomer, entities: readonly CafeEntity[]): boolean {
    if (!customer.definition.ordersDrinks || customer.activity !== "waiting") return false;
    return !entities.some((entity) => entity.tags.includes("order-cup") && entity.orderFor === customer.definition.id
      && entity.condition === "full" && entity.holderId !== "goose" && (entity.holderId || entity.restingKind === "counter" || entity.restingKind === "table"));
  }

  /** The point on her walkway nearest to something on the counter or back shelf. */
  private serviceSpot(barista: MutableBarista, target: Readonly<Position>): Position {
    const [a, b] = barista.definition.aisle;
    const abx = b.x - a.x; const abz = b.z - a.z; const lengthSq = abx * abx + abz * abz || 1;
    const t = Math.max(0, Math.min(1, ((target.x - a.x) * abx + (target.z - a.z) * abz) / lengthSq));
    return { x: a.x + abx * t, y: a.y, z: a.z + abz * t };
  }
  private pickupSpot(barista: MutableBarista): Position {
    const station = barista.definition.pickup; const approach = barista.definition.pickupApproach;
    // Halfway across the counter top, on the customer side of the barista.
    return { x: (station.position.x + approach.x) / 2 + (approach.x - station.position.x) * 0.18, y: station.position.y,
      z: (station.position.z + approach.z) / 2 };
  }

  private spill(person: MutableBarista | MutableCustomer, drink: CafeEntity, world: CafeWorld, events: GameplayEvent[]): void {
    const actorId = person.definition.id;
    world.setCondition(drink.id, "spilled", drink.orderFor);
    if (drink.holderId === actorId) {
      world.place(drink.id, actorId, { x: person.position.x - Math.sin(person.heading) * 0.55, y: person.position.y,
        z: person.position.z - Math.cos(person.heading) * 0.55 }, person.heading);
      person.heldEntityId = undefined;
    }
    world.recordFact(SPILLED_DRINK_FACT_ID);
    events.push({ type: "person-startled", actorId, position: { ...person.position } });
    events.push({ type: "drink-spilled", actorId, entityId: drink.id, position: { ...drink.position } });
    const table = world.entity(drink.id)?.restingOn;
    if (table && world.surface(table)?.kind === "table" && this.barista && !this.barista.spills.includes(table)) this.barista.spills.push(table);
  }

  // --- Customers ---------------------------------------------------------------------------------

  private isSeated(customer: MutableCustomer): boolean {
    return customer.activity !== "walking-to-pickup" && customer.activity !== "returning-to-seat" && customer.activity !== "puzzled"
      && distance2d(customer.position, customer.definition.seat) < 0.05;
  }

  /** The drink at their place: their own mug, or an order made for them. */
  private tableDrink(customer: MutableCustomer, world: CafeWorld): CafeEntity | undefined {
    const definition = customer.definition;
    const own = definition.drinkId ? world.entity(definition.drinkId) : undefined;
    if (own && !own.holderId && own.restingOn === definition.tableSurfaceId) return own;
    return world.entities().find((entity) => entity.tags.includes("order-cup") && entity.orderFor === definition.id
      && !entity.holderId && entity.restingOn === definition.tableSurfaceId);
  }

  private updateCustomer(customer: MutableCustomer, world: CafeWorld, events: GameplayEvent[], dt: number): void {
    const definition = customer.definition; const goose = world.goose;
    customer.startleCooldown = Math.max(0, customer.startleCooldown - dt);
    if (customer.heldEntityId && world.entity(customer.heldEntityId)?.holderId !== definition.id) customer.heldEntityId = undefined;
    const gooseDistance = distance2d(customer.position, goose.position);

    if (goose.startling && gooseDistance <= definition.startleRadius && customer.startleCooldown <= 0
      && customer.activity !== "startled" && customer.activity !== "dabbing" && customer.activity !== "shooing") {
      customer.startleCooldown = 1.8;
      if (definition.temperament === "bold") {
        // Not scared: they turn and wave the goose off, shoving it if it is close enough.
        this.face(customer, goose.position);
        if (gooseDistance <= definition.shooReach) world.pushGoose(definition.id, customer.position);
        customer.resumeActivity = customer.activity === "sipping" || customer.activity === "looking-up" ? "working" : customer.activity;
        customer.activity = "shooing"; customer.timer = 0.9;
        return;
      }
      this.callForHelp();
      const held = customer.heldEntityId ? world.entity(customer.heldEntityId) : undefined;
      const drink = this.tableDrink(customer, world);
      if (held?.condition === "full") {
        this.spill(customer, held, world, events);
        customer.resumeActivity = "returning-to-seat"; customer.activity = "startled"; customer.timer = 1;
      } else if (customer.activity === "sipping" && drink?.condition === "full") {
        this.spill(customer, drink, world, events);
        customer.resumeActivity = "working"; customer.activity = "startled"; customer.timer = 1;
        customer.sipsLeft = 0;
      } else {
        events.push({ type: "person-startled", actorId: definition.id, position: { ...customer.position } });
        customer.resumeActivity = this.isSeated(customer) ? (customer.activity === "waiting" ? "waiting" : "working") : customer.activity;
        customer.activity = "startled"; customer.timer = 0.8;
      }
      return;
    }

    switch (customer.activity) {
      case "startled":
        customer.timer -= dt;
        if (customer.timer <= 0) {
          const spilled = this.tableDrink(customer, world)?.condition === "spilled" && customer.resumeActivity === "working";
          if (spilled) { customer.activity = "dabbing"; customer.timer = 2.4; }
          else { customer.activity = customer.resumeActivity; customer.timer = definition.workSeconds; }
        }
        break;
      case "dabbing": case "shooing": case "puzzled": {
        customer.timer -= dt;
        if (customer.timer > 0) break;
        // A shoo goes back to whatever they were doing; the other pauses end at the seat or the table.
        const next = customer.activity === "puzzled" ? "returning-to-seat" : customer.activity === "shooing" ? customer.resumeActivity : "working";
        customer.activity = next === "shooing" || next === "startled" ? "working" : next;
        customer.resumeActivity = "working"; customer.timer = definition.workSeconds;
        if (customer.activity === "walking-to-pickup" || customer.activity === "returning-to-seat") customer.path = [];
        break;
      }
      case "working": case "looking-up": case "sipping": {
        if (this.guard(customer, world)) break;
        customer.timer -= dt;
        if (customer.timer > 0) break;
        const drink = this.tableDrink(customer, world);
        const canSip = drink?.condition === "full";
        if (customer.activity === "working") {
          if (definition.guardsTable) { customer.activity = "looking-up"; customer.timer = definition.sipSeconds * 1.4; }
          else if (canSip) { customer.activity = "sipping"; customer.timer = definition.sipSeconds; }
          else if (definition.ordersDrinks) customer.activity = "waiting";
          else customer.timer = definition.workSeconds;
        } else if (customer.activity === "looking-up") {
          if (canSip) { customer.activity = "sipping"; customer.timer = definition.sipSeconds; }
          else { customer.activity = "working"; customer.timer = definition.workSeconds; }
        } else {
          if (drink && definition.ordersDrinks && drink.tags.includes("order-cup")) {
            customer.sipsLeft -= 1;
            if (customer.sipsLeft <= 0) world.setCondition(drink.id, "empty", drink.orderFor);
          }
          customer.activity = "working"; customer.timer = definition.workSeconds;
        }
        break;
      }
      case "waiting": {
        const drink = this.tableDrink(customer, world);
        if (drink?.condition === "full") { customer.activity = "working"; customer.timer = definition.workSeconds; customer.sipsLeft = definition.sipsPerOrder; break; }
        if (this.readyOrder(customer, world) && this.barista) { customer.activity = "walking-to-pickup"; customer.path = []; }
        break;
      }
      case "walking-to-pickup": {
        const barista = this.barista; if (!barista) { customer.activity = "returning-to-seat"; break; }
        const order = this.readyOrder(customer, world);
        if (this.walkTo(customer, barista.definition.pickupApproach, definition.walkSpeed, dt, ARRIVE)) {
          if (order && distance2d(customer.position, order.position) <= PICKUP_REACH && world.acquire(order.id, definition.id)) {
            customer.heldEntityId = order.id; customer.activity = "returning-to-seat";
          } else { customer.activity = "puzzled"; customer.timer = 1.6; }
          this.face(customer, barista.definition.pickup.position);
        }
        break;
      }
      case "returning-to-seat": {
        if (this.walkTo(customer, definition.seat, definition.walkSpeed, dt, ARRIVE)) {
          Object.assign(customer.position, definition.seat); customer.heading = definition.heading;
          if (customer.heldEntityId && world.place(customer.heldEntityId, definition.id, definition.drinkSpot, definition.heading)) {
            customer.heldEntityId = undefined; customer.sipsLeft = definition.sipsPerOrder;
            customer.activity = "working"; customer.timer = definition.workSeconds;
          } else customer.activity = definition.ordersDrinks ? "waiting" : "working";
        }
        break;
      }
    }
  }

  /** A customer who is looking up and sees the goose right at their table waves it off from their chair. */
  private guard(customer: MutableCustomer, world: CafeWorld): boolean {
    const definition = customer.definition;
    if (!definition.guardsTable || customer.activity === "working") return false;
    const table = world.surface(definition.tableSurfaceId); if (!table) return false;
    if (distance2d(world.goose.position, table.position) > definition.guardRadius) return false;
    this.face(customer, world.goose.position);
    world.pushGoose(definition.id, table.position);
    customer.resumeActivity = "working"; customer.activity = "shooing"; customer.timer = 0.9;
    return true;
  }

  private readyOrder(customer: MutableCustomer, world: CafeWorld): CafeEntity | undefined {
    return world.entities().find((entity) => entity.tags.includes("order-cup") && entity.orderFor === customer.definition.id
      && entity.condition === "full" && !entity.holderId && entity.restingKind === "counter");
  }

  // --- Walking -----------------------------------------------------------------------------------

  private face(walker: Walker, target: Readonly<Position>): void {
    const dx = target.x - walker.position.x; const dz = target.z - walker.position.z;
    if (Math.hypot(dx, dz) > 1e-4) walker.heading = Math.atan2(-dx, -dz);
  }

  /** Follows the aisle graph toward a destination; true once within `stop` of it. */
  private walkTo(walker: Walker, destination: Readonly<Position>, speed: number, dt: number, stop: number): boolean {
    if (distance2d(walker.position, destination) <= Math.max(stop, ARRIVE)) { walker.path = []; return true; }
    walker.replanSeconds -= dt;
    const moved = !walker.pathTarget || distance2d(walker.pathTarget, destination) > 0.5;
    if (walker.path.length === 0 || (moved && walker.replanSeconds <= 0)) {
      walker.path = this.route(walker.position, destination); walker.pathTarget = { ...destination }; walker.replanSeconds = REPLAN_SECONDS;
    } else if (walker.path.length > 0) walker.path[walker.path.length - 1] = { ...destination, y: walker.position.y };
    let budget = speed * dt;
    const startX = walker.position.x; const startZ = walker.position.z;
    try {
    while (budget > 0 && walker.path.length > 0) {
      const next = walker.path[0];
      const last = walker.path.length === 1;
      const remaining = distance2d(walker.position, next) - (last ? stop : 0);
      if (remaining <= budget) {
        const dx = next.x - walker.position.x; const dz = next.z - walker.position.z; const length = Math.hypot(dx, dz);
        const step = Math.max(0, remaining);
        if (length > 1e-6) { walker.position.x += dx / length * step; walker.position.z += dz / length * step; walker.heading = Math.atan2(-dx, -dz); }
        budget -= step; walker.path.shift();
        if (last) return true;
      } else {
        const dx = next.x - walker.position.x; const dz = next.z - walker.position.z; const length = Math.hypot(dx, dz);
        walker.position.x += dx / length * budget; walker.position.z += dz / length * budget; walker.heading = Math.atan2(-dx, -dz);
        budget = 0;
      }
    }
    } finally {
      if (Math.hypot(walker.position.x - startX, walker.position.z - startZ) > 1e-5) walker.moved = true;
    }
    return distance2d(walker.position, destination) <= Math.max(stop, ARRIVE) + 1e-6;
  }

  /** Shortest path over the authored aisle points, entering at the point nearest each end. */
  private route(from: Readonly<Position>, to: Readonly<Position>): Position[] {
    const { nodes, edges } = this.definition.routes;
    const end: Position = { x: to.x, y: from.y, z: to.z };
    if (nodes.length === 0) return [end];
    const nearest = (p: Readonly<Position>) => nodes.reduce((best, node, index) => distance2d(p, node) < distance2d(p, nodes[best]) ? index : best, 0);
    const start = nearest(from); const goal = nearest(to);
    if (start === goal || distance2d(from, to) <= Math.min(distance2d(from, nodes[start]), distance2d(to, nodes[goal]))) return [end];
    const cost = nodes.map(() => Infinity); const previous = nodes.map(() => -1); const done = nodes.map(() => false);
    cost[start] = 0;
    for (;;) {
      let current = -1;
      for (let index = 0; index < nodes.length; index += 1) if (!done[index] && cost[index] < Infinity && (current < 0 || cost[index] < cost[current])) current = index;
      if (current < 0 || current === goal) break;
      done[current] = true;
      for (const [a, b] of edges) {
        const other = a === current ? b : b === current ? a : -1; if (other < 0 || done[other]) continue;
        const next = cost[current] + distance2d(nodes[current], nodes[other]);
        if (next < cost[other]) { cost[other] = next; previous[other] = current; }
      }
    }
    if (cost[goal] === Infinity) return [end];
    const path: Position[] = [];
    for (let index = goal; index >= 0; index = previous[index]) path.unshift({ ...nodes[index], y: from.y });
    // Skip the entry point when it lies behind us on the way to the second point.
    if (path.length > 1 && distance2d(from, path[1]) < distance2d(nodes[start], path[1])) path.shift();
    if (path.length > 0 && distance2d(to, path[path.length - 2] ?? from) < distance2d(nodes[goal], path[path.length - 2] ?? from)) path.pop();
    path.push(end);
    return path;
  }
}
