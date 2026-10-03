import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_WORLD_LAYOUT, COFFEE_SHOP_AREA_ID, cloneWorldLayout, createInstance, getWorldArea, type WorldArea } from "../src/game/worldLayout.ts";
import { createCentralPlazaRules, createSightMap, createWorldRules } from "../src/game/worldLevel.ts";
import { GUITAR_TASK_IDS, VILLAGE_TASKS } from "../src/game/challenges.ts";
import { MUSICIAN_TUNING } from "../src/game/musicianTuning.ts";
import { FIXED_STEP, Simulation, type GameplayEvent, type PlayerCommand, type Position, type WorldEntityDefinition, type WorldRules } from "../src/game/simulation/Simulation.ts";
import { GUITAR_HIDDEN_FACT_ID, type MusicianActivity, type MusicianDefinition } from "../src/game/simulation/musician.ts";
import type { TownGraph } from "../src/game/simulation/townsfolk.ts";

const at = (x: number, z: number, y = 0): Position => ({ x, y, z });
const idle: PlayerCommand = { moveX: 0, moveZ: 0, hurry: false, honkPressed: false };
const distance = (a: Readonly<Position>, b: Readonly<Position>) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * A test stage: the musician plays at the origin on a raised stage facing +z,
 * with the guitar stand beside them, takes breaks 12 m out front, and cannot see
 * through a wall running along x = 6–7.
 */
const STAND = at(0.9, 1.6, 0.61);
const STAND_REACH = at(0.9, 2.7);
const BREAK = at(0, 12);
function blockedByWall(a: Readonly<Position>, b: Readonly<Position>): boolean {
  for (let step = 1; step < 60; step += 1) {
    const t = step / 60; const x = a.x + (b.x - a.x) * t; const z = a.z + (b.z - a.z) * t;
    if (x >= 6 && x <= 7 && z >= -2 && z <= 20) return true;
  }
  return false;
}
function openGraph(): TownGraph {
  const nodes: Position[] = []; const edges: [number, number][] = [];
  for (let i = 0; i <= 14; i += 1) for (let j = 0; j <= 14; j += 1) {
    nodes.push(at(-14 + i * 2, -6 + j * 2));
    if (i > 0) edges.push([nodes.length - 1, nodes.length - 16]);
    if (j > 0) edges.push([nodes.length - 1, nodes.length - 2]);
  }
  return { nodes, edges };
}
function stageRules(): WorldRules {
  const guitar: WorldEntityDefinition = { id: "guitar", label: "Guitar", position: STAND, heading: Math.PI, tags: ["guitar"], homeAreaId: "test",
    essential: true, carryable: { interactionRange: 1.15, carryHeight: 0.42, carryDistance: 0.58, maxCarrySpeed: 1.9, drag: { length: 1.02, scrapeRadius: 9 } } };
  const musician: MusicianDefinition = {
    id: "musician", home: { position: at(0, 0, 0.61), heading: Math.PI }, stageExit: [at(0, 0, 0.61), at(0, 1.5, 0.61), at(0, 3)],
    guitarId: "guitar", standPosition: STAND, breakSpot: { position: BREAK, heading: 0 }, searchSpots: [at(-5, 5), at(5, 5)],
    graph: openGraph(), canPass: () => true, canSee: (a, b) => !blockedByWall(a, b), tuning: MUSICIAN_TUNING,
  };
  return { areaId: "test", spawn: at(-10, -4), spawnHeading: 0, objectives: VILLAGE_TASKS, entities: [guitar], musician,
    resolveMovement: (_current, proposed, output) => { Object.assign(output, proposed); } };
}

function run(simulation: Simulation, seconds: number, command: PlayerCommand = idle, second?: PlayerCommand): GameplayEvent[] {
  const events: GameplayEvent[] = [];
  for (let tick = 0; tick < Math.round(seconds / FIXED_STEP); tick += 1) events.push(...simulation.advancePlayers(FIXED_STEP, command, second));
  return events;
}
function runUntil(simulation: Simulation, done: () => boolean, seconds: number, command: PlayerCommand = idle, seen?: Set<MusicianActivity>): void {
  for (let tick = 0; tick < Math.round(seconds / FIXED_STEP); tick += 1) {
    simulation.advancePlayers(FIXED_STEP, command);
    seen?.add(musician(simulation).activity);
    if (done()) return;
  }
  assert.fail(`timed out; the musician is ${musician(simulation).activity}`);
}
const musician = (simulation: Simulation) => simulation.world.musician!;
const guitar = (simulation: Simulation) => simulation.world.entities.find((entity) => entity.tags.includes("guitar"))!;
const press = (simulation: Simulation, command: Partial<PlayerCommand>) => run(simulation, FIXED_STEP, { ...idle, ...command });
/** Wait for the musician's break, then for the moment they look away (or watch the stage). */
function waitForBreak(simulation: Simulation, activity: "watching" | "sipping"): void {
  runUntil(simulation, () => musician(simulation).activity === activity, 90);
}
function grabFromStand(simulation: Simulation): void {
  simulation.setPlayerTransform(STAND_REACH, 0);
  press(simulation, { interactPressed: true });
  assert.equal(simulation.player.heldEntityId, "guitar");
}

test("the musician plays with the guitar in hand, then leaves it on its stand for a break", () => {
  const simulation = new Simulation(stageRules());
  run(simulation, 0.5);
  assert.equal(musician(simulation).activity, "playing");
  assert.equal(guitar(simulation).holderId, "musician");
  simulation.setPlayerTransform(STAND_REACH, 0);
  press(simulation, { interactPressed: true });
  assert.equal(simulation.player.heldEntityId, undefined, "it cannot be taken while it is being played");

  simulation.setPlayerTransform(at(-10, -4), 0);
  waitForBreak(simulation, "watching");
  assert.equal(guitar(simulation).holderId, undefined);
  assert.ok(distance(guitar(simulation).position, STAND) < 0.05, "back on its stand");
  assert.ok(distance(musician(simulation).position, BREAK) < 0.1, "taking the break out front");
});

test("the goose drags the guitar by the neck: backing away in slow tugs, no hurrying, the guitar sliding after it", () => {
  const simulation = new Simulation(stageRules());
  waitForBreak(simulation, "sipping");
  grabFromStand(simulation);
  assert.equal(simulation.player.dragging, true);
  simulation.setPlayerTransform(at(-8, 0), 0);
  const speeds: number[] = [];
  for (let tick = 0; tick < 150; tick += 1) {
    simulation.advancePlayers(FIXED_STEP, { ...idle, moveX: -1, hurry: true });
    speeds.push(simulation.player.speed);
    const item = guitar(simulation); const goose = simulation.player;
    const forwardX = -Math.sin(goose.heading); const forwardZ = -Math.cos(goose.heading);
    if (tick > 60) {
      assert.ok((item.trail!.x - goose.position.x) * forwardX + (item.trail!.z - goose.position.z) * forwardZ > 0.6, "facing the guitar it pulls");
      assert.ok(goose.velocity.x * forwardX + goose.velocity.z * forwardZ < 0, "backing away from it");
    }
  }
  const steady = speeds.slice(60);
  assert.ok(Math.max(...steady) <= 1.9 + 1e-6, "never faster than the guitar allows, even hurrying");
  assert.ok(Math.min(...steady) < Math.max(...steady) * 0.75, "it moves in heaves rather than at a steady pace");

  const before = { ...guitar(simulation).trail! };
  press(simulation, { interactPressed: true });
  const dropped = guitar(simulation);
  assert.equal(dropped.holderId, undefined);
  assert.ok(dropped.trail && distance(dropped.trail, before) < 0.3, "let go where it lies, not lifted somewhere new");
  assert.equal(simulation.player.dragging, false);
});

test("taking the guitar in plain view sends the musician after the goose; caught, it drops the guitar and the set goes on", () => {
  const simulation = new Simulation(stageRules());
  waitForBreak(simulation, "watching");
  grabFromStand(simulation);
  const seen = new Set<MusicianActivity>();
  const events: GameplayEvent[] = [];
  for (let tick = 0; tick < 20 / FIXED_STEP && !events.some((event) => event.type === "goose-shooed"); tick += 1) {
    events.push(...simulation.advancePlayers(FIXED_STEP, idle)); seen.add(musician(simulation).activity);
  }
  assert.ok(seen.has("reacting") && seen.has("chasing"));
  assert.ok(events.some((event) => event.type === "goose-shooed" && event.actorId === "musician"));
  assert.equal(simulation.player.heldEntityId, undefined, "caught, the goose drops it");
  runUntil(simulation, () => musician(simulation).activity === "playing", 30);
  assert.equal(guitar(simulation).holderId, "musician", "picked up and played again");
});

test("an unseen theft leaves the musician puzzled; after searching they give up, and the guitar counts as hidden", () => {
  const simulation = new Simulation(stageRules());
  waitForBreak(simulation, "sipping");
  grabFromStand(simulation);
  // Off behind the wall without a sound, and left there.
  simulation.setPlayerTransform(at(9.5, 5), 0);
  press(simulation, { interactPressed: true });
  simulation.setPlayerTransform(at(-12, -5), 0);
  const seen = new Set<MusicianActivity>();
  runUntil(simulation, () => musician(simulation).activity === "missing", 120, idle, seen);
  assert.ok(seen.has("puzzled") && seen.has("searching"));
  assert.equal(seen.has("chasing"), false, "they never saw who took it");
  run(simulation, FIXED_STEP * 2);
  assert.ok(simulation.world.durableFacts.includes(GUITAR_HIDDEN_FACT_ID));
  assert.equal(simulation.isObjectiveComplete(GUITAR_TASK_IDS.hide), true);
  assert.equal(simulation.isObjectiveComplete(GUITAR_TASK_IDS.steal), true);
});

test("a guitar left where the musician can see it is fetched back rather than counted as hidden", () => {
  const simulation = new Simulation(stageRules());
  waitForBreak(simulation, "sipping");
  grabFromStand(simulation);
  simulation.setPlayerTransform(at(-3, 6), 0);
  press(simulation, { interactPressed: true });
  simulation.setPlayerTransform(at(-12, -5), 0);
  runUntil(simulation, () => musician(simulation).activity === "playing" && guitar(simulation).holderId === "musician", 120);
  assert.equal(simulation.world.durableFacts.includes(GUITAR_HIDDEN_FACT_ID), false);
});

test("the scrape of the guitar carries through walls: the musician comes to look, though they cannot see it", () => {
  const simulation = new Simulation(stageRules());
  waitForBreak(simulation, "sipping");
  grabFromStand(simulation);
  simulation.setPlayerTransform(at(8, 9), Math.PI);
  run(simulation, 0.5);
  assert.ok(!["investigating", "reacting", "chasing"].includes(musician(simulation).activity), "standing still behind the wall makes no sound");
  run(simulation, 0.6, { ...idle, moveZ: 1 });
  assert.equal(musician(simulation).activity, "investigating");
});

test("honking with the guitar in the bill twangs it", () => {
  const simulation = new Simulation(stageRules());
  waitForBreak(simulation, "sipping");
  grabFromStand(simulation);
  const events = press(simulation, { honkPressed: true });
  assert.ok(events.some((event) => event.type === "instrument-twanged"));
  assert.ok(events.some((event) => event.type === "objective-completed" && event.objectiveId === GUITAR_TASK_IDS.twang));
});

test("one goose honks to draw the musician's eye while the other takes the guitar", () => {
  const simulation = new Simulation(stageRules());
  simulation.enableSecondPlayer(at(-11, -5));
  waitForBreak(simulation, "watching");
  simulation.setPlayerTransform(at(-6, 12), 0);
  simulation.setSecondPlayerTransform(STAND_REACH, 0);
  run(simulation, FIXED_STEP, { ...idle, honkPressed: true }, idle);
  assert.equal(musician(simulation).activity, "eyeing");
  const events = run(simulation, FIXED_STEP, idle, { ...idle, interactPressed: true });
  assert.equal(simulation.secondaryPlayer?.heldEntityId, "guitar");
  assert.ok(events.some((event) => event.type === "objective-completed" && event.objectiveId === GUITAR_TASK_IDS.distraction));
  assert.equal(musician(simulation).activity, "eyeing", "still watching the honker");
});

test("a theft the musician sees while watching nobody else does not count as a distraction", () => {
  const simulation = new Simulation(stageRules());
  waitForBreak(simulation, "watching");
  grabFromStand(simulation);
  run(simulation, 0.2);
  assert.equal(simulation.isObjectiveComplete(GUITAR_TASK_IDS.distraction), false);
});

test("sight lines: buildings block the view, benches do not", () => {
  const area: WorldArea = { id: "sight-test", label: "Sight test", chunks: [{ x: 0, z: 0, playable: true }], instances: [], controlLinks: [] };
  createInstance(area, "street.building1", "test.building", 10, 10);
  createInstance(area, "oldtown.bench", "test.bench", 10, 30);
  const canSee = createSightMap(area);
  assert.equal(canSee({ x: 2, z: 10 }, { x: 18, z: 10 }), false, "a building in the way");
  assert.equal(canSee({ x: 2, z: 30 }, { x: 18, z: 30 }), true, "a bench in the way");
  assert.equal(canSee({ x: 2, z: 20 }, { x: 18, z: 20 }), true, "nothing in the way");
});

test("in the square, the musician gets down off the stage for a break and back up to play again", () => {
  const simulation = new Simulation(createCentralPlazaRules(getWorldArea(CANONICAL_WORLD_LAYOUT)));
  const stand = { ...guitar(simulation).position };
  runUntil(simulation, () => musician(simulation).activity === "watching", 60);
  assert.ok(distance(guitar(simulation).position, stand) < 0.05, "left on its stand");
  assert.ok(musician(simulation).position.y < 0.1, "down on the paving");
  runUntil(simulation, () => musician(simulation).activity === "playing" && guitar(simulation).holderId === musician(simulation).id, 80);
  assert.ok(musician(simulation).position.y > 0.3, "back up on the stage");
});

test("dragging the guitar into the coffee shop counts, and it is back on its stand on returning", () => {
  const layout = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  const plazaRules = () => createWorldRules(getWorldArea(layout), layout.transitions);
  const square = new Simulation(plazaRules());
  runUntil(square, () => musician(square).activity === "sipping", 90);
  const item = guitar(square);
  square.setPlayerTransform({ ...item.position, y: 0 }, 0);
  press(square, { interactPressed: true });
  assert.equal(square.player.heldEntityId, item.id);

  const shop = new Simulation(createWorldRules(getWorldArea(layout, COFFEE_SHOP_AREA_ID), layout.transitions), square.sessionState);
  const events = run(shop, FIXED_STEP);
  assert.ok(events.some((event) => event.type === "objective-completed" && event.objectiveId === GUITAR_TASK_IDS.elsewhere));
  press(shop, { interactPressed: true });

  const back = new Simulation(plazaRules(), shop.sessionState);
  assert.equal(back.world.entities.filter((entity) => entity.tags.includes("guitar")).length, 1, "the musician cannot do without it");
  run(back, 0.2);
  assert.equal(guitar(back).holderId, musician(back).id);
});

test("only the distraction task needs two geese", () => {
  const simulation = new Simulation(stageRules());
  assert.deepEqual(simulation.objectiveList.filter((task) => task.needsTwoGeese).map((task) => task.id), [GUITAR_TASK_IDS.distraction]);
});
