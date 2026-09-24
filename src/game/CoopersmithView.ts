import * as THREE from "three";
import { createCoffeeChair, createCoffeeTable } from "./CoffeeFurnitureView.ts";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";

/**
 * Photo-informed CooperSmith's Pub & Brewing on Old Town Square: a two-storey
 * red-brick block that tapers sharply toward the plaza. Seen from above, the
 * long left wall ends in a short square end (the corner door under the red
 * PUB neon), and the main three-window facade then cuts back at about 43° to
 * meet the party wall. The facade carries segmental-arched windows under a
 * corbelled cornice and a black steel truss pergola. The triangle the taper
 * leaves in front of it is a wrought-iron patio full of black market umbrellas.
 * The long left wall runs back plain and still carries a faded grocery ghost
 * sign; the right wall is a party wall against the neighbouring block and is
 * left blank. Local +z is the plaza end, and the whole footprint is centred on
 * the origin so the catalog bounds stay symmetric.
 */
const C = PALETTE.coopersmith;

// Plan, in meters, measured off the Google Earth roof outline.
const X_L = -5;
const X_R = 6;
const Z_F = 7.4;
const Z_B = Z_F - 18;
/** Width of the square end, and how far the diagonal facade cuts back along the party wall. */
const END_W = 3.7;
const TAPER = 6.8;
const BODY_H = 8.3;
const PARAPET_H = 8.75;
// Patio: fence lines, pergola depth off the facade and truss chords.
const FENCE_X = X_L - 0.9;
const FENCE_FRONT_Z = Z_F + 3.2;
const FENCE_RIGHT_X = X_R - 0.2;
const PERGOLA_DEPTH = 2.2;
const TRUSS_LOW = 3.05;
const TRUSS_TOP = 3.45;
const UP = new THREE.Vector3(0, 1, 0);

type P2 = readonly [x: number, z: number];

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}

/** A square bar between two points: steel tubes, pickets and rails. */
function bar(from: THREE.Vector3Tuple, to: THREE.Vector3Tuple, size: number, color: number = C.steel): THREE.Mesh {
  const a = new THREE.Vector3(...from); const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a); const length = dir.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, length, size), toonMaterial(color));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function css(color: number): string { return `#${color.toString(16).padStart(6, "0")}`; }

// ---------------------------------------------------------------- massing

/** Rear, party wall, diagonal facade, square end, long side: edge i runs from vertex i to i + 1. */
const FOOTPRINT: readonly P2[] = [[X_L, Z_B], [X_R, Z_B], [X_R, Z_F - TAPER], [X_L + END_W, Z_F], [X_L, Z_F]];
const REAR_EDGE = 0, FRONT_EDGE = 2, END_EDGE = 3, SIDE_EDGE = 4;
const FINISHED_EDGES = [REAR_EDGE, FRONT_EDGE, END_EDGE, SIDE_EDGE];
/** The show faces on the plaza; the side and rear walls stay plain brick. */
const SHOW_EDGES = [FRONT_EDGE, END_EDGE];

/**
 * The footprint pushed outward by `outset` on the listed edges. Every other
 * edge (always the party wall) tucks just inside the body, so a band dies
 * into the brick there instead of z-fighting with it.
 */
function grow(outset: number, edges: readonly number[] = FINISHED_EDGES): P2[] {
  const n = FOOTPRINT.length;
  const lines = FOOTPRINT.map((a, i) => {
    const b = FOOTPRINT[(i + 1) % n];
    const dx = b[0] - a[0]; const dz = b[1] - a[1]; const length = Math.hypot(dx, dz);
    const offset = edges.includes(i) ? outset : Math.min(outset, -0.01);
    return { x: a[0] + (dz / length) * offset, z: a[1] - (dx / length) * offset, dx, dz };
  });
  return lines.map((line, i) => {
    const prev = lines[(i + n - 1) % n];
    const t = ((line.x - prev.x) * line.dz - (line.z - prev.z) * line.dx) / (prev.dx * line.dz - prev.dz * line.dx);
    return [prev.x + prev.dx * t, prev.z + prev.dz * t] as const;
  });
}

/** Extrudes a plan polygon between two heights. */
function prism(points: readonly P2[], bottom: number, top: number, color: number): THREE.Mesh {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, bottom, 0);
  const m = new THREE.Mesh(geometry, toonMaterial(color));
  m.castShadow = true; m.receiveShadow = true; return m;
}

// ---------------------------------------------------------------- facades

/** A wall face: its centre on the ground, outward-facing rotation, and length. */
interface Face { readonly x: number; readonly z: number; readonly angle: number; readonly width: number }
/** The diagonal facade; local +x runs from the square end toward the party wall. */
const FRONT: Face = {
  x: (X_L + END_W + X_R) / 2, z: Z_F - TAPER / 2,
  angle: Math.atan2(TAPER, X_R - X_L - END_W), width: Math.hypot(X_R - X_L - END_W, TAPER),
};
const END: Face = { x: X_L + END_W / 2, z: Z_F, angle: 0, width: END_W };
/** Local +x on the side wall points toward the front of the building. */
const SIDE: Face = { x: X_L, z: (Z_F + Z_B) / 2, angle: -Math.PI / 2, width: Z_F - Z_B };
const REAR: Face = { x: (X_L + X_R) / 2, z: Z_B, angle: Math.PI, width: X_R - X_L };

/** Places an object on a face: `u` runs along the wall, `out` away from it. */
function mount<T extends THREE.Object3D>(face: Face, u: number, y: number, object: T, out = 0): T {
  const c = Math.cos(face.angle); const s = Math.sin(face.angle);
  object.position.set(face.x + u * c + out * s, y, face.z - u * s + out * c);
  object.rotation.y = face.angle;
  return object;
}

/** A segmental arch geometry: its circle through both springers and the crown. */
function arch(w: number, spring: number, rise: number): { r: number; cy: number; a: number } {
  const half = w / 2; const r = (half * half + rise * rise) / (2 * rise);
  const cy = spring + rise - r;
  return { r, cy, a: Math.atan2(spring - cy, half) };
}

function archShape(w: number, spring: number, rise: number): THREE.Shape {
  const s = new THREE.Shape(); const half = w / 2;
  s.moveTo(-half, 0); s.lineTo(half, 0); s.lineTo(half, spring);
  const { r, cy, a } = arch(w, spring, rise);
  s.absarc(0, cy, r, a, Math.PI - a, false);
  s.lineTo(-half, 0);
  return s;
}

function extrude(shape: THREE.Shape, depth: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 14 }), toonMaterial(color));
  m.castShadow = true; m.receiveShadow = true; return m;
}

interface OpeningSpec {
  readonly w: number;
  readonly h: number;
  /** Arch rise; zero for a flat lintel. */
  readonly rise: number;
  readonly kind: "window" | "shopfront" | "door";
}

/**
 * One wall opening built proud of the brick (the cel look reads a flush dark
 * pane as a recess): dark frame, glass, brick voussoirs or lintel, stone sill.
 * Local origin is the opening's bottom centre on the wall face.
 */
function opening(spec: OpeningSpec): THREE.Group {
  const g = new THREE.Group();
  const { w, h, rise } = spec;
  const spring = h - rise;
  const frameShape = rise > 0 ? archShape(w + 0.14, spring + 0.07, rise + 0.02) : new THREE.Shape([new THREE.Vector2(-w / 2 - 0.07, 0), new THREE.Vector2(w / 2 + 0.07, 0), new THREE.Vector2(w / 2 + 0.07, h + 0.07), new THREE.Vector2(-w / 2 - 0.07, h + 0.07)]);
  // Doors stand on the paving; windows get a frame lip below the glass.
  const lip = spec.kind === "door" ? 0 : -0.05;
  const frame = extrude(frameShape, 0.04, C.frame); frame.position.set(0, lip, 0); g.add(frame);
  const glassShape = rise > 0 ? archShape(w, spring, rise) : new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h), new THREE.Vector2(-w / 2, h)]);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(glassShape, 14), toonMaterial(C.glass));
  glass.position.z = 0.045; g.add(glass);

  if (rise > 0) {
    // Radial brick voussoirs standing just proud of the wall.
    const { r, cy, a } = arch(w + 0.14, spring + 0.07, rise + 0.02);
    const band = new THREE.Shape();
    band.absarc(0, cy, r + 0.2, a, Math.PI - a, false);
    band.absarc(0, cy, r, Math.PI - a, a, true);
    band.closePath();
    const voussoirs = extrude(band, 0.07, C.brickShade); voussoirs.position.y = lip; g.add(voussoirs);
  } else {
    g.add(box(w + 0.34, 0.18, 0.08, C.brickShade, 0, h + 0.12, 0.04));
  }

  if (spec.kind === "window") {
    // Double-hung sash: the meeting rail sits just above half height.
    g.add(box(w, 0.05, 0.03, C.frame, 0, spring * 0.52, 0.06));
    g.add(box(w + 0.26, 0.09, 0.17, C.sill, 0, -0.07, 0.07));
  } else if (spec.kind === "shopfront") {
    // Transom bar at the springing line and a centre mullion below it.
    g.add(box(w, 0.06, 0.03, C.frame, 0, spring - 0.05, 0.06));
    g.add(box(0.05, spring - 0.05, 0.03, C.frame, 0, (spring - 0.05) / 2, 0.06));
    g.add(box(w + 0.2, 0.1, 0.16, C.sill, 0, -0.07, 0.07));
  } else {
    // Paired dark-red leaves under a glazed transom.
    const leaf = spring - 0.08;
    for (const side of [-1, 1]) {
      g.add(box(w / 2 - 0.02, leaf, 0.05, C.door, side * w / 4, leaf / 2, 0.07));
      g.add(box(w / 2 - 0.18, leaf * 0.42, 0.02, C.glass, side * w / 4, leaf * 0.66, 0.1));
      g.add(box(0.03, 0.22, 0.04, C.sill, side * 0.07, leaf * 0.45, 0.11));
    }
    g.add(box(w, 0.06, 0.03, C.frame, 0, spring - 0.05, 0.06));
  }
  return g;
}

// ---------------------------------------------------------------- painted signs

/**
 * A cut-out painted plane: `paint` draws opaque strokes and the alpha test
 * drops everything else, so lettering sits on the brick with no card behind it.
 * Headless builds (tests) keep the mesh but hide it.
 */
function paintedPlane(width: number, height: number, pixelsPerMeter: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Mesh {
  const material = toonMaterial(0xffffff, { alphaTest: 0.5 });
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * pixelsPerMeter); canvas.height = Math.round(height * pixelsPerMeter);
    paint(canvas.getContext("2d")!, canvas.width, canvas.height);
    material.map = new THREE.CanvasTexture(canvas); material.map.colorSpace = THREE.SRGBColorSpace;
    material.map.anisotropy = 4;
  } else {
    material.visible = false;
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.receiveShadow = true;
  return mesh;
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, color: number, maxWidth?: number): void {
  ctx.font = font; ctx.fillStyle = css(color); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(value, x, y, maxWidth);
}

/** Deterministic wear so the ghost sign weathers identically every load. */
function weather(ctx: CanvasRenderingContext2D, w: number, h: number, specks: number, course: number): void {
  let seed = 9;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";
  // Mortar joints show through the paint, one brick course apart.
  for (let y = 0; y < h; y += course) if (random() < 0.7) ctx.fillRect(0, y, w, Math.max(1, course * 0.18));
  for (let i = 0; i < specks; i++) {
    const size = 2 + random() * random() * 22;
    ctx.fillRect(random() * w, random() * h, size * (0.6 + random()), size * 0.5);
  }
  ctx.globalCompositeOperation = "source-over";
}

/** Faded "Staple & Fancy Grocery" advertising above an older sage panel. */
function ghostSign(): THREE.Mesh {
  const width = 11.4; const height = 6.2; const ppm = 110;
  return paintedPlane(width, height, ppm, (ctx, w, h) => {
    const u = (meters: number) => (meters / width) * w;
    const v = (meters: number) => h - (meters / height) * h;
    // Lower left: an earlier sage-green panel with a painted border.
    ctx.fillStyle = css(C.ghostSage); ctx.fillRect(u(0.3), v(3.2), u(3.3), v(0.4) - v(3.2));
    ctx.strokeStyle = css(C.ghostPaint); ctx.lineWidth = u(0.14);
    ctx.strokeRect(u(0.15), v(4.1), u(3.6), v(0.25) - v(4.1));
    // Upper right: the grocery lettering and its rule lines.
    const cx = u(7.55); const face = (px: number) => `bold ${Math.round(px)}px Georgia, 'Times New Roman', serif`;
    text(ctx, "GROCERY & DRUG CO.", cx, v(5.35), face(u(0.6)), C.ghostPaint, u(6.2));
    text(ctx, "WHOLESALE AND RETAIL", cx, v(4.72), face(u(0.32)), C.ghostPaint, u(5));
    text(ctx, "STAPLE & FANCY GROCERY", cx, v(4.05), face(u(0.64)), C.ghostPaint, u(6.4));
    text(ctx, "& PROVISIONS", cx, v(3.3), face(u(0.64)), C.ghostPaint, u(5));
    ctx.fillStyle = css(C.ghostPaint);
    ctx.fillRect(u(4.55), v(2.78), u(6), u(0.07));
    text(ctx, "THE CORNER STORE", cx, v(2.5), face(u(0.24)), C.ghostPaint, u(3));
    ctx.strokeRect(u(4.1), v(5.8), u(6.9), v(2.2) - v(5.8));
    weather(ctx, w, h, 5200, u(0.077));
  });
}

function signLetters(): THREE.Group {
  const g = new THREE.Group();
  const name = paintedPlane(4.8, 0.72, 220, (ctx, w, h) => {
    text(ctx, "CooperSmith’s", w / 2, h * 0.54, `small-caps bold ${Math.round(h * 0.86)}px Georgia, 'Times New Roman', serif`, C.signLetters, w * 0.98);
  });
  name.position.y = 0.46;
  const trade = paintedPlane(2.6, 0.3, 220, (ctx, w, h) => {
    text(ctx, "PUB & BREWING", w / 2, h * 0.55, `bold ${Math.round(h * 0.78)}px Georgia, 'Times New Roman', serif`, C.signLetters, w * 0.98);
  });
  g.add(name, trade);
  return g;
}

function neonPub(): THREE.Mesh {
  return paintedPlane(0.72, 0.24, 300, (ctx, w, h) => {
    text(ctx, "PUB", w / 2, h * 0.55, `bold ${Math.round(h * 0.82)}px 'Trebuchet MS', sans-serif`, C.neon, w);
  });
}

// ---------------------------------------------------------------- building

function createBuilding(): THREE.Group {
  const g = new THREE.Group(); g.name = "CooperSmith's brick block";
  g.add(prism(FOOTPRINT, 0, BODY_H, C.brick));
  // The neighbour's party wall is a touch darker where it was never exposed.
  g.add(box(0.02, BODY_H - 0.4, Z_F - TAPER - Z_B - 0.2, C.brickParty, X_R + 0.005, BODY_H / 2 + 0.2, (Z_F - TAPER + Z_B) / 2));

  // Stone plinth, a string course under the upper floor, stepped corbelling,
  // then a brick parapet with a metal coping around a flat tar roof.
  g.add(prism(grow(0.05), 0, 0.4, C.plinth));
  g.add(prism(grow(0.05, SHOW_EDGES), 4.6, 4.72, C.brickShade));
  g.add(prism(grow(0.06, SHOW_EDGES), 7.48, 7.6, C.brickShade));
  g.add(prism(grow(0.12, SHOW_EDGES), 7.98, 8.16, C.brickShade));
  g.add(prism(grow(0.17, SHOW_EDGES), 8.16, 8.3, C.brick));
  g.add(prism(grow(0.08), BODY_H, PARAPET_H, C.brick));
  g.add(prism(grow(0.13), PARAPET_H, PARAPET_H + 0.08, C.coping));
  g.add(prism(grow(-0.28), PARAPET_H + 0.08, PARAPET_H + 0.1, C.roof));

  // A dentil course between the corbel bands on the show faces.
  const dentilGeometry = new THREE.BoxGeometry(0.16, 0.2, 0.1);
  const dentilSpots: THREE.Matrix4[] = [];
  const probe = new THREE.Object3D();
  for (const face of [FRONT, END]) {
    const count = Math.max(2, Math.floor(face.width / 0.42));
    for (let i = 0; i < count; i++) {
      mount(face, -face.width / 2 + (i + 0.5) * face.width / count, 7.8, probe, 0.05);
      probe.updateMatrix(); dentilSpots.push(probe.matrix.clone());
    }
  }
  const dentils = new THREE.InstancedMesh(dentilGeometry, toonMaterial(C.brickShade), dentilSpots.length);
  dentilSpots.forEach((matrix, i) => dentils.setMatrixAt(i, matrix));
  dentils.castShadow = true; dentils.receiveShadow = true;
  g.add(dentils);

  // Upper floor: three arched windows on the diagonal facade, one on the end.
  const upper: OpeningSpec = { w: 1.08, h: 2.2, rise: 0.3, kind: "window" };
  for (const u of [-3, 0, 3]) g.add(mount(FRONT, u, 4.9, opening(upper)));
  g.add(mount(END, 0, 4.9, opening(upper)));

  // Ground floor: arched shopfronts either side of the facade door, and the
  // end entrance under its red neon transom.
  const shopfront: OpeningSpec = { w: 1.5, h: 2.5, rise: 0.38, kind: "shopfront" };
  g.add(mount(FRONT, -3, 0.45, opening(shopfront)), mount(FRONT, 3, 0.45, opening(shopfront)));
  g.add(mount(FRONT, 0, 0, opening({ w: 1.5, h: 2.95, rise: 0.4, kind: "door" })));
  g.add(mount(END, 0, 0, opening({ w: 1.3, h: 2.95, rise: 0.45, kind: "door" })));
  g.add(mount(END, 0, 2.56, neonPub(), 0.08));
  g.add(mount(FRONT, -0.3, 3.62, signLetters(), 0.03));

  // The long side wall: ghost sign toward the front, one tall window, a few
  // smaller ones toward the rear, a service door and two downspouts.
  g.add(mount(SIDE, 3.3, 4.8, ghostSign(), 0.012));
  g.add(mount(SIDE, -0.45, 5.0, opening({ w: 1, h: 1.8, rise: 0, kind: "window" })));
  for (const u of [-5.4, -6.6, -7.8]) g.add(mount(SIDE, u, 5.3, opening({ w: 0.62, h: 1.35, rise: 0.18, kind: "window" })));
  g.add(mount(SIDE, -7.1, 0, opening({ w: 1.05, h: 2.3, rise: 0, kind: "door" })));
  for (const u of [8.55, -8.8]) {
    g.add(mount(SIDE, u, (BODY_H - 0.3) / 2, box(0.12, BODY_H - 0.3, 0.12, C.coping, 0, 0, 0), 0.08));
    g.add(mount(SIDE, u, BODY_H - 0.25, box(0.26, 0.22, 0.2, C.coping, 0, 0, 0), 0.1));
  }

  // Rear: a service door and two small upper windows.
  g.add(mount(REAR, 2.2, 0, opening({ w: 1.1, h: 2.3, rise: 0, kind: "door" })));
  for (const u of [-3.0, 0.2]) g.add(mount(REAR, u, 5.1, opening({ w: 0.9, h: 1.5, rise: 0.2, kind: "window" })));

  // Roof clutter from the aerial view: a long duct beside the side parapet,
  // HVAC boxes, a round vent near the tip, a brewhouse stack and antennas.
  g.add(box(0.7, 0.6, 5.5, C.coping, X_L + 1.1, PARAPET_H + 0.38, -0.8));
  g.add(box(1.6, 0.9, 1.2, C.coping, 2.4, PARAPET_H + 0.5, -6.5));
  g.add(box(0.8, 0.5, 0.8, C.roof, 1, PARAPET_H + 0.33, -2.5));
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.5, 14), toonMaterial(C.coping));
  vent.position.set(3.6, PARAPET_H + 0.33, 1.6); vent.castShadow = true; g.add(vent);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.4, 12), toonMaterial(C.coping));
  stack.position.set(2.5, PARAPET_H + 0.8, -8.5); stack.castShadow = true; g.add(stack);
  for (const [x, z, h] of [[-3.5, 6.6, 0.9], [-2.2, 6.2, 0.6], [1.8, 3.2, 0.75]] as const) {
    g.add(bar([x, PARAPET_H + 0.08, z], [x, PARAPET_H + 0.08 + h, z], 0.04, C.steel));
  }
  return g;
}

// ---------------------------------------------------------------- patio

/**
 * Black steel pergola along the diagonal facade, built in the facade's own
 * frame (local x along the wall, z out from it): a truss on three posts with
 * returns to the wall. It stops short of the party wall so it never reaches
 * into the neighbouring block.
 */
function createPergola(): THREE.Group {
  const g = new THREE.Group(); g.name = "CooperSmith's patio pergola";
  const left = -4.6; const right = 2.2; const mid = (left + right) / 2;
  const truss = (a: P2, b: P2) => {
    g.add(bar([a[0], TRUSS_LOW, a[1]], [b[0], TRUSS_LOW, b[1]], 0.07));
    g.add(bar([a[0], TRUSS_TOP, a[1]], [b[0], TRUSS_TOP, b[1]], 0.07));
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]); const bays = Math.max(2, Math.round(length / 0.5));
    for (let i = 0; i < bays; i++) {
      const t0 = i / bays; const t1 = (i + 1) / bays;
      const y0 = i % 2 ? TRUSS_TOP : TRUSS_LOW; const y1 = i % 2 ? TRUSS_LOW : TRUSS_TOP;
      g.add(bar([a[0] + (b[0] - a[0]) * t0, y0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, y1, a[1] + (b[1] - a[1]) * t1], 0.035));
    }
  };
  truss([left, PERGOLA_DEPTH], [right, PERGOLA_DEPTH]);
  for (const x of [left, mid, right]) {
    truss([x, 0.06], [x, PERGOLA_DEPTH]);
    g.add(bar([x, 0, PERGOLA_DEPTH], [x, TRUSS_TOP + 0.04, PERGOLA_DEPTH], 0.11));
    g.add(box(0.26, 0.04, 0.26, C.steel, x, 0.02, PERGOLA_DEPTH));
  }
  g.add(box(right - left + 0.1, 0.22, 0.1, C.steel, mid, TRUSS_TOP - 0.1, 0.05));
  // Open lattice of purlins across the top.
  for (let z = 0.5; z < PERGOLA_DEPTH - 0.1; z += 0.42) g.add(box(right - left, 0.05, 0.05, C.steel, mid, TRUSS_TOP + 0.06, z));
  return mount(FRONT, 0, 0, g);
}

/** Where the diagonal facade crosses a given x. */
function facadeZ(x: number): number {
  return Z_F - TAPER * (x - (X_L + END_W)) / (X_R - X_L - END_W);
}

/**
 * Wrought-iron patio fence: out from the side wall, round the square end, straight
 * across the front and back to the facade beside the party wall, enclosing the
 * triangle the taper leaves. The gap in the left run is the gate.
 */
const FENCE_RUNS: readonly (readonly [P2, P2])[] = [
  [[X_L, Z_F - 1.2], [FENCE_X, Z_F - 1.2]],
  [[FENCE_X, Z_F - 1.2], [FENCE_X, Z_F + 0.2]],
  [[FENCE_X, Z_F + 1.3], [FENCE_X, Z_F + 1.8]],
  [[FENCE_X, Z_F + 1.8], [X_L + 0.4, FENCE_FRONT_Z]],
  [[X_L + 0.4, FENCE_FRONT_Z], [FENCE_RIGHT_X, FENCE_FRONT_Z]],
  [[FENCE_RIGHT_X, FENCE_FRONT_Z], [FENCE_RIGHT_X, facadeZ(FENCE_RIGHT_X)]],
];

function createFence(): THREE.Group {
  const g = new THREE.Group(); g.name = "CooperSmith's patio fence";
  const pickets: THREE.Matrix4[] = []; const rings: THREE.Matrix4[] = [];
  const quaternion = new THREE.Quaternion(); const unit = new THREE.Vector3(1, 1, 1);
  for (const [a, b] of FENCE_RUNS) {
    const dx = b[0] - a[0]; const dz = b[1] - a[1]; const length = Math.hypot(dx, dz);
    const angle = Math.atan2(-dz, dx);
    quaternion.setFromAxisAngle(UP, angle);
    const at = (t: number, y: number) => new THREE.Vector3(a[0] + dx * t, y, a[1] + dz * t);
    for (const y of [0.1, 0.78, 0.98]) {
      const rail = box(length, 0.035, 0.035, C.steel, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2); rail.rotation.y = angle; g.add(rail);
    }
    const posts = Math.max(1, Math.ceil(length / 2));
    for (let i = 0; i <= posts; i++) {
      const p = at(i / posts, 0);
      g.add(box(0.07, 1.04, 0.07, C.steel, p.x, 0.52, p.z));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), toonMaterial(C.steel)); cap.position.set(p.x, 1.08, p.z); g.add(cap);
    }
    for (let i = 1, n = Math.floor(length / 0.12); i < n; i++) pickets.push(new THREE.Matrix4().compose(at(i / n, 0.44), quaternion, unit));
    for (let i = 0, n = Math.max(1, Math.floor(length / 0.17)); i < n; i++) rings.push(new THREE.Matrix4().compose(at((i + 0.5) / n, 0.88), quaternion, unit));
  }
  const batch = (geometry: THREE.BufferGeometry, matrices: THREE.Matrix4[]) => {
    const mesh = new THREE.InstancedMesh(geometry, toonMaterial(C.steel), matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = true; g.add(mesh);
  };
  batch(new THREE.BoxGeometry(0.022, 0.68, 0.022), pickets);
  batch(new THREE.TorusGeometry(0.072, 0.012, 5, 14), rings);

  // Flower boxes riding the front rail.
  for (const x of [-2.9, 0.9, 4.2]) {
    g.add(box(0.95, 0.2, 0.26, C.planter, x, 1.1, FENCE_FRONT_Z - 0.08));
    for (let i = 0; i < 5; i++) {
      const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 + (i % 2) * 0.03, 0), toonMaterial(i % 2 ? PALETTE.green.leaf : i % 4 ? PALETTE.flower.pink : PALETTE.flower.coral));
      bloom.position.set(x - 0.36 + i * 0.18, 1.26, FENCE_FRONT_Z - 0.08); bloom.castShadow = true; g.add(bloom);
    }
  }
  return g;
}

/** Black eight-panel market umbrella; the canopy stays under the pergola chords. */
function createUmbrella(radius = 1.1): THREE.Group {
  const g = new THREE.Group(); g.name = "CooperSmith's black patio umbrella";
  const rim = 2.45; const apex = 3.0;
  g.add(bar([0, 0, 0], [0, apex + 0.12, 0], 0.045, C.umbrellaPole));
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(radius, apex - rim, 8, 1, true), toonMaterial(C.umbrella, { side: THREE.DoubleSide }));
  canopy.position.y = (apex + rim) / 2; canopy.castShadow = true; g.add(canopy);
  const valance = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.13, 8, 1, true), toonMaterial(C.umbrella, { side: THREE.DoubleSide }));
  valance.position.y = rim - 0.065; valance.castShadow = true; g.add(valance);
  // Ribs down each panel seam and the small vented crown.
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    g.add(bar([0, apex, 0], [Math.cos(angle) * radius, rim, Math.sin(angle) * radius], 0.03, C.umbrellaRib));
  }
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.14, 8), toonMaterial(C.umbrellaRib));
  crown.position.y = apex + 0.08; g.add(crown);
  g.add(box(0.36, 0.06, 0.36, C.umbrellaRib, 0, 0.03, 0));
  return g;
}

/**
 * Umbrella tables filling the patio triangle: a row along the front fence, then
 * two shorter rows stepping back toward the party wall as the facade cuts in.
 */
export const COOPERSMITH_PATIO_TABLES: readonly P2[] = [
  [X_L + 0.9, Z_F + 2.2], [X_L + 3.3, Z_F + 2.2], [X_L + 5.7, Z_F + 2.2], [X_L + 8.1, Z_F + 2.2],
  [X_L + 6, Z_F - 0.3], [X_L + 8.4, Z_F - 0.3],
  [X_L + 9, Z_F - 2.6],
];

function createSeating(): THREE.Group {
  const g = new THREE.Group(); g.name = "CooperSmith's patio seating";
  for (const [x, z] of COOPERSMITH_PATIO_TABLES) {
    const table = createCoffeeTable(); table.position.set(x, 0, z); g.add(table);
    for (const side of [-1, 1]) {
      // Chairs face the table: the sitter looks along local -z.
      const chair = createCoffeeChair(); chair.position.set(x + side * 0.62, 0, z); chair.rotation.y = Math.atan2(side, 0); g.add(chair);
    }
    const shade = createUmbrella(); shade.position.set(x, 0, z); g.add(shade);
  }
  return g;
}

export function createCoopersmith(): THREE.Group {
  const g = new THREE.Group();
  g.name = "CooperSmith's Pub & Brewing";
  g.add(createBuilding(), createPergola(), createFence(), createSeating());
  return g;
}
