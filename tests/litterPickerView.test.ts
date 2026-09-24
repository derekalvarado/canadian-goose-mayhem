import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { WorldView } from "../src/game/WorldView.ts";
import type { WorldSnapshot } from "../src/game/simulation/Simulation.ts";
import type { WorldArea } from "../src/game/worldLayout.ts";

const area: WorldArea = {
  id: "old-town-square.central-plaza",
  label: "Test plaza",
  chunks: [],
  instances: [{
    id: "picker",
    assetId: "prop.litter-picker",
    label: "Litter picker",
    transform: { x: 0, y: 0, z: 0, rotationY: 0 },
  }],
  controlLinks: [],
};

function snapshot(holderId?: string): WorldSnapshot {
  return {
    player: {
      id: "goose",
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      heading: 0,
      speed: 0,
      turnAmount: 0,
      wingsSpread: false,
      sneaking: false,
      threatening: false,
      spooked: false,
      heldEntityId: holderId === "goose" ? "picker" : undefined,
    },
    entities: [{
      id: "picker",
      label: "Litter picker",
      position: { x: 0, y: holderId === "goose" ? 0.16 : 0, z: holderId === "goose" ? -0.45 : 0 },
      heading: 0,
      holderId,
      serviceCount: 0,
    }],
    splashKids: [],
    durableFacts: [],
  };
}

test("a loose litter picker rests sideways on the authored ground plane", () => {
  const view = new WorldView(area);
  view.syncGameplay(snapshot());
  const picker = view.instances.get("picker")!;

  assert.equal(picker.rotation.x, Math.PI / 2);
  assert.equal(picker.position.y, 0);
  assert.equal(picker.parent, view);
});

test("a goose-held litter picker is centered in the beak and turns with its mouth socket", () => {
  const view = new WorldView(area);
  const mouthSocket = new THREE.Object3D();
  view.syncGameplay(snapshot("goose"), mouthSocket);
  const picker = view.instances.get("picker")!;

  assert.equal(picker.rotation.z, Math.PI / 2);
  assert.equal(picker.position.x, 0.8, "the picker midpoint should be at the goose's mouth");
  assert.equal(picker.parent, mouthSocket);

  mouthSocket.rotation.y = Math.PI / 2;
  mouthSocket.updateMatrixWorld(true);
  picker.updateMatrixWorld(true);
  const turnedPosition = picker.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(turnedPosition.z + 0.8) < 1e-6, "the held picker should inherit the goose's turn");
});
