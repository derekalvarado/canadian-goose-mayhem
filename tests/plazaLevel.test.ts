import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import {
  FOUNTAIN,
  PLAZA_MAX_Z,
  PLAZA_MIN_Z,
  SPLASH_PAD,
  findPlazaStaticOverlaps,
  isPlazaPlayable,
  plazaGroupLocalToWorld,
  resolvePlazaMovement,
} from "../src/game/plazaLevel.ts";
import { clonePlazaLayout, CANONICAL_PLAZA_LAYOUT } from "../src/game/plazaLayout.ts";
import { Simulation, FIXED_STEP, type PlayerCommand } from "../src/game/simulation/Simulation.ts";
import { createPlazaRules, plazaRules } from "../src/game/simulation/plaza.ts";

const idle: PlayerCommand = { moveX: 0, moveZ: 0, hurry: false, honkPressed: false };

test("the Old Town spawn and splash pad are playable", () => {
  assert.equal(isPlazaPlayable(plazaRules.spawn.x, plazaRules.spawn.z), true);
  assert.equal(isPlazaPlayable(SPLASH_PAD.x, SPLASH_PAD.z), true);
});

test("the storefront perimeter confines the goose", () => {
  assert.equal(isPlazaPlayable(23, 0), false);
  assert.equal(isPlazaPlayable(0, PLAZA_MIN_Z - 0.1), false);
  assert.equal(isPlazaPlayable(0, PLAZA_MAX_Z + 0.1), false);
  assert.equal(isPlazaPlayable(21.8, 17.8), false);
});

test("visible plaza fixtures use authored collision", () => {
  const playWall = plazaGroupLocalToWorld(CANONICAL_PLAZA_LAYOUT, "plaza.play-area", 0, -3);
  const playOpening = plazaGroupLocalToWorld(CANONICAL_PLAZA_LAYOUT, "plaza.play-area", 5.8, 1.1);
  const pavilion = CANONICAL_PLAZA_LAYOUT.groups["plaza.pavilion-stage"].position;
  assert.equal(isPlazaPlayable(FOUNTAIN.x, FOUNTAIN.z), false);
  assert.equal(isPlazaPlayable(playWall.x, playWall.z), false, "play-area north wall should block");
  assert.equal(isPlazaPlayable(playOpening.x, playOpening.z), true, "play-area opening should remain usable");
  assert.equal(isPlazaPlayable(pavilion.x, pavilion.z), false, "pavilion stage should block");
  assert.equal(isPlazaPlayable(19.35, -7.2), false, "fixed planter should block");
});

test("moving an editable feature moves its collision without creating a task", () => {
  const layout = clonePlazaLayout(CANONICAL_PLAZA_LAYOUT);
  layout.groups["plaza.goose-fountain"].position.x = 8;
  layout.groups["plaza.goose-fountain"].position.z = 5;

  assert.equal(isPlazaPlayable(FOUNTAIN.x, FOUNTAIN.z, undefined, layout), true);
  assert.equal(isPlazaPlayable(8, 5, undefined, layout), false);
  const rules = createPlazaRules(layout);
  assert.deepEqual(rules.objectives, []);
});

test("rotating the play-area group rotates its authored collision", () => {
  const layout = clonePlazaLayout(CANONICAL_PLAZA_LAYOUT);
  const playArea = layout.groups["plaza.play-area"];
  playArea.rotationY = Math.PI / 2;

  assert.equal(isPlazaPlayable(playArea.position.x - 3, playArea.position.z, undefined, layout), false);
  assert.equal(isPlazaPlayable(playArea.position.x, playArea.position.z - 3, undefined, layout), true);
});

test("the editor warns when a movable group overlaps fixed scenery", () => {
  const layout = clonePlazaLayout(CANONICAL_PLAZA_LAYOUT);
  layout.groups["plaza.cafe-table-1"].position.x = 19.35;
  layout.groups["plaza.cafe-table-1"].position.z = -7.2;
  assert.deepEqual(findPlazaStaticOverlaps(layout, "plaza.cafe-table-1"), ["plaza.planter-east-north"]);
});

test("movement slides along the fountain instead of crossing its basin", () => {
  const current = new Vector3(FOUNTAIN.x + FOUNTAIN.radius + 0.6, 0.02, FOUNTAIN.z + 0.8);
  const proposed = new Vector3(FOUNTAIN.x + FOUNTAIN.radius - 0.2, 0.02, FOUNTAIN.z + 0.5);
  const output = new Vector3();
  resolvePlazaMovement(current, proposed, output);
  assert.equal(isPlazaPlayable(output.x, output.z), true);
  assert.notDeepEqual(output.toArray(), proposed.toArray());
});

test("approaching the goose fountain does not create a task or stop exploration", () => {
  const spawn = { x: FOUNTAIN.x + FOUNTAIN.radius + 2.25, y: 0.02, z: FOUNTAIN.z };
  const simulation = new Simulation({ ...plazaRules, spawn });
  const events = Array.from({ length: 30 }, () =>
    simulation.advance(FIXED_STEP, { ...idle, moveX: -1 }),
  ).flat();
  assert.equal(events.filter((event) => event.type === "objective-completed").length, 0);

  const before = simulation.player.position.x;
  for (let frame = 0; frame < 30; frame += 1) {
    simulation.advance(FIXED_STEP, { ...idle, moveX: 1 });
  }
  assert.ok(simulation.player.position.x > before);
});
