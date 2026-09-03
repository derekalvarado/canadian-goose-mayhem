import * as THREE from "three";

interface GooseParts {
  visual: THREE.Group;
  body: THREE.Mesh;
  chest: THREE.Mesh;
  neckPivot: THREE.Group;
  head: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftWing: THREE.Group;
  rightWing: THREE.Group;
  lowerBill: THREE.Group;
  leftEye: THREE.Group;
  rightEye: THREE.Group;
}

const FEATHER_COLORS = [0x6d6453, 0x7b705d, 0x887b65, 0x5d594f];

function material(color: number, roughness = 0.88): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function castAndReceive(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createFoot(): THREE.Group {
  const foot = new THREE.Group();
  const footMaterial = material(0x161916, 0.76);
  const ankle = castAndReceive(
    new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.078, 0.48, 16), footMaterial),
  );
  ankle.position.y = -0.22;
  foot.add(ankle);

  const shape = new THREE.Shape();
  shape.moveTo(-0.08, 0.12);
  shape.lineTo(-0.27, -0.31);
  shape.quadraticCurveTo(-0.26, -0.39, -0.18, -0.34);
  shape.lineTo(-0.03, -0.15);
  shape.lineTo(0, -0.43);
  shape.quadraticCurveTo(0.02, -0.51, 0.07, -0.42);
  shape.lineTo(0.12, -0.15);
  shape.lineTo(0.29, -0.32);
  shape.quadraticCurveTo(0.35, -0.36, 0.32, -0.27);
  shape.lineTo(0.09, 0.12);
  shape.closePath();

  const web = castAndReceive(new THREE.Mesh(new THREE.ShapeGeometry(shape, 4), footMaterial));
  web.rotation.x = -Math.PI / 2;
  web.position.set(0, -0.47, -0.13);
  foot.add(web);
  return foot;
}

function createEye(side: -1 | 1): THREE.Group {
  const eye = new THREE.Group();
  eye.position.set(side * 0.278, 0.08, -0.176);

  const iris = castAndReceive(
    new THREE.Mesh(new THREE.SphereGeometry(0.047, 20, 14), material(0x171a16, 0.45)),
  );
  iris.scale.set(0.55, 1, 1);
  eye.add(iris);

  const glint = new THREE.Mesh(
    new THREE.SphereGeometry(0.011, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xf7edcf }),
  );
  glint.position.set(side * 0.018, 0.018, -0.035);
  eye.add(glint);
  return eye;
}

function createBill(): { upper: THREE.Mesh; lower: THREE.Group } {
  const billMaterial = material(0x171a17, 0.7);
  const billGeometry = new THREE.SphereGeometry(0.25, 28, 18);

  const upper = castAndReceive(new THREE.Mesh(billGeometry, billMaterial));
  upper.scale.set(0.78, 0.28, 1.28);
  upper.position.set(0, -0.045, -0.43);

  const lower = new THREE.Group();
  lower.position.set(0, -0.075, -0.24);
  const lowerMesh = castAndReceive(new THREE.Mesh(billGeometry, billMaterial));
  lowerMesh.scale.set(0.72, 0.2, 0.98);
  lowerMesh.position.z = -0.2;
  lower.add(lowerMesh);

  const mouthLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.31, 0.014, 0.33),
    new THREE.MeshBasicMaterial({ color: 0x070907 }),
  );
  mouthLine.position.set(0, 0.006, -0.19);
  lower.add(mouthLine);
  return { upper, lower };
}

function createWing(side: -1 | 1): THREE.Group {
  const wing = new THREE.Group();
  wing.position.set(side * 0.6, 0.9, 0.05);

  const wingBase = castAndReceive(
    new THREE.Mesh(new THREE.SphereGeometry(0.55, 36, 24), material(0x766c5a)),
  );
  wingBase.scale.set(0.32, 0.57, 1.18);
  wingBase.rotation.x = -0.18;
  wing.add(wingBase);

  const featherGeometry = new THREE.SphereGeometry(1, 24, 16);
  const rows = [
    { count: 4, y: 0.2, z: -0.18, size: 0.26 },
    { count: 5, y: 0.02, z: -0.05, size: 0.3 },
    { count: 5, y: -0.17, z: 0.13, size: 0.33 },
  ];

  rows.forEach((row, rowIndex) => {
    for (let index = 0; index < row.count; index += 1) {
      const progress = row.count === 1 ? 0 : index / (row.count - 1);
      const feather = castAndReceive(
        new THREE.Mesh(
          featherGeometry,
          material(FEATHER_COLORS[(index + rowIndex) % FEATHER_COLORS.length]),
        ),
      );
      feather.scale.set(0.085, row.size * 0.52, row.size);
      feather.position.set(
        side * (0.13 + rowIndex * 0.018),
        row.y - Math.abs(progress - 0.5) * 0.07,
        row.z + (progress - 0.5) * 0.92,
      );
      feather.rotation.x = -0.23 + progress * 0.11;
      feather.rotation.z = side * (-0.08 + (progress - 0.5) * 0.06);
      wing.add(feather);
    }
  });

  return wing;
}

function createTail(): THREE.Group {
  const tail = new THREE.Group();
  tail.position.set(0, 0.86, 1.03);
  const tailGeometry = new THREE.CapsuleGeometry(0.09, 0.47, 8, 18);
  const tailMaterial = material(0xede8d8);

  for (let index = -3; index <= 3; index += 1) {
    const feather = castAndReceive(new THREE.Mesh(tailGeometry, tailMaterial));
    feather.rotation.x = Math.PI / 2;
    feather.rotation.z = index * 0.065;
    feather.position.set(index * 0.085, Math.abs(index) * -0.012, index % 2 === 0 ? 0.12 : 0.04);
    feather.scale.set(1 - Math.abs(index) * 0.055, 1 - Math.abs(index) * 0.04, 0.62);
    tail.add(feather);
  }
  return tail;
}

function createGooseParts(): GooseParts {
  const visual = new THREE.Group();
  visual.rotation.order = "YXZ";

  const bodyMaterial = material(0x7b715e);
  const body = castAndReceive(
    new THREE.Mesh(new THREE.SphereGeometry(0.78, 48, 32), bodyMaterial),
  );
  body.scale.set(0.95, 0.72, 1.25);
  body.position.set(0, 0.88, 0.16);
  visual.add(body);

  const rump = castAndReceive(
    new THREE.Mesh(new THREE.SphereGeometry(0.63, 40, 26), material(0x6e6657)),
  );
  rump.scale.set(1, 0.72, 0.92);
  rump.position.set(0, 0.91, 0.69);
  visual.add(rump);

  const chest = castAndReceive(
    new THREE.Mesh(new THREE.SphereGeometry(0.58, 40, 28), material(0x9a8a70)),
  );
  chest.scale.set(0.92, 0.95, 0.76);
  chest.position.set(0, 0.9, -0.49);
  visual.add(chest);

  const belly = castAndReceive(
    new THREE.Mesh(new THREE.SphereGeometry(0.55, 36, 24), material(0xb1a489)),
  );
  belly.scale.set(0.92, 0.4, 1.35);
  belly.position.set(0, 0.55, 0.2);
  visual.add(belly);

  const leftWing = createWing(-1);
  const rightWing = createWing(1);
  visual.add(leftWing, rightWing, createTail());

  const backFeatherGeometry = new THREE.SphereGeometry(1, 22, 14);
  for (let row = 0; row < 3; row += 1) {
    for (let index = -2; index <= 2; index += 1) {
      const feather = castAndReceive(
        new THREE.Mesh(
          backFeatherGeometry,
          material(FEATHER_COLORS[(row + index + 8) % FEATHER_COLORS.length]),
        ),
      );
      feather.scale.set(0.19, 0.065, 0.28);
      feather.position.set(index * 0.2, 1.42 - Math.abs(index) * 0.025, -0.05 + row * 0.29);
      feather.rotation.x = -0.14 + row * 0.05;
      visual.add(feather);
    }
  }

  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 0.78, -0.48);
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0.03),
    new THREE.Vector3(0, 0.44, -0.2),
    new THREE.Vector3(0, 0.93, -0.18),
    new THREE.Vector3(0, 1.32, -0.44),
  ]);
  const neck = castAndReceive(
    new THREE.Mesh(
      new THREE.TubeGeometry(neckCurve, 56, 0.195, 24, false),
      material(0x202520, 0.8),
    ),
  );
  neckPivot.add(neck);

  const neckBib = castAndReceive(
    new THREE.Mesh(new THREE.SphereGeometry(0.24, 28, 18), material(0xe9e6d8)),
  );
  neckBib.scale.set(0.76, 1.2, 0.28);
  neckBib.position.set(0, 0.66, -0.37);
  neckBib.rotation.x = -0.18;
  neckPivot.add(neckBib);

  const head = new THREE.Group();
  head.position.set(0, 1.38, -0.47);
  const skull = castAndReceive(
    new THREE.Mesh(new THREE.SphereGeometry(0.32, 40, 28), material(0x202520, 0.76)),
  );
  skull.scale.set(0.92, 0.92, 1.08);
  head.add(skull);

  for (const side of [-1, 1] as const) {
    const cheek = castAndReceive(
      new THREE.Mesh(new THREE.SphereGeometry(0.15, 28, 18), material(0xf1eee2)),
    );
    cheek.scale.set(0.24, 0.8, 1.08);
    cheek.position.set(side * 0.302, -0.035, -0.045);
    cheek.rotation.z = side * -0.12;
    head.add(cheek);
  }

  const leftEye = createEye(-1);
  const rightEye = createEye(1);
  head.add(leftEye, rightEye);

  const { upper, lower } = createBill();
  head.add(upper, lower);

  const nostrilMaterial = new THREE.MeshBasicMaterial({ color: 0x050605 });
  for (const side of [-1, 1] as const) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), nostrilMaterial);
    nostril.position.set(side * 0.1, -0.004, -0.7);
    nostril.scale.set(1.7, 0.55, 0.35);
    head.add(nostril);
  }

  neckPivot.add(head);
  visual.add(neckPivot);

  const leftLeg = createFoot();
  const rightLeg = createFoot();
  leftLeg.position.set(-0.25, 0.53, 0.12);
  rightLeg.position.set(0.25, 0.53, 0.12);
  visual.add(leftLeg, rightLeg);

  return {
    visual,
    body,
    chest,
    neckPivot,
    head,
    leftLeg,
    rightLeg,
    leftWing,
    rightWing,
    lowerBill: lower,
    leftEye,
    rightEye,
  };
}

export class Goose extends THREE.Group {
  private readonly parts: GooseParts;
  private honkTime = 0;
  private idleLookSeed = 0;

  constructor() {
    super();
    this.parts = createGooseParts();
    this.add(this.parts.visual);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.82, 48),
      new THREE.MeshBasicMaterial({
        color: 0x0b140d,
        transparent: true,
        opacity: 0.21,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1, 1.45, 1);
    shadow.position.y = 0.025;
    this.add(shadow);
  }

  honk(): void {
    this.honkTime = 0.72;
  }

  update(delta: number, elapsed: number, speedRatio: number, turnAmount: number): void {
    this.honkTime = Math.max(0, this.honkTime - delta);
    const moving = THREE.MathUtils.smoothstep(speedRatio, 0.03, 0.45);
    const pace = THREE.MathUtils.lerp(5.4, 10.8, Math.min(1, speedRatio));
    const step = elapsed * pace;
    const sway = Math.sin(step) * moving;
    const bounce = Math.abs(Math.sin(step)) * moving;
    const idleBreath = Math.sin(elapsed * 1.6) * 0.012 * (1 - moving);

    this.parts.visual.position.y = bounce * 0.055 + idleBreath;
    this.parts.visual.rotation.z = -sway * 0.045 - turnAmount * 0.045;
    this.parts.body.rotation.x = -bounce * 0.035;
    this.parts.body.scale.y = 0.72 + idleBreath * 0.25;
    this.parts.chest.position.y = 0.9 + idleBreath * 0.35;

    this.parts.leftLeg.rotation.x = sway * 0.72;
    this.parts.rightLeg.rotation.x = -sway * 0.72;
    this.parts.leftLeg.rotation.z = -sway * 0.035;
    this.parts.rightLeg.rotation.z = -sway * 0.035;

    this.parts.leftWing.rotation.z = moving * 0.045 + Math.abs(turnAmount) * 0.035;
    this.parts.rightWing.rotation.z = -moving * 0.045 - Math.abs(turnAmount) * 0.035;
    this.parts.leftWing.rotation.x = -bounce * 0.022;
    this.parts.rightWing.rotation.x = -bounce * 0.022;

    if (moving < 0.08 && Math.floor(elapsed / 4.7) !== this.idleLookSeed) {
      this.idleLookSeed = Math.floor(elapsed / 4.7);
    }
    const idleLook = Math.sin(elapsed * 0.58 + this.idleLookSeed * 2.17) * (1 - moving);
    this.parts.neckPivot.rotation.z = sway * -0.026 + turnAmount * 0.04;
    this.parts.neckPivot.rotation.x = bounce * 0.025;
    this.parts.head.rotation.y = idleLook * 0.22 + turnAmount * 0.1;
    this.parts.head.rotation.x = -bounce * 0.045;

    const honkProgress = this.honkTime > 0 ? Math.sin((this.honkTime / 0.72) * Math.PI) : 0;
    this.parts.lowerBill.rotation.x = honkProgress * 0.3;
    this.parts.neckPivot.scale.y = 1 + honkProgress * 0.055;
    this.parts.head.position.z = -0.47 - honkProgress * 0.07;
    this.parts.leftWing.rotation.y = honkProgress * -0.055;
    this.parts.rightWing.rotation.y = honkProgress * 0.055;

    const blink = Math.sin(elapsed * 0.72 + 1.3) > 0.985 ? 0.12 : 1;
    this.parts.leftEye.scale.y = blink;
    this.parts.rightEye.scale.y = blink;
  }
}
