import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { Goose } from "../src/game/Goose.ts";

test("goose meshes remain visible to one another while respecting world depth", () => {
  const goose = new Goose();
  let meshCount = 0;
  goose.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshCount += 1;
    assert.equal(object.renderOrder, 1);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) assert.equal(material.depthWrite, false);
  });
  assert.ok(meshCount > 0);
});
