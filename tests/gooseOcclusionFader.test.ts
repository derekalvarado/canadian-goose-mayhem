import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { GooseOcclusionFader } from "../src/game/GooseOcclusionFader.ts";
import { OcclusionFadeGroupRegistry } from "../src/game/OcclusionFadeGroups.ts";
import { PlazaWorld } from "../src/game/PlazaWorld.ts";

function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 0.6, 0);
  return camera;
}

function createMesh(x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x76533b }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

test("a hit on one member fades and restores its complete authored group", () => {
  const world = new THREE.Group();
  const building = new THREE.Group();
  const wall = createMesh(0, 1.2, 4);
  const window = createMesh(3, 1.2, 4);
  const ungroupedLamp = createMesh(0, 1.2, 3);
  building.add(wall, window);
  world.add(building, ungroupedLamp);

  const groups = new OcclusionFadeGroupRegistry();
  groups.register("building", building);
  const wallMaterial = wall.material;
  const windowMaterial = window.material;
  const lampMaterial = ungroupedLamp.material;
  const fader = new GooseOcclusionFader(groups);
  fader.update(world, createCamera(), new THREE.Group(), 1);

  for (const mesh of [wall, window]) {
    assert.equal((mesh.material as THREE.Material).transparent, true);
    assert.ok((mesh.material as THREE.Material).opacity < 0.35);
    assert.equal(mesh.castShadow, false);
  }
  assert.equal(ungroupedLamp.material, lampMaterial);
  assert.equal((ungroupedLamp.material as THREE.Material).transparent, false);
  assert.equal(ungroupedLamp.castShadow, true);

  wall.position.x = 8;
  fader.update(world, createCamera(), new THREE.Group(), 1);
  assert.equal(wall.material, wallMaterial);
  assert.equal(window.material, windowMaterial);
  assert.equal(wall.castShadow, true);
  assert.equal(window.castShadow, true);
});

test("a pavilion canopy fades without fading its unregistered stage deck", () => {
  const world = new THREE.Group();
  const canopy = new THREE.Group();
  const roof = createMesh(0, 1.2, 4);
  const column = createMesh(3, 1.2, 4);
  canopy.add(roof, column);
  const deck = createMesh(-3, 0.3, 4);
  world.add(canopy, deck);

  const groups = new OcclusionFadeGroupRegistry();
  groups.register("pavilion.canopy", canopy);
  const deckMaterial = deck.material;
  new GooseOcclusionFader(groups).update(world, createCamera(), new THREE.Group(), 1);

  assert.equal((roof.material as THREE.Material).transparent, true);
  assert.equal((column.material as THREE.Material).transparent, true);
  assert.equal(deck.material, deckMaterial);
  assert.equal((deck.material as THREE.Material).transparent, false);
});

test("plaza metadata groups complete façades and trees while leaving stage decking unregistered", () => {
  const world = new PlazaWorld();
  const groups = world.occlusionFadeGroups;
  const facade = groups.groupById("plaza.building.north.1");
  const tree = groups.groupById("plaza.tree.east-north");
  const canopy = groups.groupById("plaza.pavilion-stage.canopy");
  assert.ok(facade && facade.meshes.length > 5);
  assert.ok(tree && tree.meshes.length === 4);
  assert.ok(canopy && canopy.meshes.length === 6);

  for (const mesh of [...facade.meshes, ...tree.meshes, ...canopy.meshes]) {
    assert.ok(groups.groupForMesh(mesh));
  }

  const pavilion = world.editableGroups.get("plaza.pavilion-stage");
  assert.ok(pavilion);
  const stageDeck = pavilion.children[0].children[0] as THREE.Mesh;
  assert.equal(groups.groupForMesh(stageDeck), undefined);
});
