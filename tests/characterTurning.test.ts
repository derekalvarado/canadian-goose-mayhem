import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RiggedCharacterView } from "../src/game/RiggedCharacterView.ts";

function placed(heading: number): { placement: THREE.Group; view: RiggedCharacterView } {
  const placement = new THREE.Group();
  placement.rotation.y = heading;
  const view = new RiggedCharacterView({ name: "villager", errorLabel: "villager", palette: {} });
  placement.add(view);
  view.update(1 / 60);
  return { placement, view };
}

test("a villager given a new heading swings round to it over a moment instead of snapping", () => {
  const { placement, view } = placed(0);
  assert.equal(view.drawnHeading, 0);
  placement.rotation.y = Math.PI / 2;
  view.update(1 / 60);
  assert.ok(view.drawnHeading > 0 && view.drawnHeading < Math.PI / 4, "the first frame of a turn only starts it");
  for (let frame = 0; frame < 60; frame++) view.update(1 / 60);
  assert.ok(Math.abs(view.drawnHeading - Math.PI / 2) < 0.01, "a second later they face the new heading");
});

test("villagers turn the short way round", () => {
  const { placement, view } = placed(3);
  placement.rotation.y = -3;
  view.update(1 / 60);
  // From 3 rad to -3 rad is a small turn through ±π, not most of a circle back through 0.
  assert.ok(Math.abs(view.drawnHeading) > 3, `turned through 0 instead (${view.drawnHeading})`);
});

test("a villager first placed in the world faces their heading straight away", () => {
  const { view } = placed(1.2);
  assert.ok(Math.abs(view.drawnHeading - 1.2) < 1e-9);
});
