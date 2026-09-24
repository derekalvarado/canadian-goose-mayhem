import assert from "node:assert/strict";
import test from "node:test";
import { FIXED_STEP, Simulation, type PlayerCommand, type WorldRules } from "../src/game/simulation/Simulation.ts";
import { getWorldAsset } from "../src/game/worldAssets.ts";

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

test("the litter picker can be grabbed from its expanded interaction radius", () => {
  const asset = getWorldAsset("prop.litter-picker");
  assert.ok(asset?.carryable);
  assert.ok(asset.carryable.interactionRange > 1.05);

  const withinRange = new Simulation({
    spawn: position(asset.carryable.interactionRange - 0.05),
    spawnHeading: 0,
    resolveMovement: openMovement,
    objectives: [],
    entities: [{ id: "picker", label: "Litter picker", position: position(0), carryable: asset.carryable }],
  });
  const grabbed = withinRange.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.ok(grabbed.some((event) => event.type === "entity-grabbed" && event.entityId === "picker"));

  const outsideRange = new Simulation({
    spawn: position(asset.carryable.interactionRange + 0.05),
    spawnHeading: 0,
    resolveMovement: openMovement,
    objectives: [],
    entities: [{ id: "picker", label: "Litter picker", position: position(0), carryable: asset.carryable }],
  });
  assert.deepEqual(outsideRange.advance(FIXED_STEP, { ...idle, interactPressed: true }), []);
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

function splashKidRules(): WorldRules {
  return {
    spawn: position(0), spawnHeading: 0, resolveMovement: openMovement, objectives: [],
    entities: [
      { id: "pad", label: "Splash pad", position: position(2), active: true },
      { id: "faucet", label: "Faucet", position: position(0), controller: { targetId: "pad", interactionPoint: position(0), interactionRange: 1 } },
    ],
    splashKids: [{
      id: "kid", position: position(2), heading: 0, observedTargetId: "pad",
      playRoute: [position(2), position(3)], retreatPositions: [position(7), position(-7)],
      playSpeed: 1, fleeSpeed: 3, threatRadius: 5, disappointedSeconds: 1, crySeconds: 1,
    }],
  };
}

test("turning off the splash pad makes kids protest, walk away, and return when it resumes", () => {
  const simulation = new Simulation(splashKidRules());
  simulation.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.equal(simulation.world.splashKids[0].activity, "disappointed");
  for (let tick = 0; tick < 70; tick += 1) simulation.advance(FIXED_STEP, idle);
  assert.equal(simulation.world.splashKids[0].activity, "walking-away");
  for (let tick = 0; tick < 400 && simulation.world.splashKids[0].activity !== "away"; tick += 1) simulation.advance(FIXED_STEP, idle);
  assert.equal(simulation.world.splashKids[0].activity, "away");
  simulation.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.equal(simulation.world.splashKids[0].activity, "returning");
  for (let tick = 0; tick < 500 && simulation.world.splashKids[0].activity !== "playing"; tick += 1) simulation.advance(FIXED_STEP, idle);
  assert.equal(simulation.world.splashKids[0].activity, "playing");
});

test("a nearby threatening goose makes kids run away and cry before returning", () => {
  for (const pose of [{ threatening: true }, { wingsSpread: true }]) {
    const simulation = new Simulation(splashKidRules());
    const events = simulation.advance(FIXED_STEP, { ...idle, ...pose });
    assert.ok(events.some((event) => event.type === "splash-kid-frightened" && event.actorId === "kid"));
    assert.equal(simulation.world.splashKids[0].activity, "frightened");
    for (let tick = 0; tick < 240 && simulation.world.splashKids[0].activity !== "crying"; tick += 1) simulation.advance(FIXED_STEP, idle);
    assert.equal(simulation.world.splashKids[0].activity, "crying");
    for (let tick = 0; tick < 600 && simulation.world.splashKids[0].activity !== "playing"; tick += 1) simulation.advance(FIXED_STEP, idle);
    assert.equal(simulation.world.splashKids[0].activity, "playing");
  }
});

test("the sneak pose does not frighten nearby kids", () => {
  const simulation = new Simulation(splashKidRules());
  const events = simulation.advance(FIXED_STEP, { ...idle, sneaking: true });
  assert.equal(simulation.player.sneaking, true);
  assert.equal(simulation.player.threatening, false);
  assert.equal(simulation.world.splashKids[0].activity, "playing");
  assert.equal(events.some((event) => event.type === "splash-kid-frightened"), false);
});

test("frightened kids scatter to different spots on the far side from the goose", () => {
  // Pad centred at x = 3 with the goose at its west edge; kids spread across the pad.
  const around = [[5.8,4.7], [5.8,-4.7], [-5.8,4.7], [-5.8,-4.7], [6.4,0], [0,6.2], [0,-6.2]].map(([x, z]) => position(3 + x, z));
  const kid = (id: string, x: number, z: number) => ({
    id, position: position(x, z), heading: 0, observedTargetId: "pad",
    playRoute: [position(x, z)], retreatPositions: around,
    playSpeed: 1, fleeSpeed: 3, threatRadius: 5, disappointedSeconds: 1, crySeconds: 1,
  });
  const simulation = new Simulation({
    spawn: position(0), spawnHeading: 0, resolveMovement: openMovement, objectives: [],
    entities: [{ id: "pad", label: "Splash pad", position: position(3), active: true }],
    splashKids: [kid("north", 2.2, 1.4), kid("middle", 2.6, 0.1), kid("south", 2.1, -1.3)],
  });
  simulation.advance(FIXED_STEP, { ...idle, threatening: true });
  assert.deepEqual(simulation.world.splashKids.map((child) => child.activity), ["frightened", "frightened", "frightened"]);
  for (let tick = 0; tick < 240; tick += 1) simulation.advance(FIXED_STEP, idle);
  const spots = simulation.world.splashKids.map((child) => child.position);
  for (let a = 0; a < spots.length; a += 1) {
    assert.ok(spots[a].x > 3, `kid ${a} ran toward the goose's side`);
    for (let b = a + 1; b < spots.length; b += 1) {
      assert.ok(Math.hypot(spots[a].x - spots[b].x, spots[a].z - spots[b].z) > 3, `kids ${a} and ${b} fled to the same spot`);
    }
  }
});

test("playing kids stop to splash at each route point, and a scare still interrupts them", () => {
  const rules = splashKidRules();
  const simulation = new Simulation({ ...rules, splashKids: [{ ...rules.splashKids![0], splashSeconds: 1 }] });
  for (let tick = 0; tick < 120 && simulation.world.splashKids[0].activity !== "splashing"; tick += 1) simulation.advance(FIXED_STEP, idle);
  const stop = simulation.world.splashKids[0];
  assert.equal(stop.activity, "splashing");
  assert.deepEqual(stop.position, position(3));
  for (let tick = 0; tick < 30; tick += 1) simulation.advance(FIXED_STEP, idle);
  assert.equal(simulation.world.splashKids[0].activity, "splashing");
  assert.deepEqual(simulation.world.splashKids[0].position, position(3), "kids stay put while splashing");
  for (let tick = 0; tick < 40; tick += 1) simulation.advance(FIXED_STEP, idle);
  assert.equal(simulation.world.splashKids[0].activity, "playing");

  const scared = new Simulation({ ...rules, splashKids: [{ ...rules.splashKids![0], splashSeconds: 5 }] });
  for (let tick = 0; tick < 120 && scared.world.splashKids[0].activity !== "splashing"; tick += 1) scared.advance(FIXED_STEP, idle);
  scared.advance(FIXED_STEP, { ...idle, threatening: true });
  assert.equal(scared.world.splashKids[0].activity, "frightened");
});
