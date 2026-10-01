import type { GameplayEvent, Position } from "./Simulation.ts";

/**
 * People who make the square feel lived in: parents keeping an eye on the splash
 * pad (standing, or on a bench with the family dog), and passers-by who wander
 * between benches, sights, and shop doors. They notice the goose by distance
 * (no sight lines yet), startle at honks and flapping, and step out of its way;
 * nothing they do sets back the goose or its tasks. Walking follows a graph of
 * open paving built from the layout, not a nav mesh.
 */

export type TownActivity =
  // Standing pastimes.
  | "idle" | "watching" | "clapping" | "calling" | "filming" | "phoning" | "waving" | "looking"
  // Seated pastimes.
  | "sitting" | "sit-looking" | "sit-phoning" | "sit-sipping" | "sit-relaxing" | "sit-petting"
  // Getting about.
  | "walking" | "running" | "inside"
  // Reacting to the goose.
  | "startled" | "stepping-back" | "eyeing" | "shooing";
export const STANDING_PASTIMES: readonly TownActivity[] = ["idle", "watching", "clapping", "calling", "filming", "phoning", "waving", "looking"];
export const SEATED_PASTIMES: readonly TownActivity[] = ["sitting", "sit-looking", "sit-phoning", "sit-sipping", "sit-relaxing", "sit-petting"];

export interface TownSpot { readonly position: Readonly<Position>; readonly heading: number }
/** A place to sit, with the spot in front of it where people stand up and sit down. */
export interface TownSeat extends TownSpot { readonly id: string; readonly approach: Readonly<Position> }
export interface TownGraph { readonly nodes: readonly Readonly<Position>[]; readonly edges: readonly (readonly [number, number])[] }

export interface TownspersonDefinition {
  readonly id: string; readonly look: string; readonly role: "parent" | "walker";
  readonly position: Readonly<Position>; readonly heading: number;
  readonly walkSpeed: number;
  /** Joggers run between destinations and never stop to sit. */
  readonly runs?: boolean;
  /** Parents keep to this spot (a bench seat when `seat` is set) and pass the time there. */
  readonly seat?: TownSeat;
  /** What a standing parent faces between reactions (the splash pad). */
  readonly watch?: Readonly<Position>;
  /** Pastimes this person picks from; the dog's owner also pets it. */
  readonly pastimes: readonly TownActivity[];
}
export interface DogDefinition {
  readonly id: string; readonly position: Readonly<Position>; readonly heading: number;
  readonly ownerId?: string;
  readonly noticeRadius: number; readonly barkRadius: number; readonly honkRadius: number;
  readonly barkSeconds: number; readonly settleSeconds: number;
  readonly restSeconds: Readonly<{ min: number; max: number }>;
}
export interface TownReactions {
  readonly startleRadius: number; readonly personalRadius: number; readonly stepBack: number;
  readonly startleSeconds: number; readonly eyeSeconds: number; readonly shooSeconds: number;
}
export interface TownsfolkDefinition {
  readonly people: readonly TownspersonDefinition[];
  readonly dogs: readonly DogDefinition[];
  readonly graph: TownGraph;
  /** Bench seats passers-by may use; parents' seats and the dog's spot are left out. */
  readonly seats: readonly TownSeat[];
  /** Spots worth stopping at to look (the fountain, the splash pad). */
  readonly sights: readonly TownSpot[];
  /** Shop doors people go in and come back out of. */
  readonly doors: readonly TownSpot[];
  readonly reactions: TownReactions;
  readonly pastimeSeconds: Readonly<{ min: number; max: number }>;
  readonly walker: Readonly<{ sitSeconds: { min: number; max: number }; lookSeconds: { min: number; max: number }; insideSeconds: { min: number; max: number } }>;
  /** Whether a person may stand at a point (on paving, clear of furniture). */
  canStand(x: number, z: number): boolean;
  /** Whether the straight line between two points is walkable, for cutting corners between graph points. */
  canPass(a: Readonly<Position>, b: Readonly<Position>): boolean;
  /** Where passers-by wander to: the square itself rather than back alleys. Everywhere when absent. */
  roams?(x: number, z: number): boolean;
}

export interface TownspersonState {
  readonly id: string; readonly look: string; readonly role: "parent" | "walker";
  readonly position: Readonly<Position>; readonly heading: number;
  readonly activity: TownActivity; readonly activitySecondsRemaining: number;
  readonly seated: boolean; readonly moving: boolean;
  /** Indoors (in a shop): not drawn. */
  readonly hidden: boolean;
}
export type DogActivity = "lying" | "sitting" | "alert" | "barking" | "happy";
export interface DogState {
  readonly id: string; readonly position: Readonly<Position>; readonly heading: number; readonly activity: DogActivity;
}
export interface TownGoose { readonly position: Readonly<Position>; readonly startling: boolean }

type Plan =
  | { kind: "post" }
  | { kind: "seat"; seat: TownSeat }
  | { kind: "sight"; spot: TownSpot }
  | { kind: "door"; spot: TownSpot }
  | { kind: "wander"; to: Position };
interface MutablePerson {
  readonly definition: TownspersonDefinition; readonly position: Position; heading: number;
  activity: TownActivity; timer: number; seated: boolean; moving: boolean; hidden: boolean;
  path: Position[]; plan?: Plan; seatTimer: number;
  /** Where a standing parent passes the time; drifts a little now and then. */
  readonly spot: Position;
  resume?: TownActivity; startleCooldown: number; shooCooldown: number; random: () => number;
}
interface MutableDog {
  readonly definition: DogDefinition; heading: number; activity: DogActivity; timer: number; barkCooldown: number; random: () => number;
}

const ARRIVE = 0.05;
const distance2d = (a: Readonly<Position>, b: Readonly<Position>): number => Math.hypot(a.x - b.x, a.z - b.z);
const headingTo = (from: Readonly<Position>, to: Readonly<Position>): number => Math.atan2(-(to.x - from.x), -(to.z - from.z));

/** Small seeded generator so a person's choices replay identically from the same start. */
export function seeded(id: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < id.length; index += 1) state = Math.imul(state ^ id.charCodeAt(index), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (random: () => number, range: Readonly<{ min: number; max: number }>) => range.min + (range.max - range.min) * random();

export class Townsfolk {
  private readonly definition: TownsfolkDefinition;
  private readonly people: MutablePerson[] = [];
  private readonly dogs: MutableDog[] = [];
  /** Neighbours of each graph point, with the distance to them. */
  private readonly links: (readonly [number, number])[][];

  constructor(definition: TownsfolkDefinition) {
    this.definition = definition;
    const { nodes, edges } = definition.graph;
    this.links = nodes.map(() => []);
    for (const [a, b] of edges) {
      if (!nodes[a] || !nodes[b]) continue;
      const length = distance2d(nodes[a], nodes[b]); this.links[a].push([b, length]); this.links[b].push([a, length]);
    }
    const ids = [...definition.people.map((person) => person.id), ...definition.dogs.map((dog) => dog.id)];
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate townsfolk ID");
    if (definition.graph.edges.some(([a, b]) => !definition.graph.nodes[a] || !definition.graph.nodes[b])) throw new Error("Town route edge points at a missing node");
    this.reset();
  }

  reset(): void {
    this.people.length = 0;
    for (const definition of this.definition.people) {
      const random = seeded(definition.id);
      const person: MutablePerson = { definition, position: { ...definition.position }, heading: definition.heading,
        activity: "idle", timer: 0, seated: false, moving: false, hidden: false, path: [], seatTimer: 0,
        spot: { ...definition.position }, startleCooldown: 0, shooCooldown: 0, random };
      this.people.push(person);
      if (definition.role === "parent") {
        if (definition.seat) this.sitDown(person, definition.seat);
        else if (definition.watch) person.heading = headingTo(person.position, definition.watch);
        this.nextPastime(person);
      } else {
        // A passer-by authored beside a free bench starts out sitting on it.
        const seat = this.definition.seats.find((candidate) => !definition.runs && distance2d(candidate.position, definition.position) < 1.2 && !this.seatTaken(candidate, person));
        if (seat) { this.sitDown(person, seat); person.plan = { kind: "seat", seat }; person.seatTimer = between(random, this.definition.walker.sitSeconds) * 0.6; this.nextPastime(person); }
        else this.chooseDestination(person);
      }
    }
    this.dogs.length = 0;
    for (const definition of this.definition.dogs) {
      const random = seeded(definition.id);
      this.dogs.push({ definition, heading: definition.heading, activity: "lying", timer: between(random, definition.restSeconds), barkCooldown: 0, random });
    }
  }

  snapshot(): TownspersonState[] {
    return this.people.map((person) => ({ id: person.definition.id, look: person.definition.look, role: person.definition.role,
      position: { ...person.position }, heading: person.heading, activity: person.activity, activitySecondsRemaining: person.timer,
      seated: person.seated, moving: person.moving, hidden: person.hidden }));
  }
  dogSnapshot(): DogState[] {
    return this.dogs.map((dog) => ({ id: dog.definition.id, position: { ...dog.definition.position }, heading: dog.heading, activity: dog.activity }));
  }

  /** Where the goose was last seen this step; people steer their plans around it. */
  private goose?: Readonly<Position>;
  private upset: readonly Readonly<Position>[] = [];

  /**
   * `upset` holds where children are frightened or crying: parents nearby turn to
   * call out to them (seated ones look over) until they settle.
   */
  update(goose: TownGoose, events: GameplayEvent[], dt: number, upset: readonly Readonly<Position>[] = []): void {
    this.goose = goose.position; this.upset = upset;
    for (const person of this.people) { person.moving = false; this.updatePerson(person, goose, events, dt); }
    for (const dog of this.dogs) this.updateDog(dog, goose, events, dt);
  }

  // --- People ------------------------------------------------------------------------------------

  private updatePerson(person: MutablePerson, goose: TownGoose, events: GameplayEvent[], dt: number): void {
    const { reactions } = this.definition;
    person.startleCooldown = Math.max(0, person.startleCooldown - dt);
    person.shooCooldown = Math.max(0, person.shooCooldown - dt);
    if (person.hidden) {
      person.timer -= dt;
      if (person.timer <= 0) { person.hidden = false; this.chooseDestination(person); }
      return;
    }
    const gooseDistance = distance2d(person.position, goose.position);
    const reacting = person.activity === "startled" || person.activity === "stepping-back" || person.activity === "eyeing" || person.activity === "shooing";
    if (goose.startling && gooseDistance <= reactions.startleRadius && person.startleCooldown <= 0 && person.activity !== "startled") {
      if (!reacting) person.resume = person.activity;
      person.activity = "startled"; person.timer = reactions.startleSeconds; person.startleCooldown = reactions.startleSeconds + 1.2;
      if (!person.seated) person.heading = headingTo(person.position, goose.position);
      events.push({ type: "person-startled", actorId: person.definition.id, position: { ...person.position } });
      return;
    }
    if (gooseDistance <= reactions.personalRadius && !reacting) {
      if (person.seated) {
        if (person.shooCooldown <= 0) { person.resume = person.activity; person.activity = "shooing"; person.timer = reactions.shooSeconds; person.shooCooldown = reactions.shooSeconds + 1.5; }
      } else this.stepAway(person, goose.position);
      if (person.activity === "shooing" || person.activity === "stepping-back") return;
    }

    switch (person.activity) {
      case "startled":
        person.timer -= dt;
        if (person.timer > 0) break;
        if (person.seated) this.resume(person);
        else if (gooseDistance <= reactions.personalRadius * 1.6) this.stepAway(person, goose.position);
        else { person.activity = "eyeing"; person.timer = reactions.eyeSeconds; }
        break;
      case "stepping-back": {
        const target = person.path[person.path.length - 1];
        if (!target || this.follow(person, person.definition.walkSpeed * 1.25, dt)) { person.activity = "eyeing"; person.timer = reactions.eyeSeconds; }
        if (person.activity !== "stepping-back") person.heading = headingTo(person.position, goose.position);
        break;
      }
      case "eyeing":
        person.heading = headingTo(person.position, goose.position);
        person.timer -= dt;
        if (person.timer <= 0) this.resume(person);
        break;
      case "shooing":
        person.timer -= dt;
        if (person.timer <= 0) this.resume(person);
        break;
      case "walking": case "running":
        if (this.follow(person, person.definition.walkSpeed, dt)) this.arrive(person);
        break;
      case "inside": break;
      default: {
        const child = person.definition.role === "parent" ? this.upset.find((kid) => distance2d(kid, person.position) < 11) : undefined;
        if (child) {
          if (person.seated) person.activity = "sit-looking";
          else { person.activity = "calling"; person.heading = headingTo(person.position, child); }
          person.timer = Math.max(person.timer, 1.2);
          break;
        }
        person.timer -= dt;
        if (person.seated && person.definition.role === "walker") {
          person.seatTimer -= dt;
          if (person.seatTimer <= 0) { this.standUp(person); this.chooseDestination(person); break; }
        }
        if (person.timer <= 0) {
          if (person.definition.role === "walker" && !person.seated) this.chooseDestination(person);
          else this.nextPastime(person);
        }
      }
    }
  }

  /** Back off from the goose to a clear spot, then keep an eye on it. */
  private stepAway(person: MutablePerson, from: Readonly<Position>): void {
    const away = headingTo(from, person.position);
    const distance = this.definition.reactions.stepBack;
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 2]) {
      const x = person.position.x - Math.sin(away + turn) * distance; const z = person.position.z - Math.cos(away + turn) * distance;
      if (!this.definition.canStand(x, z) || !this.definition.canPass(person.position, { x, y: 0, z })) continue;
      if (person.activity !== "stepping-back" && person.activity !== "startled" && person.activity !== "eyeing") person.resume = person.activity;
      person.activity = "stepping-back"; person.path = [{ x, y: person.position.y, z }];
      return;
    }
    // Nowhere clear to go: stand and watch it instead.
    if (person.activity !== "eyeing") { person.resume ??= person.activity; person.activity = "eyeing"; person.timer = this.definition.reactions.eyeSeconds; }
  }

  /** Pick up where they left off: walking on, returning to their spot, or another pastime. */
  private resume(person: MutablePerson): void {
    const previous = person.resume; person.resume = undefined;
    if (person.seated) { this.nextPastime(person, previous); return; }
    if (person.definition.role === "parent") {
      if (distance2d(person.position, person.spot) > 0.3 && this.planWalk(person, person.spot, { kind: "post" })) return;
      this.nextPastime(person); return;
    }
    // Carry on to the same place, unless the goose is standing in it.
    const target = this.planTarget(person.plan);
    const blocked = target && this.goose && distance2d(target, this.goose) < this.definition.reactions.personalRadius * 2.5;
    if (target && !blocked && (person.plan?.kind !== "wander" || previous === "walking" || previous === "running")
      && this.planWalk(person, target, person.plan!)) return;
    this.chooseDestination(person);
  }

  private nextPastime(person: MutablePerson, keep?: TownActivity): void {
    const options = person.definition.pastimes.filter((activity) => SEATED_PASTIMES.includes(activity) === person.seated
      && (activity !== "sit-petting" || this.dogs.some((dog) => dog.definition.ownerId === person.definition.id && dog.activity !== "barking" && dog.activity !== "alert")));
    const fallback: TownActivity = person.seated ? "sitting" : "idle";
    const pool = options.length > 0 ? options : [fallback];
    // Mostly switch to something new; sometimes carry on with what they were doing.
    const next = keep && pool.includes(keep) && person.random() < 0.35 ? keep : pool[Math.floor(person.random() * pool.length)];
    person.activity = next; person.timer = between(person.random, this.definition.pastimeSeconds);
    if (!person.seated && person.definition.role === "parent") {
      const watch = person.definition.watch;
      // Now and then a standing parent drifts a step or two along the pad's edge.
      if (person.random() < 0.3) {
        const angle = person.random() * Math.PI * 2; const reach = 0.6 + person.random() * 1.1;
        const x = person.definition.position.x + Math.sin(angle) * reach; const z = person.definition.position.z + Math.cos(angle) * reach;
        if (this.definition.canStand(x, z) && this.planWalk(person, { x, y: person.position.y, z }, { kind: "post" })) {
          person.spot.x = x; person.spot.z = z; person.resume = next; return;
        }
      }
      if (watch) person.heading = headingTo(person.position, watch);
    }
  }

  // --- Passers-by --------------------------------------------------------------------------------

  private chooseDestination(person: MutablePerson): void {
    for (let attempt = 0; attempt < 6; attempt += 1) if (this.tryDestination(person)) return;
    // Nowhere reachable for now: pass a moment here and try again.
    person.plan = undefined; person.activity = person.definition.runs ? "idle" : "looking"; person.timer = 2;
  }

  private tryDestination(person: MutablePerson): boolean {
    const { seats, sights, doors, graph } = this.definition; const random = person.random;
    const runner = person.definition.runs === true;
    const roll = random();
    const freeSeats = runner ? [] : seats.filter((seat) => !this.seatTaken(seat, person));
    const freeSights = runner ? [] : sights.filter((spot) => !this.people.some((other) => other !== person && other.plan?.kind === "sight" && other.plan.spot === spot));
    let plan: Plan | undefined;
    if (roll < 0.35 && freeSeats.length > 0) plan = { kind: "seat", seat: this.pick(freeSeats, random, person.position) };
    else if (roll < 0.65 && freeSights.length > 0) plan = { kind: "sight", spot: this.pick(freeSights, random, person.position) };
    else if (roll < 0.77 && doors.length > 0 && !runner) plan = { kind: "door", spot: doors[Math.floor(random() * doors.length)] };
    if (!plan) {
      // Wander to a node a fair way off, so people cross the square rather than shuffle.
      const roams = this.definition.roams ?? (() => true);
      const goose = this.goose;
      // Strollers pick somewhere across the way rather than the far end of town; joggers go further.
      const far = graph.nodes.filter((node) => roams(node.x, node.z) && distance2d(node, person.position) > (runner ? 14 : 7)
        && (runner || distance2d(node, person.position) < 24) && (!goose || distance2d(node, goose) > 4));
      const pool = far.length > 0 ? far : graph.nodes;
      if (pool.length === 0) return false;
      plan = { kind: "wander", to: { ...pool[Math.floor(random() * pool.length)] } };
    }
    return this.planWalk(person, this.planTarget(plan)!, plan);
  }

  /** Prefer nearer choices without always taking the nearest. */
  private pick<T extends TownSpot>(options: readonly T[], random: () => number, from: Readonly<Position>): T {
    const sorted = [...options].sort((a, b) => distance2d(a.position, from) - distance2d(b.position, from));
    return sorted[Math.floor(random() ** 1.6 * sorted.length)];
  }

  private planTarget(plan: Plan | undefined): Position | undefined {
    if (!plan) return undefined;
    switch (plan.kind) {
      case "seat": return { ...plan.seat.approach };
      case "sight": case "door": return { ...plan.spot.position };
      case "wander": return { ...plan.to };
      case "post": return undefined;
    }
  }

  /** Sets off toward a target; false (and nothing changes) when it cannot be reached. */
  private planWalk(person: MutablePerson, target: Readonly<Position>, plan: Plan): boolean {
    const path = this.route(person.position, target);
    if (!path) return false;
    person.plan = plan; person.path = path;
    person.activity = person.definition.runs ? "running" : "walking";
    return true;
  }

  private arrive(person: MutablePerson): void {
    const plan = person.plan; const walker = this.definition.walker;
    switch (plan?.kind) {
      case "post":
        if (person.definition.watch) person.heading = headingTo(person.position, person.definition.watch);
        if (person.resume) { const next = person.resume; person.resume = undefined; person.activity = next; person.timer = between(person.random, this.definition.pastimeSeconds); }
        else this.nextPastime(person);
        return;
      case "seat":
        if (this.seatTaken(plan.seat, person)) { this.chooseDestination(person); return; }
        this.sitDown(person, plan.seat); person.seatTimer = between(person.random, walker.sitSeconds); this.nextPastime(person);
        return;
      case "sight":
        person.heading = plan.spot.heading;
        person.activity = (["looking", "looking", "phoning", "filming", "idle"] as const)[Math.floor(person.random() * 5)];
        person.timer = between(person.random, walker.lookSeconds);
        return;
      case "door":
        person.hidden = true; person.activity = "inside"; person.timer = between(person.random, walker.insideSeconds);
        return;
      default:
        if (!person.definition.runs && person.random() < 0.35) { person.activity = person.random() < 0.5 ? "looking" : "phoning"; person.timer = between(person.random, walker.lookSeconds); person.plan = undefined; }
        else this.chooseDestination(person);
    }
  }

  private seatTaken(seat: TownSeat, asker: MutablePerson): boolean {
    return this.people.some((other) => other !== asker && ((other.plan?.kind === "seat" && other.plan.seat.id === seat.id)
      || (other.seated && distance2d(other.position, seat.position) < 0.5) || other.definition.seat?.id === seat.id));
  }
  private sitDown(person: MutablePerson, seat: TownSeat): void {
    Object.assign(person.position, seat.position); person.heading = seat.heading; person.seated = true; person.path = [];
  }
  private standUp(person: MutablePerson): void {
    const plan = person.plan;
    if (plan?.kind === "seat") Object.assign(person.position, plan.seat.approach);
    person.seated = false; person.plan = undefined;
  }

  // --- The dog -----------------------------------------------------------------------------------

  private updateDog(dog: MutableDog, goose: TownGoose, events: GameplayEvent[], dt: number): void {
    const definition = dog.definition; const at = definition.position;
    const distance = distance2d(at, goose.position);
    dog.barkCooldown = Math.max(0, dog.barkCooldown - dt);
    const provoked = distance <= definition.barkRadius || (goose.startling && distance <= definition.honkRadius);
    if (provoked) {
      if (dog.activity !== "barking" || dog.barkCooldown <= 0) {
        events.push({ type: "dog-barked", actorId: definition.id, position: { ...at } });
        dog.barkCooldown = 1.1;
      }
      dog.activity = "barking"; dog.timer = definition.barkSeconds;
    }
    const turnToward = (target: number) => {
      const difference = Math.atan2(Math.sin(target - dog.heading), Math.cos(target - dog.heading));
      dog.heading += Math.sign(difference) * Math.min(Math.abs(difference), 5 * dt);
    };
    switch (dog.activity) {
      case "barking":
        turnToward(headingTo(at, goose.position));
        if (!provoked) { dog.timer -= dt; if (dog.timer <= 0) { dog.activity = "alert"; dog.timer = definition.settleSeconds; } }
        else if (dog.barkCooldown <= 0) { events.push({ type: "dog-barked", actorId: definition.id, position: { ...at } }); dog.barkCooldown = 1.1; }
        break;
      case "alert":
        turnToward(headingTo(at, goose.position));
        if (distance > definition.noticeRadius) { dog.timer -= dt; if (dog.timer <= 0) { dog.activity = "sitting"; dog.timer = between(dog.random, definition.restSeconds); } }
        else dog.timer = definition.settleSeconds;
        break;
      default: {
        if (distance <= definition.noticeRadius) { dog.activity = "alert"; dog.timer = definition.settleSeconds; break; }
        turnToward(definition.heading);
        const owner = definition.ownerId ? this.people.find((person) => person.definition.id === definition.ownerId) : undefined;
        if (owner?.activity === "sit-petting") { dog.activity = "happy"; break; }
        if (dog.activity === "happy") { dog.activity = "sitting"; dog.timer = between(dog.random, definition.restSeconds); break; }
        dog.timer -= dt;
        if (dog.timer <= 0) { dog.activity = dog.activity === "lying" ? "sitting" : "lying"; dog.timer = between(dog.random, definition.restSeconds); }
      }
    }
  }

  // --- Walking -----------------------------------------------------------------------------------

  /** Moves along the planned path; true on reaching its end. */
  private follow(person: MutablePerson, speed: number, dt: number): boolean {
    let budget = speed * dt;
    while (budget > 0 && person.path.length > 0) {
      const next = person.path[0];
      const dx = next.x - person.position.x; const dz = next.z - person.position.z; const length = Math.hypot(dx, dz);
      if (length > 1e-6) person.heading = Math.atan2(-dx, -dz);
      if (length <= budget) { person.position.x = next.x; person.position.z = next.z; budget -= length; person.path.shift(); person.moving = true; }
      else { person.position.x += dx / length * budget; person.position.z += dz / length * budget; budget = 0; person.moving = true; }
    }
    return person.path.length === 0 || distance2d(person.position, person.path[person.path.length - 1]) <= ARRIVE;
  }

  /**
   * Shortest path over the paving graph, entering at the node nearest each end;
   * undefined when the destination cannot be reached from here.
   */
  private route(from: Readonly<Position>, to: Readonly<Position>): Position[] | undefined {
    const { nodes } = this.definition.graph;
    const end: Position = { x: to.x, y: from.y, z: to.z };
    const canPass = (a: Readonly<Position>, b: Readonly<Position>) => this.definition.canPass(a, b);
    if (distance2d(from, to) < 10 && canPass(from, to)) return [end];
    if (nodes.length === 0) return undefined;
    const nearest = (p: Readonly<Position>) => nodes.reduce((best, node, index) => distance2d(p, node) < distance2d(p, nodes[best]) ? index : best, 0);
    const start = nearest(from); const goal = nearest(to);
    if (start === goal) return [{ ...nodes[start], y: from.y }, end];
    // Dijkstra over the neighbour lists, with a small binary heap.
    const cost = new Float64Array(nodes.length).fill(Infinity); const previous = new Int32Array(nodes.length).fill(-1);
    const heap: [number, number][] = [[0, start]]; cost[start] = 0;
    const push = (item: [number, number]) => {
      heap.push(item); let index = heap.length - 1;
      while (index > 0) { const parent = (index - 1) >> 1; if (heap[parent][0] <= heap[index][0]) break; [heap[parent], heap[index]] = [heap[index], heap[parent]]; index = parent; }
    };
    const pop = (): [number, number] => {
      const top = heap[0]; const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last; let index = 0;
        for (;;) {
          const left = index * 2 + 1; const right = left + 1; let smallest = index;
          if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
          if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
          if (smallest === index) break;
          [heap[smallest], heap[index]] = [heap[index], heap[smallest]]; index = smallest;
        }
      }
      return top;
    };
    while (heap.length > 0) {
      const [spent, current] = pop();
      if (current === goal) break;
      if (spent > cost[current]) continue;
      for (const [other, length] of this.links[current]) {
        const next = spent + length;
        if (next < cost[other]) { cost[other] = next; previous[other] = current; push([next, other]); }
      }
    }
    if (cost[goal] === Infinity) return undefined;
    const path: Position[] = [];
    for (let index = goal; index >= 0; index = previous[index]) path.unshift({ ...nodes[index], y: from.y });
    // Skip an entry node behind us, and the last node when the destination is nearer, when the way is clear.
    if (path.length > 1 && distance2d(from, path[1]) < distance2d(nodes[start], path[1]) && canPass(from, path[1])) path.shift();
    if (path.length > 1 && distance2d(to, path[path.length - 2]) < distance2d(nodes[goal], path[path.length - 2]) && canPass(path[path.length - 2], to)) path.pop();
    path.push(end);
    return path;
  }
}
