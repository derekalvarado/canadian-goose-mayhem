import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createWorldAssetView } from "../src/game/PlazaWorld.ts";
import { OcclusionFadeGroupRegistry } from "../src/game/OcclusionFadeGroups.ts";
import {
  CANONICAL_WORLD_LAYOUT,
  CENTRAL_PLAZA_AREA_ID,
  COFFEE_SHOP_AREA_ID,
  getWorldArea,
  resolveStartAreaId,
} from "../src/game/worldLayout.ts";
import { createCoffeeShopRules, createWorldRules, ENTER_SHOP_FACT_ID, ENTER_SHOP_OBJECTIVE_ID, isWorldAreaPlayable } from "../src/game/worldLevel.ts";
import { FIXED_STEP, Simulation } from "../src/game/simulation/Simulation.ts";
import { AuthoredPhysicsAdapter } from "../src/game/simulation/physics.ts";

test("the coffee shop portal links the plaza entrance and the shop front door", () => {
  const plaza = getWorldArea(CANONICAL_WORLD_LAYOUT, CENTRAL_PLAZA_AREA_ID);
  const entrance = plaza.instances.find((instance) => instance.id === "plaza.shop-entrance");
  assert.ok(entrance);
  assert.equal(entrance.label, "Coffee shop entrance");

  const transitions = CANONICAL_WORLD_LAYOUT.transitions;
  assert.deepEqual(transitions.map((transition) => transition.id), ["transition.coffee-shop.enter", "transition.coffee-shop.exit"]);
  assert.equal(transitions[0]?.fromInstanceId, "plaza.shop-entrance");
  assert.equal(transitions[0]?.toAreaId, COFFEE_SHOP_AREA_ID);
  assert.equal(transitions[1]?.fromInstanceId, "coffee.front-door");
  assert.equal(transitions[1]?.toAreaId, CENTRAL_PLAZA_AREA_ID);
});

test("coffee shop rules spawn the goose on playable ground and expose no placeholder AI", () => {
  const area = getWorldArea(CANONICAL_WORLD_LAYOUT, COFFEE_SHOP_AREA_ID);
  const rules = createCoffeeShopRules(area);
  assert.equal(rules.entities?.length ?? 0, 0);
  assert.equal(rules.janitor, undefined);
  assert.equal(isWorldAreaPlayable(area, rules.spawn.x, rules.spawn.z), true);
  assert.equal(createWorldRules(area).objectives.length, 0);
});

/** A spot just outside the placed shop entrance, and the stick direction that walks into it. */
function shopApproach(): { start: { x: number; y: number; z: number }; moveX: number; moveZ: number } {
  const entrance = getWorldArea(CANONICAL_WORLD_LAYOUT, CENTRAL_PLAZA_AREA_ID).instances.find((instance) => instance.id === "plaza.shop-entrance")!;
  const { x, z, rotationY } = entrance.transform;
  const moveX = -Math.sin(rotationY); const moveZ = -Math.cos(rotationY);
  return { start: { x: x - moveX * 1.2, y: 0, z: z - moveZ * 1.2 }, moveX, moveZ };
}

test("crossing the southern storefront transitions both ways without losing the shop fact", () => {
  const plaza = getWorldArea(CANONICAL_WORLD_LAYOUT, CENTRAL_PLAZA_AREA_ID);
  const coffeeShop = getWorldArea(CANONICAL_WORLD_LAYOUT, COFFEE_SHOP_AREA_ID);
  const plazaRules = createWorldRules(plaza, CANONICAL_WORLD_LAYOUT.transitions);
  const approach = shopApproach();
  const plazaSimulation = new Simulation({ ...plazaRules, spawn: approach.start });
  const enterEvents = Array.from({ length: 120 }, () => plazaSimulation.advance(FIXED_STEP, { moveX: approach.moveX, moveZ: approach.moveZ, hurry: false, honkPressed: false })).flat();
  const enter = enterEvents.find((event) => event.type === "area-transition-requested");
  assert.ok(enter && enter.type === "area-transition-requested");
  assert.equal(enter.toAreaId, COFFEE_SHOP_AREA_ID);
  assert.ok(plazaSimulation.sessionState.durableFacts.includes(ENTER_SHOP_FACT_ID));

  const coffeeSimulation = new Simulation(createWorldRules(coffeeShop, CANONICAL_WORLD_LAYOUT.transitions), plazaSimulation.sessionState);
  coffeeSimulation.setPlayerTransform(enter.targetPosition, enter.targetHeading);
  const exitEvents = Array.from({ length: 120 }, () => coffeeSimulation.advance(FIXED_STEP, { moveX: 0, moveZ: 1, hurry: false, honkPressed: false })).flat();
  const exit = exitEvents.find((event) => event.type === "area-transition-requested");
  assert.ok(exit && exit.type === "area-transition-requested");
  assert.equal(exit.toAreaId, CENTRAL_PLAZA_AREA_ID);

  const restoredPlaza = new Simulation(plazaRules, coffeeSimulation.sessionState);
  assert.equal(restoredPlaza.isObjectiveComplete(ENTER_SHOP_OBJECTIVE_ID), true);
});

test("a goose-held item keeps its identity across the area boundary", () => {
  const plaza = getWorldArea(CANONICAL_WORLD_LAYOUT, CENTRAL_PLAZA_AREA_ID);
  const coffeeShop = getWorldArea(CANONICAL_WORLD_LAYOUT, COFFEE_SHOP_AREA_ID);
  const rules = createWorldRules(plaza, CANONICAL_WORLD_LAYOUT.transitions);
  const can = plaza.instances.find((instance) => instance.id === "plaza.beer-can")!;
  const simulation = new Simulation({ ...rules, spawn: { x: can.transform.x, y: 0, z: can.transform.z } });
  simulation.advance(FIXED_STEP, { moveX: 0, moveZ: 0, hurry: false, honkPressed: false, interactPressed: true });
  assert.equal(simulation.player.heldEntityId, "plaza.beer-can");

  const approach = shopApproach();
  simulation.setPlayerTransform(approach.start);
  const enterEvents = Array.from({ length: 120 }, () => simulation.advance(FIXED_STEP, { moveX: approach.moveX, moveZ: approach.moveZ, hurry: false, honkPressed: false })).flat();
  const enter = enterEvents.find((event) => event.type === "area-transition-requested");
  assert.ok(enter && enter.type === "area-transition-requested");

  const coffeeSimulation = new Simulation(createWorldRules(coffeeShop, CANONICAL_WORLD_LAYOUT.transitions), simulation.sessionState);
  assert.equal(coffeeSimulation.player.heldEntityId, "plaza.beer-can");
  assert.equal(coffeeSimulation.world.entities.find((entity) => entity.id === "plaza.beer-can")?.holderId, "goose");
  assert.equal(coffeeSimulation.world.entities.find((entity) => entity.id === "plaza.beer-can")?.assetId, "prop.beer-can");
});

test("the central plaza is the default start while developer overrides remain available", () => {
  const layout = CANONICAL_WORLD_LAYOUT;
  assert.equal(resolveStartAreaId(layout, false), CENTRAL_PLAZA_AREA_ID);
  assert.equal(resolveStartAreaId(layout, false, "missing-area"), CENTRAL_PLAZA_AREA_ID);
  assert.equal(resolveStartAreaId(layout, true), CENTRAL_PLAZA_AREA_ID);
  assert.equal(resolveStartAreaId(layout, true, COFFEE_SHOP_AREA_ID), COFFEE_SHOP_AREA_ID);
  assert.equal(resolveStartAreaId(layout, true, "coffee-shop"), COFFEE_SHOP_AREA_ID);
  assert.equal(resolveStartAreaId(layout, true, "old-town-square.central-plaza"), "old-town-square.central-plaza");
  assert.equal(resolveStartAreaId(layout, true, "missing-area"), CENTRAL_PLAZA_AREA_ID);
});

test("authored physics spike maps stable colliders and supports fixed-step body queries", () => {
  const area = getWorldArea(CANONICAL_WORLD_LAYOUT, COFFEE_SHOP_AREA_ID);
  const physics = new AuthoredPhysicsAdapter(area);
  physics.createBody({ id: "coffee.test-mug", type: "dynamic", position: { x: 0, y: 0.8, z: 4 }, radius: 0.1 });
  physics.applyImpulse("coffee.test-mug", { x: 1, y: 0, z: 0 });
  physics.step(1 / 60);
  assert.ok((physics.snapshot()[0]?.position.x ?? 0) > 0);
  const placed = (id: string) => area.instances.find((instance) => instance.id === id)!.transform;
  const counter = placed("coffee.counter");
  assert.ok(physics.overlapCircle({ x: counter.x, y: 0, z: counter.z }, 0.2).includes("coffee.counter"));

  const wall = placed("coffee.wall-north");
  const hit = physics.sweepCircle({ x: wall.x, y: 0, z: wall.z + 11 }, { x: wall.x, y: 0, z: wall.z + 0.3 }, 0.34, "coffee.test-mug");
  assert.equal(hit?.bodyId, "coffee.wall-north");
});

test("coffee graybox assets render with the shared toon material", () => {
  const ids = [
    "coffee.shop-floor", "coffee.wall-long", "coffee.wall-side", "coffee.wall-door-wing", "coffee.front-door",
    "coffee.wall-board", "coffee.counter", "coffee.table", "coffee.chair", "coffee.placeholder-person",
  ];
  for (const assetId of ids) {
    const view = createWorldAssetView(assetId, new OcclusionFadeGroupRegistry(), `test.${assetId}`);
    let meshCount = 0;
    view.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshCount += 1;
      assert.ok(object.material instanceof THREE.MeshToonMaterial, `${assetId} should use toon materials`);
    });
    assert.ok(meshCount > 0, `${assetId} should render geometry`);
  }
});
