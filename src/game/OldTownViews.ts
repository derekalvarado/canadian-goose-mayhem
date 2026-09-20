import * as THREE from "three";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";

const C = PALETTE.building1;
function box(w: number, h: number, d: number, color: number, x = 0, y = h / 2, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
function cylinder(r: number, h: number, color: number, x = 0, y = h / 2, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), toonMaterial(color));
  m.position.set(x, y, z); m.castShadow = true; return m;
}
function label(text: string, width: number, height: number): THREE.Mesh {
  const material = toonMaterial(C.limestone);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = `#${C.awningSeams.toString(16)}`; ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = `#${C.limestone.toString(16)}`; ctx.font = "bold 58px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 512, 68, 970);
    material.color.set(0xffffff); material.map = new THREE.CanvasTexture(canvas); material.map.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

/** A continuous, low-contrast paving field. The catalog owns its walkable extent. */
export function createOldTownPaving(halfWidth = 22, halfDepth = 18): THREE.Group {
  const group = new THREE.Group();
  group.add(box(halfWidth * 2, .12, halfDepth * 2, C.limestone, 0, -.065));
  const geo = new THREE.BoxGeometry(.98, .016, .48);
  const colors = [PALETTE.oldTown.paving, PALETTE.oldTown.pavingLight, PALETTE.oldTown.pavingShade];
  const batches = colors.map(c => new THREE.InstancedMesh(geo, toonMaterial(c), Math.ceil(halfWidth * 2) * Math.ceil(halfDepth * 4)));
  const counts = [0, 0, 0]; const matrix = new THREE.Matrix4();
  for (let row = 0; row < halfDepth * 4; row++) for (let col = 0; col < halfWidth * 2 - 1; col++) {
    const n = (row * 17 + col * 13) % 11; const color = n < 7 ? 0 : n < 9 ? 1 : 2;
    matrix.makeTranslation(-halfWidth + .75 + col + (row % 2) * .25, -.004, -halfDepth + .25 + row * .5);
    batches[color].setMatrixAt(counts[color]++, matrix);
  }
  batches.forEach((m, i) => { m.count = counts[i]; m.receiveShadow = true; group.add(m); });
  // Thin brick bands frame the pedestrian axis without disrupting walking height.
  if (halfWidth === 22) for (const z of [-12, 12]) group.add(box(44, .025, .32, C.brick, 0, .006, z));
  return group;
}

export function createTownBench(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-.9, .9]) { g.add(box(.1, .5, .65, PALETTE.plaza.iron, x), box(.1, .95, .1, PALETTE.plaza.iron, x, .5, -.27)); }
  for (const z of [-.24, -.08, .08, .24]) g.add(box(2.25, .07, .13, C.frames, 0, .52, z));
  for (const y of [.7, .86, 1.02]) g.add(box(2.25, .12, .08, C.frames, 0, y, -.3));
  return g;
}
export function createTownBed(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(4.6, .4, 1.7, C.brick), box(4.75, .13, 1.85, C.limestone, 0, .43), box(4.3, .03, 1.4, PALETTE.earth.woodDark, 0, .505));
  const geo = new THREE.IcosahedronGeometry(.38, 1);
  for (let i = 0; i < 12; i++) {
    const x = -1.95 + (i % 6) * .78, z = i < 6 ? -.38 : .38;
    const bush = new THREE.Mesh(geo, toonMaterial(i % 3 ? C.awningSeams : PALETTE.green.deciduous));
    bush.position.set(x, .67, z); bush.scale.set(1, .65, .85); bush.castShadow = true; g.add(bush);
    if (i % 2 === 0) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(.12, 0), toonMaterial(i % 3 ? PALETTE.flower.coral : PALETTE.flower.yellow));
      f.position.set(x, .96, z); g.add(f);
    }
  }
  return g;
}
export function createTownLamp(): THREE.Group {
  const g = new THREE.Group();
  g.add(cylinder(.17, .25, PALETTE.plaza.iron), cylinder(.065, 5.5, PALETTE.plaza.iron));
  g.add(box(1.05, .09, .1, PALETTE.plaza.iron, .3, 4.8));
  for (const x of [-.2, .75]) {
    g.add(cylinder(.24, .13, PALETTE.plaza.iron, x, 5.08), cylinder(.16, .32, C.limestone, x, 4.86));
  }
  g.add(box(.7, 1.5, .04, C.awning, .48, 3.75));
  const banner = label("OLD TOWN", .64, .22); banner.position.set(.48, 3.92, .025); g.add(banner);
  // Abstract mountain banner, broad silhouette.
  const shape = new THREE.Shape(); shape.moveTo(-.28, 0); shape.lineTo(-.04, .4); shape.lineTo(.1, .19); shape.lineTo(.28, .34); shape.lineTo(.28, 0); shape.closePath();
  const peak = new THREE.Mesh(new THREE.ShapeGeometry(shape), toonMaterial(C.limestone)); peak.position.set(.48, 3.12, .025); g.add(peak);
  return g;
}
export function createTownLights(): THREE.Group {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 5.2, -8), new THREE.Vector3(0, 4.5, 0), new THREE.Vector3(0, 5.2, 8)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, .018, 4, false), toonMaterial(PALETTE.plaza.iron)));
  for (let i = 0; i <= 14; i++) {
    const p = curve.getPoint(i / 14); const bulb = new THREE.Mesh(new THREE.SphereGeometry(.075, 6, 4), toonMaterial(C.limestone));
    bulb.position.copy(p); bulb.position.y -= .1; g.add(bulb);
  }
  return g;
}
export function createTownFireplace(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.8, .25, 1.4, C.limestone), box(2.3, 1.4, 1, C.brick, 0, .9), box(2.55, .2, 1.25, C.limestone, 0, 1.7));
  g.add(box(1.5, .8, .05, PALETTE.plaza.iron, 0, .85, .51));
  for (const x of [-.45, 0, .45]) g.add(box(.36, .16, .2, C.frames, x, .55, .56));
  return g;
}
export function createTownStage(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(12.4, .5, 5.2, C.brick), box(12.6, .14, 5.4, C.limestone, 0, .54));
  for (let i = 0; i < 3; i++) g.add(box(10 - i * .3, .17, .38, C.limestone, 0, .085 + i * .17, 3.45 - i * .38));
  for (const x of [-5.7, 5.7]) for (const z of [-2.15, 2.15]) g.add(cylinder(.14, 4.75, PALETTE.plaza.iron, x, 2.9, z));
  for (let i = 0; i < 20; i++) {
    const x = -6.65 + i * .7; const y = 5.15 + .62 * (1 - (x / 7) ** 2);
    g.add(box(.71, .18, 5.8, C.frames, x, y));
  }
  for (const z of [-2.85, 2.85]) g.add(box(14, .22, .15, PALETTE.plaza.iron, 0, 5.08, z));
  const sign = label("OLD TOWN SQUARE", 4.6, .55); sign.position.set(0, 4.65, 2.94); g.add(sign);
  return g;
}

/** Photo-informed landmark facades: broad blocks with individual structural bays. */
export function createTownBlock(kind: "miller" | "coopersmith"): THREE.Group {
  const g = new THREE.Group(); const miller = kind === "miller";
  const w = miller ? 15.8 : 17.2, h = miller ? 10.2 : 8.2, d = 8;
  g.add(box(w, h, d, miller ? C.brick : C.brickAccent), box(w + .18, .4, d + .14, C.limestone, 0, .2));
  g.add(box(w - .35, .12, d - .35, C.roof, 0, h + .07));
  for (const z of [-d / 2, d / 2]) g.add(box(w + .4, .22, .32, C.limestone, 0, h + .28, z));
  for (const x of [-w / 2, w / 2]) g.add(box(.3, .22, d - .1, C.limestone, x, h + .28));
  for (const y of [3.45, h - .55]) g.add(box(w + .2, .2, .35, C.limestone, 0, y, 4.08));
  const count = miller ? 7 : 6;
  for (let i = 0; i < count; i++) {
    const x = -w / 2 + 1.15 + i * (w - 2.3) / (count - 1);
    if (miller) {
      const s = new THREE.Shape(); const r = .43;
      s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, 1.75); s.absarc(0, 1.75, r, 0, Math.PI, false); s.lineTo(-r, 0);
      const trim = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: .14, bevelEnabled: false, steps: 1, curveSegments: 12 }), toonMaterial(C.limestone));
      trim.position.set(x, 5.15, 4.01); g.add(trim);
      const pane = new THREE.Mesh(new THREE.ShapeGeometry(s), toonMaterial(C.glass)); pane.scale.set(.8, .92, 1); pane.position.set(x, 5.23, 4.16); g.add(pane);
      g.add(box(1.12, .13, .38, C.limestone, x, 5.12, 4.13));
    } else {
      g.add(box(1.65, 1.95, .14, C.frames, x, 5.65, 4.03), box(1.47, 1.75, .05, C.glass, x, 5.65, 4.12), box(.07, 1.75, .07, C.limestone, x, 5.65, 4.16));
    }
    g.add(box(1.7, 2.65, .16, C.frames, x, 1.68, 4.08), box(1.48, 2.4, .05, C.glass, x, 1.7, 4.19));
    if (miller && i % 2 === 0) {
      const a = box(1.95, .12, 1.1, C.awning, x, 3.01, 4.54); a.rotation.x = .22; g.add(a);
    }
  }
  for (let i = 0; i < 20; i++) g.add(box(.23, .4, .32, C.limestone, -w / 2 + .45 + i * (w - .9) / 19, h - .8, 4.17));
  if (!miller) {
    for (let i = 0; i < 16; i++) {
      const x = -w / 2 + .6 + i * (w - 1.2) / 15;
      const panel = box((w - 1) / 16, .1, 1.8, C.glass, x, 3.2, 4.8); panel.rotation.x = .32; g.add(panel);
      const rib = box(.055, .14, 1.84, C.limestone, x, 3.24, 4.8); rib.rotation.x = .32; g.add(rib);
    }
  }
  const sign = label(miller ? "MILLER BLOCK" : "COOPERSMITH’S", miller ? 4 : 5, .52); sign.position.set(0, miller ? 8.5 : 2.95, miller ? 4.03 : 5.68); g.add(sign);
  // Side elevations remain finished when seen from the entry or editor.
  for (const side of [-1, 1]) for (const z of [-2.7, 0, 2.7]) {
    g.add(box(.1, 2, 1, C.frames, side * (w / 2 + .03), 5.8, z), box(.05, 1.78, .82, C.glass, side * (w / 2 + .09), 5.8, z));
  }
  return g;
}

/** Flush ellipse inlay around the central event space, as shown on the DDA plan. */
export function createTownInlay(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.RingGeometry(7.7, 8, 96), toonMaterial(C.awningSeams));
  m.rotation.x = -Math.PI / 2; m.scale.x = 1.72; m.position.y = .013; m.receiveShadow = true; g.add(m);
  return g;
}
