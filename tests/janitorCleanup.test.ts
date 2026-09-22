import assert from "node:assert/strict";
import test from "node:test";
import { FIXED_STEP, Simulation, type GameplayEvent, type PlayerCommand, type WorldRules } from "../src/game/simulation/Simulation.ts";

const idle: PlayerCommand = { moveX: 0, moveZ: 0, hurry: false, honkPressed: false };
const position = (x: number, z = 0) => ({ x, y: 0, z });
const openMovement: WorldRules["resolveMovement"] = (_current, proposed, output) => { Object.assign(output, proposed); };
const carryable = (interactionRange = 1) => ({ interactionRange, carryHeight: 0.5, carryDistance: 0.42 });

function cleanupRules(options: {
  spawn?: number; shooRadius?: number; shooReach?: number; jogSpeed?: number; toolSearchSeconds?: number;
  padActive?: boolean; litterRange?: number;
} = {}): WorldRules {
  return {
    spawn: position(options.spawn ?? 30), spawnHeading: 0, resolveMovement: openMovement, objectives: [],
    entities: [
      { id: "pad", label: "Splash pad", position: position(10), active: options.padActive ?? true },
      { id: "faucet", label: "Faucet", position: position(50),
        controller: { targetId: "pad", interactionPoint: position(50), interactionRange: 0.35 } },
      // Deliberately reverse the authored positions: route order comes from stable IDs.
      { id: "trash-b", label: "Bin B", position: position(2), cleanup: { role: "trash-can" } },
      { id: "trash-a", label: "Bin A", position: position(1), cleanup: { role: "trash-can" } },
      { id: "bag", label: "Trash bag", position: position(0), cleanup: { role: "trash-bag" },
        carryable: { ...carryable(), stealableWhileHeld: true } },
      { id: "picker", label: "Litter picker", position: position(0), cleanup: { role: "litter-picker" },
        carryable: { ...carryable(), stealableWhileHeld: true } },
      { id: "litter-b", label: "Tray", position: position(4), cleanup: { role: "litter" }, carryable: carryable(options.litterRange ?? 1) },
      { id: "litter-a", label: "Paper", position: position(3), cleanup: { role: "litter" }, carryable: carryable(options.litterRange ?? 1) },
    ],
    janitor: {
      id: "janitor", position: position(0), heading: 0, guardPosition: position(0), investigationPosition: position(10),
      observedTargetId: "pad", walkSpeed: 12, guardRadius: 1, noticeRadius: 100,
      inspectSeconds: 0.08, scratchSeconds: 0.08, shooSeconds: 0.05,
      cleanup: {
        emptySeconds: 0.05, pickupSeconds: 0.08, reactionSeconds: 0.05,
        toolSearchSeconds: options.toolSearchSeconds ?? 0.4,
        shooRadius: options.shooRadius ?? 0.1, shooReach: options.shooReach ?? 0.8,
        jogSpeed: options.jogSpeed ?? 12, fumbleRadius: 1.5,
      },
    },
  };
}

function runUntil(simulation: Simulation, predicate: () => boolean, maxTicks = 3000, command = idle): GameplayEvent[] {
  const events: GameplayEvent[] = [];
  for (let tick = 0; tick < maxTicks && !predicate(); tick += 1) events.push(...simulation.advance(FIXED_STEP, command));
  assert.equal(predicate(), true, `condition not reached; janitor=${JSON.stringify(simulation.world.janitor)}`);
  return events;
}

test("janitor services every trash can and litter item once in stable ID order before repeating", () => {
  const simulation = new Simulation(cleanupRules());
  const events = runUntil(simulation,
    () => simulation.world.entities.find((entity) => entity.id === "litter-b")?.serviceCount === 1);
  assert.deepEqual(events.filter((event) => event.type === "trash-can-emptied").map((event) => event.entityId), ["trash-a", "trash-b"]);
  assert.deepEqual(events.filter((event) => event.type === "litter-picked-up").map((event) => event.entityId), ["litter-a", "litter-b"]);
  assert.equal(simulation.world.entities.filter((entity) => entity.id === "litter-a").length, 1);
  assert.equal(simulation.world.entities.find((entity) => entity.id === "litter-a")?.containedBy, "bag");
  runUntil(simulation, () => (simulation.world.entities.find((entity) => entity.id === "trash-a")?.serviceCount ?? 0) === 2);
});

test("trash bag theft reacts, forces a recoverable release, and resumes the same bin without duplication", () => {
  const simulation = new Simulation(cleanupRules({ spawn: 1.4, litterRange: 0.2 }));
  runUntil(simulation, () => simulation.world.janitor?.activity === "emptying-trash");
  const target = simulation.world.janitor?.targetEntityId;
  const stolen = simulation.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.ok(stolen.some((event) => event.type === "entity-grabbed" && event.entityId === "bag"));
  assert.equal(simulation.world.janitor?.activity, "reacting");
  const recovery = runUntil(simulation, () => simulation.world.entities.find((entity) => entity.id === target)?.serviceCount === 1);
  assert.ok(recovery.some((event) => event.type === "goose-shooed"));
  assert.equal(simulation.world.entities.filter((entity) => entity.id === "bag").length, 1);
  assert.equal(simulation.player.heldEntityId, undefined);
});

test("a stolen picker is boundedly recovered to its safe home and the litter target resumes", () => {
  const simulation = new Simulation(cleanupRules({ spawn: -0.5, litterRange: 0.2, jogSpeed: 0, shooReach: 0.05, toolSearchSeconds: 0.1 }));
  runUntil(simulation, () => simulation.world.janitor?.cleanupPhase === "litter"
    && simulation.world.janitor?.activity === "walking-to-litter");
  const target = simulation.world.janitor?.targetEntityId;
  const stolen = simulation.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.ok(stolen.some((event) => event.type === "entity-grabbed" && event.entityId === "picker"));
  const recovery = runUntil(simulation, () => simulation.world.entities.find((entity) => entity.id === "picker")?.holderId === "janitor");
  assert.ok(recovery.some((event) => event.type === "entity-recovered" && event.entityId === "picker"));
  assert.equal(simulation.world.janitor?.targetEntityId, target);
  runUntil(simulation, () => simulation.world.entities.find((entity) => entity.id === target)?.serviceCount === 1);
  assert.equal(simulation.world.entities.filter((entity) => entity.id === "picker").length, 1);
});

test("nearby honk, wings, and threat poses fumble pickup before retrying the same item", () => {
  for (const interruption of [{ honkPressed: true }, { wingsSpread: true }, { aggressive: true }]) {
    const simulation = new Simulation(cleanupRules({ spawn: 3, shooRadius: 0.1 }));
    runUntil(simulation, () => simulation.world.janitor?.activity === "picking-litter");
    const target = simulation.world.janitor?.targetEntityId;
    const events = simulation.advance(FIXED_STEP, { ...idle, ...interruption });
    assert.ok(events.some((event) => event.type === "janitor-fumbled" && event.entityId === target));
    assert.equal(simulation.world.entities.find((entity) => entity.id === target)?.containedBy, undefined);
    runUntil(simulation, () => simulation.world.entities.find((entity) => entity.id === target)?.containedBy === "bag");
    assert.equal(simulation.world.entities.filter((entity) => entity.id === target).length, 1);
  }
});

test("cleaned litter can be pulled from the bag, dropped, and collected again in a later pass", () => {
  const simulation = new Simulation(cleanupRules({ spawn: 0.4 }));
  runUntil(simulation, () => simulation.world.entities.find((entity) => entity.id === "litter-a")?.containedBy === "bag");
  // Finish the current pass so the bag is back at its authored safe location.
  runUntil(simulation, () => simulation.world.janitor?.cleanupPhase === "trash");
  const grabbed = simulation.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.ok(grabbed.some((event) => event.type === "entity-grabbed" && event.entityId === "litter-a"));
  assert.equal(simulation.player.heldEntityId, "litter-a");
  simulation.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.equal(simulation.world.entities.find((entity) => entity.id === "litter-a")?.containedBy, undefined);
  runUntil(simulation, () => (simulation.world.entities.find((entity) => entity.id === "litter-a")?.serviceCount ?? 0) === 2, 5000);
  assert.equal(simulation.world.entities.filter((entity) => entity.id === "litter-a").length, 1);
});

test("turning off the splash pad interrupts cleanup and returns to the exact target", () => {
  const simulation = new Simulation(cleanupRules({ spawn: 50 }));
  const toggled = simulation.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.ok(toggled.some((event) => event.type === "device-state-changed" && event.targetId === "pad" && !event.active));
  runUntil(simulation, () => simulation.world.janitor?.activity === "walking-to-pad");
  const interruptedTarget = simulation.world.janitor?.targetEntityId;
  const events = runUntil(simulation, () => simulation.world.entities.find((entity) => entity.id === interruptedTarget)?.serviceCount === 1);
  assert.ok(events.some((event) => event.type === "device-state-changed" && event.targetId === "pad" && event.active));
  assert.equal(interruptedTarget, "trash-a");
  assert.equal(simulation.world.entities.find((entity) => entity.id === "trash-b")?.serviceCount, 0);
});

test("direct shoo drops only the goose's held item and resumes the interrupted cleanup target", () => {
  const rules = cleanupRules({ spawn: 3, shooRadius: 1, litterRange: 0.3 });
  const threatened = new Simulation(rules);
  threatened.advance(FIXED_STEP, { ...idle, interactPressed: true });
  assert.equal(threatened.player.heldEntityId, "litter-a");
  runUntil(threatened, () => threatened.world.janitor?.activity === "chasing-goose");
  const interruptedTarget = threatened.world.janitor?.targetEntityId;
  const events = runUntil(threatened, () => threatened.player.spooked);
  assert.ok(events.some((event) => event.type === "entity-dropped" && event.entityId === "litter-a"));
  assert.ok(events.some((event) => event.type === "goose-shooed"));
  assert.equal(threatened.player.heldEntityId, undefined);
  runUntil(threatened, () => threatened.world.entities.find((entity) => entity.id === interruptedTarget)?.serviceCount === 1);
  assert.equal(threatened.world.entities.filter((entity) => entity.id === "litter-a").length, 1);
});
