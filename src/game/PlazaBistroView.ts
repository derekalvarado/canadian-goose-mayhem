import * as THREE from "three";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";

/**
 * Photo-informed Old Town Square bistro set: a small square steel-blue folding
 * table on X-crossed legs, flanked by two folding chairs with slatted seats and
 * two curved back slats. Chairs face local -z with the backrest toward +z, and
 * sit on either side of the table along x, facing each other.
 */
const C = PALETTE.plazaBistro;
const UP = new THREE.Vector3(0, 1, 0);

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}

/** A thin round steel rod running between two points. */
function rod(from: THREE.Vector3Tuple, to: THREE.Vector3Tuple, radius = 0.016, color: number = C.frame): THREE.Mesh {
  const a = new THREE.Vector3(...from); const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a); const length = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 6), toonMaterial(color));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** A flat rounded-corner plate, used for the table top. */
function roundedPlate(size: number, radius: number, thickness: number, color: number): THREE.Mesh {
  const h = size / 2; const r = radius;
  const shape = new THREE.Shape();
  shape.moveTo(-h + r, -h);
  shape.lineTo(h - r, -h); shape.quadraticCurveTo(h, -h, h, -h + r);
  shape.lineTo(h, h - r); shape.quadraticCurveTo(h, h, h - r, h);
  shape.lineTo(-h + r, h); shape.quadraticCurveTo(-h, h, -h, h - r);
  shape.lineTo(-h, -h + r); shape.quadraticCurveTo(-h, -h, -h + r, -h);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 4 });
  geometry.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geometry, toonMaterial(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

const TABLE_SIZE = 0.8;
const TABLE_Y = 0.76;

export function createBistroTable(): THREE.Group {
  const group = new THREE.Group(); group.name = "plaza folding bistro table";

  // Thin steel top with a slightly darker rolled rim underneath.
  const rim = roundedPlate(TABLE_SIZE, 0.07, 0.035, C.frameShade);
  rim.position.y = TABLE_Y - 0.035;
  const top = roundedPlate(TABLE_SIZE - 0.02, 0.06, 0.012, C.top);
  top.position.y = TABLE_Y;
  group.add(rim, top);

  // Two side frames, each an X of legs seen from the side, joined by
  // stretchers so the set reads as the classic folding bistro table.
  const legX = TABLE_SIZE / 2 - 0.08;
  const topZ = TABLE_SIZE / 2 - 0.1;
  const footZ = TABLE_SIZE / 2 - 0.02;
  for (const side of [-1, 1] as const) {
    const x = side * legX;
    group.add(
      rod([x, TABLE_Y - 0.035, -topZ], [x, 0, footZ], 0.018),
      rod([x, TABLE_Y - 0.035, topZ], [x, 0, -footZ], 0.018),
      // Rail under the top along each side.
      rod([x, TABLE_Y - 0.05, -topZ], [x, TABLE_Y - 0.05, topZ], 0.014),
    );
    for (const end of [-1, 1] as const) {
      const foot = box(0.045, 0.02, 0.045, C.foot, x, 0.01, end * footZ);
      group.add(foot);
    }
  }
  // Cross stretchers between the side frames: one high, and the folding brace.
  group.add(
    rod([-legX, TABLE_Y - 0.05, -topZ], [legX, TABLE_Y - 0.05, -topZ], 0.014),
    rod([-legX, TABLE_Y - 0.05, topZ], [legX, TABLE_Y - 0.05, topZ], 0.014),
  );
  // The folding brace meets one leg of each X partway down.
  const braceY = 0.24; const t = (TABLE_Y - 0.035 - braceY) / (TABLE_Y - 0.035);
  const braceZ = -topZ + t * (footZ + topZ);
  group.add(rod([-legX, braceY, braceZ], [legX, braceY, braceZ], 0.013));
  return group;
}

const SEAT_Y = 0.45;
const SEAT_W = 0.4;
const SEAT_FRONT_Z = -0.2;
const SEAT_BACK_Z = 0.17;
const BACK_TOP_Y = 0.88;
const BACK_TOP_Z = 0.3;

/** The back posts rake rearward; this is their z at a given height. */
function backZ(y: number): number {
  return SEAT_BACK_Z + ((y - SEAT_Y) / (BACK_TOP_Y - SEAT_Y)) * (BACK_TOP_Z - SEAT_BACK_Z);
}

export function createBistroChair(): THREE.Group {
  const group = new THREE.Group(); group.name = "plaza folding bistro chair";
  const halfW = SEAT_W / 2;

  // Slatted seat: five slats running front to back on a thin frame.
  const slats = 5; const gap = 0.012;
  const slatW = (SEAT_W - gap * (slats - 1)) / slats;
  for (let i = 0; i < slats; i += 1) {
    const x = -halfW + slatW / 2 + i * (slatW + gap);
    group.add(box(slatW, 0.018, SEAT_BACK_Z - SEAT_FRONT_Z, C.slat, x, SEAT_Y, (SEAT_FRONT_Z + SEAT_BACK_Z) / 2));
  }
  group.add(
    rod([-halfW, SEAT_Y - 0.02, SEAT_FRONT_Z], [halfW, SEAT_Y - 0.02, SEAT_FRONT_Z], 0.014),
    rod([-halfW, SEAT_Y - 0.02, SEAT_BACK_Z], [halfW, SEAT_Y - 0.02, SEAT_BACK_Z], 0.014),
  );

  for (const side of [-1, 1] as const) {
    const x = side * (halfW + 0.012);
    // Rear leg and back post in one raked piece: from the front foot, crossing
    // under the seat, up to the top of the back.
    group.add(
      rod([x, 0, -0.24], [x, SEAT_Y - 0.02, SEAT_BACK_Z]),
      rod([x, SEAT_Y - 0.02, SEAT_BACK_Z], [x, BACK_TOP_Y, BACK_TOP_Z]),
      // The other half of the X: from the rear foot up to the front of the seat.
      rod([x, 0, 0.22], [x, SEAT_Y - 0.02, SEAT_FRONT_Z]),
      // Seat side rail.
      rod([x, SEAT_Y - 0.02, SEAT_FRONT_Z], [x, SEAT_Y - 0.02, SEAT_BACK_Z], 0.014),
    );
    group.add(
      box(0.035, 0.02, 0.04, C.foot, x, 0.01, -0.24),
      box(0.035, 0.02, 0.04, C.foot, x, 0.01, 0.22),
    );
  }
  // Low stretcher between the rear feet, as on the folding frame.
  group.add(rod([-halfW, 0.12, 0.17], [halfW, 0.12, 0.17], 0.012));

  // Two wide back slats, bowed slightly rearward, following the post rake.
  const backTilt = Math.atan2(BACK_TOP_Z - SEAT_BACK_Z, BACK_TOP_Y - SEAT_Y);
  for (const y of [0.83, 0.7] as const) {
    const slat = new THREE.Group();
    const segments = 4; const width = SEAT_W + 0.02; const bow = 0.025;
    for (let i = 0; i < segments; i += 1) {
      const t = (i + 0.5) / segments - 0.5;
      const piece = box(width / segments + 0.004, 0.075, 0.016, C.slat, t * width, 0, bow * (1 - 4 * t * t));
      piece.rotation.y = -Math.atan(bow * -8 * t / width);
      slat.add(piece);
    }
    slat.position.set(0, y, backZ(y));
    slat.rotation.x = backTilt;
    group.add(slat);
  }
  return group;
}

/** Table with two chairs facing each other across it, as seen in the square. */
export function createBistroSet(): THREE.Group {
  const group = new THREE.Group(); group.name = "plaza bistro set";
  group.add(createBistroTable());
  for (const side of [-1, 1] as const) {
    const chair = createBistroChair();
    // Chairs face the table: local -z points toward the origin.
    chair.position.set(side * 0.64, 0, 0);
    chair.rotation.y = side * Math.PI / 2;
    group.add(chair);
  }
  return group;
}
