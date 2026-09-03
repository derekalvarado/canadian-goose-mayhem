import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import {
  EXIT_Z,
  GOOSE_RADIUS,
  isInClearing,
  isOnPath,
  isPlayable,
  pathCenterAt,
  pathHalfWidthAt,
  resolveLevelMovement,
} from "../src/game/level.ts";

test("the spawn and clearing center are playable", () => {
  assert.equal(isPlayable(0, 7.4), true);
  assert.equal(isInClearing(0, 2, GOOSE_RADIUS), true);
});

test("the forest perimeter confines the goose", () => {
  assert.equal(isPlayable(15, 2), false);
  assert.equal(isPlayable(-14, 8), false);
  assert.equal(isPlayable(9, -10), false);
});

test("the north path forms one continuous route through the perimeter", () => {
  for (let z = -6.8; z >= EXIT_Z - 2; z -= 0.4) {
    assert.equal(isOnPath(pathCenterAt(z), z, GOOSE_RADIUS * 0.55), true, `path gap at z=${z}`);
    assert.equal(isPlayable(pathCenterAt(z), z), true, `route blocked at z=${z}`);
  }
});

test("the path edge is bounded by forest", () => {
  const z = -18;
  const outsideX = pathCenterAt(z) + pathHalfWidthAt(z) + 0.7;
  assert.equal(isPlayable(outsideX, z), false);
});

test("movement slides along a boundary instead of crossing it", () => {
  const current = new Vector3(11.8, 0.02, 2);
  const proposed = new Vector3(12.5, 0.02, 1.7);
  const output = new Vector3();
  resolveLevelMovement(current, proposed, output);
  assert.equal(isPlayable(output.x, output.z), true);
  assert.notDeepEqual(output.toArray(), proposed.toArray());
});

test("large props block movement", () => {
  const current = new Vector3(-3.7, 0.02, -1.55);
  const proposed = new Vector3(-5.35, 0.02, -1.55);
  const output = new Vector3();
  resolveLevelMovement(current, proposed, output);
  assert.notEqual(output.x, proposed.x);
});
