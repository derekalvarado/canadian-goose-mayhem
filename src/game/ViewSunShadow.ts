import * as THREE from "three";

const SUN_DIRECTION = new THREE.Vector3(-9, 18, 8).normalize();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3().crossVectors(UP, SUN_DIRECTION).normalize();
const LIGHT_UP = new THREE.Vector3().crossVectors(SUN_DIRECTION, RIGHT);
const MAX_CASTER_HEIGHT = 24;

/** Fit shadow coverage to the visible ground and buildings, independent of plaza bounds. */
export class ViewSunShadow {
  readonly light = new THREE.DirectionalLight(0xffffff, Math.PI * 0.45);
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(UP, 0);
  private readonly point = new THREE.Vector3();
  private readonly center = new THREE.Vector3();

  constructor() {
    const sun = this.light;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 400;
    sun.shadow.bias = -0.00018;
    sun.shadow.normalBias = 0.025;
  }

  update(camera: THREE.PerspectiveCamera): void {
    camera.updateWorldMatrix(true, false);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let minDepth = Infinity, maxDepth = -Infinity;
    this.center.set(0, 0, 0);
    let count = 0;
    // Include the elevated silhouette as well as the floor. A generous caster
    // margin keeps offscreen crowns/buildings that cast into the view in the map.
    for (const height of [0, MAX_CASTER_HEIGHT]) {
      this.plane.constant = -height;
      for (const x of [-1, 1]) for (const y of [-1, 1]) {
        this.ray.setFromCamera(new THREE.Vector2(x, y), camera);
        if (!this.ray.ray.intersectPlane(this.plane, this.point)) continue;
        this.center.add(this.point);
        count++;
        const depth = this.point.dot(SUN_DIRECTION);
        minDepth = Math.min(minDepth, depth); maxDepth = Math.max(maxDepth, depth);
        const lightX = this.point.dot(RIGHT);
        const lightY = this.point.dot(LIGHT_UP);
        minX = Math.min(minX, lightX); maxX = Math.max(maxX, lightX);
        minY = Math.min(minY, lightY); maxY = Math.max(maxY, lightY);
      }
    }
    if (!count) return;
    this.center.multiplyScalar(1 / count);
    const halfWidth = Math.ceil((maxX - minX) / 2 + 16);
    const halfHeight = Math.ceil((maxY - minY) / 2 + 16);
    const texelX = halfWidth * 2 / this.light.shadow.mapSize.x;
    const texelY = halfHeight * 2 / this.light.shadow.mapSize.y;
    // Snap in light space to keep shadows stable while the camera moves.
    const centerX = Math.round((minX + maxX) / 2 / texelX) * texelX;
    const centerY = Math.round((minY + maxY) / 2 / texelY) * texelY;
    this.center.addScaledVector(RIGHT, centerX - this.center.dot(RIGHT));
    this.center.addScaledVector(LIGHT_UP, centerY - this.center.dot(LIGHT_UP));
    this.light.target.position.copy(this.center);
    this.light.position.copy(this.center).addScaledVector(SUN_DIRECTION, 200);
    const shadowCamera = this.light.shadow.camera;
    const centerDepth = this.center.dot(SUN_DIRECTION);
    shadowCamera.near = Math.max(1, 200 + centerDepth - maxDepth - 24);
    shadowCamera.far = 200 + centerDepth - minDepth + 24;
    shadowCamera.left = -halfWidth;
    shadowCamera.right = halfWidth;
    shadowCamera.bottom = -halfHeight;
    shadowCamera.top = halfHeight;
    shadowCamera.updateProjectionMatrix();
    this.light.updateMatrixWorld();
    this.light.target.updateMatrixWorld();
  }
}
