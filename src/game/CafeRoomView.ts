import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";

/**
 * The coffee shop's shell: an old plank floor, tall black walls that hide the
 * town outside, the front door, a doorway through to the kitchen, the kitchen's
 * tiled floor, and the chalk menu board. Metres, floor at y = 0.
 */
export const CAFE_WALL_HEIGHT = 20;
const WALL_THICKNESS = 0.36;
const C = PALETTE.coffee;

function mesh(geometry: THREE.BufferGeometry, color: number, castShadow = true): THREE.Mesh {
  const result = new THREE.Mesh(geometry, toonMaterial(color));
  result.castShadow = castShadow; result.receiveShadow = true;
  return result;
}
function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, castShadow = true): THREE.Mesh {
  const result = mesh(new THREE.BoxGeometry(w, h, d), color, castShadow);
  result.position.set(x, y, z);
  return result;
}
/** Many boxes of one color merged into a single mesh. */
function mergedBoxes(boxes: readonly (readonly [w: number, h: number, d: number, x: number, y: number, z: number])[], color: number): THREE.Mesh {
  const geometry = mergeGeometries(boxes.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)))!;
  return mesh(geometry, color, false);
}
/** Deterministic 0..1 noise so the floor looks the same on every load. */
const hash = (a: number, b: number): number => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/** Narrow early-1900s floorboards in three tones, butt joints staggered row to row. */
export function createCafeFloor(width = 18, depth = 14): THREE.Group {
  const group = new THREE.Group(); group.name = "coffee shop plank floor";
  group.add(box(width, 0.14, depth, C.plankSeam, 0, -0.07, 0, false));
  const board = 0.12; const seam = 0.012; const rows = Math.round(depth / board);
  const tones: (readonly [number, number, number, number, number, number])[][] = [[], [], []];
  const joints: (readonly [number, number, number, number, number, number])[] = [];
  for (let row = 0; row < rows; row += 1) {
    const z = -depth / 2 + (row + 0.5) * (depth / rows);
    let x = -width / 2 - hash(row, 0) * 1.6;
    for (let piece = 0; x < width / 2; piece += 1) {
      const length = 1.1 + hash(row, piece + 1) * 1.9;
      const start = Math.max(x, -width / 2); const end = Math.min(x + length, width / 2);
      if (end - start > 0.05) {
        tones[Math.floor(hash(piece, row + 7) * 3)].push([end - start - seam, 0.02, depth / rows - seam, (start + end) / 2, 0.01, z]);
        if (end < width / 2) joints.push([seam * 1.4, 0.021, depth / rows - seam, end, 0.01, z]);
      }
      x += length;
    }
  }
  [C.plankA, C.plankB, C.plankC].forEach((color, index) => group.add(mergedBoxes(tones[index], color)));
  if (joints.length > 0) group.add(mergedBoxes(joints, C.plankSeam));
  return group;
}

/** A tall black wall running along local x, with a darker skirting board at the floor. */
export function createCafeWall(length: number): THREE.Group {
  const group = new THREE.Group(); group.name = "coffee shop wall";
  group.add(
    box(length, CAFE_WALL_HEIGHT, WALL_THICKNESS, C.wallPaint, 0, CAFE_WALL_HEIGHT / 2, 0),
    box(length + 0.04, 0.22, WALL_THICKNESS + 0.06, C.wallTrim, 0, 0.11, 0),
  );
  return group;
}

/**
 * The back wall, running along local x, with a doorway through to the kitchen.
 * `KITCHEN_DOORWAY` is the opening's [start, end] along the wall.
 */
export const KITCHEN_DOORWAY: readonly [number, number] = [-7.6, -5.4];
export const KITCHEN_DOORWAY_HEIGHT = 3.2;
export function createCafeDoorwayWall(length = 17.6, opening: readonly [number, number] = KITCHEN_DOORWAY): THREE.Group {
  const group = new THREE.Group(); group.name = "coffee shop wall with kitchen doorway";
  const [start, end] = opening; const half = length / 2;
  for (const [from, to] of [[-half, start], [end, half]] as const) {
    const run = to - from; if (run <= 0) continue;
    group.add(
      box(run, CAFE_WALL_HEIGHT, WALL_THICKNESS, C.wallPaint, (from + to) / 2, CAFE_WALL_HEIGHT / 2, 0),
      box(run, 0.22, WALL_THICKNESS + 0.06, C.wallTrim, (from + to) / 2, 0.11, 0),
    );
  }
  // Lintel over the doorway and a wooden frame around it.
  group.add(box(end - start, CAFE_WALL_HEIGHT - KITCHEN_DOORWAY_HEIGHT, WALL_THICKNESS, C.wallPaint, (start + end) / 2,
    (CAFE_WALL_HEIGHT + KITCHEN_DOORWAY_HEIGHT) / 2, 0));
  for (const x of [start, end]) group.add(box(0.1, KITCHEN_DOORWAY_HEIGHT, WALL_THICKNESS + 0.08, C.counterTop, x, KITCHEN_DOORWAY_HEIGHT / 2, 0));
  group.add(box(end - start + 0.2, 0.14, WALL_THICKNESS + 0.08, C.counterTop, (start + end) / 2, KITCHEN_DOORWAY_HEIGHT, 0));
  return group;
}

export function createCafeFrontDoor(): THREE.Group {
  const group = new THREE.Group(); group.name = "coffee shop front door";
  group.add(
    box(0.18, 3.4, 0.18, C.metal, -1.7, 1.7, 0),
    box(0.18, 3.4, 0.18, C.metal, 1.7, 1.7, 0),
    box(3.55, 0.18, 0.18, C.metal, 0, 3.38, 0),
    // The black wall closes over the doorway all the way up.
    box(4.0, CAFE_WALL_HEIGHT - 3.47, WALL_THICKNESS, C.wallPaint, 0, (CAFE_WALL_HEIGHT + 3.47) / 2, 0.18),
  );
  const glass = new THREE.Mesh(new THREE.BoxGeometry(3.25, 3.0, 0.035), toonMaterial(PALETTE.plaza.window, { transparent: true, opacity: 0.35 }));
  glass.position.set(0, 1.55, -0.01);
  const threshold = box(3.4, 0.025, 0.78, PALETTE.earth.pathShade, 0, 0.014, 0, false);
  group.add(glass, threshold);
  return group;
}

/** Black-and-white checkered kitchen tile. */
export function createKitchenFloor(width: number, depth: number): THREE.Group {
  const group = new THREE.Group(); group.name = "kitchen tile floor";
  group.add(box(width, 0.14, depth, PALETTE.kitchen.tileDark, 0, -0.07, 0, false));
  const tile = 0.36; const light: [number, number, number, number, number, number][] = [];
  const columns = Math.round(width / tile); const rows = Math.round(depth / tile);
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      if ((column + row) % 2) continue;
      light.push([width / columns - 0.01, 0.02, depth / rows - 0.01, -width / 2 + (column + 0.5) * (width / columns), 0.01, -depth / 2 + (row + 0.5) * (depth / rows)]);
    }
  }
  group.add(mergedBoxes(light, PALETTE.kitchen.tileLight));
  return group;
}

// --- Menu board --------------------------------------------------------------------------------

const MENU_LINES: readonly (readonly [item: string, price: string])[] = [
  ["Espresso", "3.00"], ["Cappuccino", "4.25"], ["Latte", "4.50"], ["Drip coffee", "2.75"],
  ["Croissant", "3.50"], ["Pain au chocolat", "4.00"],
];
const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

/** Hand-lettered chalk menu drawn once onto a canvas. */
function chalkMenuTexture(): THREE.CanvasTexture | undefined {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 480;
  const context = canvas.getContext("2d"); if (!context) return undefined;
  context.fillStyle = hex(C.chalkboard); context.fillRect(0, 0, canvas.width, canvas.height);
  // Smudges of old chalk.
  for (let index = 0; index < 18; index += 1) {
    context.fillStyle = "rgba(239,233,216,0.035)";
    context.beginPath();
    context.ellipse(hash(index, 1) * 1024, hash(index, 2) * 480, 60 + hash(index, 3) * 120, 20 + hash(index, 4) * 40, hash(index, 5) * 3, 0, Math.PI * 2);
    context.fill();
  }
  const hand = "'Chalkboard SE', 'Marker Felt', 'Bradley Hand', 'Comic Sans MS', cursive";
  const chalk = (text: string, x: number, y: number, size: number, color: number, align: CanvasTextAlign = "left") => {
    context.font = `${size}px ${hand}`; context.textAlign = align; context.fillStyle = hex(color);
    context.globalAlpha = 0.92; context.fillText(text, x, y);
    // A faint offset pass gives the letters a dusty chalk edge.
    context.globalAlpha = 0.25; context.fillText(text, x + 1.5, y + 1);
    context.globalAlpha = 1;
  };
  chalk("MENU", 512, 82, 70, C.chalkYellow, "center");
  context.strokeStyle = hex(C.chalk); context.lineWidth = 3; context.globalAlpha = 0.7;
  context.beginPath(); context.moveTo(360, 102); context.quadraticCurveTo(512, 112, 664, 100); context.stroke();
  context.globalAlpha = 1;
  MENU_LINES.forEach(([item, price], index) => {
    const y = 162 + index * 50;
    chalk(item, 150, y, 36, index < 4 ? C.chalk : C.chalkPink);
    chalk(price, 770, y, 36, C.chalkBlue, "right");
    context.strokeStyle = "rgba(239,233,216,0.3)"; context.setLineDash([4, 10]); context.lineWidth = 2;
    context.beginPath(); context.moveTo(150 + context.measureText(item).width + 14, y - 8); context.lineTo(680, y - 8); context.stroke();
    context.setLineDash([]);
  });
  // A steaming cup doodle and a little croissant.
  context.strokeStyle = hex(C.chalk); context.lineWidth = 4; context.globalAlpha = 0.85;
  context.strokeRect(842, 250, 80, 62);
  context.beginPath(); context.arc(930, 281, 18, -Math.PI / 2, Math.PI / 2); context.stroke();
  for (const x of [862, 882, 902]) { context.beginPath(); context.moveTo(x, 238); context.bezierCurveTo(x - 10, 222, x + 10, 212, x, 196); context.stroke(); }
  context.strokeStyle = hex(C.chalkYellow);
  context.beginPath(); context.arc(880, 400, 46, Math.PI * 1.05, Math.PI * 1.95); context.stroke();
  context.beginPath(); context.arc(880, 388, 30, Math.PI * 1.1, Math.PI * 1.9); context.stroke();
  context.globalAlpha = 1;
  chalk("fresh baked daily!", 150, 452, 30, C.chalkYellow);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

export function createMenuBoard(): THREE.Group {
  const group = new THREE.Group(); group.name = "coffee shop menu board";
  group.add(
    box(3.2, 1.55, 0.1, C.chalkboard, 0, 2.6, 0),
    box(3.35, 0.08, 0.16, C.counterTop, 0, 3.42, 0),
    box(3.35, 0.08, 0.16, C.counterTop, 0, 1.78, 0),
    box(0.08, 1.7, 0.16, C.counterTop, -1.62, 2.6, 0),
    box(0.08, 1.7, 0.16, C.counterTop, 1.62, 2.6, 0),
  );
  const texture = chalkMenuTexture();
  if (texture) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.45), toonMaterial(0xffffff, { map: texture }, true));
    face.position.set(0, 2.6, 0.052); face.name = "chalk menu";
    group.add(face);
  } else {
    // Without a canvas (headless tests), a few chalk strokes still mark it as a menu.
    for (const [width, y] of [[1.45, 3.05], [1.9, 2.75], [1.6, 2.5], [1.8, 2.25]] as const) group.add(box(width, 0.045, 0.01, C.chalk, -0.2, y, 0.055));
  }
  return group;
}
