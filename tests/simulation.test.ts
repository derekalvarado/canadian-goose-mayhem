import assert from "node:assert/strict";
import test from "node:test";
import { Objectives } from "../src/game/simulation/Objectives.ts";
import {
  Simulation, FIXED_STEP, GOOSE_POOP_IDLE_SECONDS, MAX_GOOSE_POOPS, type WorldRules, type PlayerCommand,
} from "../src/game/simulation/Simulation.ts";
import { brambleRules, TRAIL_OBJECTIVE_ID } from "../src/game/simulation/bramble.ts";
import { EXIT_Z, isPlayable, pathCenterAt } from "../src/game/level.ts";

const idle: PlayerCommand = { moveX: 0, moveZ: 0, hurry: false, honkPressed: false };
const openWorld: WorldRules = {
  spawn: { x: 0, y: 0.02, z: 0 }, spawnHeading: Math.PI, objectives: [],
  resolveMovement: (_current, proposed, output) => { Object.assign(output, proposed); },
};

test("movement produces the same result at 30, 60, and 144 rendered frames per second", () => {
  const states = [30, 60, 144].map((fps) => {
    const simulation = new Simulation(openWorld);
    for (let frame = 0; frame < fps * 2; frame++) {
      simulation.advance(1 / fps, { ...idle, moveX: 0.7, moveZ: -0.7 });
    }
    assert.equal(simulation.elapsed, 2);
    return simulation.player;
  });
  assert.deepEqual(states[0], states[1]);
  assert.deepEqual(states[1], states[2]);
});

test("presentation interpolation exposes adjacent ticks without advancing or mutating gameplay", () => {
  const simulation = new Simulation(openWorld);
  simulation.advance(FIXED_STEP, { ...idle, moveX: 1 });
  const current = simulation.player;
  assert.deepEqual(simulation.previousPlayerTransform.position, openWorld.spawn);
  assert.equal(simulation.interpolationAlpha, 0);
  simulation.advance(FIXED_STEP / 2, { ...idle, moveX: 1 });
  assert.deepEqual(simulation.player, current, "partial render frame changed gameplay");
  assert.ok(Math.abs(simulation.interpolationAlpha - 0.5) < 1e-9);
  const sample = simulation.previousPlayerTransform;
  (sample.position as { x: number }).x = 999;
  assert.equal(simulation.previousPlayerTransform.position.x, 0, "presentation received mutable simulation state");
  simulation.advance(FIXED_STEP / 2, { ...idle, moveX: 1 });
  assert.deepEqual(simulation.previousPlayerTransform.position, current.position);
  simulation.suspend();
  assert.deepEqual(simulation.previousPlayerTransform.position, simulation.player.position);
  simulation.reset();
  assert.deepEqual(simulation.previousPlayerTransform.position, openWorld.spawn);
  assert.equal(simulation.previousPlayerTransform.heading, openWorld.spawnHeading);
});

test("honk survives a frame without a tick and is emitted once during catch-up", () => {
  const simulation = new Simulation(openWorld);
  assert.deepEqual(simulation.advance(FIXED_STEP / 2, { ...idle, honkPressed: true }), []);
  const events = simulation.advance(FIXED_STEP * 3, idle);
  assert.equal(events.filter((event) => event.type === "goose-honked").length, 1);
  assert.deepEqual(simulation.advance(FIXED_STEP, idle), []);
});

test("pause discards a pending honk and partial tick without resetting progress", () => {
  const simulation = new Simulation({ ...openWorld, objectives: [{ id: "visit", description: "Visit", isSatisfied: () => true }] });
  simulation.advance(FIXED_STEP, idle);
  simulation.advance(FIXED_STEP / 2, { ...idle, honkPressed: true });
  simulation.suspend();
  assert.deepEqual(simulation.advance(FIXED_STEP, idle), []);
  assert.equal(simulation.elapsed, 2 * FIXED_STEP);
  assert.equal(simulation.isObjectiveComplete("visit"), true);
});

test("sneak and threat poses live in simulation state and clear on pause", () => {
  const simulation = new Simulation(openWorld);
  simulation.advance(FIXED_STEP, { ...idle, wingsSpread: true, sneaking: true, threatening: true });
  assert.equal(simulation.player.wingsSpread, true);
  assert.equal(simulation.player.sneaking, true);
  assert.equal(simulation.player.threatening, true);
  for (let tick = 0; tick < Math.round(GOOSE_POOP_IDLE_SECONDS / FIXED_STEP); tick += 1) {
    simulation.advance(FIXED_STEP, { ...idle, sneaking: true });
  }
  assert.equal(simulation.goosePoops.length, 0);
  simulation.suspend();
  assert.equal(simulation.player.wingsSpread, false);
  assert.equal(simulation.player.sneaking, false);
  assert.equal(simulation.player.threatening, false);
});

test("long stalls are bounded and do not create a later catch-up burst", () => {
  const simulation = new Simulation(openWorld);
  simulation.advance(60, { ...idle, moveX: 1 });
  assert.equal(simulation.elapsed, 8 * FIXED_STEP);
  simulation.advance(FIXED_STEP, idle);
  assert.equal(simulation.elapsed, 9 * FIXED_STEP);
});

test("the live forest collision adapter keeps a running goose within the clearing", () => {
  const simulation = new Simulation(brambleRules);
  for (let frame = 0; frame < 600; frame++) {
    simulation.advance(FIXED_STEP, { ...idle, moveX: 1, hurry: true });
    const { x, z } = simulation.player.position;
    assert.equal(isPlayable(x, z), true);
  }
});

test("finding the trail completes once, permits backtracking, and resets explicitly", () => {
  const z = EXIT_Z + 0.02;
  const simulation = new Simulation({ ...brambleRules, spawn: { x: pathCenterAt(z), y: 0.02, z } });
  const events = Array.from({ length: 20 }, () => simulation.advance(FIXED_STEP, { ...idle, moveZ: -1 })).flat();
  assert.equal(events.filter((event) => event.type === "objective-completed").length, 1);
  assert.equal(simulation.isObjectiveComplete(TRAIL_OBJECTIVE_ID), true);
  const before = simulation.player.position.z;
  for (let frame = 0; frame < 90; frame++) simulation.advance(FIXED_STEP, { ...idle, moveZ: 1 });
  assert.ok(simulation.player.position.z > before + 2);
  assert.equal(simulation.isObjectiveComplete(TRAIL_OBJECTIVE_ID), true);
  simulation.reset();
  assert.equal(simulation.isObjectiveComplete(TRAIL_OBJECTIVE_ID), false);
  assert.equal(simulation.elapsed, 0);
  assert.deepEqual(simulation.player.velocity, { x: 0, y: 0, z: 0 });
});

test("objectives work in either order or simultaneously and never revoke completion", () => {
  for (const sequence of [[1, 2], [2, 1], [3]]) {
    const objectives = new Objectives<number>([
      { id: "thermos", description: "Move the thermos", isSatisfied: (bits) => Boolean(bits & 1) },
      { id: "gate", description: "Open the gate", isSatisfied: (bits) => Boolean(bits & 2) },
    ]);
    const completed = sequence.flatMap((bits) => objectives.evaluate(bits));
    assert.deepEqual(completed.sort(), ["gate", "thermos"]);
    assert.deepEqual(objectives.evaluate(0), []);
    assert.deepEqual(objectives.evaluate(3), []);
    assert.equal(objectives.isComplete("thermos"), true);
  }
});

test("duplicate objective IDs are rejected so content cannot silently mask another task", () => {
  const definition = { id: "task", description: "Task", isSatisfied: () => true };
  assert.throws(() => new Objectives([definition, definition]), /Duplicate objective ID/);
});

test("view snapshots and honk event positions cannot mutate authoritative player state", () => {
  const simulation = new Simulation(openWorld);
  const snapshot = simulation.player;
  const [event] = simulation.advance(FIXED_STEP, { ...idle, honkPressed: true });
  Object.assign(snapshot.position, { x: 999 });
  if (event.type === "goose-honked") Object.assign(event.position, { x: 999 });
  assert.equal(simulation.player.position.x, 0);
});

test("diagonal commands are normalized and invalid time cannot poison simulation state", () => {
  const simulation = new Simulation(openWorld);
  for (const delta of [NaN, Infinity, -1, 0]) assert.deepEqual(simulation.advance(delta, idle), []);
  simulation.advance(FIXED_STEP, { ...idle, moveX: 1, moveZ: 1 });
  const diagonalSpeed = simulation.player.speed;
  simulation.reset();
  simulation.advance(FIXED_STEP, { ...idle, moveX: 1 });
  assert.ok(Math.abs(simulation.player.speed - diagonalSpeed) < 1e-12);
});

test("the goose poops after ten idle seconds and player activity resets the wait", () => {
  const simulation = new Simulation(openWorld);
  const firstWait = Math.round(GOOSE_POOP_IDLE_SECONDS / FIXED_STEP) - 1;
  for (let tick = 0; tick < firstWait; tick++) assert.deepEqual(simulation.advance(FIXED_STEP, idle), []);
  assert.equal(simulation.goosePoops.length, 0);

  simulation.advance(FIXED_STEP, { ...idle, moveX: 1 });
  for (let tick = 0; tick < firstWait; tick++) simulation.advance(FIXED_STEP, idle);
  assert.equal(simulation.goosePoops.length, 0);

  const events = simulation.advance(FIXED_STEP, idle);
  const poopEvent = events.find((event) => event.type === "goose-pooped");
  assert.ok(poopEvent && poopEvent.type === "goose-pooped");
  assert.equal(simulation.goosePoops.length, 1);
  assert.equal(simulation.goosePoops[0]?.id, poopEvent.poopId);
});

test("only the ten newest durable goose poops remain and reset clears them", () => {
  const simulation = new Simulation(openWorld);
  const ticksPerPoop = Math.round(GOOSE_POOP_IDLE_SECONDS / FIXED_STEP);
  for (let poop = 0; poop < MAX_GOOSE_POOPS + 2; poop++) {
    for (let tick = 0; tick < ticksPerPoop; tick++) simulation.advance(FIXED_STEP, idle);
  }
  assert.deepEqual(simulation.goosePoops.map((poop) => poop.id), [
    "goose-poop-2", "goose-poop-3", "goose-poop-4", "goose-poop-5", "goose-poop-6",
    "goose-poop-7", "goose-poop-8", "goose-poop-9", "goose-poop-10", "goose-poop-11",
  ]);
  const snapshot = simulation.goosePoops[0];
  if (snapshot) snapshot.position.x = 999;
  assert.notEqual(simulation.goosePoops[0]?.position.x, 999);
  simulation.reset();
  assert.deepEqual(simulation.goosePoops, []);
});

test("a second goose moves in the same fixed-step simulation and stops when its command source disconnects", () => {
  const simulation = new Simulation(openWorld);
  simulation.enableSecondPlayer({ x: 1, y: 0.02, z: 0 }, Math.PI);
  for (let tick = 0; tick < 60; tick += 1) {
    simulation.advancePlayers(FIXED_STEP, { ...idle, moveX: -1 }, { ...idle, moveX: 1 });
  }
  assert.ok(simulation.player.position.x < 0);
  assert.ok((simulation.secondaryPlayer?.position.x ?? 0) > 1);
  const standingAt = simulation.secondaryPlayer!.position;
  simulation.advancePlayers(FIXED_STEP, idle);
  assert.deepEqual(simulation.secondaryPlayer!.position, standingAt);
  assert.equal(simulation.secondaryPlayer!.speed, 0);
});

test("both geese honk with stable actor identity", () => {
  const simulation = new Simulation(openWorld);
  simulation.enableSecondPlayer({ x: 1, y: 0.02, z: 0 });
  const events = simulation.advancePlayers(FIXED_STEP,
    { ...idle, honkPressed: true }, { ...idle, honkPressed: true });
  assert.deepEqual(events.filter((event) => event.type === "goose-honked").map((event) => event.actorId), ["goose", "goose-2"]);
});

test("simultaneous grabs are deterministic and an item can have only one goose holder", () => {
  const rules: WorldRules = {
    ...openWorld,
    entities: [{ id: "test.apple", label: "apple", position: { x: 0.5, y: 0, z: 0 },
      carryable: { interactionRange: 2, carryHeight: 0.5, carryDistance: 0.4 } }],
  };
  const simulation = new Simulation(rules);
  simulation.enableSecondPlayer({ x: 1, y: 0.02, z: 0 });
  const events = simulation.advancePlayers(FIXED_STEP,
    { ...idle, interactPressed: true }, { ...idle, interactPressed: true });
  assert.equal(simulation.world.entities[0]?.holderId, "goose");
  assert.deepEqual(events.filter((event) => event.type === "entity-grabbed").map((event) => event.actorId), ["goose"]);

  const secondOnly = new Simulation(rules);
  secondOnly.enableSecondPlayer({ x: 1, y: 0.02, z: 0 });
  secondOnly.advancePlayers(FIXED_STEP, idle, { ...idle, interactPressed: true });
  assert.equal(secondOnly.world.entities[0]?.holderId, "goose-2");
  assert.equal(secondOnly.secondaryPlayer?.heldEntityId, "test.apple");
  const heldPosition = secondOnly.world.entities[0]!.position;
  secondOnly.advancePlayers(FIXED_STEP, idle);
  assert.equal(secondOnly.world.entities[0]?.holderId, "goose-2", "disconnect must not drop Goose 2's item");
  assert.deepEqual(secondOnly.world.entities[0]?.position, heldPosition);
});

test("ending a shared game drops what Goose 2 carries where it stands and removes it", () => {
  const simulation = new Simulation({
    ...openWorld,
    entities: [{ id: "test.apple", label: "apple", position: { x: 0.5, y: 0, z: 0 },
      carryable: { interactionRange: 2, carryHeight: 0.5, carryDistance: 0.4 } }],
  });
  simulation.enableSecondPlayer({ x: 1, y: 0.02, z: 0 });
  simulation.advancePlayers(FIXED_STEP, idle, { ...idle, interactPressed: true });
  assert.equal(simulation.world.entities[0]?.holderId, "goose-2");

  const events = simulation.disableSecondPlayer();
  assert.deepEqual(events.map((event) => event.type), ["entity-dropped"]);
  assert.equal(simulation.world.entities[0]?.holderId, undefined);
  assert.equal(simulation.secondaryPlayer, undefined);
  assert.deepEqual(simulation.disableSecondPlayer(), [], "ending twice is harmless");
  simulation.advancePlayers(FIXED_STEP, idle, { ...idle, moveX: 1 });
  assert.equal(simulation.players.length, 1, "a late command from the departed guest is ignored");
});
