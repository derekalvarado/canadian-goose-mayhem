import * as THREE from "three";
import {
  CLEARING_CENTER_Z,
  CLEARING_RADIUS_X,
  CLEARING_RADIUS_Z,
  OBSTACLES,
  pathCenterAt,
  pathHalfWidthAt,
  seededRandom,
} from "./level";
import { PALETTE } from "./palette";
import { toonMaterial } from "./toonMaterial";

interface TreePlacement {
  x: number;
  z: number;
  height: number;
  width: number;
  rotation: number;
  colorIndex: number;
}

function finishMesh(mesh: THREE.Mesh, castShadow = true): THREE.Mesh {
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function createRibbon(widthScale: number, y: number, color: number): THREE.Mesh {
  const segments = 72;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const z = THREE.MathUtils.lerp(-6.4, -34, progress);
    const center = pathCenterAt(z);
    const halfWidth = pathHalfWidthAt(z) * widthScale;
    positions.push(center - halfWidth, y, z, center + halfWidth, y, z);

    if (index < segments) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return finishMesh(new THREE.Mesh(geometry, toonMaterial(color)), false);
}

function createTreePlacements(): TreePlacement[] {
  const random = seededRandom(771204);
  const placements: TreePlacement[] = [];

  for (let index = 0; index < 108; index += 1) {
    const angle = (index / 108) * Math.PI * 2 + (random() - 0.5) * 0.075;
    const ringOffset = 0.5 + random() * 3.8;
    const x = Math.cos(angle) * (CLEARING_RADIUS_X + ringOffset);
    const z = CLEARING_CENTER_Z + Math.sin(angle) * (CLEARING_RADIUS_Z + ringOffset * 0.84);
    if (z < -5.5 && Math.abs(x - pathCenterAt(z)) < 4.3) continue;
    placements.push({
      x,
      z,
      height: 4.2 + random() * 3.7,
      width: 0.8 + random() * 0.48,
      rotation: random() * Math.PI * 2,
      colorIndex: Math.floor(random() * 4),
    });
  }

  for (let index = 0; index < 72; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 18 + random() * 16;
    const x = Math.cos(angle) * radius;
    const z = CLEARING_CENTER_Z + Math.sin(angle) * radius * 0.82;
    if (z < -6 && Math.abs(x - pathCenterAt(z)) < 5.1) continue;
    placements.push({
      x,
      z,
      height: 5.2 + random() * 4.2,
      width: 0.88 + random() * 0.62,
      rotation: random() * Math.PI * 2,
      colorIndex: Math.floor(random() * 4),
    });
  }

  for (let index = 0; index < 20; index += 1) {
    const progress = index / 19;
    const z = THREE.MathUtils.lerp(-9.5, -34, progress);
    const side = index % 2 === 0 ? -1 : 1;
    const x = pathCenterAt(z) + side * (pathHalfWidthAt(z) + 2.1 + random() * 1.2);
    placements.push({
      x,
      z,
      height: 4.8 + random() * 3.6,
      width: 0.82 + random() * 0.44,
      rotation: random() * Math.PI * 2,
      colorIndex: Math.floor(random() * 4),
    });
  }

  return placements;
}

function createForestInstances(): THREE.Group {
  const group = new THREE.Group();
  const placements = createTreePlacements();
  const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.48, 4.6, 12, 5);
  const branchGeometry = new THREE.CylinderGeometry(0.12, 0.24, 2.2, 10, 3);
  const crownGeometry = new THREE.SphereGeometry(1, 24, 16);
  const trunkMaterial = toonMaterial(0xffffff, { vertexColors: true });
  const crownMaterial = toonMaterial(0xffffff, { vertexColors: true });
  const trunkInstances = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, placements.length);
  const branchInstances = new THREE.InstancedMesh(branchGeometry, trunkMaterial, placements.length * 2);
  const crownLower = new THREE.InstancedMesh(crownGeometry, crownMaterial, placements.length);
  const crownMiddle = new THREE.InstancedMesh(crownGeometry, crownMaterial, placements.length);
  const crownUpper = new THREE.InstancedMesh(crownGeometry, crownMaterial, placements.length);
  const crownColors = [PALETTE.green.deep, PALETTE.green.hedge, PALETTE.green.leaf, PALETTE.green.grass];
  const trunkColors = [PALETTE.earth.woodDark, PALETTE.earth.wood, PALETTE.earth.woodDark, PALETTE.earth.woodLight];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();

  placements.forEach((tree, index) => {
    const trunkHeight = tree.height * 0.66;
    euler.set(0, tree.rotation, 0);
    quaternion.setFromEuler(euler);
    position.set(tree.x, trunkHeight * 0.5 - 0.07, tree.z);
    scale.set(tree.width, trunkHeight / 4.6, tree.width);
    matrix.compose(position, quaternion, scale);
    trunkInstances.setMatrixAt(index, matrix);
    trunkInstances.setColorAt(index, new THREE.Color(trunkColors[tree.colorIndex]));

    for (let branch = 0; branch < 2; branch += 1) {
      const branchIndex = index * 2 + branch;
      euler.set(
        branch === 0 ? 0.78 : -0.72,
        tree.rotation + branch * 1.9,
        branch === 0 ? 0.48 : -0.43,
      );
      quaternion.setFromEuler(euler);
      position.set(
        tree.x + Math.cos(tree.rotation + branch * 2.3) * tree.width * 0.36,
        tree.height * (0.47 + branch * 0.08),
        tree.z + Math.sin(tree.rotation + branch * 2.3) * tree.width * 0.36,
      );
      scale.set(tree.width * 0.72, tree.height * 0.18, tree.width * 0.72);
      matrix.compose(position, quaternion, scale);
      branchInstances.setMatrixAt(branchIndex, matrix);
      branchInstances.setColorAt(branchIndex, new THREE.Color(trunkColors[tree.colorIndex]));
    }

    const crownColor = new THREE.Color(crownColors[tree.colorIndex]);
    const layerData = [
      { mesh: crownLower, y: 0.67, width: 1.72, height: 0.63, z: 0.04 },
      { mesh: crownMiddle, y: 0.8, width: 1.43, height: 0.56, z: -0.08 },
      { mesh: crownUpper, y: 0.92, width: 0.95, height: 0.42, z: 0.03 },
    ];
    layerData.forEach((layer, layerIndex) => {
      euler.set(0, tree.rotation + layerIndex * 0.63, 0);
      quaternion.setFromEuler(euler);
      position.set(
        tree.x + (layerIndex - 1) * tree.width * 0.22,
        tree.height * layer.y,
        tree.z + layer.z * tree.height,
      );
      scale.set(
        tree.width * layer.width,
        tree.height * layer.height * 0.45,
        tree.width * layer.width * 0.93,
      );
      matrix.compose(position, quaternion, scale);
      layer.mesh.setMatrixAt(index, matrix);
      layer.mesh.setColorAt(index, crownColor);
    });
  });

  for (const mesh of [trunkInstances, branchInstances, crownLower, crownMiddle, crownUpper]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
  return group;
}

function createGround(): THREE.Group {
  const group = new THREE.Group();
  const groundGeometry = new THREE.PlaneGeometry(76, 82);
  groundGeometry.rotateX(-Math.PI / 2);
  groundGeometry.translate(0, -0.095, 0);
  const ground = finishMesh(
    new THREE.Mesh(groundGeometry, toonMaterial(PALETTE.green.deep)),
    false,
  );
  group.add(ground);

  const clearing = finishMesh(
    new THREE.Mesh(
      new THREE.CircleGeometry(CLEARING_RADIUS_X + 0.5, 128),
      toonMaterial(PALETTE.green.lawn),
    ),
    false,
  );
  clearing.rotation.x = -Math.PI / 2;
  clearing.scale.z = CLEARING_RADIUS_Z / CLEARING_RADIUS_X;
  clearing.position.set(0, 0.003, CLEARING_CENTER_Z);
  group.add(clearing);

  group.add(createRibbon(1.15, 0.006, PALETTE.earth.pathShade));
  group.add(createRibbon(0.92, 0.012, PALETTE.earth.path));
  group.add(createRibbon(0.63, 0.017, PALETTE.earth.pathLight));
  return group;
}

function createBoulder(x: number, z: number, radius: number, color: number): THREE.Mesh {
  // Broad, intentional planes replace the noisy, displaced rock surface.
  const geometry = new THREE.DodecahedronGeometry(radius, 0);
  const rock = finishMesh(new THREE.Mesh(geometry, toonMaterial(color)));
  rock.position.set(x, radius * 0.52, z);
  rock.scale.set(1.08, 0.65, 0.9);
  rock.rotation.set(-0.12, x * 0.2, 0.08);
  return rock;
}

function createProps(): THREE.Group {
  const group = new THREE.Group();
  group.add(createBoulder(OBSTACLES[0].x, OBSTACLES[0].z, 1.12, PALETTE.stone.mid));
  group.add(createBoulder(OBSTACLES[3].x, OBSTACLES[3].z, 0.82, PALETTE.stone.dark));

  const log = finishMesh(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.47, 0.56, 2.7, 18, 5),
      toonMaterial(PALETTE.earth.wood),
    ),
  );
  log.position.set(OBSTACLES[2].x, 0.43, OBSTACLES[2].z);
  log.rotation.set(0, 0.68, Math.PI / 2);
  group.add(log);

  const logEndMaterial = toonMaterial(PALETTE.earth.woodLight);
  for (const end of [-1, 1]) {
    const endCap = finishMesh(
      new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.025, 18), logEndMaterial),
    );
    endCap.position.set(
      OBSTACLES[2].x + Math.cos(0.68) * end * 1.3,
      0.43,
      OBSTACLES[2].z - Math.sin(0.68) * end * 1.3,
    );
    endCap.rotation.set(0, 0.68, Math.PI / 2);
    group.add(endCap);
  }

  const stump = finishMesh(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.77, 0.8, 17, 4),
      toonMaterial(PALETTE.earth.woodDark),
    ),
  );
  stump.position.set(OBSTACLES[1].x, 0.4, OBSTACLES[1].z);
  stump.rotation.y = 0.19;
  group.add(stump);

  const stumpTop = finishMesh(
    new THREE.Mesh(new THREE.CylinderGeometry(0.59, 0.59, 0.025, 17), logEndMaterial),
  );
  stumpTop.position.set(OBSTACLES[1].x, 0.81, OBSTACLES[1].z);
  group.add(stumpTop);

  const marker = new THREE.Group();
  marker.position.set(pathCenterAt(-14) + pathHalfWidthAt(-14) + 0.9, 0, -14);
  const post = finishMesh(
    new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 2.25, 12), toonMaterial(PALETTE.earth.woodDark)),
  );
  post.position.y = 1.12;
  post.rotation.z = -0.035;
  marker.add(post);
  const arrow = finishMesh(
    new THREE.Mesh(new THREE.ConeGeometry(0.31, 1.12, 4), toonMaterial(PALETTE.accent.cream)),
  );
  arrow.position.set(-0.03, 1.9, -0.02);
  arrow.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  marker.add(arrow);
  group.add(marker);

  const mushroomCapMaterial = toonMaterial(PALETTE.accent.brick);
  const mushroomStemMaterial = toonMaterial(PALETTE.accent.cream);
  const mushroomSpotsMaterial = toonMaterial(PALETTE.goose.white);
  const mushroomPositions = [
    [-3.55, 4.2, 0.22],
    [-3.3, 4.65, 0.17],
    [-5.9, -0.7, 0.19],
  ] as const;
  mushroomPositions.forEach(([x, z, size], index) => {
    const mushroom = new THREE.Group();
    mushroom.position.set(x, 0, z);
    const stem = finishMesh(
      new THREE.Mesh(new THREE.CylinderGeometry(size * 0.22, size * 0.32, size, 12), mushroomStemMaterial),
      false,
    );
    stem.position.y = size * 0.5;
    mushroom.add(stem);
    const cap = finishMesh(
      new THREE.Mesh(
        new THREE.SphereGeometry(size * 0.65, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.48),
        mushroomCapMaterial,
      ),
      false,
    );
    cap.position.y = size;
    mushroom.add(cap);
    if (index !== 1) {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(size * 0.07, 8, 6), mushroomSpotsMaterial);
      spot.position.set(size * 0.15, size * 1.42, -size * 0.12);
      mushroom.add(spot);
    }
    group.add(mushroom);
  });
  return group;
}

function createUndergrowth(): THREE.Group {
  const group = new THREE.Group();
  const random = seededRandom(90517);
  const bladeGeometry = new THREE.ConeGeometry(0.075, 0.5, 5);
  const bladeMaterial = toonMaterial(0xffffff, { vertexColors: true });
  const blades = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, 420);
  const colors = [PALETTE.green.hedge, PALETTE.green.leaf, PALETTE.green.grass, PALETTE.green.deep];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();

  let count = 0;
  while (count < 420) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 18;
    const x = Math.cos(angle) * radius;
    const z = CLEARING_CENTER_Z + Math.sin(angle) * radius * 0.82;
    const onOpenLawn = (x * x) / 100 + ((z - CLEARING_CENTER_Z) * (z - CLEARING_CENTER_Z)) / 72 < 1;
    const besidePath = z < -5.5 && Math.abs(x - pathCenterAt(z)) < pathHalfWidthAt(z) + 0.35;
    if (onOpenLawn && random() < 0.68) continue;
    if (besidePath) continue;

    const height = 0.5 + random() * 0.65;
    position.set(x, height * 0.22 - 0.02, z);
    euler.set((random() - 0.5) * 0.22, random() * Math.PI * 2, (random() - 0.5) * 0.22);
    quaternion.setFromEuler(euler);
    scale.set(0.8 + random() * 0.7, height, 0.8 + random() * 0.7);
    matrix.compose(position, quaternion, scale);
    blades.setMatrixAt(count, matrix);
    blades.setColorAt(count, new THREE.Color(colors[Math.floor(random() * colors.length)]));
    count += 1;
  }
  blades.count = count;
  blades.receiveShadow = true;
  blades.instanceMatrix.needsUpdate = true;
  if (blades.instanceColor) blades.instanceColor.needsUpdate = true;
  group.add(blades);

  const pebbleGeometry = new THREE.DodecahedronGeometry(0.13, 0);
  const pebbleMaterial = toonMaterial(0xffffff, { vertexColors: true });
  const pebbles = new THREE.InstancedMesh(pebbleGeometry, pebbleMaterial, 66);
  const pebbleColors = [PALETTE.stone.mid, PALETTE.stone.light, PALETTE.stone.dark];
  for (let index = 0; index < 66; index += 1) {
    const progress = index / 65;
    const z = THREE.MathUtils.lerp(-7.5, -32.5, progress);
    const side = index % 2 === 0 ? -1 : 1;
    position.set(
      pathCenterAt(z) + side * (pathHalfWidthAt(z) * (0.74 + random() * 0.23)),
      0.07,
      z + (random() - 0.5) * 0.7,
    );
    euler.set(random() * 0.3, random() * Math.PI, random() * 0.3);
    quaternion.setFromEuler(euler);
    const pebbleScale = 0.5 + random() * 1.1;
    scale.set(pebbleScale * 1.25, pebbleScale * 0.55, pebbleScale);
    matrix.compose(position, quaternion, scale);
    pebbles.setMatrixAt(index, matrix);
    pebbles.setColorAt(index, new THREE.Color(pebbleColors[Math.floor(random() * pebbleColors.length)]));
  }
  pebbles.castShadow = true;
  pebbles.receiveShadow = true;
  pebbles.instanceMatrix.needsUpdate = true;
  if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
  group.add(pebbles);
  return group;
}

/** Solid forms share the same cel material; lighting lives in Game. */
export class ForestWorld extends THREE.Group {
  constructor() {
    super();
    this.add(createGround(), createForestInstances(), createUndergrowth(), createProps());
  }
}
