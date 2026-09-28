import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_WORLD_LAYOUT, CENTRAL_PLAZA_AREA_ID, COFFEE_SHOP_AREA_ID, getWorldArea } from "../src/game/worldLayout.ts";
import { createWorldRules } from "../src/game/worldLevel.ts";
import { KITCHEN_DOORWAY } from "../src/game/CafeRoomView.ts";
import { CAFE_TASK_IDS, ENTER_SHOP_OBJECTIVE_ID } from "../src/game/challenges.ts";
import { SPILLED_DRINK_FACT_ID, type CafePersonState } from "../src/game/simulation/cafeCrew.ts";
import { FIXED_STEP, Simulation, type GameplayEvent, type PlayerCommand, type SimulationSessionState, type WorldEntityState } from "../src/game/simulation/Simulation.ts";

const idle: PlayerCommand = { moveX: 0, moveZ: 0, hurry: false, honkPressed: false };
const cafeArea = () => getWorldArea(CANONICAL_WORLD_LAYOUT, COFFEE_SHOP_AREA_ID);
const plazaArea = () => getWorldArea(CANONICAL_WORLD_LAYOUT, CENTRAL_PLAZA_AREA_ID);
const cafeRules = () => createWorldRules(cafeArea(), CANONICAL_WORLD_LAYOUT.transitions);
const plazaRules = () => createWorldRules(plazaArea(), CANONICAL_WORLD_LAYOUT.transitions);

function cafe(session?: SimulationSessionState): Simulation { return new Simulation(cafeRules(), session); }
function entity(simulation: Simulation, id: string): WorldEntityState {
  const found = simulation.world.entities.find((candidate) => candidate.id === id);
  assert.ok(found, `missing entity ${id}`);
  return found;
}
function tagged(simulation: Simulation, tag: WorldEntityState["tags"][number]): WorldEntityState[] {
  return simulation.world.entities.filter((candidate) => candidate.tags.includes(tag));
}
function person(simulation: Simulation, id: string): CafePersonState {
  const found = simulation.world.cafePeople.find((candidate) => candidate.id === id);
  assert.ok(found, `missing person ${id}`);
  return found;
}
function run(simulation: Simulation, seconds: number, command: PlayerCommand = idle): GameplayEvent[] {
  const events: GameplayEvent[] = [];
  for (let tick = 0; tick < Math.round(seconds / FIXED_STEP); tick += 1) events.push(...simulation.advance(FIXED_STEP, command));
  return events;
}
function runUntilEvent(simulation: Simulation, type: GameplayEvent["type"], maxSeconds: number): GameplayEvent[] {
  const events: GameplayEvent[] = [];
  for (let tick = 0; tick < maxSeconds / FIXED_STEP && !events.some((event) => event.type === type); tick += 1) events.push(...simulation.advance(FIXED_STEP, idle));
  assert.ok(events.some((event) => event.type === type), `no ${type} within ${maxSeconds}s; barista=${JSON.stringify(simulation.world.cafePeople[0])} goose=${JSON.stringify(simulation.player.position)}`);
  return events;
}
function runUntil(simulation: Simulation, predicate: () => boolean, maxSeconds = 120, command: PlayerCommand = idle): GameplayEvent[] {
  const events: GameplayEvent[] = [];
  for (let tick = 0; tick < maxSeconds / FIXED_STEP && !predicate(); tick += 1) events.push(...simulation.advance(FIXED_STEP, command));
  assert.equal(predicate(), true, `condition not reached; people=${JSON.stringify(simulation.world.cafePeople.map((p) => [p.id, p.activity]))}`);
  return events;
}
/** Puts the goose `distance` metres from a point, on the side facing `toward`, looking at the point. */
function standBy(simulation: Simulation, point: { x: number; z: number }, toward: { x: number; z: number }, distance = 0.7): void {
  const dx = toward.x - point.x; const dz = toward.z - point.z; const length = Math.hypot(dx, dz) || 1;
  const x = point.x + dx / length * distance; const z = point.z + dz / length * distance;
  simulation.setPlayerTransform({ x, y: 0, z }, Math.atan2(-(point.x - x), -(point.z - z)));
}
const interact = (simulation: Simulation) => simulation.advance(FIXED_STEP, { ...idle, interactPressed: true });
const honk = (simulation: Simulation) => simulation.advance(FIXED_STEP, { ...idle, honkPressed: true });
const completed = (events: readonly GameplayEvent[], id: string) => events.some((event) => event.type === "objective-completed" && event.objectiveId === id);
const barista = (simulation: Simulation) => simulation.world.cafePeople.find((candidate) => candidate.role === "barista")!;
const roomCenter = { x: 3.75, z: -1.35 };
/** The customer side of the counter, from the counter's own orientation. */
function customerSide(point: { x: number; z: number }): { x: number; z: number } {
  const counter = cafeArea().instances.find((instance) => instance.assetId === "coffee.counter")!;
  return { x: point.x + Math.sin(counter.transform.rotationY) * 3, z: point.z + Math.cos(counter.transform.rotationY) * 3 };
}

test("every area shows the same to-do list, and the coffee shop adds its six tasks", () => {
  const plaza = plazaRules().objectives.map(({ id }) => id);
  assert.deepEqual(cafeRules().objectives.map(({ id }) => id), plaza);
  assert.ok(plaza.includes(ENTER_SHOP_OBJECTIVE_ID));
  for (const id of Object.values(CAFE_TASK_IDS)) assert.ok(plaza.includes(id), id);
});

test("turning the radio off completes the music task and lures the barista across the room to switch it back on", () => {
  const simulation = cafe();
  const radio = tagged(simulation, "music")[0];
  standBy(simulation, radio.position, roomCenter, 0.75);
  const events = interact(simulation);
  assert.equal(entity(simulation, radio.id).active, false);
  assert.ok(completed(events, CAFE_TASK_IDS.musicOff));
  const baristaStart = barista(simulation).position;
  simulation.setPlayerTransform({ x: 0, y: 0, z: 4 }, 0);
  const later = runUntil(simulation, () => entity(simulation, radio.id).active === true, 60);
  assert.ok(later.some((event) => event.type === "device-state-changed" && event.actorId === barista(simulation).id && event.active));
  assert.ok(Math.hypot(barista(simulation).position.x - baristaStart.x, barista(simulation).position.z - baristaStart.z) > 8, "she walked over to it");
  assert.equal(simulation.isObjectiveComplete(CAFE_TASK_IDS.musicOff), true, "a crossed-off task stays crossed off");
});

test("ringing the bell brings the barista to the register, and she quiets it herself", () => {
  const simulation = cafe();
  const bell = tagged(simulation, "bell")[0];
  standBy(simulation, bell.position, customerSide(bell.position), 0.7);
  assert.match(simulation.interactionHint ?? "", /^Ring /);
  interact(simulation);
  assert.equal(entity(simulation, bell.id).active, true);
  interact(simulation);
  assert.equal(entity(simulation, bell.id).active, true, "ringing again does not switch it off");
  simulation.setPlayerTransform({ x: 0, y: 0, z: 4 }, 0);
  runUntil(simulation, () => barista(simulation).activity === "greeting", 30);
  runUntil(simulation, () => entity(simulation, bell.id).active === false, 10);
});

test("a honk while the student sips spills her coffee, but not while she is only reading", () => {
  const reading = cafe();
  const student = "coffee.customer-student";
  runUntil(reading, () => person(reading, student).activity === "working");
  standBy(reading, person(reading, student).position, roomCenter, 1.6);
  honk(reading);
  assert.equal(reading.world.durableFacts.includes(SPILLED_DRINK_FACT_ID), false);
  assert.equal(person(reading, student).activity, "startled");

  const sipping = cafe();
  runUntil(sipping, () => person(sipping, student).activity === "sipping", 30);
  standBy(sipping, person(sipping, student).position, roomCenter, 1.6);
  assert.ok(completed(honk(sipping), CAFE_TASK_IDS.spillCoffee));
  assert.ok(tagged(sipping, "drink").some((drink) => drink.condition === "spilled"));
});

test("frightening the student brings the barista running to herd the goose out the front door", () => {
  const simulation = cafe();
  const student = person(simulation, "coffee.customer-student");
  standBy(simulation, student.position, roomCenter, 1.6);
  honk(simulation);
  const herding = runUntilEvent(simulation, "area-transition-requested", 60);
  assert.ok(herding.filter((event) => event.type === "goose-shooed" && event.actorId === barista(simulation).id).length >= 2,
    "she shoves the goose along more than once");
  const exit = herding.find((event) => event.type === "area-transition-requested");
  assert.ok(exit && exit.type === "area-transition-requested" && exit.toAreaId === CENTRAL_PLAZA_AREA_ID);
});

test("the laptop worker is not scared: he waves the goose off himself and never spills", () => {
  const simulation = cafe();
  const laptop = "coffee.customer-laptop";
  runUntil(simulation, () => person(simulation, laptop).activity === "sipping", 90);
  standBy(simulation, person(simulation, laptop).position, roomCenter, 1.4);
  const events = honk(simulation);
  assert.equal(person(simulation, laptop).activity, "shooing");
  assert.ok(events.some((event) => event.type === "goose-shooed" && event.actorId === laptop));
  assert.equal(simulation.world.durableFacts.includes(SPILLED_DRINK_FACT_ID), false);
  run(simulation, 1);
  assert.notEqual(barista(simulation).activity, "chasing", "nobody needs rescuing");
});

test("the barista fumbles an order she is carrying when the goose honks at her", () => {
  const simulation = cafe();
  runUntil(simulation, () => barista(simulation).activity === "serving" && barista(simulation).moving, 60);
  const carrier = barista(simulation);
  simulation.setPlayerTransform({ x: carrier.position.x + 1.5, y: 0, z: carrier.position.z }, Math.PI / 2);
  assert.ok(completed(honk(simulation), CAFE_TASK_IDS.spillCoffee));
  assert.ok(tagged(simulation, "order-cup").some((cup) => cup.condition === "spilled"));
});

test("a croissant can be stolen from the reader's plate while she reads, or from the counter", () => {
  const plate = cafe();
  const reader = person(plate, "coffee.customer-reader");
  const croissant = tagged(plate, "pastry").find((item) => !item.tags.includes("house"))!;
  runUntil(plate, () => person(plate, reader.id).activity === "working");
  standBy(plate, croissant.position, { x: croissant.position.x + 1, z: croissant.position.z + 0.2 }, 0.8);
  assert.ok(completed(interact(plate), CAFE_TASK_IDS.stealCroissant));

  const counter = cafe();
  const pastry = tagged(counter, "pastry").find((item) => item.tags.includes("house"))!;
  standBy(counter, pastry.position, customerSide(pastry.position), 0.6);
  assert.ok(completed(interact(counter), CAFE_TASK_IDS.stealCroissant));
});

test("the reader shoos a goose at her table when she looks up; it drops the croissant but keeps the task", () => {
  const simulation = cafe();
  const reader = person(simulation, "coffee.customer-reader");
  const croissant = tagged(simulation, "pastry").find((item) => !item.tags.includes("house"))!;
  runUntil(simulation, () => person(simulation, reader.id).activity === "working");
  standBy(simulation, croissant.position, { x: croissant.position.x + 1, z: croissant.position.z + 0.2 }, 0.8);
  interact(simulation);
  const events = runUntil(simulation, () => simulation.player.heldEntityId === undefined, 20);
  assert.ok(events.some((event) => event.type === "goose-shooed" && event.actorId === reader.id));
  assert.equal(simulation.isObjectiveComplete(CAFE_TASK_IDS.stealCroissant), true);
});

test("an order can be stolen off the pickup counter or snatched from a customer's hands", () => {
  const counter = cafe();
  const laptop = "coffee.customer-laptop";
  runUntil(counter, () => tagged(counter, "order-cup").some((cup) => cup.condition === "full" && cup.restingKind === "counter"), 60);
  const waiting = tagged(counter, "order-cup").find((cup) => cup.condition === "full")!;
  standBy(counter, waiting.position, customerSide(waiting.position), 0.6);
  assert.ok(completed(interact(counter), CAFE_TASK_IDS.stealOrder));

  const hands = cafe();
  runUntil(hands, () => person(hands, laptop).heldEntityId !== undefined, 90);
  const carrier = person(hands, laptop);
  standBy(hands, carrier.position, { x: carrier.position.x + 1, z: carrier.position.z }, 0.5);
  assert.match(hands.interactionHint ?? "", /^Steal /);
  assert.ok(completed(interact(hands), CAFE_TASK_IDS.stealOrder));
});

test("the barista chases down a stolen tip jar, shoos the goose, and puts the same jar back", () => {
  const simulation = cafe();
  const jar = tagged(simulation, "tip-jar")[0];
  standBy(simulation, jar.position, customerSide(jar.position), 0.6);
  interact(simulation);
  assert.equal(simulation.player.heldEntityId, jar.id);
  const events = runUntil(simulation, () => simulation.player.heldEntityId === undefined, 20, { ...idle, moveX: 1, hurry: true });
  assert.ok(events.some((event) => event.type === "goose-shooed" && event.actorId === barista(simulation).id));
  runUntil(simulation, () => {
    const current = entity(simulation, jar.id);
    return !current.holderId && Math.hypot(current.position.x - jar.position.x, current.position.z - jar.position.z) < 0.01;
  }, 40);
  assert.equal(tagged(simulation, "tip-jar").length, 1);
});

test("the tip jar is too heavy to hurry with", () => {
  const simulation = cafe();
  const jar = tagged(simulation, "tip-jar")[0];
  standBy(simulation, jar.position, customerSide(jar.position), 0.6);
  interact(simulation);
  run(simulation, 0.5, { ...idle, moveX: 1, hurry: true });
  assert.ok(simulation.player.speed < 3.3);
});

test("carrying the tip jar out the door completes the task in the square, without leaving a copy behind", () => {
  const inside = cafe();
  const jar = tagged(inside, "tip-jar")[0];
  // Lure the barista away first, then walk out with the jar.
  const radio = tagged(inside, "music")[0];
  standBy(inside, radio.position, roomCenter, 0.75);
  interact(inside);
  runUntil(inside, () => barista(inside).activity === "fixing-radio", 40);
  standBy(inside, jar.position, customerSide(jar.position), 0.6);
  interact(inside);
  assert.equal(inside.player.heldEntityId, jar.id);
  const exit = cafeRules().transitions!.find((transition) => transition.toAreaId === CENTRAL_PLAZA_AREA_ID)!;
  inside.setPlayerTransform({ x: exit.triggerPosition.x, y: 0, z: exit.triggerPosition.z - 1.2 }, Math.PI);
  const leaving = runUntil(inside, () => inside.world.player.position.z > exit.triggerPosition.z - 0.7, 5, { ...idle, moveZ: 1 });
  const transition = [...leaving, ...run(inside, 0.2, { ...idle, moveZ: 1 })].find((event) => event.type === "area-transition-requested");
  assert.ok(transition && transition.type === "area-transition-requested");

  const outside = new Simulation(plazaRules(), inside.sessionState);
  outside.setPlayerTransform(transition.targetPosition, transition.targetHeading);
  assert.equal(outside.isObjectiveComplete(CAFE_TASK_IDS.tipJarOutside), false, "restoring is silent; the square reports it on its own tick");
  assert.ok(completed(run(outside, FIXED_STEP), CAFE_TASK_IDS.tipJarOutside));
  interact(outside); // put it down in the square

  const back = new Simulation(cafeRules(), outside.sessionState);
  assert.equal(tagged(back, "tip-jar").length, 0, "the jar is still outside, not rebuilt at the counter");
  assert.equal(back.isObjectiveComplete(CAFE_TASK_IDS.tipJarOutside), true);
  const again = new Simulation(plazaRules(), back.sessionState);
  assert.equal(tagged(again, "tip-jar").length, 1);
});

test("a coffee break needs a drink and a croissant set down together on a table nobody sits at", () => {
  const simulation = cafe();
  const occupied = new Set(simulation.world.cafePeople.flatMap((candidate) => candidate.tableSurfaceId ? [candidate.tableSurfaceId] : []));
  const table = cafeArea().instances.find((instance) => instance.assetId === "coffee.table" && !occupied.has(instance.id))!;
  const tablePoint = { x: table.transform.x, z: table.transform.z };
  const croissant = tagged(simulation, "pastry").find((item) => item.tags.includes("house"))!;
  const setDown = () => { standBy(simulation, tablePoint, { x: tablePoint.x, z: tablePoint.z + 1 }, 0.95); return interact(simulation); };

  standBy(simulation, croissant.position, customerSide(croissant.position), 0.6);
  interact(simulation);
  let events = setDown();
  assert.equal(entity(simulation, croissant.id).restingOn, table.id, "dropping it over the table sets it on the table");
  assert.equal(completed(events, CAFE_TASK_IDS.coffeeBreak), false, "a croissant alone is not a coffee break");

  const mug = entity(simulation, "coffee.mug-student");
  standBy(simulation, mug.position, { x: mug.position.x - 1, z: mug.position.z + 0.3 }, 0.85);
  interact(simulation);
  assert.equal(simulation.player.heldEntityId, mug.id);
  events = setDown();
  assert.ok(completed(events, CAFE_TASK_IDS.coffeeBreak));
});

test("the beer can from the square counts as the drink for a coffee break", () => {
  const plaza = new Simulation(plazaRules());
  const can = tagged(plaza, "drink")[0];
  plaza.setPlayerTransform({ x: can.position.x + 0.5, y: 0, z: can.position.z }, Math.PI / 2);
  interact(plaza);
  assert.equal(plaza.player.heldEntityId, can.id);
  const simulation = new Simulation(cafeRules(), plaza.sessionState);
  const occupied = new Set(simulation.world.cafePeople.flatMap((candidate) => candidate.tableSurfaceId ? [candidate.tableSurfaceId] : []));
  const table = cafeArea().instances.find((instance) => instance.assetId === "coffee.table" && !occupied.has(instance.id))!;
  const tablePoint = { x: table.transform.x, z: table.transform.z };
  standBy(simulation, tablePoint, { x: tablePoint.x, z: tablePoint.z + 1 }, 0.95);
  interact(simulation);
  const croissant = tagged(simulation, "pastry").find((item) => item.tags.includes("house"))!;
  standBy(simulation, croissant.position, customerSide(croissant.position), 0.6);
  interact(simulation);
  standBy(simulation, tablePoint, { x: tablePoint.x + 1, z: tablePoint.z }, 0.95);
  assert.ok(completed(interact(simulation), CAFE_TASK_IDS.coffeeBreak));
});

test("a table with a customer at it never counts as a coffee break", () => {
  const simulation = cafe();
  const reader = person(simulation, "coffee.customer-reader");
  // Her own mug and croissant already sit together on her table.
  run(simulation, 1);
  assert.equal(simulation.isObjectiveComplete(CAFE_TASK_IDS.coffeeBreak), false);
  assert.ok(reader.tableSurfaceId);
});

test("tasks finished in the coffee shop stay crossed off through the door and back", () => {
  const simulation = cafe();
  const radio = tagged(simulation, "music")[0];
  standBy(simulation, radio.position, roomCenter, 0.75);
  interact(simulation);
  assert.equal(simulation.isObjectiveComplete(CAFE_TASK_IDS.musicOff), true);
  const outside = new Simulation(plazaRules(), simulation.sessionState);
  assert.equal(outside.isObjectiveComplete(CAFE_TASK_IDS.musicOff), true);
  assert.deepEqual(run(outside, 0.1).filter((event) => event.type === "objective-completed"), []);
  const back = new Simulation(cafeRules(), outside.sessionState);
  assert.equal(back.isObjectiveComplete(CAFE_TASK_IDS.musicOff), true);
  // The radio is still off where the goose left it; turning it back on later never un-crosses the task.
  assert.equal(entity(back, radio.id).active, false);
});

test("a janitor's tool left in the coffee shop is back home when the square loads, exactly once", () => {
  const plaza = new Simulation(plazaRules());
  const picker = plaza.world.entities.find((item) => item.assetId === "prop.litter-picker")!;
  plaza.setPlayerTransform({ x: picker.position.x + 0.5, y: 0, z: picker.position.z }, Math.PI / 2);
  interact(plaza);
  assert.equal(plaza.player.heldEntityId, picker.id);
  const inside = new Simulation(cafeRules(), plaza.sessionState);
  interact(inside); // drop it in the café
  const outside = new Simulation(plazaRules(), inside.sessionState);
  const copies = outside.world.entities.filter((item) => item.id === picker.id);
  assert.equal(copies.length, 1);
  assert.ok(Math.hypot(copies[0].position.x - picker.position.x, copies[0].position.z - picker.position.z) < 0.01);
  assert.ok(new Simulation(cafeRules(), outside.sessionState).world.entities.every((item) => item.id !== picker.id));
});

test("left alone, the coffee shop never crosses anything off by itself", () => {
  const simulation = cafe();
  simulation.setPlayerTransform({ x: 0, y: 0, z: 5.2 }, 0);
  const events = run(simulation, 180);
  assert.deepEqual(events.filter((event) => event.type === "objective-completed"), []);
  // Meanwhile the routine keeps turning over: orders are made, fetched, and cleared.
  assert.ok(events.filter((event) => event.type === "order-called").length >= 2);
});

test("each level lists only its own tasks, but a task still counts wherever it is finished", () => {
  const byLevel = (simulation: Simulation, areaId: string) => simulation.objectiveList.filter((task) => task.areaId === areaId).map((task) => task.id);
  const simulation = cafe();
  assert.deepEqual(byLevel(simulation, CENTRAL_PLAZA_AREA_ID), [ENTER_SHOP_OBJECTIVE_ID]);
  assert.deepEqual([...byLevel(simulation, COFFEE_SHOP_AREA_ID)].sort(), Object.values(CAFE_TASK_IDS).sort());
  assert.ok(simulation.objectiveList.every((task) => task.areaId !== undefined), "every task belongs to a level");
});

test("the baker works the kitchen stations in a loop", () => {
  const simulation = cafe();
  const baker = () => person(simulation, "coffee.baker");
  simulation.setPlayerTransform({ x: 3, y: 0, z: 4 }, 0);
  const tasks = new Set<string>();
  runUntil(simulation, () => { tasks.add(baker().activity); return tasks.has("washing"); }, 120);
  for (const task of ["kneading", "baking", "stocking", "washing", "walking"]) assert.ok(tasks.has(task), task);
  runUntil(simulation, () => baker().activity === "kneading", 60);
});

test("the goose can waddle through the doorway into the kitchen, where the baker shoos it", () => {
  const simulation = cafe();
  const wall = cafeArea().instances.find((instance) => instance.assetId === "coffee.wall-long-doorway")!;
  const middle = wall.transform.x + (KITCHEN_DOORWAY[0] + KITCHEN_DOORWAY[1]) / 2;
  // Start just inside the café in front of the doorway and walk through it.
  simulation.setPlayerTransform({ x: middle, y: 0, z: wall.transform.z + 0.9 }, 0);
  run(simulation, 1.2, { ...idle, moveZ: -1 });
  assert.ok(simulation.player.position.z < wall.transform.z - 0.5, `goose reached z=${simulation.player.position.z}`);
  const baker = person(simulation, "coffee.baker");
  standBy(simulation, baker.position, { x: baker.position.x + 1, z: baker.position.z }, 1.2);
  const events = run(simulation, 0.2);
  assert.ok(events.some((event) => event.type === "goose-shooed" && event.actorId === baker.id));
});

test("the barista herds a frightening goose out even from the kitchen doorway", () => {
  const simulation = cafe();
  const student = person(simulation, "coffee.customer-student");
  standBy(simulation, student.position, roomCenter, 1.6);
  honk(simulation);
  const wall = cafeArea().instances.find((instance) => instance.assetId === "coffee.wall-long-doorway")!;
  simulation.setPlayerTransform({ x: wall.transform.x + (KITCHEN_DOORWAY[0] + KITCHEN_DOORWAY[1]) / 2, y: 0, z: wall.transform.z - 0.9 }, 0);
  const herding = runUntilEvent(simulation, "area-transition-requested", 90);
  assert.ok(herding.some((event) => event.type === "goose-shooed" && event.actorId === barista(simulation).id));
});
