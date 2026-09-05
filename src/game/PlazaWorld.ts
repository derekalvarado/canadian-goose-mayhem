import * as THREE from "three";
import {
  FOUNTAIN_RADIUS,
  PAVILION_SIZE,
  PLAY_AREA_SIZE,
  PLAZA_GROUP_COLLIDERS,
  PLAZA_STATIC_COLLIDERS,
  SPLASH_PAD_RADIUS,
  type PlazaBoxCollider,
} from "./plazaLevel";
import {
  CANONICAL_PLAZA_LAYOUT,
  PLAZA_GROUP_IDS,
  type PlazaGroupId,
  type PlazaLayout,
} from "./plazaLayout";
import { PALETTE } from "./palette";
import { toonMaterial } from "./toonMaterial";

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

function createPavilion(): THREE.Group {
  const group = new THREE.Group();
  group.add(box(PAVILION_SIZE.halfWidth * 2, 0.52, PAVILION_SIZE.halfDepth * 2, PALETTE.earth.woodDark, 0, 0.26, 0));
  group.add(box(PAVILION_SIZE.halfWidth * 2 - 0.5, 0.08, PAVILION_SIZE.halfDepth * 2 - 0.35, PALETTE.earth.woodLight, 0, 0.56, 0));

  const columnMaterial = toonMaterial(PALETTE.plaza.iron);
  for (const x of [-6.15, 6.15]) {
    for (const z of [-1.75, 1.75]) {
      const column = finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 4.1, 10), columnMaterial));
      column.position.set(x, 2.55, z);
      group.add(column);
    }
  }
  group.add(box(14.8, 0.28, 5.45, PALETTE.plaza.iron, 0, 4.58, 0));
  group.add(box(13.8, 0.17, 4.8, PALETTE.earth.woodDark, 0, 4.38, 0));
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

function createLongSideFacade(spec: LongSideFacadeSpec, side: -1 | 1): THREE.Group {
  const group = new THREE.Group();
  const buildingZ = side * 20;
  const frontZ = side * 18.04;
  const awningZ = side * 17.72;

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

function createLongSideBuildings(): THREE.Group {
  const group = new THREE.Group();
  const north: readonly LongSideFacadeSpec[] = [
    { centerX: -17.6, width: 8.4, height: 7.8, color: PALETTE.plaza.brickDark, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningBlue },
    { centerX: -8.8, width: 8.8, height: 9.2, color: PALETTE.plaza.brick, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningGreen },
    { centerX: 0.2, width: 8.7, height: 7.4, color: PALETTE.plaza.brickLight, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningBlue },
    { centerX: 9.1, width: 8.7, height: 9.5, color: PALETTE.plaza.brick, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningGreen },
    { centerX: 17.8, width: 8.3, height: 8.2, color: PALETTE.plaza.brickDark, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningBlue },
  ];
  const south: readonly LongSideFacadeSpec[] = [
    { centerX: -17.6, width: 8.4, height: 8.8, color: PALETTE.plaza.brick, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningGreen },
    { centerX: -8.8, width: 8.8, height: 7.3, color: PALETTE.plaza.brickLight, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningBlue },
    { centerX: 0.2, width: 8.7, height: 9.4, color: PALETTE.plaza.brickDark, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningGreen },
    { centerX: 9.1, width: 8.7, height: 7.9, color: PALETTE.plaza.brickLight, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningBlue },
    { centerX: 17.8, width: 8.3, height: 8.9, color: PALETTE.plaza.brick, trim: PALETTE.accent.cream, awning: PALETTE.plaza.awningGreen },
  ];
  for (const spec of north) group.add(createLongSideFacade(spec, -1));
  for (const spec of south) group.add(createLongSideFacade(spec, 1));
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

function createTree(x: number, z: number, height: number): THREE.Group {
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

function createFurnitureAndPlanting(): THREE.Group {
  const group = new THREE.Group();
  for (const planter of PLAZA_STATIC_COLLIDERS) {
    group.add(createPlanter(planter));
  }
  group.add(
    createTree(19.35, -7.2, 6.7),
    createTree(19.35, 6.2, 6.2),
    createTree(7.8, 16.7, 6.8),
    createTree(-17.5, 13.5, 7.2),
  );
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

  constructor(layout: PlazaLayout = CANONICAL_PLAZA_LAYOUT) {
    super();
    const contents: Record<PlazaGroupId, THREE.Group> = {
      "plaza.goose-fountain": createFountain(),
      "plaza.splash-pad": createSplashPad(),
      "plaza.play-area": createPlayArea(),
      "plaza.pavilion-stage": createPavilion(),
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
      createLongSideBuildings(),
      createFurnitureAndPlanting(),
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
