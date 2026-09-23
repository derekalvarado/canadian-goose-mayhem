import * as THREE from "three";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";

/**
 * Photo-informed wall-mounted gas meter bank from an Old Town brick side wall:
 * a painted header pipe feeding four meters (one older bolted unit on a
 * concrete pad), a service regulator on the street end, and the odd rusty
 * drop, conduit and wrapped standpipe. Local +z faces away from the wall,
 * which sits at z = WALL_Z.
 */
const C = PALETTE.gasMeter;
const WALL_Z = -0.6;
const HEADER_Y = 1.05;
const HEADER_Z = -0.44;
const PIPE_R = 0.042;
const UP = new THREE.Vector3(0, 1, 0);

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}

function pipe(from: THREE.Vector3Tuple, to: THREE.Vector3Tuple, color: number = C.pipe, radius = PIPE_R): THREE.Mesh {
  const a = new THREE.Vector3(...from); const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a); const length = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), toonMaterial(color));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  m.castShadow = true;
  return m;
}

/** Elbows and tees read as slightly swollen knuckles in the photographs. */
function joint(x: number, y: number, z: number, color: number = C.pipe, radius = PIPE_R * 1.35): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), toonMaterial(color));
  m.position.set(x, y, z); m.castShadow = true; return m;
}

/** A short, wider collar along a pipe axis: unions, couplings and nuts. */
function collar(at: THREE.Vector3Tuple, axis: "x" | "y" | "z", color: number = C.pipeShade, length = 0.07, radius = PIPE_R * 1.45): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), toonMaterial(color));
  m.position.set(...at);
  if (axis === "x") m.rotation.z = Math.PI / 2;
  if (axis === "z") m.rotation.x = Math.PI / 2;
  m.castShadow = true; return m;
}

/** Quarter-turn service valve with its flat lock wing. */
function valve(x: number, y: number, z: number, color: number = C.pipeShade): THREE.Group {
  const g = new THREE.Group(); g.position.set(x, y, z);
  g.add(box(0.1, 0.11, 0.1, color, 0, 0, 0), box(0.05, 0.035, 0.14, color, 0, 0.07, 0.03));
  return g;
}

interface MeterSpec { x: number; bottom: number; w: number; h: number; d: number; old?: boolean }

function meter(spec: MeterSpec): THREE.Group {
  const g = new THREE.Group();
  const { w, h, d } = spec;
  const body = spec.old ? C.meterOld : C.meter;
  const z = WALL_Z + 0.05 + d / 2;
  const cy = spec.bottom + h / 2;
  g.position.set(spec.x, 0, 0);
  // Pressed-steel case: main body, a set-back top cap and a raised front plate.
  g.add(box(w, h - 0.05, d, body, 0, cy - 0.025, z));
  g.add(box(w - 0.05, 0.05, d - 0.05, C.meterShade, 0, spec.bottom + h - 0.025, z));
  g.add(box(w - 0.08, h * 0.62, 0.03, C.meterShade, 0, cy - h * 0.1, z + d / 2 + 0.01));
  // Cream index window near the top and the utility's red-and-white tag below.
  const indexX = spec.old ? 0 : -w * 0.12;
  const indexY = spec.bottom + h - 0.13;
  g.add(box(0.2, 0.11, 0.06, C.index, indexX, indexY, z + d / 2 + 0.03));
  for (let i = 0; i < 4; i++) g.add(box(0.026, 0.026, 0.01, C.dial, indexX - 0.06 + i * 0.04, indexY, z + d / 2 + 0.065));
  g.add(box(0.13, 0.09, 0.01, C.tag, -w * 0.12, cy - 0.06, z + d / 2 + 0.03));
  g.add(box(0.13, 0.025, 0.012, PALETTE.accent.red, -w * 0.12, cy - 0.035, z + d / 2 + 0.032));
  if (spec.old) {
    // The larger older meter is bolted round its face and has a blue badge.
    const bolt = new THREE.SphereGeometry(0.014, 6, 4);
    for (let i = 0; i < 7; i++) for (const side of [-1, 1]) {
      const b = new THREE.Mesh(bolt, toonMaterial(C.meterShade));
      b.position.set(side * (w / 2 - 0.035), spec.bottom + 0.06 + i * (h - 0.16) / 6, z + d / 2 + 0.01); g.add(b);
    }
    g.add(box(0.2, 0.06, 0.012, C.badge, 0.02, cy + 0.04, z + d / 2 + 0.03));
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 12), toonMaterial(C.meterShade));
    dome.position.set(0, spec.bottom + h + 0.04, z + 0.04); g.add(dome);
  }
  // Swivel inlet/outlet stubs on the case top.
  for (const side of [-1, 1]) g.add(collar([side * w * 0.3, spec.bottom + h + 0.035, HEADER_Z], "y", C.pipeShade, 0.07));
  return g;
}

export function createGasMeterBank(): THREE.Group {
  const g = new THREE.Group();
  g.name = "Gas meter bank";

  // Concrete pad in front of the right-hand meters.
  g.add(box(2.2, 0.13, 1.05, C.concrete, 0.36, 0.065, WALL_Z + 0.525));
  g.add(box(2.24, 0.02, 1.09, C.concreteShade, 0.36, 0.01, WALL_Z + 0.525));

  // Header: long painted manifold with couplings, a rusty union and the dead-end cap.
  g.add(pipe([-2.12, HEADER_Y, HEADER_Z], [1.62, HEADER_Y, HEADER_Z]));
  for (const x of [-1.8, -0.05, 0.92]) g.add(collar([x, HEADER_Y, HEADER_Z], "x"));
  g.add(collar([-1.12, HEADER_Y, HEADER_Z], "x", C.rust, 0.09, PIPE_R * 1.6));
  g.add(valve(-2.1, HEADER_Y, HEADER_Z));
  g.add(collar([-2.19, HEADER_Y, HEADER_Z], "x", C.pipeShade, 0.05, PIPE_R * 1.2));

  // Regulator riser at the street end, painted red where it enters the paving.
  g.add(joint(1.62, HEADER_Y, HEADER_Z));
  g.add(pipe([1.62, HEADER_Y, HEADER_Z], [1.62, 0.28, HEADER_Z]));
  g.add(pipe([1.62, 0.28, HEADER_Z], [1.62, -0.02, HEADER_Z], C.riserRed));
  g.add(collar([1.62, 0.62, HEADER_Z], "y"), collar([1.62, 0.3, HEADER_Z], "y"));
  const regulator = new THREE.Group();
  regulator.position.set(1.66, 0.8, HEADER_Z + 0.06);
  regulator.rotation.y = -0.7;
  regulator.add(box(0.14, 0.18, 0.14, C.pipeShade, 0, 0, 0));
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 10), toonMaterial(C.pipeShade));
  throat.rotation.z = Math.PI / 2; throat.position.set(0.12, 0.04, 0); regulator.add(throat);
  const diaphragm = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 24), toonMaterial(C.meter));
  diaphragm.rotation.z = Math.PI / 2; diaphragm.position.set(0.22, 0.06, 0); regulator.add(diaphragm);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.018, 6, 24), toonMaterial(C.meterShade));
  rim.rotation.y = Math.PI / 2; rim.position.set(0.22, 0.06, 0); regulator.add(rim);
  const bonnet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMaterial(C.meter));
  bonnet.rotation.z = -Math.PI / 2; bonnet.scale.set(1, 0.35, 1); bonnet.position.set(0.27, 0.06, 0); regulator.add(bonnet);
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), toonMaterial(C.pipeShade));
  vent.position.set(0.02, -0.14, 0); regulator.add(vent);
  regulator.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  g.add(regulator);

  const meters: MeterSpec[] = [
    { x: -1.62, bottom: 0.2, w: 0.5, h: 0.56, d: 0.34 },
    { x: -0.3, bottom: 0.24, w: 0.46, h: 0.52, d: 0.32 },
    { x: 0.32, bottom: 0.13, w: 0.6, h: 0.66, d: 0.4, old: true },
    { x: 0.98, bottom: 0.24, w: 0.46, h: 0.52, d: 0.32 },
  ];
  meters.forEach((spec, index) => {
    g.add(meter(spec));
    const top = spec.bottom + spec.h + 0.07;
    // Inlet: drop from a header tee through a service valve.
    const inX = spec.x - spec.w * 0.3;
    g.add(joint(inX, HEADER_Y, HEADER_Z), pipe([inX, HEADER_Y, HEADER_Z], [inX, top, HEADER_Z]));
    g.add(valve(inX, (HEADER_Y + top) / 2 + 0.02, HEADER_Z));
    // Outlet: up and back through the brick at staggered heights.
    const outX = spec.x + spec.w * 0.3;
    const outY = top + 0.05 + (index % 2) * 0.04;
    g.add(pipe([outX, top, HEADER_Z], [outX, outY, HEADER_Z]), joint(outX, outY, HEADER_Z));
    g.add(pipe([outX, outY, HEADER_Z], [outX, outY, WALL_Z]), collar([outX, outY, WALL_Z + 0.03], "z"));
  });

  // Rusty brass drop and plugged tee between the first two meters.
  g.add(joint(-1.0, HEADER_Y, HEADER_Z, C.rust), pipe([-1.0, HEADER_Y, HEADER_Z], [-1.0, 0.86, HEADER_Z], C.rust));
  g.add(joint(-1.0, 0.86, HEADER_Z, C.rust), pipe([-1.0, 0.86, HEADER_Z], [-1.0, 0.86, WALL_Z], C.rust));
  g.add(pipe([-0.72, HEADER_Y, HEADER_Z], [-0.72, 0.93, HEADER_Z], C.brass), valve(-0.72, 0.9, HEADER_Z, C.brass));

  // Standpipe at the pad's corner, wrapped in black tape where boots scuff it.
  g.add(pipe([-0.82, -0.02, -0.18], [-0.82, 0.66, -0.18]), joint(-0.82, 0.66, -0.18));
  g.add(pipe([-0.82, 0.66, -0.18], [-0.82, 0.66, HEADER_Z]), joint(-0.82, 0.66, HEADER_Z));
  g.add(pipe([-0.82, 0.66, HEADER_Z], [-0.82, HEADER_Y, HEADER_Z]), joint(-0.82, HEADER_Y, HEADER_Z));
  g.add(pipe([-0.82, -0.02, -0.18], [-0.82, 0.3, -0.18], C.tape, PIPE_R * 1.3));
  g.add(box(0.14, 0.06, 0.02, C.tape, -0.76, 0.24, -0.12));

  // Low runs along the foot of the wall: an old rusted line and white conduit.
  g.add(pipe([-1.4, 0.2, WALL_Z + 0.05], [1.2, 0.2, WALL_Z + 0.05], C.rust, 0.035));
  g.add(pipe([-0.95, 0.3, WALL_Z + 0.08], [1.4, 0.3, WALL_Z + 0.08], C.conduit, 0.028));
  g.add(joint(1.4, 0.3, WALL_Z + 0.08, C.conduit, 0.035), pipe([1.4, 0.3, WALL_Z + 0.08], [1.4, 0.3, 0.05], C.conduit, 0.028));
  g.add(joint(1.4, 0.3, 0.05, C.conduit, 0.035), pipe([1.4, 0.3, 0.05], [1.4, 0.13, 0.05], C.conduit, 0.028));

  // Small grey service box on the brick above the header.
  g.add(box(0.32, 0.3, 0.1, C.meterShade, -0.5, 1.4, WALL_Z + 0.05));
  g.add(box(0.14, 0.06, 0.01, C.dial, -0.46, 1.43, WALL_Z + 0.105));

  return g;
}
