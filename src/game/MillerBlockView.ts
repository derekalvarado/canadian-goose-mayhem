import * as THREE from "three";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";

const C = PALETTE.millerBlock;

/** Five shopfronts side by side, as in the northeast row of the square. */
export const MILLER_BLOCK_BAYS = 5;
const BAY_WIDTH = 7.02;
const WIDTH = BAY_WIDTH * MILLER_BLOCK_BAYS;
const FRONT = 3;
const BACK = -3.4;
const DEPTH = FRONT - BACK;
const GROUND_HEIGHT = 4.3;
const WALL_HEIGHT = 8.9;
const PIER = .9;
/** Display windows sit just behind the piers; only the doors are set well back. */
const SHOPFRONT = FRONT - .3;
const DOOR_LINE = FRONT - 1.5;
const NOOK = 2;
/** Bay that holds the café door (the +x end, which faces the café entrance once the row is turned to the square). */
export const MILLER_BLOCK_CAFE_BAY = MILLER_BLOCK_BAYS - 1;
const AWNINGS = [C.awningGreen, C.awningRed, C.awningGreen, C.awningGreen, C.awningRed];
const WINDOW = { bottom: 5.55, top: 7.65, width: 1 };
const COURSE = .35;

interface Hole { u0: number; u1: number; y0: number; y1: number }

function box(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent: THREE.Object3D, r: number, h: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), toonMaterial(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function rod(parent: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, r: number, color: number): void {
  const dir = to.clone().sub(from);
  const mesh = cylinder(parent, r, dir.length(), color, 0, 0, 0);
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
}

/** Repeatable pseudo-random numbers so the stonework looks the same every load. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stoneColor(rand: () => number): number {
  const r = rand();
  return r < .5 ? C.sandstone : r < .8 ? C.sandstoneLight : C.sandstoneDark;
}

/** A wall face in its own frame: the face is at local z = 0, facing +z, running along x. */
function face(parent: THREE.Object3D, x: number, z: number, rotationY: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotationY;
  parent.add(group);
  return group;
}

/** Rough-cut sandstone in staggered courses, leaving gaps for windows. */
function rusticate(f: THREE.Object3D, u0: number, u1: number, y0: number, y1: number, holes: readonly Hole[], rand: () => number): void {
  for (let y = y0; y < y1 - .05; y += COURSE) {
    const h = Math.min(COURSE, y1 - y);
    const spans: [number, number][] = [];
    let start = u0;
    for (const hole of holes.filter((item) => item.y0 < y + h - .01 && item.y1 > y + .01).sort((a, b) => a.u0 - b.u0)) {
      if (hole.u0 > start) spans.push([start, Math.min(hole.u0, u1)]);
      start = Math.max(start, hole.u1);
    }
    if (start < u1) spans.push([start, u1]);
    for (const [a, b] of spans) {
      let u = a;
      let first = true;
      while (u < b - .04) {
        let len = first ? .3 + rand() * .6 : .6 + rand() * .5;
        first = false;
        if (b - (u + len) < .3) len = b - u;
        const out = .02 + rand() * .05;
        box(f, Math.max(.05, len - .035), h - .035, .1, stoneColor(rand), u + len / 2, y + h / 2, out - .05);
        u += len;
      }
    }
  }
}

/** Tall double-hung window framed by alternating light-stone quoins, a lintel and a sill. */
function upperWindow(f: THREE.Object3D, u: number, holes: Hole[]): void {
  const { bottom, top, width } = WINDOW;
  const h = top - bottom;
  const mid = bottom + h / 2;
  box(f, width, h, .1, C.iron, u, mid, 0);
  box(f, width - .18, h - .18, .04, C.glass, u, mid, .05);
  box(f, width - .1, .08, .08, C.iron, u, mid + .08, .07);
  box(f, .05, h / 2 - .1, .06, C.iron, u, mid + h / 4 + .02, .06);
  for (let i = 0, y = bottom; y < top - .01; i++, y += COURSE) {
    const qh = Math.min(COURSE, top - y);
    for (const side of [-1, 1]) {
      const qw = (i + (side > 0 ? 1 : 0)) % 2 === 0 ? .42 : .28;
      box(f, qw - .03, qh - .03, .14, C.trim, u + side * (width / 2 + qw / 2), y + qh / 2, .02);
    }
  }
  box(f, width + .9, .3, .16, C.trim, u, top + .15, .03);
  box(f, width + .5, .12, .26, C.trim, u, bottom - .06, .08);
  holes.push({ u0: u - width / 2 - .45, u1: u + width / 2 + .45, y0: bottom - .15, y1: top + .3 });
}

/** Bracketed roof cornice with dentils, a projecting crown and iron cresting along the top. */
function cornice(f: THREE.Object3D, u0: number, u1: number, consoles: readonly number[]): void {
  const len = u1 - u0;
  const mid = (u0 + u1) / 2;
  box(f, len, .14, .2, C.cornice, mid, 8.07, .1);
  for (let u = u0 + .1; u < u1 - .05; u += .2) box(f, .1, .12, .12, C.cornice, u, 8.2, .22);
  box(f, len, .55, .16, C.cornice, mid, 8.5, .08);
  const count = Math.max(2, Math.round(len / 1.15));
  const step = (len - .8) / (count - 1);
  for (let i = 0; i < count; i++) {
    const u = u0 + .4 + i * step;
    box(f, .2, .58, .42, C.cornice, u, 8.5, .3);
    box(f, .14, .16, .3, C.cornice, u, 8.15, .24);
    if (i < count - 1) box(f, step - .45, .3, .04, C.iron, u + step / 2, 8.5, .18);
  }
  for (const u of consoles) {
    box(f, .42, 1.15, .62, C.cornice, u, 8.38, .31);
    box(f, .3, .25, .4, C.cornice, u, 7.7, .2);
  }
  box(f, len + .9, .26, 1, C.cornice, mid, 8.9, .3);
  box(f, len + .98, .07, 1.06, C.iron, mid, 9.065, .3);
  for (let u = u0 - .3; u <= u1 + .3; u += .5) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(.045, .24, 6), toonMaterial(C.iron));
    spike.position.set(u, 9.22, .76);
    f.add(spike);
  }
}

/** Cast-iron storefront column with a base, rings and a capital. */
function ironColumn(g: THREE.Object3D, x: number, z: number): void {
  box(g, .34, .55, .34, C.iron, x, .275, z);
  box(g, .37, .06, .37, C.kickPanel, x, .52, z);
  cylinder(g, .085, 3.05, C.iron, x, 2.05, z);
  cylinder(g, .12, .07, C.kickPanel, x, 1.3, z);
  cylinder(g, .12, .07, C.iron, x, 2.75, z);
  box(g, .26, .2, .26, C.iron, x, 3.62, z);
  box(g, .38, .14, .38, C.iron, x, 3.79, z);
  box(g, .3, .1, .3, C.iron, x, 3.91, z);
}

function displayWindow(g: THREE.Object3D, x0: number, x1: number): void {
  const w = x1 - x0;
  const x = (x0 + x1) / 2;
  const z = SHOPFRONT;
  box(g, w, 3.95, SHOPFRONT - DOOR_LINE, C.sandstoneDark, x, 1.975, (SHOPFRONT + DOOR_LINE) / 2);
  box(g, w, .14, .16, C.trim, x, .07, z + .08);
  box(g, w, .58, .08, C.iron, x, .43, z + .04);
  for (let k = 0; k < 4; k++) box(g, w - .3, .05, .04, C.door, x, .26 + k * .11, z + .09);
  box(g, w, .1, .2, C.iron, x, .77, z + .1);
  box(g, w - .12, 2.5, .04, C.glass, x, 2.07, z + .02);
  for (const side of [x0 + .05, x1 - .05]) box(g, .1, 2.5, .12, C.iron, side, 2.07, z + .06);
  box(g, w, .12, .18, C.iron, x, 3.38, z + .09);
  box(g, w - .12, .45, .04, C.glass, x, 3.67, z + .02);
  const panes = Math.max(2, Math.round(w / .55));
  for (let i = 1; i < panes; i++) box(g, .04, .45, .06, C.iron, x0 + i * w / panes, 3.67, z + .05);
  box(g, w, .08, .14, C.iron, x, 3.92, z + .07);
}

/** The recessed entry: tiled floor, glazed side return and a pair of glass doors at the back. */
function doorNook(g: THREE.Object3D, n0: number, n1: number, returnX: number, returnSide: number): void {
  const w = n1 - n0;
  const x = (n0 + n1) / 2;
  const depth = FRONT - DOOR_LINE;
  const zMid = (FRONT + DOOR_LINE) / 2;
  box(g, w, .03, depth, C.tile, x, .015, zMid);
  for (const z of [FRONT - .08, DOOR_LINE + .08]) box(g, w, .032, .12, C.tileDark, x, .016, z);
  for (let i = 0; i < 3; i++) {
    const diamond = box(g, .3, .034, .3, C.tileDark, x - .6 + i * .6, .017, zMid + .15);
    diamond.rotation.y = Math.PI / 4;
  }
  box(g, 1.2, .02, .55, C.mat, x, .045, DOOR_LINE + .45);
  box(g, w, 3.95, .04, C.iron, x, 1.975, DOOR_LINE + .02);
  box(g, 1.75, 3.05, .1, C.iron, x, 1.525, DOOR_LINE + .07);
  for (const s of [-1, 1]) {
    const leaf = x + s * .39;
    box(g, .56, 2, .04, C.glass, leaf, 1.65, DOOR_LINE + .14);
    box(g, .6, .48, .04, C.kickPanel, leaf, .42, DOOR_LINE + .14);
    box(g, .035, .5, .05, C.brass, x + s * .09, 1.3, DOOR_LINE + .19);
  }
  box(g, .06, 2.9, .06, C.iron, x, 1.45, DOOR_LINE + .16);
  box(g, 1.75, .1, .16, C.iron, x, 3, DOOR_LINE + .1);
  box(g, 1.55, .75, .04, C.glass, x, 3.45, DOOR_LINE + .13);
  const rx = returnX + returnSide * .03;
  const returnDepth = SHOPFRONT - DOOR_LINE;
  const returnMid = (SHOPFRONT + DOOR_LINE) / 2;
  box(g, .08, .58, returnDepth, C.iron, rx, .43, returnMid);
  box(g, .04, 2.5, returnDepth - .1, C.glass, rx + returnSide * .02, 2.07, returnMid);
  box(g, .04, .45, returnDepth - .1, C.glass, rx + returnSide * .02, 3.67, returnMid);
  for (const [y, h] of [[.77, .1], [3.38, .12], [3.92, .08]] as const) box(g, .12, h, returnDepth, C.iron, rx, y, returnMid);
  box(g, .1, 3.95, .1, C.iron, rx, 1.975, SHOPFRONT);
  box(g, w, .35, depth, C.iron, x, 4.125, zMid);
}

/** Slanted canvas awning hung from the fascia, held out by thin iron arms. */
function awning(g: THREE.Object3D, x0: number, x1: number, color: number): void {
  const w = x1 - x0 - .12;
  const x = (x0 + x1) / 2;
  const length = 1.55;
  const tilt = .62;
  const drop = length * Math.sin(tilt);
  const out = length * Math.cos(tilt);
  const top = new THREE.Vector3(x, 4.2, FRONT + .03);
  const canvas = box(g, w, .04, length, color, x, top.y - drop / 2, top.z + out / 2);
  canvas.rotation.x = tilt;
  box(g, w, .05, .05, C.iron, x, top.y - drop, top.z + out);
  for (const side of [-1, 1]) {
    const ax = x + side * (w / 2 - .06);
    rod(g, new THREE.Vector3(ax, top.y - drop, top.z + out), new THREE.Vector3(ax, 2.7, FRONT - .02), .016, C.iron);
  }
}

function sign(text: string, width: number, height: number): THREE.Mesh {
  const material = toonMaterial(C.trim);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 160;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = `#${C.cornice.toString(16).padStart(6, "0")}`;
      ctx.fillRect(0, 0, 512, 160);
      ctx.strokeStyle = `#${C.trim.toString(16).padStart(6, "0")}`;
      ctx.lineWidth = 6;
      ctx.strokeRect(14, 14, 484, 132);
      ctx.fillStyle = `#${C.trim.toString(16).padStart(6, "0")}`;
      ctx.font = "bold 40px Georgia";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("1888", 256, 50);
      ctx.fillText(text, 256, 108);
      material.color.set(0xffffff);
      material.map = new THREE.CanvasTexture(canvas);
      material.map.colorSpace = THREE.SRGBColorSpace;
    }
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

/**
 * The Miller Block: one long two-storey rough-cut sandstone building. Its shop
 * doors sit back from the street behind iron columns and stone piers but are
 * still part of the one building. Origin at the middle of the ground
 * footprint; the street side faces local +z.
 */
export function createMillerBlockRow(): THREE.Group {
  const g = new THREE.Group();
  g.name = "Miller Block";
  const rand = seeded(1888);
  const zMid = (FRONT + BACK) / 2;
  const left = -WIDTH / 2;
  const right = WIDTH / 2;

  // Massing: full-depth upper storey; the ground floor stops at the door line.
  box(g, WIDTH, WALL_HEIGHT - GROUND_HEIGHT, DEPTH, C.mortar, 0, (WALL_HEIGHT + GROUND_HEIGHT) / 2, zMid);
  box(g, WIDTH, GROUND_HEIGHT, DOOR_LINE - BACK, C.sandstoneDark, 0, GROUND_HEIGHT / 2, (BACK + DOOR_LINE) / 2);

  const front = face(g, 0, FRONT, 0);
  const piers: number[] = [];
  for (let i = 0; i <= MILLER_BLOCK_BAYS; i++) piers.push(i === 0 ? left + PIER / 2 : i === MILLER_BLOCK_BAYS ? right - PIER / 2 : left + i * BAY_WIDTH);

  // Stone piers between the shops: light base and cap with rough blocks between.
  for (const px of piers) {
    box(g, PIER, GROUND_HEIGHT, DEPTH, C.sandstoneDark, px, GROUND_HEIGHT / 2, zMid);
    box(front, PIER + .06, .5, .16, C.trim, px, .25, .05);
    for (let row = 0, y = .5; y < 3.5; row++, y += .4) {
      const color = row % 3 === 2 ? C.trim : stoneColor(rand);
      box(front, PIER - .04, .37, .12, color, px, y + .2, .01 + rand() * .04);
    }
    box(front, PIER + .1, .4, .18, C.trim, px, 3.75, .06);
  }

  for (let bay = 0; bay < MILLER_BLOCK_BAYS; bay++) {
    const a = piers[bay] + PIER / 2;
    const c = piers[bay + 1] - PIER / 2;
    const doorAtLow = bay % 2 === 0;
    const [n0, n1] = doorAtLow ? [a, a + NOOK] : [c - NOOK, c];
    const [d0, d1] = doorAtLow ? [a + NOOK, c] : [a, c - NOOK];
    const dm = (d0 + d1) / 2;
    const color = AWNINGS[bay];

    displayWindow(g, d0, dm);
    displayWindow(g, dm, d1);
    doorNook(g, n0, n1, doorAtLow ? d0 : d1, doorAtLow ? -1 : 1);
    box(g, c - a, .35, FRONT - SHOPFRONT + .02, C.iron, (a + c) / 2, 4.125, (FRONT + SHOPFRONT) / 2);
    for (const x of [doorAtLow ? d0 : d1, dm]) ironColumn(g, x, FRONT - .2);
    awning(g, d0, dm, color);
    awning(g, dm, d1, color);
    awning(g, n0, n1, color);
  }

  // Storefront entablature: dark iron band with dentils and a projecting cornice.
  box(front, WIDTH + .3, .26, .4, C.iron, 0, 4.43, .1);
  box(front, WIDTH + .3, .32, .3, C.cornice, 0, 4.72, .05);
  for (let u = left + .1; u < right; u += .22) box(front, .1, .1, .1, C.cornice, u, 4.83, .25);
  box(front, WIDTH + .5, .16, .62, C.cornice, 0, 4.96, .2);
  box(front, WIDTH + .56, .06, .66, C.iron, 0, 5.07, .21);
  for (const px of piers) box(front, .36, .7, .45, C.cornice, px, 4.62, .2);

  // Upper storey: three tall windows per shop in rough-cut stone, then the roof cornice.
  const frontHoles: Hole[] = [];
  for (let bay = 0; bay < MILLER_BLOCK_BAYS; bay++) {
    const cx = left + (bay + .5) * BAY_WIDTH;
    for (const offset of [-2.2, 0, 2.2]) upperWindow(front, cx + offset, frontHoles);
  }
  box(front, WIDTH + .1, .15, .14, C.trim, 0, 5.32, .07);
  rusticate(front, left, right, 5.4, 8, frontHoles, rand);
  cornice(front, left, right, piers);

  // Raised name plate over the middle of the row.
  box(front, 4.8, 1.5, .5, C.cornice, 0, 9.85, .05);
  box(front, 5.1, .2, .7, C.cornice, 0, 10.68, .1);
  for (const u of [-2.4, 2.4]) {
    const finial = new THREE.Mesh(new THREE.ConeGeometry(.12, .5, 8), toonMaterial(C.iron));
    finial.position.set(u, 11.03, .1);
    front.add(finial);
  }
  const plate = sign("MILLER BLOCK", 4.2, 1.3);
  plate.position.set(0, 9.85, .31);
  front.add(plate);

  // Ends: the same rough stone and windows, so the corners read from any angle.
  const ends = [
    { f: face(g, right, 0, Math.PI / 2), u0: -FRONT, u1: -BACK, windows: [-.6, 1.8], corner: -FRONT },
    { f: face(g, left, 0, -Math.PI / 2), u0: BACK, u1: FRONT, windows: [-1.8, .6], corner: FRONT },
  ];
  for (const end of ends) {
    const holes: Hole[] = [];
    for (const u of end.windows) upperWindow(end.f, u, holes);
    box(end.f, end.u1 - end.u0, .5, .14, C.trim, (end.u0 + end.u1) / 2, .25, .05);
    box(end.f, end.u1 - end.u0, .15, .14, C.trim, (end.u0 + end.u1) / 2, 5.32, .07);
    rusticate(end.f, end.u0, end.u1, .5, 5.25, [], rand);
    rusticate(end.f, end.u0, end.u1, 5.4, 8, holes, rand);
    cornice(end.f, end.u0, end.u1, [end.corner]);
  }

  // Back: plain wall under a matching crown.
  box(g, WIDTH + .9, .26, .6, C.cornice, 0, 8.9, BACK - .1);
  box(g, WIDTH, .5, .14, C.trim, 0, .25, BACK - .05);

  // Roof: tar roof with chimneys, hatches and units, since the game camera looks down on it.
  box(g, WIDTH - .2, .12, DEPTH - .2, C.roof, 0, WALL_HEIGHT + .06, zMid);
  for (let bay = 0; bay < MILLER_BLOCK_BAYS; bay++) {
    const cx = left + (bay + .5) * BAY_WIDTH;
    if (bay % 2 === 0) {
      box(g, .9, 1.3, .6, C.sandstone, cx + 2.6, WALL_HEIGHT + .65, BACK + .7);
      box(g, 1.05, .12, .75, C.trim, cx + 2.6, WALL_HEIGHT + 1.36, BACK + .7);
    }
    box(g, 1, .25, 1, C.iron, cx - 1.5, WALL_HEIGHT + .24, zMid - .4);
    if (bay % 2 === 1) {
      box(g, 1.6, .8, 1.1, C.kickPanel, cx + 1, WALL_HEIGHT + .52, zMid + .3);
      cylinder(g, .35, .06, C.iron, cx + 1, WALL_HEIGHT + .95, zMid + .3);
    }
  }
  return g;
}
