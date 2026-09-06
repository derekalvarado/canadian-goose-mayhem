import * as THREE from "three";
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

/** A reusable authored paving unit for the WorldEditor catalog. */
function createPavingPatch(halfExtent = 4): THREE.Group {
  const group = new THREE.Group();
  const cells = halfExtent * 2;
  group.add(box(halfExtent * 2, 0.16, halfExtent * 2, PALETTE.stone.dark, 0, -0.12, 0));
  const geometry = new THREE.BoxGeometry(0.93, 0.035, 0.43);
  const colors = [PALETTE.plaza.paverLight, PALETTE.plaza.paver, PALETTE.plaza.paverDark];
  const meshes = colors.map((color) => new THREE.InstancedMesh(geometry, toonMaterial(color), cells * cells * 2));
  const counts = colors.map(() => 0); const matrix = new THREE.Matrix4();
  for (let row = 0; row < cells * 2; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const x = -halfExtent + 0.5 + column + (row % 2 ? 0.5 : 0); const z = -halfExtent + 0.25 + row * 0.5;
      const variant = (row * 7 + column * 3) % colors.length;
      matrix.makeTranslation(x, 0.018, z); meshes[variant].setMatrixAt(counts[variant], matrix); counts[variant] += 1;
    }
  }
  meshes.forEach((mesh, index) => { mesh.count = counts[index]; mesh.castShadow = false; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true; group.add(mesh); });
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
    const wing = finishMesh(new THREE.Mesh(new THREE.ConeGeometry(0.46, 2.7, 4), bronze));
    wing.position.set(side * 0.92, 0.86, 0.12);
    wing.rotation.set(0.12, 0, side * -Math.PI / 2);
    wing.scale.set(0.34, 1, 0.72);
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
  statue.scale.setScalar(1.08);
  group.add(statue);

  const streamMaterial = toonMaterial(PALETTE.plaza.waterLight);
  for (const [x, z, height] of [[-1.28, 0.1, 0.74], [0.42, 0.9, 0.58], [-0.72, -0.86, 0.48]] as const) {
    const stream = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, height, 8), streamMaterial), false);
    stream.position.set(x, 0.68 + height / 2, z);
    group.add(stream);
  }
  return group;
}

function createSplashPad(): THREE.Group {
  const group = new THREE.Group();
  const border = finishMesh(new THREE.Mesh(
    new THREE.RingGeometry(SPLASH_PAD_RADIUS, SPLASH_PAD_RADIUS + 0.52, 64),
    toonMaterial(PALETTE.plaza.concrete, { side: THREE.DoubleSide }),
  ), false);
  border.rotation.x = -Math.PI / 2;
  border.position.y = 0.08;
  group.add(border);

  const water = finishMesh(new THREE.Mesh(
    new THREE.CircleGeometry(SPLASH_PAD_RADIUS, 64),
    toonMaterial(PALETTE.plaza.waterLight, { side: THREE.DoubleSide }),
  ), false);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.07;
  group.add(water);

  const jetMaterial = toonMaterial(PALETTE.plaza.water);
  for (let index = 0; index < 9; index += 1) {
    const angle = index * 2.4;
    const radius = index % 3 === 0 ? 2.7 : 1.65;
    const height = 0.2 + (index % 4) * 0.08;
    const jet = finishMesh(new THREE.Mesh(new THREE.ConeGeometry(0.055, height, 7), jetMaterial), false);
    jet.position.set(Math.cos(angle) * radius, height / 2 + 0.08, Math.sin(angle) * radius);
    group.add(jet);
  }
  return group;
}

function createPlaySculptures(): THREE.Group {
  const group = new THREE.Group();
  const sculptureMaterial = toonMaterial(PALETTE.plaza.concreteShade);

  const bear = new THREE.Group();
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
  group.add(bear);

  const fish = new THREE.Group();
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

  const doorX = spec.centerX - spec.width * 0.28;
  group.add(box(1.12, 2.32, 0.12, PALETTE.earth.woodDark, doorX, 1.2, frontZ));

  const storefrontX = spec.centerX + spec.width * 0.14;
  const storefrontWidth = Math.max(2.35, spec.width * 0.56);
  group.add(
    box(storefrontWidth, 2.08, 0.11, PALETTE.plaza.window, storefrontX, 1.18, frontZ),
    box(storefrontWidth + 0.18, 0.3, 0.72, spec.awning, storefrontX, 2.55, awningZ),
  );

  const upperFloors = Math.max(1, Math.floor((spec.height - 3.6) / 2.25));
  const windowCount = Math.max(2, Math.floor(spec.width / 2));
  for (let floor = 0; floor < upperFloors; floor += 1) {
    for (let index = 0; index < windowCount; index += 1) {
      const x = spec.centerX - (windowCount - 1) * 0.86 + index * 1.72;
      const y = 4.16 + floor * 2.08;
      group.add(
        box(0.98, 1.3, 0.1, PALETTE.plaza.window, x, y, frontZ),
        box(1.22, 0.12, 0.18, spec.trim, x, y + 0.72, frontZ - side * 0.02),
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

  group.add(
    box(14.5, 10.2, 11.8, brick, 0, 5.1, 0),
    box(14.85, 0.42, 12.1, stone, 0, 0.3, 0),
    box(14.78, 0.28, 0.32, trim, 0, 3.45, -6.04),
    box(0.32, 0.28, 12.08, trim, 7.28, 3.45, 0),
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
  group.add(box(
    obstacle.halfWidth * 2,
    0.68,
    obstacle.halfDepth * 2,
    PALETTE.plaza.sandstone,
    obstacle.x,
    0.34,
    obstacle.z,
  ));
  group.add(box(
    obstacle.halfWidth * 1.7,
    0.26,
    obstacle.halfDepth * 1.72,
    PALETTE.green.deep,
    obstacle.x,
    0.72,
    obstacle.z,
  ));

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
      obstacle.x + (alongX ? progress * obstacle.halfWidth * 0.75 : (index % 2 - 0.5) * 0.42),
      0.93 + (index % 3) * 0.04,
      obstacle.z + (alongX ? (index % 2 - 0.5) * 0.42 : progress * obstacle.halfDepth * 0.78),
    );
    group.add(flower);
  }
  return group;
}

function createTree(id: string, x: number, z: number, height: number, groups: OcclusionFadeGroupRegistry): THREE.Group {
  const group = new THREE.Group();
  const trunk = finishMesh(new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.4, height * 0.62, 12),
    toonMaterial(PALETTE.earth.woodDark),
  ));
  trunk.position.set(x, height * 0.31, z);
  group.add(trunk);
  const crownMaterial = toonMaterial(PALETTE.green.leaf);
  for (const [offsetX, offsetY, offsetZ, scale] of [
    [0, 0.72, 0, 1.35], [-0.7, 0.64, 0.15, 0.9], [0.65, 0.66, -0.1, 0.95],
  ] as const) {
    const crown = finishMesh(new THREE.Mesh(new THREE.SphereGeometry(1, 22, 14), crownMaterial));
    crown.position.set(x + offsetX, height * offsetY, z + offsetZ);
    crown.scale.set(scale, scale * 0.82, scale);
    group.add(crown);
  }
  groups.register(id, group);
  return group;
}

function createCafeTable(): THREE.Group {
  const group = new THREE.Group();
  const metal = toonMaterial(PALETTE.plaza.awningBlue);
  const stem = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.72, 10), metal));
  stem.position.set(0, 0.36, 0);
  group.add(stem);
  const top = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.08, 18), metal));
  top.position.set(0, 0.76, 0);
  group.add(top);
  for (let index = 0; index < 3; index += 1) {
    const angle = index / 3 * Math.PI * 2;
    const chair = box(0.5, 0.48, 0.48, PALETTE.plaza.awningBlue);
    chair.position.set(Math.cos(angle) * 0.88, 0.24, Math.sin(angle) * 0.88);
    chair.rotation.y = -angle;
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
    case "plaza.paving-base": return createPaving();
    case "plaza.paving-patch": return createPavingPatch();
    case "plaza.paving-patch-large": return createPavingPatch(8);
    case "street.sidewalk-tile": return createStreetTile(PALETTE.plaza.concrete, 0);
    case "street.road-tile": return createStreetTile(PALETTE.stone.dark, -0.15);
    case "street.curb-straight": return createStraightCurb();
    case "plaza.building-frontage": return createLongSideBuildings(groups, instanceId, true);
    case "plaza.corner-market-building": return createCornerMarketBuilding(groups, instanceId);
    case "plaza.goose-fountain": return createFountain();
    case "plaza.splash-pad": return createSplashPad();
    case "plaza.play-area": return createPlayArea();
    case "plaza.pavilion-stage": return createPavilion(groups, instanceId);
    case "plaza.cafe-table-set": return createCafeTable();
    case "plaza.planter-cluster": return createPlanterCluster();
    case "plaza.tree-cluster": return createTreeCluster(groups, instanceId);
    case "plaza.string-lights": return createStringLights();
    default: throw new Error(`No renderer for world asset: ${assetId}`);
  }
}
