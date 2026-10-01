import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_WORLD_LAYOUT, cloneWorldLayout, COFFEE_SHOP_AREA_ID, getWorldArea, loadWorldLayout, saveWorldLayout, WORLD_LAYOUT_STORAGE_KEY,
  type WorldArea, type WorldInstance } from "../src/game/worldLayout.ts";
import { createCentralPlazaRules, createTownGraph, createWalkMap, createWorldRules } from "../src/game/worldLevel.ts";
import { getWorldAsset } from "../src/game/worldAssets.ts";
import { FIXED_STEP, Simulation, type GameplayEvent, type Position } from "../src/game/simulation/Simulation.ts";
import { SEATED_PASTIMES, Townsfolk, type DogDefinition, type TownGoose, type TownSeat, type TownsfolkDefinition, type TownspersonDefinition } from "../src/game/simulation/townsfolk.ts";
import { DOG_TUNING, TOWNSFOLK_PASTIME_SECONDS, TOWNSFOLK_REACTIONS, TOWNSFOLK_WALKER } from "../src/game/townsfolkTuning.ts";

const at = (x: number, z: number): Position => ({ x, y: 0, z });
const distance = (a: Readonly<Position>, b: Readonly<Position>) => Math.hypot(a.x - b.x, a.z - b.z);

/** An open 24 m square with walking points every 3 m. */
function openGraph() {
  const nodes: Position[] = []; const edges: [number, number][] = [];
  for (let i = 0; i <= 8; i += 1) for (let j = 0; j <= 8; j += 1) {
    nodes.push(at(i * 3, j * 3));
    if (i > 0) edges.push([nodes.length - 1, nodes.length - 10]);
    if (j > 0) edges.push([nodes.length - 1, nodes.length - 2]);
  }
  return { nodes, edges };
}
const seat = (id: string, x: number, z: number): TownSeat => ({ id, position: at(x, z), heading: 0, approach: at(x, z - 0.9) });
function town(people: TownspersonDefinition[], extra: Partial<TownsfolkDefinition> = {}): Townsfolk {
  return new Townsfolk({ people, dogs: [], graph: openGraph(), seats: [], sights: [], doors: [], reactions: TOWNSFOLK_REACTIONS,
    pastimeSeconds: TOWNSFOLK_PASTIME_SECONDS, walker: TOWNSFOLK_WALKER, canStand: (x, z) => x >= 0 && z >= 0 && x <= 24 && z <= 24, canPass: () => true, ...extra });
}
const standingParent = (id = "parent", x = 12, z = 12): TownspersonDefinition => ({ id, look: "cap-dad", role: "parent", position: at(x, z), heading: 0,
  walkSpeed: 1.4, watch: at(x, z + 5), pastimes: ["watching", "clapping", "waving"] });
const walker = (id: string, x: number, z: number): TownspersonDefinition => ({ id, look: "teen", role: "walker", position: at(x, z), heading: 0,
  walkSpeed: 1.4, pastimes: ["phoning", "looking", "sit-phoning", "sit-looking"] });
function run(people: Townsfolk, seconds: number, goose: TownGoose | ((tick: number) => TownGoose), each?: (tick: number, events: GameplayEvent[]) => void): GameplayEvent[] {
  const all: GameplayEvent[] = [];
  for (let tick = 0; tick < Math.round(seconds / FIXED_STEP); tick += 1) {
    const events: GameplayEvent[] = [];
    people.update(typeof goose === "function" ? goose(tick) : goose, events, FIXED_STEP);
    each?.(tick, events); all.push(...events);
  }
  return all;
}
const far: TownGoose = { position: at(100, 100), startling: false };
const person = (people: Townsfolk, id: string) => people.snapshot().find((candidate) => candidate.id === id)!;

test("a honk nearby startles a standing parent, who then gets back to watching near their spot", () => {
  const people = town([standingParent()]);
  const events = run(people, FIXED_STEP, { position: at(13.5, 12), startling: true });
  assert.ok(events.some((event) => event.type === "person-startled"));
  assert.equal(person(people, "parent").activity, "startled");
  run(people, 12, far);
  const after = person(people, "parent");
  assert.ok(["watching", "clapping", "waving", "walking"].includes(after.activity), after.activity);
  assert.ok(distance(after.position, at(12, 12)) < 2.5, "back near where they were standing");
});

test("a goose walking right up to a standing person makes them back away from it", () => {
  const people = town([standingParent()]);
  const goose = { position: at(12.6, 12.4), startling: false };
  run(people, 2.5, goose);
  assert.ok(distance(person(people, "parent").position, goose.position) > TOWNSFOLK_REACTIONS.personalRadius);
});

test("seated people stay put when startled and wave off a goose that comes too close", () => {
  const bench = seat("bench#0", 6, 6);
  const people = town([{ ...standingParent(), position: bench.position, seat: bench, pastimes: ["sit-looking", "sitting"] }]);
  run(people, FIXED_STEP, { position: at(7.5, 6), startling: true });
  assert.equal(person(people, "parent").activity, "startled");
  assert.equal(person(people, "parent").seated, true);
  run(people, 3, far);
  run(people, 0.5, { position: at(6.6, 6.6), startling: false });
  const parent = person(people, "parent");
  assert.equal(parent.activity, "shooing");
  assert.equal(parent.seated, true);
  assert.deepEqual(parent.position, bench.position);
});

test("passers-by sit on free benches but never share a seat, and get up again", () => {
  const seats = [seat("a#0", 6, 6), seat("a#1", 7, 6), seat("b#0", 18, 18)];
  const people = town([walker("w1", 0, 0), walker("w2", 24, 0), walker("w3", 0, 24), walker("w4", 24, 24), walker("w5", 12, 12)], { seats });
  const satDown = new Set<string>(); const stoodUp = new Set<string>(); const wasSeated = new Map<string, boolean>();
  run(people, 400, far, () => {
    const seated = people.snapshot().filter((candidate) => candidate.seated);
    for (const candidate of seated) {
      assert.ok(SEATED_PASTIMES.includes(candidate.activity) || candidate.activity === "startled" || candidate.activity === "shooing", candidate.activity);
      assert.ok(!seated.some((other) => other !== candidate && distance(other.position, candidate.position) < 0.3), "two people on one seat");
    }
    for (const candidate of people.snapshot()) {
      if (candidate.seated && !wasSeated.get(candidate.id)) satDown.add(candidate.id);
      if (!candidate.seated && wasSeated.get(candidate.id)) stoodUp.add(candidate.id);
      wasSeated.set(candidate.id, candidate.seated);
    }
  });
  assert.ok(satDown.size >= 2, "several people sat down");
  assert.ok(stoodUp.size >= 1, "someone got up and walked on");
});

test("a jogger never stops to sit", () => {
  const people = town([{ ...walker("jogger", 0, 0), look: "jogger", runs: true, walkSpeed: 3.1 }], { seats: [seat("a#0", 6, 6)] });
  run(people, 120, far, () => assert.equal(person(people, "jogger").seated, false));
});

test("someone who goes into a shop disappears inside, then comes back out", () => {
  const people = town([walker("w1", 3, 3), walker("w2", 21, 21), walker("w3", 3, 21)], { doors: [{ position: at(12, 24), heading: 0 }] });
  let wentIn = false; let cameOut = false; const inside = new Set<string>();
  run(people, 600, far, () => {
    for (const candidate of people.snapshot()) {
      if (candidate.hidden) { wentIn = true; inside.add(candidate.id); assert.ok(distance(candidate.position, at(12, 24)) < 0.1, "hidden at the door"); }
      else if (inside.has(candidate.id)) { cameOut = true; inside.delete(candidate.id); }
    }
  });
  assert.ok(wentIn && cameOut);
});

test("townsfolk replay identically from the same start", () => {
  const make = () => town([walker("w1", 0, 0), walker("w2", 24, 24), standingParent()], { seats: [seat("a#0", 6, 6)], doors: [{ position: at(12, 24), heading: 0 }] });
  const first = make(); const second = make();
  const goose = (tick: number): TownGoose => ({ position: at(12 + Math.sin(tick / 90) * 8, 12), startling: tick % 400 === 0 });
  run(first, 90, goose); run(second, 90, goose);
  assert.deepEqual(first.snapshot(), second.snapshot());
});

const dog = (ownerId?: string): DogDefinition => ({ id: "dog", position: at(7, 6), heading: 0, ownerId, ...DOG_TUNING });

test("the dog barks at a goose that comes close or honks nearby, then settles once it leaves", () => {
  const people = town([], { dogs: [dog()] });
  assert.equal(run(people, 5, far).length, 0);
  let events = run(people, 0.5, { position: at(7, 6 + DOG_TUNING.barkRadius - 0.5), startling: false });
  assert.ok(events.some((event) => event.type === "dog-barked"));
  assert.equal(people.dogSnapshot()[0].activity, "barking");
  run(people, 30, far);
  assert.ok(["lying", "sitting"].includes(people.dogSnapshot()[0].activity));
  events = run(people, FIXED_STEP, { position: at(7, 6 + DOG_TUNING.honkRadius - 0.5), startling: true });
  assert.ok(events.some((event) => event.type === "dog-barked"), "a honk within earshot sets it off too");
});

test("a seated owner strokes the dog, and the dog enjoys it", () => {
  const bench = seat("bench#0", 6, 6);
  const owner: TownspersonDefinition = { ...standingParent("owner"), look: "sunhat-mom", position: bench.position, seat: bench, pastimes: ["sit-looking", "sit-petting"] };
  const people = town([owner], { dogs: [dog("owner")] });
  let petted = false;
  run(people, 120, far, () => {
    if (person(people, "owner").activity === "sit-petting" && people.dogSnapshot()[0].activity === "happy") petted = true;
  });
  assert.ok(petted);
});

// --- Building the square's townsfolk from a layout ------------------------------------------------

function testArea(instances: WorldInstance[]): WorldArea {
  return { id: "test-square", label: "Test square", chunks: [{ x: -1, z: -1, playable: true }, { x: 0, z: -1, playable: true }, { x: -1, z: 0, playable: true }, { x: 0, z: 0, playable: true }],
    instances: [{ id: "paving", assetId: "plaza.paving-base", label: "Paving", transform: { x: 0, y: 0, z: 0, rotationY: 0 } }, ...instances], controlLinks: [] };
}
const place = (id: string, assetId: string, x: number, z: number, rotationY = 0): WorldInstance => ({ id, assetId, label: id, transform: { x, y: 0, z, rotationY } });

test("the walking graph keeps people off the splash pad and clear of furniture", () => {
  const area = testArea([place("pad", "plaza.splash-pad", 0, 0), place("bench", "oldtown.bench", 9, 0), place("bin", "street.trash-can", -9, 3)]);
  const graph = createTownGraph(area, []);
  const walk = createWalkMap(area);
  assert.ok(graph.nodes.length > 50);
  for (const node of graph.nodes) assert.ok(!(Math.abs(node.x) <= 4.9 && Math.abs(node.z) <= 4.9), "no point on the splash pad");
  for (const [a, b] of graph.edges) assert.ok(walk.segmentOpen(graph.nodes[a], graph.nodes[b]), "every link is walkable");
  for (const [a, b] of graph.edges) {
    const middle = { x: (graph.nodes[a].x + graph.nodes[b].x) / 2, z: (graph.nodes[a].z + graph.nodes[b].z) / 2 };
    assert.ok(!(Math.abs(middle.x) <= 4.9 && Math.abs(middle.z) <= 4.9), "no link across the splash pad");
  }
});

test("a parent placed by a bench sits on it, and the dog sits on the bench beside them", () => {
  const area = testArea([place("pad", "plaza.splash-pad", 0, 0), place("bench", "oldtown.bench", 0, -7.5),
    place("mom", "plaza.parent-sunhat-mom", 0.5, -7.3, Math.PI), place("dog", "plaza.small-white-dog", -0.5, -7.3), place("dad", "plaza.parent-cap-dad", 6, 2)]);
  const rules = createCentralPlazaRules(area);
  const town = rules.townsfolk!;
  const mom = town.people.find((candidate) => candidate.id === "mom")!;
  assert.ok(mom.seat, "the mom sits on the bench");
  assert.equal(town.people.find((candidate) => candidate.id === "dad")!.seat, undefined, "the dad stands");
  const pet = town.dogs[0];
  assert.equal(pet.ownerId, "mom");
  assert.ok(pet.position.y > 0.4, "the dog is up on the bench");
  assert.ok(!town.seats.some((free) => free.id === mom.seat!.id || distance(free.position, pet.position) < 0.6), "nobody else takes the mom's or the dog's place");
});

// --- Café regulars --------------------------------------------------------------------------------

test("café regulars come in one at a time, share a customer's table, and leave for the next one", () => {
  const area = getWorldArea(CANONICAL_WORLD_LAYOUT, COFFEE_SHOP_AREA_ID);
  const simulation = new Simulation(createWorldRules(area, CANONICAL_WORLD_LAYOUT.transitions));
  // Park the goose in a far corner, out of everyone's way.
  simulation.setPlayerTransform({ x: 8, y: 0, z: 5.5 }, 0);
  const customerTables = new Set(simulation.world.cafePeople.flatMap((candidate) => candidate.tableSurfaceId ? [candidate.tableSurfaceId] : []));
  const tables = area.instances.filter((item) => item.assetId === "coffee.table");
  const tableAt = (p: Readonly<Position>) => tables.reduce((best, table) => distance(table.transform, p) < distance(best.transform, p) ? table : best);
  const visits = new Map<string, number>(); const left = new Set<string>(); const previous = new Map<string, string>();
  for (let tick = 0; tick < 300 / FIXED_STEP; tick += 1) {
    simulation.advance(FIXED_STEP, { moveX: 0, moveZ: 0, hurry: false, honkPressed: false });
    const patrons = simulation.world.cafePeople.filter((candidate) => candidate.role === "patron");
    assert.ok(patrons.filter((candidate) => candidate.activity === "entering" || candidate.activity === "ordering").length <= 1, "one at a time at the counter");
    for (const patron of patrons) {
      if (patron.seated) assert.ok(customerTables.has(tableAt(patron.position).id), "regulars leave the empty table free");
      if (patron.activity === "ordering" && previous.get(patron.id) !== "ordering") visits.set(patron.id, (visits.get(patron.id) ?? 0) + 1);
      if (patron.activity === "away" && previous.get(patron.id) === "leaving") left.add(patron.id);
      previous.set(patron.id, patron.activity);
    }
  }
  assert.ok(left.size >= 2, "regulars finish their coffee and go");
  assert.ok(visits.size >= 3, "different regulars come in to order");
});

test("drafts saved before the townsfolk arrived gain them once, keeping other edits", () => {
  const values = new Map<string, string>();
  const store = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
  const roles = new Set(["town-parent", "town-walker", "town-dog", "cafe-patron"]);
  const old = cloneWorldLayout(CANONICAL_WORLD_LAYOUT); old.canonicalRevision = 23;
  for (const area of old.areas) area.instances = area.instances.filter((item) => !roles.has(getWorldAsset(item.assetId)?.gameplayRole ?? ""));
  getWorldArea(old).instances.find((item) => item.id === "plaza.goose-fountain")!.transform.x = -14.5;
  saveWorldLayout(old, store);
  const count = (layout: typeof old) => layout.areas.reduce((sum, area) => sum + area.instances.filter((item) => roles.has(getWorldAsset(item.assetId)?.gameplayRole ?? "")).length, 0);
  const updated = loadWorldLayout(store);
  assert.equal(count(updated), count(CANONICAL_WORLD_LAYOUT));
  assert.equal(getWorldArea(updated).instances.find((item) => item.id === "plaza.goose-fountain")!.transform.x, -14.5);
  assert.equal(JSON.parse(values.get(WORLD_LAYOUT_STORAGE_KEY)!).canonicalRevision, updated.canonicalRevision);
  assert.equal(count(loadWorldLayout(store)), count(CANONICAL_WORLD_LAYOUT), "loading again adds nobody twice");
});

test("parents turn and call out to a frightened child nearby, then go back to what they were doing", () => {
  const bench = seat("bench#0", 6, 6);
  const people = town([standingParent("standing"), { ...standingParent("seated"), position: bench.position, seat: bench, pastimes: ["sit-phoning", "sitting"] }]);
  const child = at(10, 13);
  run(people, 1, far);
  const events: GameplayEvent[] = [];
  for (let tick = 0; tick < 60; tick += 1) people.update(far, events, FIXED_STEP, [child]);
  const standing = person(people, "standing");
  assert.equal(standing.activity, "calling");
  const toChild = Math.atan2(-(child.x - standing.position.x), -(child.z - standing.position.z));
  assert.ok(Math.cos(standing.heading - toChild) > 0.999, "facing the child");
  assert.equal(person(people, "seated").activity, "sit-looking");
  run(people, 12, far);
  assert.notEqual(person(people, "standing").activity, "calling", "they settle once the child does");
});

test("an idle barista greets a regular who comes up to order", () => {
  const area = getWorldArea(CANONICAL_WORLD_LAYOUT, COFFEE_SHOP_AREA_ID);
  const simulation = new Simulation(createWorldRules(area, CANONICAL_WORLD_LAYOUT.transitions));
  simulation.setPlayerTransform({ x: 8, y: 0, z: 5.5 }, 0);
  let greeted = 0; let wasIdle = false; let ordering = new Set<string>();
  for (let tick = 0; tick < 300 / FIXED_STEP; tick += 1) {
    simulation.advance(FIXED_STEP, { moveX: 0, moveZ: 0, hurry: false, honkPressed: false });
    const people = simulation.world.cafePeople;
    const barista = people.find((candidate) => candidate.role === "barista")!;
    const nowOrdering = new Set(people.filter((candidate) => candidate.activity === "ordering").map((candidate) => candidate.id));
    if ([...nowOrdering].some((id) => !ordering.has(id)) && wasIdle) { assert.equal(barista.activity, "greeting"); greeted += 1; }
    ordering = nowOrdering; wasIdle = barista.activity === "idle" && !barista.moving;
  }
  assert.ok(greeted >= 1);
});
