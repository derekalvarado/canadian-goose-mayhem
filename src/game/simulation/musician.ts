import type { GameplayEvent, PlayerId, Position } from "./Simulation.ts";
import { graphLinks, routeOverGraph, seeded, type TownGraph } from "./townsfolk.ts";

/**
 * The street musician on the Old Town stage: plays a set, leaves the guitar on its
 * stand for a break, and keeps half an eye on it. Unlike everyone else in the
 * square they notice by sight and sound, not distance: a view cone that buildings
 * block, plus hearing for honks and the scrape of a dragged guitar. They act only
 * on what they have seen or heard, and remember where they last saw the guitar.
 * Catching the goose makes it drop the guitar; nothing is lost for good.
 */

/** Recorded once the musician gives up looking while the guitar lies hidden somewhere. */
export const GUITAR_HIDDEN_FACT_ID = "oldtown.guitar-hidden";
/** Recorded when a goose honks with the guitar in its bill, which plays it, after a fashion. */
export const GUITAR_TWANG_FACT_ID = "oldtown.guitar-twanged";
/** Recorded when one goose takes the guitar while the musician is busy watching the other. */
export const GUITAR_DISTRACTION_FACT_ID = "oldtown.guitar-stolen-while-distracted";

export type MusicianActivity =
  | "playing" | "setting-down" | "walking" | "watching" | "sipping" | "eyeing"
  | "investigating" | "reacting" | "chasing" | "shooing" | "retrieving" | "carrying"
  | "searching" | "looking-around" | "puzzled" | "missing";

export interface MusicianSpot { readonly position: Readonly<Position>; readonly heading: number }
export interface MusicianTuning {
  readonly walkSpeed: number; readonly jogSpeed: number;
  /** How far they can see, the half-width of their view cone, and the narrower cone while watching one goose. */
  readonly sightRange: number; readonly sightHalfAngle: number; readonly focusedHalfAngle: number;
  /** Close enough to notice even outside the cone (still blocked by walls). */
  readonly nearSenseRadius: number;
  readonly honkHearingRadius: number; readonly catchReach: number;
  readonly setSeconds: Readonly<{ min: number; max: number }>; readonly breakSeconds: number;
  readonly watchSeconds: Readonly<{ min: number; max: number }>; readonly sipSeconds: Readonly<{ min: number; max: number }>;
  readonly setDownSeconds: number; readonly reactSeconds: number; readonly shooSeconds: number;
  readonly eyeSeconds: number; readonly lookSeconds: number; readonly puzzledSeconds: number;
}
export interface MusicianDefinition {
  readonly id: string;
  /** Where they play, beside the guitar stand, facing the audience. */
  readonly home: MusicianSpot;
  /** From `home` down off the stage to open paving; the last point is on the ground. */
  readonly stageExit: readonly Readonly<Position>[];
  readonly guitarId: string;
  /** Where the guitar rests on its stand. */
  readonly standPosition: Readonly<Position>;
  /** Where they spend a break; the heading faces back toward the stand. */
  readonly breakSpot: MusicianSpot;
  /** Places around the stage they check when the guitar has vanished. */
  readonly searchSpots: readonly Readonly<Position>[];
  readonly graph: TownGraph;
  /** Whether the straight walk between two points is clear. */
  canPass(a: Readonly<Position>, b: Readonly<Position>): boolean;
  /** Whether nothing that blocks sight stands between two points. */
  canSee(a: Readonly<Position>, b: Readonly<Position>): boolean;
  readonly tuning: MusicianTuning;
}

export interface MusicianGoose { readonly id: PlayerId; readonly position: Readonly<Position>; readonly heldEntityId?: string }
export interface MusicianGuitar { readonly id: string; readonly position: Readonly<Position>; readonly holderId?: string }
/** Something heard this step: a honk, or a dragged item scraping along. */
export interface HeardNoise { readonly kind: "honk" | "scrape"; readonly sourceId: PlayerId; readonly position: Readonly<Position>; readonly radius: number }
/** The narrow view of the world the musician acts through; grabs and releases use the goose's rules. */
export interface MusicianWorld {
  readonly geese: readonly MusicianGoose[];
  readonly noises: readonly HeardNoise[];
  guitar(): MusicianGuitar | undefined;
  acquire(entityId: string, actorId: string): boolean;
  /** Stand the held guitar back on its stand. */
  returnToStand(entityId: string, actorId: string): boolean;
  pushGoose(actorId: string, from: Readonly<Position>, playerId: PlayerId): void;
  recordFact(factId: string): void;
}

export interface MusicianState {
  readonly id: string; readonly position: Readonly<Position>; readonly heading: number;
  readonly activity: MusicianActivity; readonly activitySecondsRemaining: number;
  /** True when they walked this tick. */
  readonly moving: boolean;
  readonly heldEntityId?: string;
  /** What shows over their head: "!" on spotting the theft, "?" while wondering where the guitar went. */
  readonly alert?: "!" | "?";
  /** The current half-width of their view cone, for the developer overlay. */
  readonly sightHalfAngle: number;
}

type Arrival = "break" | "home" | "investigate" | "search" | "retrieve" | "chase";
const distance2d = (a: Readonly<Position>, b: Readonly<Position>): number => Math.hypot(a.x - b.x, a.z - b.z);
const headingTo = (from: Readonly<Position>, to: Readonly<Position>): number => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const between = (random: () => number, range: Readonly<{ min: number; max: number }>) => range.min + (range.max - range.min) * random();
const ON_STAGE_HEIGHT = 0.3;
const ON_STAND = 0.3;
const REPATH_SECONDS = 0.35;
/** Calm states a honk can turn their head in. */
const DISTRACTABLE: readonly MusicianActivity[] = ["watching", "sipping", "eyeing", "looking-around", "puzzled", "missing", "walking", "searching"];
/** States in which a far-off scrape sends them to have a look. */
const CURIOUS: readonly MusicianActivity[] = ["watching", "sipping", "eyeing", "looking-around", "puzzled", "missing", "walking", "searching", "investigating"];

export class Musician {
  private readonly definition: MusicianDefinition;
  private readonly links: (readonly [number, number])[][];
  private readonly position: Position;
  private heading: number;
  private activity: MusicianActivity = "playing";
  private timer = 0; private moving = false;
  private path: Position[] = []; private arrival?: Arrival; private repath = 0;
  private setTimer = 0; private breakTimer = 0;
  private holding = false;
  /** Memory: they believe the guitar is gone from its stand, and where they last saw it. */
  private believesMissing = false; private searchedStage = false;
  private lastSeenGuitar?: Position; private lastSeenThief?: Position;
  private chaseTarget?: PlayerId; private eyeTarget?: PlayerId; private eyePoint?: Position;
  private resumeAfterEye: MusicianActivity = "watching";
  private pendingWalk?: { target: Position; arrival: Arrival; activity: MusicianActivity };
  private searchQueue: Position[] = [];
  private scanBase = 0; private scanTime = 0;
  private previousHolder?: string;
  private random: () => number;

  constructor(definition: MusicianDefinition) {
    this.definition = definition;
    this.links = graphLinks(definition.graph);
    this.position = { ...definition.home.position };
    this.heading = definition.home.heading;
    this.random = seeded(definition.id);
    this.reset();
  }

  get id(): string { return this.definition.id; }

  reset(): void {
    Object.assign(this.position, this.definition.home.position); this.heading = this.definition.home.heading;
    this.random = seeded(this.definition.id);
    this.activity = "playing"; this.timer = 0; this.moving = false; this.path = []; this.arrival = undefined; this.repath = 0;
    this.setTimer = between(this.random, this.definition.tuning.setSeconds); this.breakTimer = 0; this.holding = false;
    this.believesMissing = false; this.searchedStage = false; this.lastSeenGuitar = undefined; this.lastSeenThief = undefined;
    this.chaseTarget = undefined; this.eyeTarget = undefined; this.eyePoint = undefined; this.searchQueue = []; this.pendingWalk = undefined;
    this.previousHolder = undefined;
  }

  snapshot(): MusicianState {
    const { tuning } = this.definition;
    const alert = this.activity === "reacting" || this.activity === "chasing" ? "!"
      : ["puzzled", "looking-around", "searching", "investigating", "missing"].includes(this.activity) ? "?" : undefined;
    return { id: this.definition.id, position: { ...this.position }, heading: this.heading, activity: this.activity,
      activitySecondsRemaining: this.timer, moving: this.moving, heldEntityId: this.holding ? this.definition.guitarId : undefined, alert,
      sightHalfAngle: this.activity === "eyeing" ? tuning.focusedHalfAngle : tuning.sightHalfAngle };
  }

  /** Where a held guitar sits: across the front of their body. */
  holdPoint(): { position: Position; heading: number } {
    return { position: { x: this.position.x - Math.sin(this.heading) * 0.22, y: this.position.y + 1.0, z: this.position.z - Math.cos(this.heading) * 0.22 },
      heading: this.heading };
  }

  update(world: MusicianWorld, events: GameplayEvent[], dt: number): void {
    void events;
    const { tuning, guitarId } = this.definition;
    this.moving = false;
    const guitar = world.guitar();
    this.holding = guitar?.holderId === this.definition.id;

    // The moment a goose takes the guitar while they are busy watching the other one.
    const holder = guitar?.holderId;
    if (holder && holder !== this.previousHolder && (holder === "goose" || holder === "goose-2")
      && this.activity === "eyeing" && this.eyeTarget && this.eyeTarget !== holder) world.recordFact(GUITAR_DISTRACTION_FACT_ID);
    this.previousHolder = holder;

    this.perceive(world, guitar);
    this.hear(world);

    switch (this.activity) {
      case "playing": {
        this.heading = this.definition.home.heading;
        if (!this.holding) {
          if (guitar && this.onStand(guitar) && this.atHome()) { this.holding = world.acquire(guitarId, this.definition.id); }
          else { this.becomePuzzled(); break; }
        }
        this.setTimer -= dt;
        if (this.setTimer <= 0) { this.activity = "setting-down"; this.timer = tuning.setDownSeconds; }
        break;
      }
      case "setting-down":
        this.timer -= dt;
        if (this.timer > 0) break;
        if (this.holding) { world.returnToStand(guitarId, this.definition.id); this.holding = false; }
        this.breakTimer = tuning.breakSeconds;
        this.walkTo(this.definition.breakSpot.position, "break", "walking");
        break;
      case "walking": case "investigating": case "searching": case "retrieving": case "carrying":
        if (this.activity === "walking" && this.arrival === "break") this.breakTimer -= dt;
        if (this.follow(this.activity === "retrieving" || this.activity === "carrying" ? tuning.jogSpeed : tuning.walkSpeed, dt)) this.arrive(world, guitar);
        break;
      case "watching": case "sipping":
        this.breakTimer -= dt; this.timer -= dt;
        if (this.breakTimer <= 0) { this.walkTo(this.definition.home.position, "home", "walking"); break; }
        if (this.timer <= 0) {
          this.activity = this.activity === "watching" ? "sipping" : "watching";
          this.timer = between(this.random, this.activity === "watching" ? tuning.watchSeconds : tuning.sipSeconds);
        }
        // Watching the stand, or turned away with a drink.
        this.heading = this.activity === "watching" ? this.definition.breakSpot.heading : this.definition.breakSpot.heading + Math.PI;
        break;
      case "eyeing": {
        if (this.resumeAfterEye === "watching" || this.resumeAfterEye === "sipping") this.breakTimer -= dt;
        const watched = world.geese.find((goose) => goose.id === this.eyeTarget);
        if (watched && this.sees(watched.position, tuning.focusedHalfAngle * 1.6)) this.eyePoint = { ...watched.position };
        if (this.eyePoint) this.heading = headingTo(this.position, this.eyePoint);
        this.timer -= dt;
        if (this.timer <= 0) this.resume();
        break;
      }
      case "reacting":
        this.timer -= dt;
        if (this.lastSeenThief) this.heading = headingTo(this.position, this.lastSeenThief);
        if (this.timer <= 0) { this.activity = "chasing"; this.repath = 0; }
        break;
      case "chasing": this.chase(world, guitar, dt); break;
      case "shooing":
        this.timer -= dt;
        if (this.timer <= 0) this.retrieve(guitar && !guitar.holderId && this.sees(guitar.position, Math.PI) ? guitar : undefined);
        break;
      case "looking-around": case "puzzled": case "missing": {
        this.scanTime += dt;
        const sweep = this.activity === "missing" ? 0.9 : 1.25;
        this.heading = this.scanBase + Math.sin(this.scanTime * (this.activity === "missing" ? 0.45 : 1.1)) * sweep;
        if (this.activity === "missing") {
          // Given up: the guitar lies hidden somewhere they could not find it.
          if (guitar && !guitar.holderId) world.recordFact(GUITAR_HIDDEN_FACT_ID);
          break;
        }
        this.timer -= dt;
        if (this.timer <= 0) this.afterLooking();
        break;
      }
    }
  }

  /** Sight: what they can see right now updates what they believe and what they do next. */
  private perceive(world: MusicianWorld, guitar: MusicianGuitar | undefined): void {
    if (!guitar || this.holding) return;
    const halfAngle = this.activity === "eyeing" ? this.definition.tuning.focusedHalfAngle : this.definition.tuning.sightHalfAngle;
    const thief = world.geese.find((goose) => goose.heldEntityId === guitar.id && this.sees(goose.position, halfAngle));
    if (thief) {
      this.believesMissing = true; this.lastSeenThief = { ...thief.position }; this.lastSeenGuitar = { ...guitar.position };
      if (this.activity !== "reacting" && this.activity !== "chasing" && this.activity !== "shooing") {
        this.chaseTarget = thief.id; this.path = []; this.arrival = undefined;
        this.activity = "reacting"; this.timer = this.definition.tuning.reactSeconds;
        this.heading = headingTo(this.position, thief.position);
      } else if (this.activity === "chasing") this.chaseTarget = thief.id;
      return;
    }
    if (guitar.holderId || !this.sees(guitar.position, halfAngle)) return;
    this.lastSeenGuitar = { ...guitar.position };
    const busy = this.activity === "retrieving" || this.activity === "carrying" || this.activity === "shooing" || this.activity === "reacting";
    if (this.onStand(guitar)) {
      // Back where it belongs: nothing to worry about, but pick it up if they were looking for it.
      if (this.believesMissing && !busy) { this.believesMissing = false; this.walkTo(this.definition.home.position, "home", "retrieving"); }
      return;
    }
    if (!busy && this.activity !== "chasing") this.retrieve(guitar);
  }

  /** Hearing: honks turn their head; a scrape out of sight brings them over to look. */
  private hear(world: MusicianWorld): void {
    const { tuning } = this.definition;
    for (const noise of world.noises) {
      const distance = distance2d(noise.position, this.position);
      if (distance > noise.radius) continue;
      const source = world.geese.find((goose) => goose.id === noise.sourceId);
      const halfAngle = this.activity === "eyeing" ? tuning.focusedHalfAngle : tuning.sightHalfAngle;
      if (noise.kind === "scrape") {
        if (!CURIOUS.includes(this.activity) || (source && this.sees(source.position, halfAngle))) continue;
        if (this.activity === "investigating" && this.arrival === "investigate" && this.path.length > 0
          && distance2d(this.path[this.path.length - 1], noise.position) < 1.5) continue;
        this.walkTo(noise.position, "investigate", "investigating");
        this.heading = headingTo(this.position, noise.position);
      } else if (DISTRACTABLE.includes(this.activity) && distance <= tuning.honkHearingRadius) {
        if (this.activity !== "eyeing") {
          this.resumeAfterEye = this.activity;
          const target = this.path[this.path.length - 1];
          this.pendingWalk = (this.activity === "walking" || this.activity === "searching") && target && this.arrival
            ? { target: { ...target }, arrival: this.arrival, activity: this.activity } : undefined;
        }
        this.activity = "eyeing"; this.timer = tuning.eyeSeconds; this.eyeTarget = noise.sourceId; this.eyePoint = { ...noise.position };
        this.heading = headingTo(this.position, noise.position);
      }
    }
  }

  private chase(world: MusicianWorld, guitar: MusicianGuitar | undefined, dt: number): void {
    const { tuning } = this.definition;
    const target = world.geese.find((goose) => goose.id === this.chaseTarget);
    const stillHasIt = target && guitar && target.heldEntityId === guitar.id;
    const visible = target && this.sees(target.position, Math.PI);
    if (!target || !stillHasIt) {
      // It was dropped (or handed over): go and get it, if they can see where it is.
      if (guitar && !guitar.holderId && this.sees(guitar.position, Math.PI)) { this.retrieve(guitar); return; }
      if (guitar && guitar.holderId && guitar.holderId !== this.definition.id) {
        const other = world.geese.find((goose) => goose.id === guitar.holderId);
        if (other && this.sees(other.position, Math.PI)) { this.chaseTarget = other.id; return; }
      }
      this.searchFrom(this.lastSeenThief ?? this.lastSeenGuitar);
      return;
    }
    if (!visible) { this.searchFrom(this.lastSeenThief); return; }
    this.lastSeenThief = { ...target.position };
    if (distance2d(this.position, target.position) <= tuning.catchReach) {
      this.heading = headingTo(this.position, target.position);
      world.pushGoose(this.definition.id, this.position, target.id);
      this.activity = "shooing"; this.timer = tuning.shooSeconds; this.path = [];
      return;
    }
    this.repath -= dt;
    if (this.repath <= 0 || this.path.length === 0) { this.path = this.planPath(this.position, target.position); this.arrival = "chase"; this.repath = REPATH_SECONDS; }
    this.follow(tuning.jogSpeed, dt);
  }

  private retrieve(guitar: MusicianGuitar | undefined): void {
    this.believesMissing = true;
    const at = guitar && !guitar.holderId ? guitar.position : this.lastSeenGuitar;
    if (!at) { this.searchFrom(undefined); return; }
    if (guitar && !guitar.holderId && this.onStand(guitar)) { this.walkTo(this.definition.home.position, "home", "retrieving"); return; }
    this.walkTo(at, "retrieve", "retrieving");
  }

  /** Head for a place they last saw the guitar or the thief, then look around there. */
  private searchFrom(point: Readonly<Position> | undefined): void {
    this.chaseTarget = undefined;
    if (point) this.walkTo(point, "search", "searching");
    else this.afterLooking();
  }

  private becomePuzzled(): void {
    this.believesMissing = true; this.activity = "puzzled"; this.timer = this.definition.tuning.puzzledSeconds;
    this.scanBase = this.heading; this.scanTime = 0; this.path = [];
    if (!this.searchedStage) { this.searchedStage = true; this.searchQueue = this.definition.searchSpots.map((spot) => ({ ...spot })); }
  }

  /** Finished looking somewhere: try the next place, go back to what they were doing, or give up. */
  private afterLooking(): void {
    const next = this.searchQueue.shift();
    if (next) { this.walkTo(next, "search", "searching"); return; }
    if (this.believesMissing) {
      if (!this.searchedStage && this.definition.searchSpots.length > 0) {
        this.searchedStage = true; this.searchQueue = this.definition.searchSpots.map((spot) => ({ ...spot }));
        this.walkTo(this.searchQueue.shift()!, "search", "searching"); return;
      }
      this.walkTo(this.definition.home.position, "home", "walking"); return;
    }
    if (this.breakTimer > 0) this.walkTo(this.definition.breakSpot.position, "break", "walking");
    else this.walkTo(this.definition.home.position, "home", "walking");
  }

  private resume(): void {
    const previous = this.resumeAfterEye; this.eyeTarget = undefined; this.eyePoint = undefined;
    switch (previous) {
      case "watching": case "sipping":
        this.activity = previous; this.timer = between(this.random, this.definition.tuning.watchSeconds); break;
      case "missing": case "puzzled": case "looking-around":
        this.activity = previous; this.scanBase = this.heading; this.scanTime = 0;
        this.timer = Math.max(this.timer, this.definition.tuning.lookSeconds * 0.5); break;
      default: {
        // Carry on with the walk the honk interrupted.
        const pending = this.pendingWalk; this.pendingWalk = undefined;
        if (pending) this.walkTo(pending.target, pending.arrival, pending.activity);
        else if (this.believesMissing) this.searchFrom(this.lastSeenGuitar);
        else if (this.breakTimer > 0) this.walkTo(this.definition.breakSpot.position, "break", "walking");
        else this.walkTo(this.definition.home.position, "home", "walking");
      }
    }
  }

  private arrive(world: MusicianWorld, guitar: MusicianGuitar | undefined): void {
    const { tuning, guitarId } = this.definition;
    const arrival = this.arrival; this.arrival = undefined;
    switch (arrival) {
      case "break":
        this.activity = "watching"; this.timer = between(this.random, tuning.watchSeconds); this.heading = this.definition.breakSpot.heading;
        break;
      case "home": {
        this.heading = this.definition.home.heading;
        if (this.holding || (guitar && this.onStand(guitar) && world.acquire(guitarId, this.definition.id))) {
          this.holding = true; this.believesMissing = false; this.searchedStage = false; this.breakTimer = 0;
          this.activity = "playing"; this.setTimer = between(this.random, tuning.setSeconds);
        } else if (this.searchedStage) {
          this.activity = "missing"; this.scanBase = this.definition.home.heading; this.scanTime = 0;
        } else this.becomePuzzled();
        break;
      }
      case "retrieve": {
        const reachable = guitar && !guitar.holderId && distance2d(guitar.position, this.position) <= 1.2;
        if (reachable && world.acquire(guitarId, this.definition.id)) {
          this.holding = true; this.walkTo(this.definition.home.position, "home", "carrying");
        } else this.lookAround(tuning.lookSeconds);
        break;
      }
      case "investigate": case "search": case "chase": this.lookAround(tuning.lookSeconds); break;
      default: this.lookAround(tuning.lookSeconds);
    }
  }

  private lookAround(seconds: number): void {
    this.activity = "looking-around"; this.timer = seconds; this.scanBase = this.heading; this.scanTime = 0; this.path = [];
  }

  private walkTo(target: Readonly<Position>, arrival: Arrival, activity: MusicianActivity): void {
    this.path = this.planPath(this.position, target); this.arrival = arrival; this.activity = activity;
    if (this.path.length === 0) this.path = [{ ...target }];
  }

  /** A walk over the paving graph, using the stage steps to get on or off the stage. */
  private planPath(from: Readonly<Position>, to: Readonly<Position>): Position[] {
    const exit = this.definition.stageExit;
    const fromStage = from.y > ON_STAGE_HEIGHT; const toStage = to.y > ON_STAGE_HEIGHT;
    const ground = (a: Readonly<Position>, b: Readonly<Position>) =>
      routeOverGraph(this.definition.graph, this.links, (p, q) => this.definition.canPass(p, q), { ...a, y: 0 }, { ...b, y: 0 })
        ?? [{ x: b.x, y: 0, z: b.z }];
    if (exit.length === 0 || (fromStage && toStage)) return [{ ...to }];
    const foot = exit[exit.length - 1];
    if (fromStage) {
      const nearest = exit.reduce((best, point, index) => distance2d(point, from) < distance2d(exit[best], from) ? index : best, 0);
      const start = distance2d(exit[nearest], from) < 0.05 ? nearest + 1 : nearest;
      return [...exit.slice(start).map((point) => ({ ...point })), ...ground(foot, to).filter((point) => distance2d(point, foot) > 0.05)];
    }
    if (toStage) {
      const up = [...exit].reverse().slice(1).map((point) => ({ ...point }));
      const last = up[up.length - 1];
      return [...ground(from, foot).map((point) => ({ ...point, y: 0 })), ...up,
        ...(last && distance2d(last, to) > 0.05 ? [{ ...to }] : [])];
    }
    return ground(from, to);
  }

  /** Moves along the planned path; true on reaching its end. */
  private follow(speed: number, dt: number): boolean {
    let budget = speed * dt;
    while (budget > 0 && this.path.length > 0) {
      const next = this.path[0];
      const dx = next.x - this.position.x; const dz = next.z - this.position.z; const length = Math.hypot(dx, dz);
      if (length > 1e-6) this.heading = Math.atan2(-dx, -dz);
      if (length <= budget) { Object.assign(this.position, next); budget -= length; this.path.shift(); }
      else {
        const t = budget / length;
        this.position.x += dx * t; this.position.z += dz * t; this.position.y += (next.y - this.position.y) * t; budget = 0;
      }
      this.moving = true;
    }
    return this.path.length === 0;
  }

  /** In their view cone (or right beside them), within range, with nothing blocking the view. */
  private sees(point: Readonly<Position>, halfAngle: number): boolean {
    const { tuning } = this.definition;
    const distance = distance2d(this.position, point);
    if (distance > tuning.sightRange) return false;
    if (distance > tuning.nearSenseRadius && Math.abs(wrap(headingTo(this.position, point) - this.heading)) > halfAngle) return false;
    return this.definition.canSee(this.position, point);
  }

  private onStand(guitar: MusicianGuitar): boolean {
    return !guitar.holderId && distance2d(guitar.position, this.definition.standPosition) < ON_STAND;
  }
  private atHome(): boolean { return distance2d(this.position, this.definition.home.position) < 0.3; }
}
