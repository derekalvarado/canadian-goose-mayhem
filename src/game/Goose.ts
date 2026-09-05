import * as THREE from "three";
import { PALETTE } from "./palette";
import { toonMaterial } from "./toonMaterial";

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

// World units are meter-like in the plaza. Keep the authored goose proportions,
// but make its standing height read as roughly one world unit beside the props.
const GOOSE_VISUAL_SCALE = 0.4;

function characterMesh(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  // Keep overlapping animated forms free of tiny self-shadow seams.
  mesh.receiveShadow = false;
  return mesh;
}

function createFoot(): THREE.Group {
  const foot = new THREE.Group();
  const footMaterial = toonMaterial(PALETTE.goose.black, { side: THREE.DoubleSide });
  const ankle = characterMesh(
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

  const web = characterMesh(new THREE.Mesh(new THREE.ShapeGeometry(shape, 4), footMaterial));
  // The bill faces -Z, so rotate the webbing this way to put the toes
  // toward the goose's front instead of behind its ankles.
  web.rotation.x = Math.PI / 2;
  web.position.set(0, -0.47, -0.13);
  foot.add(web);
  return foot;
}

function createEye(side: -1 | 1): THREE.Group {
  const eye = new THREE.Group();
  eye.position.set(side * 0.278, 0.08, -0.176);

  const iris = characterMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.047, 20, 14), toonMaterial(PALETTE.goose.black)),
  );
  iris.scale.set(0.55, 1, 1);
  eye.add(iris);

  const glint = new THREE.Mesh(
    new THREE.SphereGeometry(0.011, 12, 8),
    toonMaterial(PALETTE.goose.highlight),
  );
  glint.position.set(side * 0.018, 0.018, -0.035);
  eye.add(glint);
  return eye;
}

function createBill(): { upper: THREE.Mesh; lower: THREE.Group } {
  const billMaterial = toonMaterial(PALETTE.goose.black);
  const billGeometry = new THREE.SphereGeometry(0.25, 28, 18);

  const upper = characterMesh(new THREE.Mesh(billGeometry, billMaterial));
  upper.scale.set(0.78, 0.28, 1.28);
  upper.position.set(0, -0.045, -0.43);

  const lower = new THREE.Group();
  lower.position.set(0, -0.075, -0.24);
  const lowerMesh = characterMesh(new THREE.Mesh(billGeometry, billMaterial));
  lowerMesh.scale.set(0.72, 0.2, 0.98);
  lowerMesh.position.z = -0.2;
  lower.add(lowerMesh);

  const mouthLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.31, 0.014, 0.33),
    toonMaterial(PALETTE.goose.black),
  );
  mouthLine.position.set(0, 0.006, -0.19);
  lower.add(mouthLine);
  return { upper, lower };
}

function createWing(side: -1 | 1): THREE.Group {
  const wing = new THREE.Group();
  wing.position.set(side * 0.6, 0.9, 0.05);

  const wingBase = characterMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.55, 36, 24), toonMaterial(PALETTE.goose.canadaBrown)),
  );
  wingBase.scale.set(0.32, 0.57, 1.18);
  wingBase.rotation.x = -0.18;
  wing.add(wingBase);

  return wing;
}

function createTail(): THREE.Group {
  const tail = new THREE.Group();
  tail.position.set(0, 0.86, 1.03);
  // One tapered silhouette, with no separate feather geometry.
  const outline = new THREE.Shape();
  outline.moveTo(-0.34, -0.2);
  outline.quadraticCurveTo(-0.32, 0.18, -0.22, 0.43);
  outline.quadraticCurveTo(0, 0.51, 0.22, 0.43);
  outline.quadraticCurveTo(0.32, 0.18, 0.34, -0.2);
  outline.closePath();
  const shape = characterMesh(new THREE.Mesh(
    new THREE.ExtrudeGeometry(outline, {
      depth: 0.08, bevelEnabled: true, bevelThickness: 0.025,
      bevelSize: 0.035, bevelSegments: 2, steps: 1, curveSegments: 12,
    }),
    toonMaterial(PALETTE.goose.canadaBrownDark),
  ));
  shape.rotation.x = Math.PI / 2;
  tail.add(shape);
  return tail;
}

function createGooseParts(): GooseParts {
  const visual = new THREE.Group();
  visual.rotation.order = "YXZ";

  const bodyMaterial = toonMaterial(PALETTE.goose.canadaBrown);
  const body = characterMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.78, 48, 32), bodyMaterial),
  );
  body.scale.set(0.95, 0.72, 1.25);
  body.position.set(0, 0.88, 0.16);
  visual.add(body);

  const chest = characterMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.58, 40, 28), toonMaterial(PALETTE.goose.canadaBrownLight)),
  );
  chest.scale.set(0.92, 0.95, 0.76);
  chest.position.set(0, 0.9, -0.49);
  visual.add(chest);

  const belly = characterMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.55, 36, 24), toonMaterial(PALETTE.goose.canadaBrownLight)),
  );
  belly.scale.set(0.92, 0.4, 1.35);
  belly.position.set(0, 0.55, 0.2);
  visual.add(belly);

  const leftWing = createWing(-1);
  const rightWing = createWing(1);
  visual.add(leftWing, rightWing, createTail());

  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 0.78, -0.48);
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0.03),
    new THREE.Vector3(0, 0.44, -0.2),
    new THREE.Vector3(0, 0.93, -0.18),
    new THREE.Vector3(0, 1.32, -0.44),
  ]);
  const neck = characterMesh(
    new THREE.Mesh(
      new THREE.TubeGeometry(neckCurve, 56, 0.195, 24, false),
      toonMaterial(PALETTE.goose.black),
    ),
  );
  neckPivot.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 1.38, -0.47);
  const skull = characterMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.32, 40, 28), toonMaterial(PALETTE.goose.black)),
  );
  skull.scale.set(0.92, 0.92, 1.08);
  head.add(skull);

  // A surface patch follows the skull: the chinstrap is a flat marking,
  // not a raised white cheek. Its normals match the underlying head.
  const strapPositions: number[] = [];
  const strapNormals: number[] = [];
  const strapIndices: number[] = [];
  const columns = 20;
  const rows = 24;
  for (let row = 0; row <= rows; row += 1) {
    const around = THREE.MathUtils.lerp(-Math.PI + 0.18, -0.18, row / rows);
    for (let column = 0; column <= columns; column += 1) {
      const along = THREE.MathUtils.lerp(-0.43, 0.38, column / columns);
      const x = Math.cos(around) * Math.cos(along);
      const y = Math.sin(around) * Math.cos(along);
      const z = Math.sin(along);
      strapPositions.push(x * 0.296, y * 0.296, z * 0.347);
      const normal = new THREE.Vector3(x / 0.296, y / 0.296, z / 0.347).normalize();
      strapNormals.push(normal.x, normal.y, normal.z);
      if (row < rows && column < columns) {
        const i = row * (columns + 1) + column;
        strapIndices.push(i, i + columns + 1, i + 1, i + 1, i + columns + 1, i + columns + 2);
      }
    }
  }
  const strapGeometry = new THREE.BufferGeometry();
  strapGeometry.setAttribute("position", new THREE.Float32BufferAttribute(strapPositions, 3));
  strapGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(strapNormals, 3));
  strapGeometry.setIndex(strapIndices);
  head.add(new THREE.Mesh(strapGeometry, toonMaterial(PALETTE.goose.highlight)));

  const leftEye = createEye(-1);
  const rightEye = createEye(1);
  head.add(leftEye, rightEye);

  const { upper, lower } = createBill();
  head.add(upper, lower);

  const nostrilMaterial = toonMaterial(PALETTE.goose.black);
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
    this.parts.visual.scale.setScalar(GOOSE_VISUAL_SCALE);
    this.add(this.parts.visual);
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
