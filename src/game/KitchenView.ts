import * as THREE from "three";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";

/**
 * The bakery kitchen behind the coffee shop, sized for the janitor-scale café
 * people. Metres, floor at y = 0, each piece facing its user along local +z.
 */
const K = PALETTE.kitchen;
export const PREP_TABLE_HEIGHT = 1.15;

function mesh(geometry: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, options: Partial<THREE.MeshToonMaterialParameters> = {}): THREE.Mesh {
  const result = new THREE.Mesh(geometry, toonMaterial(color, options));
  result.position.set(x, y, z); result.castShadow = true; result.receiveShadow = true;
  return result;
}
const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z);
const cylinder = (top: number, bottom: number, height: number, color: number, x: number, y: number, z: number, segments = 14) =>
  mesh(new THREE.CylinderGeometry(top, bottom, height, segments), color, x, y, z);
const scaled = (item: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh => { item.scale.set(x, y, z); return item; };
const legs = (group: THREE.Group, width: number, depth: number, height: number, color: number) => {
  for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2]) group.add(cylinder(0.035, 0.035, height, color, x, height / 2, z, 8));
};

function croissant(x: number, y: number, z: number, turn = 0): THREE.Mesh {
  const piece = mesh(new THREE.TorusGeometry(0.06, 0.032, 8, 10, Math.PI * 1.15), PALETTE.cafe.croissant, x, y + 0.03, z);
  piece.rotation.set(Math.PI / 2, 0, turn); piece.scale.set(1, 1, 0.75);
  return piece;
}
function baguette(x: number, y: number, z: number, turn = 0): THREE.Mesh {
  const loaf = mesh(new THREE.CapsuleGeometry(0.035, 0.42, 4, 10), K.baguette, x, y + 0.035, z);
  loaf.rotation.set(0, turn, Math.PI / 2);
  return loaf;
}

/** Double deck oven with glowing windows, a control strip, and a vent hood. */
export function createKitchenOven(): THREE.Group {
  const group = new THREE.Group(); group.name = "deck oven";
  legs(group, 1.6, 1.0, 0.35, K.steelDark);
  group.add(box(1.8, 2.0, 1.2, K.ovenBody, 0, 1.35, 0), box(1.9, 0.12, 1.3, K.steelDark, 0, 2.41, 0));
  for (const y of [0.85, 1.75]) {
    group.add(box(1.5, 0.62, 0.05, K.ovenDoor, 0, y, 0.61));
    const glow = mesh(new THREE.BoxGeometry(1.1, 0.26, 0.02), K.ovenGlow, 0, y + 0.06, 0.64); glow.material = toonMaterial(K.ovenGlow, {}, true);
    group.add(glow, box(1.2, 0.05, 0.06, K.steel, 0, y - 0.22, 0.68));
    // Loaves baking inside, silhouetted against the glow.
    for (const x of [-0.35, 0, 0.35]) group.add(box(0.22, 0.08, 0.02, K.ovenWindow, x, y + 0.02, 0.652));
  }
  group.add(box(1.8, 0.14, 0.06, K.steel, 0, 2.24, 0.61));
  for (const x of [-0.6, -0.4, -0.2]) { const knob = cylinder(0.035, 0.035, 0.04, K.tileDark, x, 2.24, 0.65, 10); knob.rotation.x = Math.PI / 2; group.add(knob); }
  group.add(box(0.2, 0.08, 0.03, K.ovenGlow, 0.55, 2.24, 0.645));
  // Hood and flue rising into the dark above.
  group.add(box(2.0, 0.5, 1.3, K.steel, 0, 3.05, 0.05), box(0.45, 3.0, 0.45, K.steelDark, 0, 4.8, -0.2));
  return group;
}

/** Wheeled speed rack loaded with trays of croissants, baguettes, and loaves. */
export function createPastryRack(): THREE.Group {
  const group = new THREE.Group(); group.name = "pastry rack";
  for (const x of [-0.37, 0.37]) for (const z of [-0.3, 0.3]) {
    group.add(box(0.035, 2.1, 0.035, K.rack, x, 1.13, z), cylinder(0.05, 0.05, 0.05, K.tileDark, x, 0.04, z, 10));
  }
  group.add(box(0.8, 0.04, 0.64, K.rack, 0, 2.18, 0));
  for (let shelf = 0; shelf < 8; shelf += 1) {
    const y = 0.3 + shelf * 0.24;
    group.add(box(0.72, 0.02, 0.6, K.tray, 0, y, 0));
    const kind = shelf % 3;
    for (let index = 0; index < 3; index += 1) {
      const x = -0.22 + index * 0.22;
      if (kind === 0) { group.add(croissant(x, y, -0.12, index), croissant(x, y, 0.13, index + 1)); }
      else if (kind === 1) group.add(baguette(x, y, 0, Math.PI / 2));
      else group.add(scaled(mesh(new THREE.SphereGeometry(0.09, 10, 8), K.loaf, x, y + 0.05, 0), 1, 0.6, 1.3));
    }
  }
  return group;
}

/** Three-bay stainless sink with drainboards, backsplash, and gooseneck taps. */
export function createKitchenSink(): THREE.Group {
  const group = new THREE.Group(); group.name = "industrial sink";
  legs(group, 2.2, 0.66, 0.8, K.steel);
  group.add(box(2.4, 0.08, 0.72, K.steel, 0, 0.3, 0)); // undershelf
  group.add(box(2.4, 0.36, 0.8, K.steel, 0, 0.98, 0), box(2.4, 0.5, 0.06, K.steel, 0, 1.4, -0.37));
  for (const x of [-0.62, 0, 0.62]) {
    group.add(box(0.52, 0.02, 0.56, K.steelShadow, x, 1.165, 0.02), box(0.5, 0.01, 0.54, K.water, x, 1.13, 0.02));
    const neck = mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 12, Math.PI), K.steel, x, 1.52, -0.24);
    neck.rotation.y = Math.PI / 2; group.add(neck, cylinder(0.02, 0.02, 0.22, K.steel, x, 1.43, -0.34, 8));
  }
  for (const x of [-1.05, 1.05]) group.add(box(0.28, 0.02, 0.7, K.steel, x, 1.17, 0));
  // A stack of mixing bowls and a scrub brush on the drainboard.
  group.add(cylinder(0.14, 0.09, 0.08, K.steelDark, 1.05, 1.22, 0), cylinder(0.12, 0.08, 0.07, K.steel, 1.05, 1.28, 0));
  return group;
}

/** Stainless prep island with dough, a rolling pin, and a tray of shaped croissants. */
export function createPrepTable(): THREE.Group {
  const group = new THREE.Group(); group.name = "prep table";
  legs(group, 2.4, 0.9, PREP_TABLE_HEIGHT - 0.04, K.steel);
  group.add(box(2.6, 0.05, 1.1, K.steel, 0, PREP_TABLE_HEIGHT - 0.025, 0), box(2.4, 0.04, 0.9, K.steelDark, 0, 0.3, 0));
  group.add(scaled(mesh(new THREE.SphereGeometry(0.16, 14, 10), K.dough, -0.55, PREP_TABLE_HEIGHT + 0.07, 0.1), 1.2, 0.55, 1));
  const pin = cylinder(0.035, 0.035, 0.5, K.shelfWood, -0.1, PREP_TABLE_HEIGHT + 0.035, 0.25, 10); pin.rotation.z = Math.PI / 2; group.add(pin);
  group.add(box(0.7, 0.02, 0.5, K.tray, 0.6, PREP_TABLE_HEIGHT + 0.01, -0.1));
  for (let row = 0; row < 2; row += 1) for (let index = 0; index < 3; index += 1) group.add(croissant(0.4 + index * 0.2, PREP_TABLE_HEIGHT, -0.22 + row * 0.24, index));
  // A dusting of flour.
  const flour = mesh(new THREE.CircleGeometry(0.4, 16), K.flourSack, -0.45, PREP_TABLE_HEIGHT + 0.002, 0.05); flour.rotation.x = -Math.PI / 2; flour.castShadow = false;
  group.add(flour);
  // Sacks of flour on the shelf underneath.
  for (const x of [-0.7, 0, 0.7]) group.add(box(0.5, 0.34, 0.4, K.flourSack, x, 0.49, 0));
  return group;
}

/** Wooden dry-goods shelving with jars on top and flour sacks below. */
export function createKitchenShelf(): THREE.Group {
  const group = new THREE.Group(); group.name = "dry goods shelf";
  for (const x of [-0.97, 0.97]) group.add(box(0.06, 2.6, 0.5, K.shelfWood, x, 1.3, 0));
  for (const y of [0.1, 0.9, 1.6, 2.3]) group.add(box(2.0, 0.05, 0.5, K.shelfWood, 0, y, 0));
  for (const x of [-0.6, 0, 0.6]) {
    group.add(box(0.5, 0.6, 0.4, K.flourSack, x, 0.43, 0), box(0.3, 0.14, 0.01, K.sackPrint, x, 0.48, 0.205));
  }
  for (let index = 0; index < 6; index += 1) {
    const x = -0.75 + index * 0.3;
    group.add(cylinder(0.1, 0.1, 0.3, K.jar, x, 1.08, 0), cylinder(0.105, 0.105, 0.04, K.steelDark, x, 1.25, 0));
    group.add(cylinder(0.11, 0.11, 0.24, index % 2 ? PALETTE.cafe.mug : K.steel, x, 1.75, 0));
  }
  return group;
}
