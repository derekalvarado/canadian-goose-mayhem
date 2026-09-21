import assert from "node:assert/strict";
import test from "node:test";
import { FIXED_STEP, Simulation, type PlayerCommand, type WorldRules } from "../src/game/simulation/Simulation.ts";

const idle: PlayerCommand = { moveX: 0, moveZ: 0, hurry: false, honkPressed: false };
const openMovement: WorldRules["resolveMovement"] = (_current, proposed, output) => { Object.assign(output, proposed); };
const position = (x: number, z = 0) => ({ x, y: 0, z });

function controlRules(): WorldRules {
  return {
    spawn: position(0), spawnHeading: 0, resolveMovement: openMovement, objectives: [],
    entities: [
      { id: "pad", label: "Splash pad", position: position(4), active: true },
      { id: "faucet-a", label: "Faucet A", position: position(0.5), controller: { targetId: "pad", interactionPoint: position(0.5), interactionRange: 1 } },
      { id: "faucet-b", label: "Faucet B", position: position(8), controller: { targetId: "pad", interactionPoint: position(8), interactionRange: 1 } },
    ],
  };
}

test("interaction edges resolve once at the authored handle and many controllers may share one target", () => {
  const simulation = new Simulation(controlRules());
  assert.equal(simulation.interactionHint, "Turn off Faucet A");
  assert.deepEqual(simulation.advance(FIXED_STEP / 2, { ...idle, interactPressed: true }), []);
  const events = simulation.advance(FIXED_STEP, idle);
  assert.equal(events.filter((event) => event.type === "device-state-changed").length, 1);
  assert.equal(simulation.world.entities.find((entity) => entity.id === "pad")?.active, false);
  assert.equal(simulation.interactionHint, "Turn on Faucet A");
  assert.deepEqual(simulation.advance(FIXED_STEP, idle), []);

  const second = new Simulation({ ...controlRules(), spawn: position(8) });
  second.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.equal(second.world.entities.find((entity) => entity.id === "pad")?.active, false);
});

test("invalid out-of-range interactions have no state change or success event", () => {
  const simulation = new Simulation({ ...controlRules(), spawn: position(-4) });
  assert.equal(simulation.interactionHint, undefined);
  assert.deepEqual(simulation.advance(FIXED_STEP, { ...idle, interactPressed: true }), []);
  assert.equal(simulation.world.entities.find((entity) => entity.id === "pad")?.active, true);
});

test("a carryable beer can has one durable identity and follows grab then drop ownership", () => {
  const simulation = new Simulation({
    spawn: position(0), spawnHeading: 0, resolveMovement: openMovement, objectives: [],
    entities: [{ id: "can", label: "Little beer can", position: position(0.4), carryable: { interactionRange: 1, carryHeight: 0.72, carryDistance: 0.54 } }],
  });
  const grabbed = simulation.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.equal(grabbed.filter((event) => event.type === "entity-grabbed").length, 1);
  assert.equal(simulation.player.heldEntityId, "can");
  for (let tick = 0; tick < 45; tick += 1) simulation.advance(FIXED_STEP, { ...idle, moveX: 1 });
  const carried = simulation.world.entities.find((entity) => entity.id === "can")!;
  assert.equal(carried.holderId, "goose");
  assert.ok(carried.position.x > 1);
  const dropped = simulation.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.equal(dropped.filter((event) => event.type === "entity-dropped").length, 1);
  assert.equal(simulation.player.heldEntityId, undefined);
  assert.equal(simulation.world.entities.filter((entity) => entity.id === "can").length, 1);
});

function janitorRules(spawn = position(0)): WorldRules {
  return {
    spawn, spawnHeading: 0, resolveMovement: openMovement,
    entities: [
      { id: "pad", label: "Splash pad", position: position(3), active: true },
      { id: "faucet", label: "Faucet", position: position(0), controller: { targetId: "pad", interactionPoint: position(0), interactionRange: 1 } },
      { id: "can", label: "Can", position: position(0.3), carryable: { interactionRange: 1, carryHeight: 0.7, carryDistance: 0.5 } },
    ],
    janitor: { id: "janitor", position: position(7), heading: 0, guardPosition: position(7), investigationPosition: position(3),
      observedTargetId: "pad", walkSpeed: 2, guardRadius: 1.5, noticeRadius: 10,
      inspectSeconds: 3, scratchSeconds: 3, shooSeconds: 0.8 },
    objectiveZones: [{ id: "shop", position: position(7), radius: 0.7, factId: "entered", guardedBy: "janitor" }],
    objectives: [{ id: "enter-shop", description: "Enter shop", isSatisfied: (world) => world.durableFacts.includes("entered") }],
  };
}

test("janitor investigates an inactive pad for three seconds, restores it, and returns", () => {
  const simulation = new Simulation(janitorRules());
  simulation.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.equal(simulation.world.janitor?.activity, "walking-to-pad");
  for (let tick = 0; tick < 400 && simulation.world.janitor?.activity !== "returning"; tick += 1) simulation.advance(FIXED_STEP, idle);
  assert.equal(simulation.world.entities.find((entity) => entity.id === "pad")?.active, true);
  assert.equal(simulation.world.janitor?.activity, "returning");
  for (let tick = 0; tick < 300 && simulation.world.janitor?.activity !== "guarding"; tick += 1) simulation.advance(FIXED_STEP, idle);
  assert.equal(simulation.world.janitor?.activity, "guarding");
});

test("restoring the pad early makes the janitor scratch for three seconds before returning", () => {
  const simulation = new Simulation(janitorRules());
  simulation.advance(FIXED_STEP, { ...idle, interactPressed: true });
  simulation.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.equal(simulation.world.janitor?.activity, "scratching");
  for (let tick = 0; tick < 179; tick += 1) simulation.advance(FIXED_STEP, idle);
  assert.equal(simulation.world.janitor?.activity, "scratching");
  simulation.advance(FIXED_STEP, idle);
  assert.equal(simulation.world.janitor?.activity, "returning");
});

test("guarding shoos and releases the goose, while a distraction permits durable shop completion", () => {
  const guardedRules = janitorRules(position(7.4));
  const guarded = new Simulation({ ...guardedRules, entities: guardedRules.entities?.map((entity) => (
    entity.id === "can" ? { ...entity, position: position(7.4) } : entity
  )) });
  const shooEvents = guarded.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.ok(shooEvents.some((event) => event.type === "entity-grabbed"));
  assert.ok(shooEvents.some((event) => event.type === "entity-dropped"));
  assert.ok(shooEvents.some((event) => event.type === "goose-shooed"));
  assert.equal(guarded.player.spooked, true);
  assert.equal(guarded.player.heldEntityId, undefined);
  assert.equal(guarded.isObjectiveComplete("enter-shop"), false);

  const distracted = new Simulation({ ...janitorRules(position(7)), entities: [
    { id: "pad", label: "Splash pad", position: position(3), active: false },
  ] });
  const completion = distracted.advance(FIXED_STEP, idle);
  assert.equal(distracted.world.janitor?.activity, "walking-to-pad");
  assert.ok(completion.some((event) => event.type === "objective-completed" && event.objectiveId === "enter-shop"));
  assert.equal(distracted.isObjectiveComplete("enter-shop"), true);
  for (let tick = 0; tick < 500; tick += 1) distracted.advance(FIXED_STEP, idle);
  assert.equal(distracted.isObjectiveComplete("enter-shop"), true);
});
