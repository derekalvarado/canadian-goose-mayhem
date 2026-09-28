import * as THREE from "three";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";

/**
 * Photo-informed Old Town coffee shop furniture: black steel double-cross-back
 * café chairs with worn wooden seats, and small square dark-wood bistro tables
 * on a single pedestal with a four-footed X base. Chairs keep the graybox
 * convention: the sitter faces local -z and the backrest sits toward +z.
 */
const C = PALETTE.coffeeFurniture;
const UP = new THREE.Vector3(0, 1, 0);

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}

/** A square steel tube running between two points. */
function tube(from: THREE.Vector3Tuple, to: THREE.Vector3Tuple, size = 0.03, color: number = C.frame): THREE.Mesh {
  const a = new THREE.Vector3(...from); const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a); const length = dir.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, length, size), toonMaterial(color));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

const SEAT_Y = 0.46;
/**
 * The café's people are janitor-sized, so the furniture is built at real-world
 * proportions and scaled up to their knee and hip heights.
 */
export const CAFE_SEAT_HEIGHT = 0.58;
export const CAFE_TABLE_HEIGHT = 0.95;
const CHAIR_SCALE = CAFE_SEAT_HEIGHT / SEAT_Y;
const LEG_X = 0.225;
const FRONT_FOOT_Z = -0.235;
const FRONT_TOP_Z = -0.2;
const REAR_FOOT_Z = 0.265;
const REAR_TOP_Z = 0.205;
const BACK_TOP_Y = 1.02;
const BACK_TOP_Z = 0.27;

/** The back posts rake slightly rearward; this is their z at a given height. */
function backZ(y: number): number {
  return REAR_TOP_Z + ((y - SEAT_Y) / (BACK_TOP_Y - SEAT_Y)) * (BACK_TOP_Z - REAR_TOP_Z);
}

export function createCoffeeChair(): THREE.Group {
  const group = new THREE.Group(); group.name = "coffee shop cross-back chair";
  const backTilt = Math.atan2(BACK_TOP_Z - REAR_TOP_Z, BACK_TOP_Y - SEAT_Y);

  // Wooden seat resting in a thin steel ring.
  group.add(
    box(0.49, 0.04, 0.47, C.frame, 0, SEAT_Y - 0.02, 0.005),
    box(0.46, 0.045, 0.44, C.seat, 0, SEAT_Y + 0.02, 0),
    box(0.4, 0.008, 0.36, C.seatLight, 0, SEAT_Y + 0.046, -0.01),
  );

  for (const side of [-1, 1] as const) {
    const x = side * LEG_X;
    // Straight front legs, and rear legs that run on up into the back posts.
    group.add(
      tube([x, SEAT_Y - 0.03, FRONT_TOP_Z], [side * (LEG_X + 0.01), 0, FRONT_FOOT_Z]),
      tube([side * (LEG_X + 0.01), 0, REAR_FOOT_Z], [x, SEAT_Y - 0.03, REAR_TOP_Z]),
      tube([x, SEAT_Y - 0.03, REAR_TOP_Z], [side * (LEG_X - 0.01), BACK_TOP_Y, BACK_TOP_Z]),
      // Side stretcher between each front and rear leg.
      tube([side * (LEG_X + 0.004), 0.17, -0.225], [side * (LEG_X + 0.004), 0.17, 0.245], 0.022),
    );
  }
  // Front and rear stretchers.
  group.add(
    tube([-LEG_X, 0.2, -0.222], [LEG_X, 0.2, -0.222], 0.022),
    tube([-LEG_X, 0.24, 0.238], [LEG_X, 0.24, 0.238], 0.022),
  );

  // Backrest: a deep top rail and a lower rail joined by a doubled X.
  const topRail = box(0.44, 0.085, 0.032, C.frame, 0, 0.965, backZ(0.965));
  const lowRail = box(0.44, 0.035, 0.028, C.frame, 0, 0.6, backZ(0.6));
  topRail.rotation.x = backTilt; lowRail.rotation.x = backTilt;
  group.add(topRail, lowRail);
  // Two parallel crosses, shifted apart along x so the pair reads as a double X.
  const railTop = 0.925; const railLow = 0.615; const inner = LEG_X - 0.03;
  for (const offset of [-0.035, 0.035] as const) {
    const reach = inner - Math.abs(offset);
    group.add(
      tube([offset - reach, railLow, backZ(railLow)], [offset + reach, railTop, backZ(railTop)], 0.02),
      tube([offset + reach, railLow, backZ(railLow)], [offset - reach, railTop, backZ(railTop)], 0.02),
    );
  }
  group.scale.setScalar(CHAIR_SCALE);
  return group;
}

const TABLE_TOP = 1.0;
const TABLE_Y = 0.78;
const TABLE_SPREAD = 1.2;

export function createCoffeeTable(): THREE.Group {
  const group = new THREE.Group(); group.name = "coffee shop square bistro table";

  // Dark wood top over a slightly darker edge band.
  group.add(
    box(TABLE_TOP, 0.05, TABLE_TOP, C.tableEdge, 0, TABLE_Y - 0.025, 0),
    box(TABLE_TOP - 0.02, 0.012, TABLE_TOP - 0.02, C.tableTop, 0, TABLE_Y + 0.006, 0),
  );

  // Steel spider under the top and the single pedestal column.
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const arm = box(0.62, 0.035, 0.05, C.frame, 0, TABLE_Y - 0.068, 0);
    arm.rotation.y = angle; group.add(arm);
  }
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, TABLE_Y - 0.1, 10), toonMaterial(C.frame));
  column.position.y = (TABLE_Y - 0.1) / 2 + 0.03; column.castShadow = true; column.receiveShadow = true;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.08, 12), toonMaterial(C.frame));
  collar.position.y = 0.09; collar.castShadow = true;
  group.add(column, collar);

  // Four-footed X base, arms tapering down toward rubber feet.
  const ARM = 0.44;
  for (let i = 0; i < 4; i += 1) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const dx = Math.cos(angle); const dz = Math.sin(angle);
    group.add(tube([dx * 0.05, 0.08, dz * 0.05], [dx * ARM, 0.035, dz * ARM], 0.055));
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.025, 10), toonMaterial(C.foot));
    foot.position.set(dx * (ARM - 0.02), 0.0125, dz * (ARM - 0.02)); foot.castShadow = true;
    group.add(foot);
  }
  group.scale.set(TABLE_SPREAD, CAFE_TABLE_HEIGHT / TABLE_Y, TABLE_SPREAD);
  return group;
}
