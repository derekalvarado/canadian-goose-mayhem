import * as THREE from "three";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";

/**
 * Photo-informed Old Town wire bike rack: two angle-iron ground rails and six
 * hairpin wheel slots that lean back from the front rail, each propped by a
 * pair of uprights from the back rail. The fourth slot has been knocked into a
 * kink near the bottom.
 * Local +z is the open side bikes roll in from; the back rail can sit against a wall.
 */
const C = PALETTE.bikeRack;
const LENGTH = 2.4;
const SLOTS = 6;
const SLOT_SPACING = 0.42;
const FRONT_Z = 0.27;
const BACK_Z = -0.22;
const RAIL_Y = 0.035;
const APEX_Z = -0.32;
const APEX_Y = 0.78;
const STRAND_GAP = 0.035;
const ROD_R = 0.013;
const BENT_SLOT = 3;
const UP = new THREE.Vector3(0, 1, 0);

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}

function rod(from: THREE.Vector3, to: THREE.Vector3, color: number = C.steel): THREE.Mesh {
  const dir = to.clone().sub(from); const length = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(ROD_R, ROD_R, length, 8), toonMaterial(color));
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  m.castShadow = true;
  return m;
}

/** Angle iron: a flat foot on the paving and a short upright flange the wire is welded to. */
function rail(z: number, flangeSide: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  g.add(box(LENGTH, 0.008, 0.045, C.rail, 0, 0.004, z));
  g.add(box(LENGTH, 0.045, 0.008, C.rail, 0, 0.0225, z + flangeSide * 0.0185));
  // Rust bleeding along the foot where water sits.
  g.add(box(LENGTH * 0.96, 0.002, 0.03, C.rust, 0, 0.009, z - flangeSide * 0.004));
  return g;
}

/** The rounded top of a hairpin: a half ring joining the two strands across the slot. */
function apexBend(center: THREE.Vector3, along: THREE.Vector3, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.TorusGeometry(STRAND_GAP, ROD_R, 6, 10, Math.PI), toonMaterial(color));
  const x = new THREE.Vector3(1, 0, 0);
  const normal = new THREE.Vector3().crossVectors(x, along).normalize();
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, along, normal));
  m.position.copy(center);
  m.castShadow = true;
  return m;
}

function slot(x: number, bent: boolean): THREE.Group {
  const g = new THREE.Group();
  g.position.x = x;
  const color = bent ? C.steelShade : C.steel;
  const apex = new THREE.Vector3(0, bent ? APEX_Y - 0.06 : APEX_Y, APEX_Z + (bent ? 0.03 : 0));
  const foot = new THREE.Vector3(0, RAIL_Y, FRONT_Z);
  const along = apex.clone().sub(foot).normalize();
  for (const side of [-1, 1]) {
    const sx = side * STRAND_GAP;
    const top = apex.clone().setX(sx);
    if (bent) {
      // Shoved down by a bumper: the strand kinks flat just above the rail.
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx, RAIL_Y, FRONT_Z),
        new THREE.Vector3(sx, 0.13, FRONT_Z - 0.02),
        new THREE.Vector3(sx, 0.17, FRONT_Z - 0.12),
        new THREE.Vector3(sx, 0.25, FRONT_Z - 0.22),
        top,
      ], false, "catmullrom", 0.2);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, ROD_R, 6), toonMaterial(color));
      m.castShadow = true; g.add(m);
    } else {
      g.add(rod(new THREE.Vector3(sx, RAIL_Y, FRONT_Z), top, color));
    }
    // Upright from the back rail to where it meets the strand.
    const t = (BACK_Z - FRONT_Z) / (apex.z - FRONT_Z);
    const meetY = RAIL_Y + t * (apex.y - RAIL_Y);
    g.add(rod(new THREE.Vector3(sx, RAIL_Y, BACK_Z), new THREE.Vector3(sx, meetY, BACK_Z), color));
  }
  g.add(apexBend(apex, along, color));
  return g;
}


export function createBikeRack(): THREE.Group {
  const g = new THREE.Group();
  g.name = "Bike rack";
  g.add(rail(FRONT_Z, -1), rail(BACK_Z, 1));
  const firstX = -((SLOTS - 1) * SLOT_SPACING) / 2;
  for (let i = 0; i < SLOTS; i++) g.add(slot(firstX + i * SLOT_SPACING, i === BENT_SLOT));
  return g;
}
