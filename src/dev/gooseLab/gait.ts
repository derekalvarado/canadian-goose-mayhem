import * as THREE from "three";

/**
 * Dev-only TypeScript port of `gait()` in scripts/animate-goose.py (walk branch),
 * posing the exported goose rig directly so walk variants can be compared without
 * a Blender round trip. Keep it in step with the Python recipe:
 * tests/gooseLab.test.ts checks SHIPPED_WALK against the GLB's walk clip.
 */

export interface GooseGait {
  /** Short clip length baked into the GLB; the game drives it by phase. */
  duration: number;
  /** Vertical bounce, meters (two per cycle). */
  bob: number;
  /** Forward pitch of the body, radians (negative leans forward). */
  lean: number;
  /** Body yaw swing, radians. Swings the rump side to side about `yawPivot`. */
  bodyYaw: number;
  /** Body roll, radians. Rocks the body over the stance foot. */
  bodyRoll: number;
  /** Sideways body shift, meters. */
  bodySway: number;
  /**
   * How far ahead of the hips the body yaw pivots, meters. 0 turns about the hips;
   * 0.26 (the chest joint) keeps the chest in place so only the rump swings.
   */
  yawPivot: number;
  /** Fraction of body yaw the chest turns back, keeping the neck and head aimed ahead. */
  chestCounterYaw: number;
  /** Chest roll against the body roll, radians. */
  chestCounterRoll: number;
  /** Tail side-to-side swing, radians. */
  tailYaw: number;
  /** How far the tail swing trails the body, radians of gait phase. */
  tailLag: number;
  /** Tail up/down flick (two per cycle), radians. */
  tailPitch: number;
  /** Extra tail wag at twice the step rate, radians: a little flick at each footfall. */
  tailFlick: number;
  /** Tail roll following the swing, radians: tips the tail feathers toward the outside of the wag. */
  tailRoll: number;
  stance: number;
  reach: number;
  lift: number;
}

/** The walk the game ships today (WADDLE in scripts/animate-goose.py). */
export const SHIPPED_WALK: GooseGait = {
  duration: 0.72,
  bob: 0.013,
  lean: -0.025,
  bodyYaw: 0.08,
  bodyRoll: 0.07,
  bodySway: 0.02,
  yawPivot: 0.26,
  chestCounterYaw: 1,
  chestCounterRoll: 0.014,
  tailYaw: 0.16,
  tailLag: 1.1,
  tailPitch: 0.035,
  tailFlick: 0.03,
  tailRoll: 0.05,
  stance: 0.56,
  reach: 0.2,
  lift: 0.075,
};

type Angles = readonly [number, number, number];
const LEG_REST_LENGTH = 0.185;

/** Poses one goose armature (the GLB's `canada-goose` node) the way animate-goose.py does. */
export class GooseGaitRig {
  private readonly bones = new Map<string, THREE.Bone>();
  private readonly restLocal = new Map<string, THREE.Matrix4>();
  /** Rest rotation of each bone in armature space. */
  private readonly restRotation = new Map<string, THREE.Matrix4>();
  private readonly posed = new Map<string, THREE.Matrix4>();
  private readonly scratch = new THREE.Matrix4();
  private readonly scratch2 = new THREE.Matrix4();

  constructor(armature: THREE.Object3D) {
    armature.traverse((object) => {
      if (object instanceof THREE.Bone) {
        this.bones.set(object.name, object);
        object.updateMatrix();
        this.restLocal.set(object.name, object.matrix.clone());
      }
    });
    for (const name of this.bones.keys()) {
      const rest = this.armatureMatrix(name, this.restLocal);
      this.restRotation.set(name, new THREE.Matrix4().extractRotation(rest));
    }
  }

  /** Writes the gait pose at `phase` (0..1) into the bones. */
  apply(style: GooseGait, phase: number): void {
    for (const [name, rest] of this.restLocal) this.posed.set(name, rest.clone());
    const wave = Math.PI * 2 * phase;
    const sin = Math.sin, cos = Math.cos;
    const bob = style.bob * (1 - cos(2 * wave));
    const bodyYaw = style.bodyYaw * sin(wave);
    this.pose("body", [style.lean, bodyYaw, style.bodyRoll * cos(wave)],
      [style.bodySway * cos(wave) + style.yawPivot * sin(bodyYaw), bob, 0]);
    this.pose("chest", [-style.lean * 0.4, -bodyYaw * style.chestCounterYaw, -style.chestCounterRoll * cos(wave)]);
    for (let i = 1; i <= 6; i += 1) {
      this.pose(`neck_${i}`, [0.014 * sin(2 * wave - i * 0.32), 0, -0.006 * cos(wave - i * 0.2)]);
    }
    this.pose("head", [0.015, 0.015 * sin(wave - 0.5), 0]);
    const tailSwing = sin(wave - style.tailLag);
    this.pose("tail", [style.tailPitch * sin(2 * wave - 0.7),
      style.tailYaw * tailSwing + style.tailFlick * sin(2 * wave - style.tailLag * 2),
      style.tailRoll * tailSwing]);
    for (const [side, sign, shift] of [["left", -1, 0], ["right", 1, 0.5]] as const) {
      const p = (phase + shift) % 1;
      const { stance, reach } = style;
      let z: number, lift: number, pitch: number;
      if (p <= stance) {
        z = -reach + 2 * reach * p / stance;
        lift = 0;
        pitch = 0;
      } else {
        const swing = (p - stance) / (1 - stance);
        // Hermite return: same rearward velocity on lift-off and touchdown.
        const tangent = 2 * reach * (1 - stance) / stance;
        z = (2 * swing ** 3 - 3 * swing ** 2 + 1) * reach
          + (swing ** 3 - 2 * swing ** 2 + swing) * tangent
          + (-2 * swing ** 3 + 3 * swing ** 2) * -reach
          + (swing ** 3 - swing ** 2) * tangent;
        lift = style.lift * sin(Math.PI * swing) ** 2;
        pitch = -0.3 * sin(Math.PI * 2 * swing) * sin(Math.PI * swing);
      }
      this.footTarget(side, z, lift, pitch);
      this.pose(`${side}_wing`, [-0.035 + 0.018 * sin(2 * wave - 0.6),
        sign * 0.015 * sin(wave - 0.5), sign * (-0.025 - 0.014 * sin(2 * wave - 0.7))]);
      this.pose(`${side}_wing_tip`, [0.018 * sin(2 * wave - 1.1), 0, sign * 0.012 * sin(wave - 0.9)]);
    }
    for (const [name, bone] of this.bones) {
      this.posed.get(name)!.decompose(bone.position, bone.quaternion, bone.scale);
    }
  }

  /** animate-goose.py `pose()`: an armature-axis rotation (Blender XYZ order) and offset at the bone's head. */
  private pose(name: string, angles: Angles, offset: Angles = [0, 0, 0]): void {
    const rest = this.restRotation.get(name);
    if (!rest) return;
    const delta = new THREE.Matrix4().makeTranslation(...offset)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...angles, "ZYX")));
    const basis = rest.clone().invert().multiply(delta).multiply(rest);
    this.posed.get(name)!.copy(this.restLocal.get(name)!).multiply(basis);
  }

  /** animate-goose.py `foot_target()`: stretch the shin from the posed hip to a level ankle. */
  private footTarget(side: "left" | "right", z: number, lift: number, pitch: number): void {
    const legName = `${side}_leg`;
    const hip = new THREE.Vector3().setFromMatrixPosition(this.armatureMatrix(legName, this.posed));
    const ankle = new THREE.Vector3(side === "left" ? -0.1 : 0.1, 0.045 + lift, 0.06 + z);
    const direction = ankle.clone().sub(hip);
    const angle = Math.atan2(-direction.z, -direction.y);
    const leg = new THREE.Matrix4().makeTranslation(hip)
      .multiply(this.scratch.makeRotationX(angle))
      .multiply(this.restRotation.get(legName)!)
      .multiply(this.scratch.makeScale(1, direction.length() / LEG_REST_LENGTH, 1));
    this.setArmatureMatrix(legName, leg);
    const footName = `${side}_foot`;
    const foot = new THREE.Matrix4().makeTranslation(ankle)
      .multiply(this.scratch.makeRotationFromEuler(new THREE.Euler(pitch, side === "left" ? 0.09 : -0.09, 0, "ZYX")))
      .multiply(this.restRotation.get(footName)!);
    this.setArmatureMatrix(footName, foot);
  }

  private armatureMatrix(name: string, locals: Map<string, THREE.Matrix4>): THREE.Matrix4 {
    const result = locals.get(name)!.clone();
    for (let parent = this.bones.get(name)!.parent; parent instanceof THREE.Bone; parent = parent.parent) {
      result.premultiply(locals.get(parent.name)!);
    }
    return result;
  }

  private setArmatureMatrix(name: string, matrix: THREE.Matrix4): void {
    const parent = this.bones.get(name)!.parent;
    const parentMatrix = parent instanceof THREE.Bone ? this.armatureMatrix(parent.name, this.posed) : this.scratch2.identity();
    this.posed.get(name)!.copy(parentMatrix).invert().multiply(matrix);
  }
}
