import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { ViewSunShadow } from "../src/game/ViewSunShadow.ts";

test("visible ground retains shadow coverage at plaza edges and distant editor positions", () => {
  const sun = new ViewSunShadow();
  for (const [x, z, distance, aspect] of [[0, 0, 18, 1.8], [24, 20, 18, 1.8], [-24, -20, 18, 1], [180, -140, 36, 2.4]]) {
    const camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 130);
    camera.position.set(x + distance, distance * Math.SQRT2, z + distance);
    camera.lookAt(x, 0, z);
    sun.update(camera);
    sun.light.shadow.updateMatrices(sun.light);
    for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(u, v), camera);
      const ground = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      assert.ok(ground);
      for (const height of [0, 10, 20]) {
        const projected = ground.clone().add(new THREE.Vector3(0, height, 0)).project(sun.light.shadow.camera);
        assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1,
          `shadow coverage lost at ${x},${z}, height ${height}: ${projected.toArray()}`);
      }
    }
    const direction = sun.light.position.clone().sub(sun.light.target.position).normalize();
    assert.ok(direction.distanceTo(new THREE.Vector3(-9, 18, 8).normalize()) < 1e-10);
  }
});
