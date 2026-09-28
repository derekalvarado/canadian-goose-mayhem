import * as THREE from "three";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";
import type { WorldEntityState } from "./simulation/Simulation.ts";

/**
 * Coffee-shop counter, back bar, and the small props the goose can play with.
 * Metres, ground (or the top the prop rests on) at y = 0. Counter pieces face
 * their customers along local +z. Props that change with gameplay expose
 * `userData.syncState(entity)`; animated ones expose `userData.update(delta)`.
 */
const C = PALETTE.cafe;
export const CAFE_COUNTER_HEIGHT = 1.23;

function mesh(geometry: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, options: Partial<THREE.MeshToonMaterialParameters> = {}): THREE.Mesh {
  const result = new THREE.Mesh(geometry, toonMaterial(color, options));
  result.position.set(x, y, z); result.castShadow = true; result.receiveShadow = true;
  return result;
}
const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z);
const cylinder = (top: number, bottom: number, height: number, color: number, x: number, y: number, z: number, segments = 18) =>
  mesh(new THREE.CylinderGeometry(top, bottom, height, segments), color, x, y, z);

export type SyncState = (entity: WorldEntityState) => void;
export type UpdatePresentation = (delta: number) => void;

// --- Counter and back bar --------------------------------------------------------------------------

export function createCafeCounter(): THREE.Group {
  const group = new THREE.Group(); group.name = "coffee shop order counter";
  const top = CAFE_COUNTER_HEIGHT;
  group.add(
    box(6.2, top - 0.1, 1.3, C.counterFront, 0, (top - 0.1) / 2, 0),
    box(6.1, 0.14, 1.2, C.backBar, 0, 0.07, -0.02), // recessed toe kick
    box(6.44, 0.09, 1.46, C.counterTop, 0, top - 0.045, 0),
  );
  // Raised wood panels across the customer side, with a pale tile band below them.
  for (let index = 0; index < 6; index += 1) {
    group.add(box(0.86, 0.62, 0.04, C.counterPanel, -2.6 + index * 1.04, 0.72, 0.665));
  }
  group.add(box(6.2, 0.22, 0.03, C.counterTile, 0, 0.26, 0.662));
  // Register and card reader on the barista's side, near the ordering end.
  const register = new THREE.Group(); register.position.set(1.8, top, -0.35);
  register.add(box(0.44, 0.16, 0.36, PALETTE.coffee.metal, 0, 0.08, 0), box(0.4, 0.26, 0.04, C.laptopScreen, 0, 0.3, -0.06));
  register.children[1].rotation.x = -0.35;
  group.add(register);
  // A little "pick up" sign at the far end, where finished orders wait.
  const sign = new THREE.Group(); sign.position.set(-2.5, top, 0.3);
  sign.add(box(0.03, 0.34, 0.03, C.chromeDark, 0, 0.17, 0), box(0.34, 0.16, 0.02, C.label, 0, 0.36, 0), box(0.22, 0.025, 0.021, C.note, 0, 0.37, 0.002));
  group.add(sign);
  // Napkins and a stack of spare lids so the counter reads as a working café.
  group.add(box(0.18, 0.12, 0.12, C.chromeDark, 0.9, top + 0.06, 0.45), box(0.14, 0.1, 0.02, C.plate, 0.9, top + 0.1, 0.45));
  group.add(cylinder(0.065, 0.065, 0.14, C.cupLid, -1.2, top + 0.07, -0.3));
  return group;
}

export function createCafeBackBar(): THREE.Group {
  const group = new THREE.Group(); group.name = "espresso back bar";
  const top = CAFE_COUNTER_HEIGHT;
  group.add(box(6.2, top - 0.06, 0.6, C.backBar, 0, (top - 0.06) / 2, 0), box(6.3, 0.07, 0.66, C.counterTop, 0, top - 0.035, 0));
  for (let index = 0; index < 5; index += 1) group.add(box(1.1, 0.8, 0.03, C.counterPanel, -2.44 + index * 1.22, 0.58, 0.305));
  // Espresso machine: red body, chrome top, two group heads with portafilters.
  const machine = new THREE.Group(); machine.position.set(0, top, -0.05); machine.name = "espresso machine";
  machine.add(
    box(1.0, 0.5, 0.48, C.machineBody, 0, 0.25, 0),
    box(1.04, 0.06, 0.52, C.chrome, 0, 0.53, 0),
    box(0.96, 0.04, 0.3, C.chromeDark, 0, 0.02, 0.28), // drip tray
  );
  for (const x of [-0.25, 0.25]) {
    machine.add(cylinder(0.06, 0.07, 0.1, C.chrome, x, 0.3, 0.27), box(0.04, 0.03, 0.2, C.grinder, x, 0.25, 0.4));
  }
  machine.add(cylinder(0.035, 0.035, 0.08, C.cupPaper, -0.25, 0.08, 0.3), cylinder(0.035, 0.035, 0.08, C.cupPaper, 0.25, 0.08, 0.3));
  for (const x of [-0.36, 0.36]) {
    const gauge = cylinder(0.05, 0.05, 0.02, C.label, x, 0.4, 0.245); gauge.rotation.x = Math.PI / 2; machine.add(gauge);
  }
  group.add(machine);
  // Grinder with its bean hopper.
  group.add(box(0.26, 0.4, 0.28, C.grinder, 0.85, top + 0.2, -0.05), cylinder(0.14, 0.08, 0.24, C.glass, 0.85, top + 0.52, -0.05));
  // Wall shelves with mugs and jars above the bar.
  for (const y of [2.05, 2.7]) {
    group.add(box(5.6, 0.05, 0.32, C.shelf, 0, y, -0.14));
    for (let index = 0; index < 7; index += 1) {
      const x = -2.4 + index * 0.8;
      if ((index + (y > 2.2 ? 1 : 0)) % 2 === 0) group.add(cylinder(0.08, 0.08, 0.14, C.mug, x, y + 0.095, -0.14));
      else group.add(cylinder(0.09, 0.09, 0.22, C.glass, x, y + 0.135, -0.14), cylinder(0.085, 0.085, 0.12, C.croissantDark, x, y + 0.085, -0.14));
    }
  }
  return group;
}

// --- Props -----------------------------------------------------------------------------------------

export function createTipJar(): THREE.Group {
  const group = new THREE.Group(); group.name = "tip jar";
  group.add(
    cylinder(0.075, 0.07, 0.07, C.coinsDark, 0, 0.04, 0),
    cylinder(0.07, 0.07, 0.03, C.coins, 0, 0.085, 0),
    mesh(new THREE.CylinderGeometry(0.1, 0.095, 0.26, 20, 1, true), C.glass, 0, 0.13, 0, { transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    cylinder(0.103, 0.098, 0.07, C.label, 0, 0.15, 0),
    mesh(new THREE.TorusGeometry(0.098, 0.012, 6, 20), C.glass, 0, 0.26, 0),
  );
  group.children[4].rotation.x = Math.PI / 2;
  // A folded bill poking out of the top, so it reads as money from far away.
  const bill = box(0.08, 0.1, 0.01, 0x88a86a, 0.02, 0.26, 0); bill.rotation.z = 0.3; group.add(bill);
  return group;
}

export function createCroissant(): THREE.Group {
  const group = new THREE.Group(); group.name = "croissant";
  const body = mesh(new THREE.TorusGeometry(0.085, 0.045, 10, 14, Math.PI * 1.15), C.croissant, 0, 0.04, 0);
  body.rotation.set(Math.PI / 2, 0, -Math.PI * 0.075); body.scale.set(1, 1, 0.75);
  group.add(body);
  // Darker baked ridges across the crescent.
  for (let index = 0; index < 5; index += 1) {
    const angle = -Math.PI * 0.08 + index * Math.PI * 0.26;
    const ridge = mesh(new THREE.TorusGeometry(0.047, 0.008, 5, 10), C.croissantDark, Math.cos(angle) * 0.085, 0.045, -Math.sin(angle) * 0.085);
    ridge.rotation.y = angle; group.add(ridge);
  }
  return group;
}

export function createPlate(): THREE.Group {
  const group = new THREE.Group(); group.name = "plate";
  group.add(cylinder(0.16, 0.12, 0.02, C.plate, 0, 0.01, 0, 24));
  return group;
}

function createPuddle(radius: number): THREE.Mesh {
  const puddle = mesh(new THREE.CircleGeometry(radius, 16), C.puddle, 0, 0.006, 0);
  puddle.rotation.x = -Math.PI / 2; puddle.scale.set(1, 0.7, 1); puddle.castShadow = false; puddle.visible = false;
  return puddle;
}

/** A drink tips over and leaves a puddle when it is spilled. */
function drinkState(group: THREE.Group, cup: THREE.Group, surface: THREE.Mesh, lid: THREE.Object3D | undefined, puddle: THREE.Mesh): SyncState {
  return (entity) => {
    const spilled = entity.condition === "spilled";
    const held = entity.holderId !== undefined;
    cup.rotation.set(0, 0, spilled && !held ? Math.PI / 2 : 0);
    cup.position.y = spilled && !held ? 0.06 : 0;
    surface.visible = entity.condition === "full";
    if (lid) lid.visible = entity.condition === "full";
    puddle.visible = spilled && !held;
    group.userData.condition = entity.condition;
  };
}

export function createMug(): THREE.Group {
  const group = new THREE.Group(); group.name = "coffee mug";
  const cup = new THREE.Group();
  cup.add(cylinder(0.062, 0.058, 0.11, C.mug, 0, 0.055, 0), cylinder(0.063, 0.063, 0.018, C.mugStripe, 0, 0.075, 0));
  const handle = mesh(new THREE.TorusGeometry(0.032, 0.01, 6, 12, Math.PI), C.mug, 0.062, 0.058, 0); handle.rotation.z = -Math.PI / 2; cup.add(handle);
  const surface = cylinder(0.054, 0.054, 0.005, C.coffee, 0, 0.1, 0);
  cup.add(surface);
  const puddle = createPuddle(0.16);
  group.add(cup, puddle);
  group.userData.syncState = drinkState(group, cup, surface, undefined, puddle);
  return group;
}

export function createOrderCup(): THREE.Group {
  const group = new THREE.Group(); group.name = "coffee order";
  const cup = new THREE.Group();
  cup.add(cylinder(0.058, 0.044, 0.16, C.cupPaper, 0, 0.08, 0), cylinder(0.056, 0.05, 0.05, C.cupSleeve, 0, 0.085, 0));
  const lid = new THREE.Group();
  lid.add(cylinder(0.062, 0.062, 0.02, C.cupLid, 0, 0.17, 0), cylinder(0.035, 0.05, 0.02, C.cupLid, 0, 0.188, 0));
  const surface = cylinder(0.054, 0.054, 0.004, C.coffee, 0, 0.155, 0);
  cup.add(surface, lid);
  const puddle = createPuddle(0.18);
  group.add(cup, puddle);
  group.userData.syncState = drinkState(group, cup, surface, lid, puddle);
  return group;
}

export function createLaptop(): THREE.Group {
  const group = new THREE.Group(); group.name = "laptop";
  group.add(box(0.36, 0.02, 0.25, C.laptop, 0, 0.01, 0), box(0.3, 0.004, 0.12, C.laptopScreen, 0, 0.022, -0.03));
  const lid = new THREE.Group(); lid.position.set(0, 0.02, 0.12); lid.rotation.x = 0.28;
  lid.add(box(0.36, 0.24, 0.014, C.laptop, 0, 0.12, 0), box(0.32, 0.2, 0.004, C.laptopGlow, 0, 0.125, -0.009));
  group.add(lid);
  return group;
}

/** A wooden valve radio on a little side table; its dial glows and notes drift up while it plays. */
export function createCafeRadio(): THREE.Group {
  const group = new THREE.Group(); group.name = "café radio";
  group.add(box(0.84, 0.05, 0.52, C.stand, 0, 0.8, 0));
  for (const [x, z] of [[-0.36, -0.2], [0.36, -0.2], [-0.36, 0.2], [0.36, 0.2]]) group.add(box(0.05, 0.8, 0.05, C.stand, x, 0.4, z));
  group.add(box(0.76, 0.03, 0.44, C.stand, 0, 0.18, 0));
  const radio = new THREE.Group(); radio.position.y = 0.825;
  radio.add(box(0.62, 0.36, 0.3, C.radioBody, 0, 0.18, 0));
  const crown = mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.3, 20, 1, false, 0, Math.PI), C.radioBody, 0, 0.36, 0);
  crown.rotation.set(Math.PI / 2, 0, Math.PI / 2); crown.scale.set(1, 1, 0.5); radio.add(crown);
  radio.add(box(0.34, 0.26, 0.02, C.radioGrill, -0.08, 0.24, 0.151));
  for (let index = 0; index < 4; index += 1) radio.add(box(0.3, 0.012, 0.022, C.radioBody, -0.08, 0.15 + index * 0.06, 0.153));
  const dial = cylinder(0.055, 0.055, 0.02, C.radioOff, 0.2, 0.25, 0.155); dial.rotation.x = Math.PI / 2; radio.add(dial);
  for (const x of [0.15, 0.25]) { const knob = cylinder(0.022, 0.022, 0.03, C.stand, x, 0.1, 0.16); knob.rotation.x = Math.PI / 2; radio.add(knob); }
  group.add(radio);
  const dialOn = toonMaterial(C.radioLight, {}, true); const dialOff = toonMaterial(C.radioOff);
  // Two little notes bob upward while music plays.
  const notes = [0, 1].map((index) => {
    const note = new THREE.Group();
    note.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), C.note, 0, 0, 0), box(0.012, 0.12, 0.012, C.note, 0.03, 0.06, 0));
    note.children[0].scale.set(1.2, 0.85, 0.6); note.userData.phase = index * 0.5; group.add(note);
    return note;
  });
  let playing = true; let clock = 0;
  group.userData.syncState = ((entity) => {
    playing = entity.active !== false;
    dial.material = playing ? dialOn : dialOff;
  }) satisfies SyncState;
  group.userData.update = ((delta) => {
    clock += delta;
    for (const note of notes) {
      const t = (clock * 0.45 + (note.userData.phase as number)) % 1;
      note.visible = playing;
      note.position.set(Math.sin((t + (note.userData.phase as number)) * Math.PI * 2) * 0.12, 1.35 + t * 0.7, 0.05);
      note.scale.setScalar(t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1);
    }
  }) satisfies UpdatePresentation;
  return group;
}

/** A brass counter bell that shivers for a moment after it is rung. */
export function createServiceBell(): THREE.Group {
  const group = new THREE.Group(); group.name = "service bell";
  group.add(cylinder(0.09, 0.1, 0.03, C.bellBase, 0, 0.015, 0, 20));
  const dome = new THREE.Group(); dome.position.y = 0.03;
  const shell = mesh(new THREE.SphereGeometry(0.075, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.bellBrass);
  dome.add(shell, cylinder(0.012, 0.012, 0.03, C.bellBrass, 0, 0.085, 0), mesh(new THREE.SphereGeometry(0.018, 8, 6), C.bellBrass, 0, 0.1, 0));
  group.add(dome);
  let ringing = false; let clock = 0;
  group.userData.syncState = ((entity) => {
    if (entity.active && !ringing) clock = 0;
    ringing = entity.active === true;
  }) satisfies SyncState;
  group.userData.update = ((delta) => {
    clock += delta;
    const wobble = ringing ? Math.sin(clock * 38) * 0.12 * Math.max(0, 1 - clock / 0.8) : 0;
    dome.rotation.set(wobble, 0, wobble * 0.6);
  }) satisfies UpdatePresentation;
  return group;
}

/** A folded broadsheet a reader holds in both hands; attached by the character view. */
export function createNewspaper(): THREE.Group {
  const group = new THREE.Group(); group.name = "newspaper";
  for (const side of [-1, 1]) {
    const page = box(0.3, 0.42, 0.008, C.newspaper, side * 0.15, 0, 0); page.rotation.y = side * 0.22;
    page.position.z = 0.03; group.add(page);
    for (let line = 0; line < 6; line += 1) {
      const text = box(0.22, 0.018, 0.002, C.newsprint, side * 0.15, 0.14 - line * 0.05, 0.0);
      text.rotation.y = side * 0.22; text.position.z = 0.03 + (side < 0 ? 0.006 : 0.006); group.add(text);
    }
  }
  return group;
}

/** A damp cloth for wiping tables; attached to the barista's hand while she wipes. */
export function createWipingCloth(): THREE.Group {
  const group = new THREE.Group(); group.name = "wiping cloth";
  group.add(box(0.16, 0.02, 0.12, C.label, 0, 0, 0));
  return group;
}
