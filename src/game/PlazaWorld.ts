import { createOldTownPaving, createTownBench, createTownBed, createTownLamp, createTownLights, createTownFireplace, createTownStage, createTownBlock, createTownInlay } from "./OldTownViews.ts";
import * as THREE from "three";
import { JanitorView } from "./JanitorView.ts";
import { SplashKidView } from "./SplashKidView.ts";
import { DeciduousTreeView, deciduousTreeVariantForId } from "./DeciduousTreeView.ts";
import { Building1View } from "./Building1View.ts";
import { TrashCanView } from "./TrashCanView.ts";
import {
  FOUNTAIN_RADIUS,
  PAVILION_SIZE,
  PLAY_AREA_SIZE,
  PLAZA_GROUP_COLLIDERS,
  PLAZA_STATIC_COLLIDERS,
  SPLASH_PAD_RADIUS,
  type PlazaBoxCollider,
} from "./plazaLevel.ts";
import {
  CANONICAL_PLAZA_LAYOUT,
  PLAZA_GROUP_IDS,
  type PlazaGroupId,
  type PlazaLayout,
} from "./plazaLayout.ts";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";
import { OcclusionFadeGroupRegistry } from "./OcclusionFadeGroups.ts";

function finishMesh(mesh: THREE.Mesh, castShadow = true, receiveShadow = true): THREE.Mesh {
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function box(
  width: number,
  height: number,
  depth: number,
  color: number,
  x = 0,
  y = height / 2,
  z = 0,
): THREE.Mesh {
  const mesh = finishMesh(new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    toonMaterial(color),
  ));
  mesh.position.set(x, y, z);
  return mesh;
}

function createPaving(): THREE.Group {
  const group = new THREE.Group();
  group.add(box(54, 0.16, 48, PALETTE.stone.dark, 0, -0.12, 0));

  const columns = 44;
  const rows = 72;
  const geometry = new THREE.BoxGeometry(0.93, 0.035, 0.43);
  const paverColors = [
    PALETTE.plaza.paverLight,
    PALETTE.plaza.paver,
    PALETTE.plaza.paverDark,
  ];
  const pavers = paverColors.map((color) => new THREE.InstancedMesh(
    geometry,
    toonMaterial(color),
    columns * rows,
  ));
  const counts = paverColors.map(() => 0);
  const matrix = new THREE.Matrix4();
  for (let row = 0; row < rows; row += 1) {
    const z = -17.75 + row * 0.5;
    const offset = row % 2 === 0 ? 0 : 0.5;
    for (let column = 0; column < columns; column += 1) {
      const x = -21.5 + column + offset;
      const variant = (row * 7 + column * 3) % paverColors.length;
      matrix.makeTranslation(x, 0.018, z);
      pavers[variant].setMatrixAt(counts[variant], matrix);
      counts[variant] += 1;
    }
  }
  pavers.forEach((mesh, index) => {
    mesh.count = counts[index];
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  });
  return group;
}

function createStreetTile(color: number, elevation: number): THREE.Group {
  const group = new THREE.Group();
  group.add(box(8, 0.16, 8, color, 0, elevation - 0.08, 0));
  return group;
}

function createStraightCurb(): THREE.Group {
  const group = new THREE.Group();
  // Top aligns with the sidewalk while the road rests 0.15 m below it.
  group.add(box(8, 0.15, 0.32, PALETTE.plaza.concrete, 0, -0.075, 0));
  return group;
}

function createRock(x: number, y: number, z: number, radius: number, color: number): THREE.Mesh {
  const rock = finishMesh(new THREE.Mesh(
    new THREE.DodecahedronGeometry(radius, 0),
    toonMaterial(color),
  ));
  rock.position.set(x, y, z);
  rock.scale.set(1.15, 0.72, 0.92);
  rock.rotation.set(-0.1, x * 0.37 + z * 0.2, 0.08);
  return rock;
}


function createBronzeGoose(): THREE.Group {
  const goose = new THREE.Group();
  goose.name = "landing goose fountain statue";
  goose.userData.visualDetailTier = 6;
  goose.userData.pose = "landing";
  const bronze = toonMaterial(PALETTE.plaza.bronze);

  const body = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 16), bronze));
  body.scale.set(0.7, 0.72, 1.3);
  body.position.set(0, 0.68, 0);
  body.rotation.x = -0.25;
  goose.add(body);

  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.78, -0.3),
    new THREE.Vector3(0, 1.05, -0.5),
    new THREE.Vector3(0, 1.42, -0.46),
    new THREE.Vector3(0, 1.62, -0.7),
  ]);
  goose.add(finishMesh(new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 24, 0.12, 10), bronze)));

  const head = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), bronze));
  head.scale.set(0.9, 0.9, 1.15);
  head.position.set(0, 1.65, -0.76);
  goose.add(head);

  const bill = finishMesh(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 8), bronze));
  bill.position.set(0, 1.62, -1.02);
  bill.rotation.x = -Math.PI / 2;
  goose.add(bill);

  for (const side of [-1, 1] as const) {
    const wing = new THREE.Group();
    wing.name = "curved landing wing";
    wing.position.set(side * 0.42, 0.9, 0.1);
    wing.rotation.z = side * -0.18;

    const shoulder = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12), bronze));
    shoulder.scale.set(0.58, 0.72, 0.78);
    shoulder.position.set(side * 0.2, 0.02, 0);
    wing.add(shoulder);

    const primary = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 12), bronze));
    primary.scale.set(0.34, 0.2, 1.18);
    primary.position.set(side * 0.47, -0.18, 0.18);
    primary.rotation.set(-0.24, 0, side * -0.5);
    wing.add(primary);

    const secondary = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 12), bronze));
    secondary.scale.set(0.3, 0.16, 0.94);
    secondary.position.set(side * 0.85, -0.43, 0.31);
    secondary.rotation.set(-0.2, 0, side * -0.78);
    wing.add(secondary);

    for (const [index, featherY] of [0, -0.16, -0.3].entries()) {
      const feather = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), bronze));
      feather.scale.set(0.2, 0.11, 0.62);
      feather.position.set(side * (0.98 + index * 0.12), featherY - 0.39, 0.47 + index * 0.06);
      feather.rotation.set(-0.17, 0, side * (-0.9 - index * 0.1));
      wing.add(feather);
    }
    goose.add(wing);
  }

  goose.rotation.y = -0.52;
  return goose;
}

function createFountain(): THREE.Group {
  const group = new THREE.Group();

  const basin = finishMesh(new THREE.Mesh(
    new THREE.CylinderGeometry(FOUNTAIN_RADIUS, FOUNTAIN_RADIUS, 0.62, 10),
    toonMaterial(PALETTE.plaza.concrete),
  ));
  basin.position.y = 0.31;
  group.add(basin);

  const water = finishMesh(new THREE.Mesh(
    new THREE.CircleGeometry(FOUNTAIN_RADIUS - 0.52, 40),
    toonMaterial(PALETTE.plaza.water),
  ), false);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.635;
  group.add(water);

  const rim = finishMesh(new THREE.Mesh(
    new THREE.RingGeometry(FOUNTAIN_RADIUS - 0.5, FOUNTAIN_RADIUS + 0.03, 10),
    toonMaterial(PALETTE.plaza.sandstone, { side: THREE.DoubleSide }),
  ));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.68;
  group.add(rim);

  group.add(
    createRock(-0.5, 1.28, 0.05, 1.45, PALETTE.plaza.sandstone),
    createRock(0.72, 0.98, 0.38, 1.08, PALETTE.earth.pathShade),
    createRock(-0.85, 0.86, -0.9, 0.95, PALETTE.plaza.paverDark),
  );

  const statue = createBronzeGoose();
  statue.position.set(-0.45, 2.22, -0.05);
  statue.scale.setScalar(1.42);
  statue.userData.scaleComparedToFish = 1.42;
  group.add(statue);

  const streamMaterial = toonMaterial(PALETTE.plaza.waterLight);
  for (const [x, z, height] of [[-1.28, 0.1, 0.74], [0.42, 0.9, 0.58], [-0.72, -0.86, 0.48]] as const) {
    const stream = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, height, 8), streamMaterial), false);
    stream.position.set(x, 0.68 + height / 2, z);
    group.add(stream);
  }
  return group;
}

interface SplashJet {
  readonly mesh: THREE.Mesh;
  readonly baseHeight: number;
  readonly phase: number;
  readonly interval: number;
  readonly duration: number;
  nextBurst: number;
}

function splashVariation(index: number, salt: number): number {
  const value = Math.sin((index + 1) * (12.9898 + salt * 78.233)) * 43758.5453;
  return value - Math.floor(value);
}

/** Presentation-only splash pad animation; it has no gameplay or simulation state. */
export class SplashPadView extends THREE.Group {
  private readonly jets: SplashJet[] = [];
  private active = true;

  constructor() {
    super();
    this.name = "Splash pad";

    const border = finishMesh(new THREE.Mesh(
      new THREE.RingGeometry(SPLASH_PAD_RADIUS, SPLASH_PAD_RADIUS + 0.52, 64),
      toonMaterial(PALETTE.plaza.concrete, { side: THREE.DoubleSide }),
    ), false);
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.08;
    this.add(border);

    const surface = finishMesh(new THREE.Mesh(
      new THREE.CircleGeometry(SPLASH_PAD_RADIUS, 64),
      toonMaterial(PALETTE.stone.mid, { side: THREE.DoubleSide }),
    ), false);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = 0.06;
    this.add(surface);

    const paverGeometry = new THREE.BoxGeometry(0.95, 0.045, 0.62);
    const paverColors = [PALETTE.stone.light, PALETTE.stone.mid, PALETTE.stone.dark];
    const pavers = paverColors.map((color) => new THREE.InstancedMesh(
      paverGeometry,
      toonMaterial(color),
      180,
    ));
    const counts = paverColors.map(() => 0);
    const matrix = new THREE.Matrix4();
    for (let row = -7; row <= 7; row += 1) {
      for (let column = -7; column <= 7; column += 1) {
        const x = column * 1.02 + (row & 1 ? 0.51 : 0);
        const z = row * 0.66;
        if (Math.hypot(x, z) > SPLASH_PAD_RADIUS - 0.18) continue;
        const variant = ((row * 5 + column * 3 + 30) % paverColors.length + paverColors.length) % paverColors.length;
        matrix.makeTranslation(x, 0.085, z);
        pavers[variant].setMatrixAt(counts[variant], matrix);
        counts[variant] += 1;
      }
    }
    pavers.forEach((mesh, index) => {
      mesh.count = counts[index];
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.add(mesh);
    });

    const nozzleMaterial = toonMaterial(PALETTE.plaza.iron);
    const jetMaterial = toonMaterial(PALETTE.plaza.water, { transparent: true, opacity: 0.9 });
    for (let index = 0; index < 12; index += 1) {
      const angle = index * Math.PI * 2 / 12 + (index % 2) * 0.12;
      const radius = index % 3 === 0 ? 3.15 : index % 3 === 1 ? 2.05 : 1.1;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const nozzle = finishMesh(new THREE.Mesh(
        new THREE.CylinderGeometry(0.115, 0.115, 0.028, 12),
        nozzleMaterial,
      ), false);
      nozzle.position.set(x, 0.12, z);
      nozzle.userData.splashPadNozzle = true;
      this.add(nozzle);

      const jet = finishMesh(new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.07, 1, 8),
        jetMaterial,
      ), false);
      jet.position.set(x, 0.13, z);
      jet.scale.y = 0.001;
      jet.visible = false;
      this.add(jet);

      const phase = splashVariation(index, 0.31);
      this.jets.push({
        mesh: jet,
        baseHeight: 0.62 + splashVariation(index, 0.73) * 0.65,
        phase,
        interval: 1.45 + splashVariation(index, 1.17) * 2.7,
        duration: 0.42 + splashVariation(index, 1.91) * 0.34,
        nextBurst: 0.4 + phase * 2.1,
      });
    }
  }

  update(delta: number): void {
    if (!this.active) {
      for (const jet of this.jets) jet.mesh.visible = false;
      return;
    }
    for (const jet of this.jets) {
      jet.nextBurst -= delta;
      if (jet.nextBurst > 0) continue;
      jet.nextBurst += jet.interval;

      const burstDuration = jet.duration;
      jet.mesh.userData.splashPadBurstRemaining = burstDuration;
    }

    for (const jet of this.jets) {
      const remaining = Math.max(0, Number(jet.mesh.userData.splashPadBurstRemaining ?? 0) - delta);
      jet.mesh.userData.splashPadBurstRemaining = remaining;
      if (remaining <= 0) {
        jet.mesh.visible = false;
        continue;
      }
      const progress = 1 - remaining / jet.duration;
      const envelope = Math.sin(Math.PI * progress);
      const wobble = 0.92 + Math.sin(progress * Math.PI * 2 + jet.phase * 5) * 0.08;
      const height = Math.max(0.02, jet.baseHeight * envelope * wobble);
      jet.mesh.visible = true;
      jet.mesh.scale.y = height;
      jet.mesh.position.y = 0.13 + height / 2;
    }
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (!active) for (const jet of this.jets) jet.mesh.visible = false;
    else for (const jet of this.jets) jet.nextBurst = Math.min(jet.nextBurst, 0.18 + jet.phase * 0.35);
  }
}

function createSplashPad(): SplashPadView {
  const group = new SplashPadView();
  return group;
}

function createSplashFaucet(): THREE.Group {
  const group = new THREE.Group();
  group.name = "splash-pad faucet";
  const metal = toonMaterial(PALETTE.plaza.iron);
  const handleMaterial = toonMaterial(PALETTE.accent.red);
  const pedestal = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.23, 0.55, 12), metal));
  pedestal.position.y = 0.275;
  const neck = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.34, 10), metal));
  neck.position.set(0, 0.58, -0.08); neck.rotation.x = Math.PI / 2;
  const handle = finishMesh(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.075, 0.09), handleMaterial));
  handle.position.set(0, 0.58, -0.19); handle.name = "faucet-handle"; handle.userData.interactionPoint = true;
  const center = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.1, 12), metal));
  center.position.copy(handle.position); center.rotation.z = Math.PI / 2;
  group.add(pedestal, neck, handle, center);
  return group;
}

function createBeerCan(): THREE.Group {
  const group = new THREE.Group(); group.name = "little beer can";
  const body = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.145, 16), toonMaterial(PALETTE.accent.red)));
  body.position.y = 0.073;
  const top = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.008, 16), toonMaterial(PALETTE.workwear.reflective)));
  top.position.y = 0.149;
  const stripe = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.049, 0.025, 16, 1, true), toonMaterial(PALETTE.accent.cream)));
  stripe.position.y = 0.075;
  const tab = finishMesh(new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.004, 6, 10), toonMaterial(PALETTE.plaza.iron)));
  tab.rotation.x = Math.PI / 2; tab.position.set(0, 0.155, -0.008);
  group.add(body, top, stripe, tab); return group;
}

function createShopEntranceMarker(): THREE.Group {
  const group = new THREE.Group(); group.name = "shop entrance threshold";
  const mat = finishMesh(new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.025, 0.72), toonMaterial(PALETTE.earth.pathShade)), false, true);
  mat.position.y = 0.013; mat.userData.gameplayMarker = "shop-entrance"; group.add(mat); return group;
}

function createPlaySculptures(): THREE.Group {
  const group = new THREE.Group();
  const sculptureMaterial = toonMaterial(PALETTE.plaza.concreteShade);

  const bear = new THREE.Group();
  bear.name = "oversized bear sculpture";
  bear.userData.playSculpture = "bear";
  bear.userData.visualDetailTier = 6;
  bear.userData.relativeScale = "about twice the fish sculpture";
  bear.position.set(-3.1, 0, -0.1);
  const bearBody = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14), sculptureMaterial));
  bearBody.scale.set(0.82, 1.02, 0.75);
  bearBody.position.y = 0.72;
  bear.add(bearBody);
  const bearHead = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(0.43, 20, 14), sculptureMaterial));
  bearHead.position.set(0, 1.43, -0.15);
  bear.add(bearHead);
  for (const side of [-1, 1] as const) {
    const ear = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), sculptureMaterial));
    ear.position.set(side * 0.3, 1.72, -0.12);
    bear.add(ear);
  }
  bear.scale.setScalar(2.8);
  group.add(bear);

  const fish = new THREE.Group();
  fish.name = "fish sculpture";
  fish.userData.playSculpture = "fish";
  fish.userData.visualDetailTier = 6;
  fish.position.set(1.3, 0.62, 0);
  const fishBody = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(0.72, 22, 14), sculptureMaterial));
  fishBody.scale.set(1.5, 0.62, 0.68);
  fish.add(fishBody);
  const tail = finishMesh(new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.85, 3), sculptureMaterial));
  tail.position.x = 1.2;
  tail.rotation.z = Math.PI / 2;
  fish.add(tail);
  group.add(fish);
  return group;
}

function createPlayArea(): THREE.Group {
  const group = new THREE.Group();
  const floor = box(
    PLAY_AREA_SIZE.halfWidth * 2 - 0.5,
    0.08,
    PLAY_AREA_SIZE.halfDepth * 2 - 0.5,
    PALETTE.plaza.rubber,
    0,
    0.04,
    0,
  );
  floor.castShadow = false;
  group.add(floor);

  for (const obstacle of PLAZA_GROUP_COLLIDERS["plaza.play-area"]) {
    if (obstacle.shape !== "box" || !obstacle.id.startsWith("plaza.play-wall")) continue;
    group.add(box(
      obstacle.halfWidth * 2,
      0.58,
      obstacle.halfDepth * 2,
      PALETTE.plaza.sandstone,
      obstacle.x,
      0.29,
      obstacle.z,
    ));
  }
  group.add(createPlaySculptures());
  return group;
}

function createPavilion(groups: OcclusionFadeGroupRegistry, namespace = "plaza.pavilion-stage"): THREE.Group {
  const group = new THREE.Group();
  group.add(box(PAVILION_SIZE.halfWidth * 2, 0.52, PAVILION_SIZE.halfDepth * 2, PALETTE.earth.woodDark, 0, 0.26, 0));
  group.add(box(PAVILION_SIZE.halfWidth * 2 - 0.5, 0.08, PAVILION_SIZE.halfDepth * 2 - 0.35, PALETTE.earth.woodLight, 0, 0.56, 0));

  const canopy = new THREE.Group();
  const columnMaterial = toonMaterial(PALETTE.plaza.iron);
  for (const x of [-6.15, 6.15]) {
    for (const z of [-1.75, 1.75]) {
      const column = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 4.1, 10), columnMaterial));
      column.position.set(x, 2.55, z);
      canopy.add(column);
    }
  }
  canopy.add(
    box(14.8, 0.28, 5.45, PALETTE.plaza.iron, 0, 4.58, 0),
    box(13.8, 0.17, 4.8, PALETTE.earth.woodDark, 0, 4.38, 0),
  );
  group.add(canopy);
  groups.register(`${namespace}.canopy`, canopy);
  return group;
}

interface LongSideFacadeSpec {
  readonly centerX: number;
  readonly width: number;
  readonly height: number;
  readonly color: number;
  readonly trim: number;
  readonly awning: number;
}

function createLongSideFacade(spec: LongSideFacadeSpec, side: -1 | 1, rowCenterZ = 0): THREE.Group {
  const group = new THREE.Group();
  const buildingZ = side * 20 - rowCenterZ;
  const frontZ = side * 18.04 - rowCenterZ;
  const awningZ = side * 17.72 - rowCenterZ;

  group.add(
    box(spec.width, spec.height, 3.8, spec.color, spec.centerX, spec.height / 2, buildingZ),
    box(spec.width + 0.16, 0.28, 4.02, spec.trim, spec.centerX, spec.height - 0.2, buildingZ),
    box(spec.width + 0.08, 0.2, 0.24, spec.trim, spec.centerX, 3.08, frontZ),
  );

  const pilasterMaterial = PALETTE.plaza.brickDark;
  for (const x of [spec.centerX - spec.width / 2 + 0.18, spec.centerX + spec.width / 2 - 0.18]) {
    group.add(box(0.28, spec.height - 0.45, 0.2, pilasterMaterial, x, (spec.height - 0.45) / 2, frontZ - side * 0.03));
    group.add(box(0.42, 0.16, 0.28, spec.trim, x, spec.height - 0.43, frontZ - side * 0.04));
  }

  const doorX = spec.centerX - spec.width * 0.28;
  group.add(
    box(1.12, 2.32, 0.12, PALETTE.earth.woodDark, doorX, 1.2, frontZ),
    box(1.34, 0.14, 0.18, spec.trim, doorX, 2.43, frontZ - side * 0.03),
    box(0.1, 2.42, 0.18, spec.trim, doorX - 0.62, 1.2, frontZ - side * 0.03),
    box(0.1, 2.42, 0.18, spec.trim, doorX + 0.62, 1.2, frontZ - side * 0.03),
  );
  const doorHandle = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toonMaterial(PALETTE.accent.sunlight)), false);
  doorHandle.position.set(doorX + 0.3, 1.2, frontZ - side * 0.1);
  group.add(doorHandle);

  const storefrontX = spec.centerX + spec.width * 0.14;
  const storefrontWidth = Math.max(2.35, spec.width * 0.56);
  group.add(
    box(storefrontWidth, 2.08, 0.11, PALETTE.plaza.window, storefrontX, 1.18, frontZ),
    box(storefrontWidth + 0.18, 0.3, 0.72, spec.awning, storefrontX, 2.55, awningZ),
    box(storefrontWidth + 0.26, 0.12, 0.16, spec.trim, storefrontX, 2.28, frontZ - side * 0.04),
  );
  for (const x of [storefrontX - storefrontWidth / 3, storefrontX, storefrontX + storefrontWidth / 3]) {
    group.add(box(0.07, 1.96, 0.16, spec.trim, x, 1.18, frontZ - side * 0.05));
  }
  for (const index of [-1, 0, 1] as const) {
    group.add(box(0.2, 0.12, 0.18, spec.trim, storefrontX + index * storefrontWidth * 0.34, 2.75, awningZ - side * 0.06));
  }

  const upperFloors = Math.max(1, Math.floor((spec.height - 3.6) / 2.25));
  const windowCount = Math.max(2, Math.floor(spec.width / 2));
  for (let floor = 0; floor < upperFloors; floor += 1) {
    for (let index = 0; index < windowCount; index += 1) {
      const x = spec.centerX - (windowCount - 1) * 0.86 + index * 1.72;
      const y = 4.16 + floor * 2.08;
      group.add(
        box(0.98, 1.3, 0.1, PALETTE.plaza.window, x, y, frontZ),
        box(1.22, 0.12, 0.18, spec.trim, x, y + 0.72, frontZ - side * 0.02),
        box(1.22, 0.12, 0.18, spec.trim, x, y - 0.72, frontZ - side * 0.02),
        box(0.08, 1.18, 0.18, spec.trim, x, y, frontZ - side * 0.03),
      );
    }
  }
  return group;
}

function createLongSideBuildings(groups: OcclusionFadeGroupRegistry, namespace = "plaza.building", localPivot = false): THREE.Group {
  const group = new THREE.Group();
  const north: readonly LongSideFacadeSpec[] = [
    { centerX: -17.6, width: 8.4, height: 7.8, color: PALETTE.plaza.brickDark, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningBlue },
    { centerX: -8.8, width: 8.8, height: 9.2, color: PALETTE.plaza.brick, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningGreen },
    { centerX: 0.2, width: 8.7, height: 7.4, color: PALETTE.plaza.brickLight, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningBlue },
    { centerX: 9.1, width: 8.7, height: 9.5, color: PALETTE.plaza.brick, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningGreen },
    { centerX: 17.8, width: 8.3, height: 8.2, color: PALETTE.plaza.brickDark, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningBlue },
  ];
  for (const [index, spec] of north.entries()) {
    const facade = createLongSideFacade(spec, -1, localPivot ? -20 : 0);
    groups.register(`${namespace}.north.${index + 1}`, facade);
    group.add(facade);
  }
  return group;
}

function createCornerWindow(front: boolean, coordinate: number, y: number, width: number, height: number, trim: number): THREE.Group {
  const group = new THREE.Group();
  group.userData.assetRole = "window";
  group.userData.windowCenterY = y;
  group.userData.windowHeight = height;
  group.userData.windowSurface = front ? "front" : "side";
  const x = front ? coordinate : 7.34;
  const z = front ? -6.04 : coordinate;
  group.add(front
    ? box(width, height, 0.14, PALETTE.plaza.window, x, y, z)
    : box(0.14, height, width, PALETTE.plaza.window, x, y, z));

  if (front) {
    group.add(
      box(width + 0.22, 0.12, 0.2, trim, x, y + height / 2 + 0.1, z),
      box(width + 0.22, 0.12, 0.2, trim, x, y - height / 2 - 0.1, z),
      box(0.12, height + 0.22, 0.2, trim, x - width / 2 - 0.1, y, z),
      box(0.12, height + 0.22, 0.2, trim, x + width / 2 + 0.1, y, z),
      box(0.08, height, 0.18, trim, x, y, z - 0.09),
    );
  } else {
    group.add(
      box(0.2, 0.12, width + 0.22, trim, x, y + height / 2 + 0.1, z),
      box(0.2, 0.12, width + 0.22, trim, x, y - height / 2 - 0.1, z),
      box(0.2, height + 0.22, 0.12, trim, x, y, z - width / 2 - 0.1),
      box(0.2, height + 0.22, 0.12, trim, x, y, z + width / 2 + 0.1),
      box(0.18, height, 0.08, trim, x - 0.09, y, z),
    );
  }
  return group;
}

function createCornerAwning(front: boolean, coordinate: number, width: number, color: number): THREE.Group {
  const group = new THREE.Group();
  const x = front ? coordinate : 7.58;
  const z = front ? -6.28 : coordinate;
  const canopy = front
    ? box(width, 0.18, 0.78, color, x, 3.02, z)
    : box(0.78, 0.18, width, color, x, 3.02, z);
  canopy.rotation[front ? "x" : "z"] = front ? -0.16 : 0.16;
  group.add(canopy);
  group.add(front
    ? box(width + 0.08, 0.22, 0.12, PALETTE.plaza.brickDark, x, 2.9, z - 0.34)
    : box(0.12, 0.22, width + 0.08, PALETTE.plaza.brickDark, x + 0.34, 2.9, z));
  return group;
}

function createCornerDoor(front: boolean, coordinate: number): THREE.Group {
  const group = new THREE.Group();
  const x = front ? coordinate : 7.4;
  const z = front ? -6.08 : coordinate;
  group.add(front
    ? box(1.24, 2.7, 0.16, PALETTE.earth.woodDark, x, 1.38, z)
    : box(0.16, 2.7, 1.24, PALETTE.earth.woodDark, x, 1.38, z));
  group.add(front
    ? box(1.48, 0.14, 0.22, PALETTE.accent.cream, x, 2.82, z)
    : box(0.22, 0.14, 1.48, PALETTE.accent.cream, x, 2.82, z));
  const handle = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toonMaterial(PALETTE.accent.sunlight)), false);
  handle.position.set(front ? x + 0.32 : x - 0.1, 1.35, front ? z - 0.11 : z - 0.32);
  group.add(handle);
  return group;
}

/** A detailed two-story corner market inspired by the brick storefronts around Old Town. */
function createCornerMarketBuilding(groups: OcclusionFadeGroupRegistry, namespace = "plaza.corner-market-building"): THREE.Group {
  const group = new THREE.Group();
  const brick = PALETTE.plaza.brickLight;
  const brickShadow = PALETTE.plaza.brick;
  const stone = PALETTE.plaza.concrete;
  const iron = PALETTE.plaza.iron;
  const trim = PALETTE.accent.cream;

  const windowLedgeY = 3.95;
  const frontWindowLedge = box(14.78, 0.28, 0.32, trim, 0, windowLedgeY, -6.04);
  frontWindowLedge.name = "corner-window-ledge-front";
  frontWindowLedge.userData.assetRole = "window-ledge";
  const sideWindowLedge = box(0.32, 0.28, 12.08, trim, 7.28, windowLedgeY, 0);
  sideWindowLedge.name = "corner-window-ledge-side";
  sideWindowLedge.userData.assetRole = "window-ledge";
  group.add(
    box(14.5, 10.2, 11.8, brick, 0, 5.1, 0),
    box(14.85, 0.42, 12.1, stone, 0, 0.3, 0),
    frontWindowLedge,
    sideWindowLedge,
    box(14.82, 0.24, 0.3, trim, 0, 6.98, -6.04),
    box(0.3, 0.24, 12.04, trim, 7.28, 6.98, 0),
  );

  for (const x of [-6.9, 6.9]) {
    group.add(box(0.3, 9.9, 0.34, brickShadow, x, 5.05, -6.03));
  }
  for (const z of [-5.7, 5.7]) {
    group.add(box(0.34, 9.9, 0.3, brickShadow, 7.25, 5.05, z));
  }

  for (const x of [-4.5, -1.9, 0.7, 3.3]) {
    group.add(createCornerWindow(true, x, 5.05, 0.95, 1.85, trim), createCornerWindow(true, x, 7.7, 0.95, 1.85, trim));
  }
  for (const z of [-4.3, -1.7, 0.9, 3.5]) {
    group.add(createCornerWindow(false, z, 5.05, 0.95, 1.85, trim), createCornerWindow(false, z, 7.7, 0.95, 1.85, trim));
  }

  group.add(
    createCornerWindow(true, -4.25, 1.55, 2.55, 2.05, trim),
    createCornerWindow(true, -0.85, 1.55, 2.55, 2.05, trim),
    createCornerWindow(false, -3.95, 1.55, 2.55, 2.05, trim),
    createCornerWindow(false, -0.55, 1.55, 2.55, 2.05, trim),
    createCornerAwning(true, -4.25, 2.75, PALETTE.accent.red),
    createCornerAwning(true, -0.85, 2.75, PALETTE.plaza.awningGreen),
    createCornerAwning(false, -3.95, 2.75, PALETTE.plaza.awningGreen),
    createCornerAwning(false, -0.55, 2.75, PALETTE.accent.red),
    createCornerDoor(true, 5.42),
    createCornerDoor(false, 4.88),
  );

  // Deep eaves, repeating brackets, and a raised parapet give the roofline the
  // ornate silhouette visible in the reference instead of a plain box roof.
  group.add(
    box(15.35, 0.4, 12.55, iron, 0, 10.35, 0),
    box(15.65, 0.26, 12.84, stone, 0, 10.72, 0),
    box(15.28, 0.18, 0.42, iron, 0, 10.94, -6.32),
    box(0.42, 0.18, 12.5, iron, 7.58, 10.94, 0),
  );
  for (const x of [-6.35, -4.6, -2.85, -1.1, 0.65, 2.4, 4.15, 5.9]) {
    group.add(box(0.24, 0.54, 0.3, iron, x, 10.22, -6.18));
  }
  for (const z of [-5.65, -3.9, -2.15, -0.4, 1.35, 3.1, 4.85]) {
    group.add(box(0.3, 0.54, 0.24, iron, 7.42, 10.22, z));
  }
  for (const x of [-6.5, -4.3, -2.1, 0.1, 2.3, 4.5, 6.5]) {
    group.add(box(0.12, 0.62, 0.12, trim, x, 11.08, -6.28));
  }

  const sign = new THREE.Group();
  sign.add(
    box(2.5, 0.78, 0.22, iron, -3.75, 11.48, -6.2),
    box(1.88, 0.4, 0.08, trim, -3.75, 11.5, -6.34),
    box(1.1, 0.12, 0.12, PALETTE.accent.sunlight, -3.75, 11.8, -6.35),
  );
  group.add(sign);

  const turret = new THREE.Group();
  turret.add(
    box(1.65, 0.68, 1.65, brickShadow, 4.35, 11.18, -4.35),
    box(1.85, 0.18, 1.85, iron, 4.35, 11.58, -4.35),
  );
  const turretRoof = finishMesh(new THREE.Mesh(new THREE.ConeGeometry(1.18, 1.15, 4), toonMaterial(iron)), true, true);
  turretRoof.position.set(4.35, 12.22, -4.35);
  turretRoof.rotation.y = Math.PI / 4;
  turret.add(turretRoof);
  group.add(turret);

  groups.register(namespace, group);
  return group;
}

function createPlanter(obstacle: PlazaBoxCollider): THREE.Group {
  const group = new THREE.Group();
  const width = obstacle.halfWidth * 2;
  const depth = obstacle.halfDepth * 2;
  const x = obstacle.x;
  const z = obstacle.z;
  group.add(box(
    width + 0.22,
    0.14,
    depth + 0.22,
    PALETTE.plaza.concreteShade,
    x,
    0.07,
    z,
  ));
  group.add(box(
    width,
    0.68,
    depth,
    PALETTE.plaza.sandstone,
    x,
    0.42,
    z,
  ));

  const trim = PALETTE.accent.cream;
  const rimY = 0.78;
  group.add(
    box(width + 0.2, 0.12, 0.2, trim, x, rimY, z - depth / 2),
    box(width + 0.2, 0.12, 0.2, trim, x, rimY, z + depth / 2),
    box(0.2, 0.12, depth - 0.16, trim, x - width / 2, rimY, z),
    box(0.2, 0.12, depth - 0.16, trim, x + width / 2, rimY, z),
  );
  const soil = box(
    Math.max(0.2, width - 0.34),
    0.12,
    Math.max(0.2, depth - 0.34),
    PALETTE.earth.pathShade,
    x,
    0.78,
    z,
  );
  soil.name = "planter soil";
  soil.userData.assetRole = "soil";
  group.add(soil);

  const panelMaterial = PALETTE.plaza.brickDark;
  const panelInset = PALETTE.plaza.sandstone;
  const longSide = obstacle.halfWidth >= obstacle.halfDepth;
  const panelCount = Math.max(1, Math.floor((longSide ? width : depth) / 2.2));
  for (let index = 0; index < panelCount; index += 1) {
    const progress = panelCount === 1 ? 0 : index / (panelCount - 1) * 2 - 1;
    const panel = longSide
      ? box(0.9, 0.3, 0.035, panelMaterial, x + progress * obstacle.halfWidth * 0.72, 0.4, z - depth / 2 - 0.02)
      : box(0.035, 0.3, 0.9, panelMaterial, x - width / 2 - 0.02, 0.4, z + progress * obstacle.halfDepth * 0.72);
    const inset = longSide
      ? box(0.56, 0.16, 0.045, panelInset, x + progress * obstacle.halfWidth * 0.72, 0.4, z - depth / 2 - 0.045)
      : box(0.045, 0.16, 0.56, panelInset, x - width / 2 - 0.045, 0.4, z + progress * obstacle.halfDepth * 0.72);
    group.add(panel, inset);
  }

  const flowerColors = [PALETTE.flower.coral, PALETTE.flower.yellow, PALETTE.flower.pink];
  const count = Math.max(4, Math.floor(obstacle.halfDepth * 2.2 + obstacle.halfWidth * 1.7));
  for (let index = 0; index < count; index += 1) {
    const alongX = obstacle.halfWidth > obstacle.halfDepth;
    const progress = (index + 0.5) / count * 2 - 1;
    const flower = finishMesh(new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 7),
      toonMaterial(flowerColors[index % flowerColors.length]),
    ), false);
    flower.position.set(
      x + (alongX ? progress * obstacle.halfWidth * 0.75 : (index % 2 - 0.5) * 0.42),
      0.93 + (index % 3) * 0.04,
      z + (alongX ? (index % 2 - 0.5) * 0.42 : progress * obstacle.halfDepth * 0.78),
    );
    group.add(flower);
  }
  return group;
}

function createTree(id: string, x: number, z: number, height: number, groups: OcclusionFadeGroupRegistry): THREE.Group {
  const group = new THREE.Group();
  group.userData.visualDetailTier = 6;
  const trunk = finishMesh(new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.5, height * 0.64, 12),
    toonMaterial(PALETTE.earth.woodDark),
  ));
  trunk.position.set(x, height * 0.32, z);
  group.add(trunk);
  const rootMaterial = toonMaterial(PALETTE.earth.wood);
  for (const [angle, scale] of [[0.2, 1], [2.25, 0.86], [4.35, 0.9]] as const) {
    const root = finishMesh(new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.36, 7), rootMaterial));
    root.position.set(x + Math.cos(angle) * 0.34, 0.18, z + Math.sin(angle) * 0.34);
    root.scale.set(scale, 1, 0.68);
    root.rotation.y = angle;
    group.add(root);
  }
  const branchMaterial = toonMaterial(PALETTE.earth.wood);
  for (const [offsetX, offsetY, offsetZ, length, tilt] of [
    [-0.34, 0.47, 0.02, 1.45, -0.65], [0.32, 0.52, -0.04, 1.55, 0.62],
    [-0.18, 0.63, 0.08, 1.2, -0.38], [0.22, 0.68, 0.02, 1.05, 0.4],
  ] as const) {
    const branch = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, length, 8), branchMaterial));
    branch.position.set(x + offsetX, height * offsetY, z + offsetZ);
    branch.rotation.z = tilt;
    branch.rotation.x = 0.18;
    group.add(branch);
  }
  const crownMaterials = [toonMaterial(PALETTE.green.leaf), toonMaterial(PALETTE.green.hedge), toonMaterial(PALETTE.green.grass)];
  // Three separated crowns keep the forks readable and avoid a single green
  // bubble, while the modest geometry stays inexpensive when camera-faded.
  const crownGeometry = new THREE.IcosahedronGeometry(1, 2);
  for (const [index, [offsetX, offsetY, offsetZ, scaleX, scaleY, scaleZ]] of [
    [0, 0.86, 0, 0.86, 0.74, 0.92],
    [-1.35, 0.7, 0.1, 0.78, 0.68, 0.78],
    [1.38, 0.71, -0.12, 0.8, 0.7, 0.8],
  ].entries()) {
    const crown = finishMesh(new THREE.Mesh(crownGeometry, crownMaterials[index % crownMaterials.length]));
    crown.position.set(x + offsetX, height * offsetY, z + offsetZ);
    crown.scale.set(scaleX, scaleY, scaleZ);
    group.add(crown);
  }
  groups.register(id, group);
  return group;
}

function createCafeTable(): THREE.Group {
  const group = new THREE.Group();
  const metal = toonMaterial(PALETTE.plaza.awningBlue);
  group.add(
    finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.72, 10), metal)),
    finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 12), metal)),
  );
  const stem = group.children[0] as THREE.Mesh;
  stem.position.set(0, 0.36, 0);
  const foot = group.children[1] as THREE.Mesh;
  foot.position.set(0, 0.06, 0);
  const top = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.1, 18), metal));
  top.position.set(0, 0.76, 0);
  group.add(top);
  const topInset = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.025, 18), toonMaterial(PALETTE.plaza.awningGreen)), false);
  topInset.position.set(0, 0.82, 0);
  group.add(topInset);
  for (let index = 0; index < 3; index += 1) {
    const angle = index / 3 * Math.PI * 2;
    const chair = new THREE.Group();
    chair.name = "cafe chair";
    chair.position.set(Math.cos(angle) * 0.88, 0, Math.sin(angle) * 0.88);
    chair.rotation.y = -angle;
    chair.add(
      box(0.52, 0.11, 0.52, PALETTE.plaza.awningBlue, 0, 0.48, 0),
      box(0.52, 0.62, 0.1, PALETTE.plaza.awningBlue, 0, 0.78, 0.22),
    );
    for (const legX of [-0.18, 0.18] as const) {
      chair.add(box(0.08, 0.42, 0.08, PALETTE.plaza.iron, legX, 0.26, -0.16));
    }
    group.add(chair);
  }
  return group;
}

function createPlanterCluster(): THREE.Group {
  const group = new THREE.Group();
  for (const planter of PLAZA_STATIC_COLLIDERS) {
    group.add(createPlanter(planter));
  }
  return group;
}

function createSinglePlanter(halfWidth: number, halfDepth: number): THREE.Group {
  return createPlanter({ id: "editor.planter", shape: "box", x: 0, z: 0, halfWidth, halfDepth });
}

function createTreeCluster(groups: OcclusionFadeGroupRegistry, namespace = "plaza.tree"): THREE.Group {
  const group = new THREE.Group();
  group.add(
    createTree(`${namespace}.east-north`, 19.35, -7.2, 6.7, groups),
    createTree(`${namespace}.east-south`, 19.35, 6.2, 6.2, groups),
    createTree(`${namespace}.south`, 7.8, 16.7, 6.8, groups),
    createTree(`${namespace}.north-west`, -17.5, 13.5, 7.2, groups),
  );
  return group;
}

function createFurnitureAndPlanting(groups: OcclusionFadeGroupRegistry): THREE.Group {
  const group = new THREE.Group();
  group.add(createPlanterCluster(), createTreeCluster(groups));
  return group;
}

function createEditableGroup(
  id: PlazaGroupId,
  layout: PlazaLayout,
  contents: THREE.Group,
): THREE.Group {
  const wrapper = new THREE.Group();
  const definition = layout.groups[id];
  wrapper.name = definition.label;
  wrapper.userData.layoutGroupId = id;
  wrapper.position.set(definition.position.x, 0, definition.position.z);
  wrapper.rotation.y = definition.rotationY;
  wrapper.add(contents);
  return wrapper;
}

function createStringLights(): THREE.Group {
  const group = new THREE.Group();
  const cableMaterial = toonMaterial(PALETTE.plaza.iron);
  const bulbMaterial = toonMaterial(PALETTE.accent.sunlight);
  for (let row = 0; row < 5; row += 1) {
    const z = -10 + row * 5.1;
    const cable = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 38, 6), cableMaterial), false);
    cable.position.set(0, 5.35, z);
    cable.rotation.z = Math.PI / 2;
    group.add(cable);
    for (let index = 0; index < 10; index += 1) {
      const bulb = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), bulbMaterial), false);
      bulb.position.set(-17 + index * 3.8, 5.2, z);
      group.add(bulb);
    }
  }
  return group;
}

/** A camera-safe interpretation of Fort Collins' central Old Town plaza. */
export class PlazaWorld extends THREE.Group {
  readonly editableGroups = new Map<PlazaGroupId, THREE.Group>();
  readonly occlusionFadeGroups = new OcclusionFadeGroupRegistry();

  constructor(layout: PlazaLayout = CANONICAL_PLAZA_LAYOUT) {
    super();
    const contents: Record<PlazaGroupId, THREE.Group> = {
      "plaza.goose-fountain": createFountain(),
      "plaza.splash-pad": createSplashPad(),
      "plaza.play-area": createPlayArea(),
      "plaza.pavilion-stage": createPavilion(this.occlusionFadeGroups),
      "plaza.cafe-table-1": createCafeTable(),
      "plaza.cafe-table-2": createCafeTable(),
      "plaza.cafe-table-3": createCafeTable(),
    };
    for (const id of PLAZA_GROUP_IDS) {
      const group = createEditableGroup(id, layout, contents[id]);
      this.editableGroups.set(id, group);
      this.add(group);
    }
    this.add(
      createPaving(),
      createLongSideBuildings(this.occlusionFadeGroups),
      createFurnitureAndPlanting(this.occlusionFadeGroups),
      createStringLights(),
    );
  }

  applyLayout(layout: PlazaLayout): void {
    for (const id of PLAZA_GROUP_IDS) {
      const group = this.editableGroups.get(id);
      const definition = layout.groups[id];
      if (!group) continue;
      group.position.set(definition.position.x, 0, definition.position.z);
      group.rotation.set(0, definition.rotationY, 0);
    }
  }
}

/** Renderer implementation for the source-owned WorldEditor catalog. */
export function createWorldAssetView(assetId: string, groups: OcclusionFadeGroupRegistry, instanceId = assetId): THREE.Group {
  switch (assetId) {
    case "plaza.paving-base": return createOldTownPaving();
    case "plaza.paving-patch": return createOldTownPaving(4, 4);
    case "plaza.paving-patch-large": return createOldTownPaving(8, 8);
    case "street.sidewalk-tile": return createStreetTile(PALETTE.plaza.concrete, 0);
    case "street.road-tile": return createStreetTile(PALETTE.stone.dark, -0.15);
    case "street.curb-straight": return createStraightCurb();
    case "plaza.building-frontage": return createLongSideBuildings(groups, instanceId, true);
    case "plaza.corner-market-building": return createCornerMarketBuilding(groups, instanceId);
    case "plaza.goose-fountain": return createFountain();
    case "plaza.splash-pad": return createSplashPad();
    case "plaza.splash-faucet": return createSplashFaucet();
    case "prop.beer-can": return createBeerCan();
    case "gameplay.shop-entrance": return createShopEntranceMarker();
    case "plaza.play-area": return createPlayArea();
    case "plaza.pavilion-stage": return createPavilion(groups, instanceId);
    case "plaza.cafe-table-set": return createCafeTable();
    case "plaza.street-janitor": return new JanitorView();
    case "plaza.splash-kid-runner": return new SplashKidView("runner");
    case "plaza.splash-kid-boots": return new SplashKidView("boots");
    case "oldtown.shade-tree":
    case "nature.deciduous-tree": {
      const tree = new DeciduousTreeView(undefined, deciduousTreeVariantForId(instanceId));
      if (assetId === "oldtown.shade-tree") tree.scale.setScalar(0.72);
      groups.register(instanceId, tree);
      return tree;
    }
    case "street.building1":
    case "street.building2":
    case "street.building3":
    case "street.building4":
    case "street.building5": {
      const building = new Building1View(undefined, Number(assetId.at(-1)));
      groups.register(instanceId, building);
      return building;
    }
    case "oldtown.miller-block":
    case "oldtown.coopersmith-block": {
      const block = createTownBlock(assetId === "oldtown.miller-block" ? "miller" : "coopersmith");
      groups.register(instanceId, block); return block;
    }
    case "oldtown.stage": {
      const stage = createTownStage(); groups.register(instanceId, stage); return stage;
    }
    case "oldtown.oval-inlay": return createTownInlay();
    case "oldtown.bench": return createTownBench();
    case "oldtown.flower-bed": return createTownBed();
    case "oldtown.lamp": return createTownLamp();
    case "oldtown.light-span": return createTownLights();
    case "oldtown.fireplace": return createTownFireplace();
    case "street.trash-can": return new TrashCanView();
    case "plaza.planter-cluster": return createPlanterCluster();
    case "plaza.planter-east-north": return createSinglePlanter(1.45, 3.3);
    case "plaza.planter-east-south": return createSinglePlanter(1.45, 3.1);
    case "plaza.planter-south": return createSinglePlanter(3.5, 1.3);
    case "plaza.tree-cluster": return createTreeCluster(groups, instanceId);
    case "plaza.string-lights": return createStringLights();
    default: throw new Error(`No renderer for world asset: ${assetId}`);
  }
}
