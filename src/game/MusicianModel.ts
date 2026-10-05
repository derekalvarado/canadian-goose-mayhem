import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "./palette.ts";
import { RIG_ANKLE_Y, RIG_HIP_JOINT_Y } from "./personRig.ts";
import { drawTownsperson, lookColors, type Look, type TownSlot } from "./TownsfolkModel.ts";
import { TOWNSFOLK_LEG_SCALE } from "./townsfolkTuning.ts";
import { legsFromBind, TOWNSFOLK_RUN, TOWNSFOLK_STRIDE, TOWNSFOLK_WALK } from "./townsfolkMoves.ts";
import { arm, envelope, full, hang, standingClips, withHips, type Rotations } from "./cafeMoves.ts";
import { cycleClip, walkPose, type Vec3, type WalkStyle } from "./janitorGaits.ts";
import { MUSICIAN_GUITAR_LENGTH, MUSICIAN_TUNING } from "./musicianTuning.ts";

/**
 * The street musician: a folk singer drawn with the townsfolk kit, plus her
 * cherry-red acoustic guitar as a separate prop (the goose can steal it). Rig
 * directions match the janitor: +x swings a limb forward or leans the torso back,
 * elbows bend with +x, +y turns left, +z lifts the right side.
 */

const T = PALETTE.townsfolk;
const M = PALETTE.musician;

export const MUSICIAN_LOOK: Look = {
  description: "Folk singer: long auburn hair, round glasses, mustard knit sweater, long sage skirt, brown boots.",
  height: 0.96, bulk: 0, hair: "long", top: "sweater", sleeves: "long", bottom: "skirt", skirtHem: 0.34, boots: true,
  extras: ["glasses"], brow: 0.06,
  colors: { skin: T.skinTan, hair: M.hairAuburn, top: T.mustardKnit, accent: T.mustardKnit, bottom: T.sage, shoes: T.bootBrown,
    trim: T.bootBrown, hat: T.hatBand, bag: M.strap, glasses: T.frames },
};

export type GuitarSlot = "guitar-top" | "guitar-edge" | "guitar-neck" | "guitar-fretboard" | "guitar-hole" | "guitar-cream" | "guitar-metal";
export const GUITAR_COLORS: Readonly<Record<GuitarSlot, number>> = {
  "guitar-top": M.guitarTop, "guitar-edge": M.guitarEdge, "guitar-neck": M.guitarNeck, "guitar-fretboard": M.fretboard,
  "guitar-hole": M.soundHole, "guitar-cream": M.guitarCream, "guitar-metal": M.guitarMetal,
};
/** Palette slots for the musician and her guitar, for the toon loader. The strap is the `town-bag` slot. */
export const MUSICIAN_COLORS: Readonly<Record<TownSlot | GuitarSlot, number>> = { ...lookColors(MUSICIAN_LOOK), ...GUITAR_COLORS };

// --- Guitar ---------------------------------------------------------------------------------------

/** Distances along the guitar from the headstock end, before scaling. */
const NUT = 0.168, SADDLE = 1.235, NECK_HEEL = 0.74, SOUND_HOLE = 0.9;
const UPPER_BOUT = { center: 0.87, radius: 0.18 }, LOWER_BOUT = { center: 1.17, radius: 0.235 };
const BODY_DEPTH = 0.11;
const BODY_END = LOWER_BOUT.center + LOWER_BOUT.radius;
/** Guitar length from the end of the headstock (the origin, where the goose bites) to the bottom of the body. */
export const ACOUSTIC_GUITAR_LENGTH = MUSICIAN_GUITAR_LENGTH;
/** The guitar is drawn at these sizes and then scaled up to suit the townsfolk's big storybook bodies. */
const GUITAR_SCALE = ACOUSTIC_GUITAR_LENGTH / BODY_END;

/** Half the body's width at a distance along the guitar: the two bouts blended smoothly at the waist. */
function bodyHalfWidth(v: number): number {
  const bout = ({ center, radius }: { center: number; radius: number }) => Math.sqrt(Math.max(0, radius ** 2 - (v - center) ** 2));
  return (bout(UPPER_BOUT) ** 6 + bout(LOWER_BOUT) ** 6) ** (1 / 6);
}

/**
 * A cherry-red acoustic guitar: headstock end at the origin, the neck and body
 * running along +z, the strings facing +y. One mesh per palette slot.
 */
export function createAcousticGuitar(): THREE.Group {
  const pieces = new Map<GuitarSlot, THREE.BufferGeometry[]>();
  const put = (slot: GuitarSlot, geometry: THREE.BufferGeometry) => {
    geometry.deleteAttribute("uv");
    const list = pieces.get(slot) ?? []; list.push(geometry.index ? geometry.toNonIndexed() : geometry); pieces.set(slot, list);
  };
  const box = (slot: GuitarSlot, w: number, h: number, d: number, x: number, y: number, z: number, tilt?: THREE.Matrix4) => {
    const geometry = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    if (tilt) geometry.applyMatrix4(tilt);
    put(slot, geometry);
  };
  /** A flat shape lying on the guitar's top, `y` above the soundboard. */
  const decal = (slot: GuitarSlot, geometry: THREE.BufferGeometry, y: number, z: number, x = 0) =>
    put(slot, geometry.rotateX(-Math.PI / 2).translate(x, y, z));

  // Body: the outline traced down one side and back up the other, in the top's plane (shape y = -distance along).
  const outline: THREE.Vector2[] = [];
  const top = UPPER_BOUT.center - UPPER_BOUT.radius, bottom = BODY_END;
  const steps = 36;
  for (let i = 0; i <= steps; i++) { const v = top + (bottom - top) * (1 - Math.cos(Math.PI * i / steps)) / 2; outline.push(new THREE.Vector2(bodyHalfWidth(v), -v)); }
  for (let i = steps - 1; i > 0; i--) outline.push(new THREE.Vector2(-outline[i].x, outline[i].y));
  const shape = new THREE.Shape(outline);
  const sides = new THREE.ExtrudeGeometry(shape, { depth: BODY_DEPTH, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 4 });
  put("guitar-edge", sides.rotateX(-Math.PI / 2).translate(0, -BODY_DEPTH, 0));
  decal("guitar-top", new THREE.ShapeGeometry(shape), 0.0125, 0);
  // Sound hole with a cream rosette, a teardrop pickguard, and the bridge.
  decal("guitar-cream", new THREE.RingGeometry(0.074, 0.09, 28), 0.0135, SOUND_HOLE);
  decal("guitar-hole", new THREE.CircleGeometry(0.068, 24), 0.014, SOUND_HOLE);
  decal("guitar-cream", new THREE.CircleGeometry(0.07, 18).scale(0.85, 1.35, 1), 0.013, SOUND_HOLE + 0.08, 0.1);
  box("guitar-fretboard", 0.18, 0.018, 0.045, 0, 0.02, SADDLE + 0.005);
  box("guitar-cream", 0.12, 0.008, 0.008, 0, 0.032, SADDLE);
  for (const x of [-0.05, -0.03, -0.01, 0.01, 0.03, 0.05]) put("guitar-cream", new THREE.SphereGeometry(0.006, 6, 4).translate(x, 0.031, SADDLE + 0.018));

  // Neck, fretboard, frets and position dots.
  box("guitar-neck", 0.066, 0.05, NECK_HEEL - NUT + 0.03, 0, -0.015, (NUT + NECK_HEEL) / 2 + 0.015);
  box("guitar-neck", 0.08, 0.07, 0.06, 0, -0.035, NECK_HEEL - 0.01); // heel
  box("guitar-fretboard", 0.074, 0.014, 0.6, 0, 0.017, NUT + 0.3);
  box("guitar-cream", 0.076, 0.012, 0.01, 0, 0.028, NUT);
  const fret = (n: number) => NUT + (SADDLE - NUT) * (1 - 2 ** (-n / 12));
  for (let n = 1; n <= 14; n++) box("guitar-metal", 0.074, 0.004, 0.005, 0, 0.0255, fret(n));
  for (const n of [3, 5, 7, 9, 12]) decal("guitar-cream", new THREE.CircleGeometry(0.008, 8), 0.0245, (fret(n - 1) + fret(n)) / 2);

  // Headstock, tilted back from the nut, with three tuning pegs a side.
  const tilt = new THREE.Matrix4().makeTranslation(0, 0, NUT).multiply(new THREE.Matrix4().makeRotationX(-0.22));
  box("guitar-fretboard", 0.1, 0.026, NUT, 0, 0, -NUT / 2, tilt);
  for (const z of [-0.04, -0.085, -0.13]) for (const side of [-1, 1]) {
    put("guitar-metal", new THREE.CylinderGeometry(0.008, 0.008, 0.045, 6).rotateZ(Math.PI / 2).translate(side * 0.07, 0, z).applyMatrix4(tilt));
    put("guitar-cream", new THREE.BoxGeometry(0.02, 0.016, 0.03).translate(side * 0.098, 0, z).applyMatrix4(tilt));
  }

  // Six strings from the nut to the saddle, fanning out a little toward the bridge.
  for (let i = 0; i < 6; i++) {
    const across = (i - 2.5) / 2.5;
    const start = new THREE.Vector3(across * 0.028, 0.032, NUT), end = new THREE.Vector3(across * 0.05, 0.034, SADDLE);
    const string = new THREE.CylinderGeometry(0.0018, 0.0018, start.distanceTo(end), 4);
    string.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()));
    put("guitar-metal", string.translate(...start.clone().add(end).multiplyScalar(0.5).toArray()));
  }

  const group = new THREE.Group();
  group.name = "acoustic-guitar";
  for (const [slot, geometries] of pieces) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error(`Unable to merge ${slot}`);
    geometry.computeVertexNormals();
    geometry.scale(GUITAR_SCALE, GUITAR_SCALE, GUITAR_SCALE);
    const material = new THREE.MeshStandardMaterial({ color: GUITAR_COLORS[slot], roughness: 1, metalness: 0 });
    material.name = slot;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = slot; mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

// --- Musician -------------------------------------------------------------------------------------

/**
 * Where the guitar hangs when she plays, relative to her chest: body across her
 * right hip, neck rising to her left and angled a little forward, the strings
 * tipped up slightly so she can see them. Janitor-sized metres (scaled by height).
 */
const GUITAR_BODY_FROM_CHEST: Vec3 = [0.2, -0.5, -0.46];
const GUITAR_ALONG: Vec3 = [0.83, -0.56, 0.05];
const GUITAR_FACING: Vec3 = [0, 0.18, -1];

/** Heights in janitor coordinates are stretched by the long townsfolk legs; this undoes it above the hips. */
const LEG_LIFT = (RIG_HIP_JOINT_Y - RIG_ANKLE_Y) * (TOWNSFOLK_LEG_SCALE - 1);

interface GuitarFrame { origin: THREE.Vector3; along: THREE.Vector3; facing: THREE.Vector3; across: THREE.Vector3 }
/** The playing guitar's axes in model space: `along` runs headstock to body, `facing` out of the strings, `across` toward the floor-side edge. */
function guitarFrame(k: number): GuitarFrame {
  const chest = new THREE.Vector3(0, (1.65 + LEG_LIFT) * k, 0);
  const along = new THREE.Vector3(...GUITAR_ALONG).normalize();
  const facing = new THREE.Vector3(...GUITAR_FACING);
  facing.addScaledVector(along, -facing.dot(along)).normalize();
  const across = new THREE.Vector3().crossVectors(facing, along);
  const body = chest.clone().add(new THREE.Vector3(...GUITAR_BODY_FROM_CHEST).multiplyScalar(k));
  return { origin: body.addScaledVector(along, -LOWER_BOUT.center * GUITAR_SCALE), along, facing, across };
}
/** A point `distance` along the (unscaled) guitar, `out` metres off the strings and `side` toward the floor-side edge. */
const pointOn = (frame: GuitarFrame, distance: number, out: number, side = 0) =>
  frame.origin.clone().addScaledVector(frame.along, distance * GUITAR_SCALE).addScaledVector(frame.facing, out).addScaledVector(frame.across, side);

/**
 * The street musician on the townsfolk rig. Her chest carries a `guitar_socket`
 * whose axes match `createAcousticGuitar`, so a held guitar lines up when added
 * to it. The strap (`town-bag` mesh) can be hidden when she sets the guitar down.
 */
export function createMusicianModel(): THREE.Group {
  const spec = MUSICIAN_LOOK; const k = spec.height;
  const { rig } = drawTownsperson("street-musician", spec);
  const { model, chest, torsoWeight } = rig;
  model.userData = { assetRole: "rigged-character", visualDetailTier: 3, forward: "-Z", look: "street-musician" };
  const frame = guitarFrame(k);

  // Strap: from the neck heel up over her left shoulder, across her back, and round her right hip to the tail.
  const toRig = (p: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(p.x / k, p.y / k - LEG_LIFT, p.z / k);
  const strapPoints = [
    toRig(pointOn(frame, NECK_HEEL, -0.07, -0.04)),
    new THREE.Vector3(-0.22, 1.66, -0.29), new THREE.Vector3(-0.2, 1.82, -0.17), new THREE.Vector3(-0.19, 1.885, 0.02),
    new THREE.Vector3(-0.15, 1.76, 0.25), new THREE.Vector3(0.06, 1.42, 0.335), new THREE.Vector3(0.33, 1.16, 0.3),
    new THREE.Vector3(0.46, 1.08, 0.02),
    toRig(pointOn(frame, BODY_END + 0.005, -0.055)),
  ];
  rig.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strapPoints), 48, 0.022, 6, false), "town-bag", torsoWeight);

  rig.finish(lookColors(spec), ["town-mouth-open"]);

  const socket = new THREE.Object3D();
  socket.name = "guitar_socket";
  socket.userData.attachmentRole = "held-guitar";
  const chestPosition = new THREE.Vector3(); model.updateMatrixWorld(true); chest.getWorldPosition(chestPosition);
  socket.position.copy(frame.origin).sub(chestPosition);
  socket.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.across, frame.facing, frame.along));
  chest.add(socket);

  model.animations = createMusicianClips(model, frame, rig.bindPose());
  return model;
}

// --- Clips ----------------------------------------------------------------------------------------

type ArmPose = [forward: number, out: number, elbow: number, twist: number];

/**
 * Finds shoulder and elbow angles that put a hand's grip on `target`, measured on
 * the model itself rather than eyeballed. The elbow is kept out from the body.
 */
function reach(model: THREE.Object3D, side: "left" | "right", target: THREE.Vector3, wrist: Vec3, guess: ArmPose): ArmPose {
  const shoulder = model.getObjectByName(`${side}_shoulder`)!, elbow = model.getObjectByName(`${side}_elbow`)!;
  const wristBone = model.getObjectByName(`${side}_wrist`)!, grip = model.getObjectByName(`${side}_hand_socket`)!;
  const at = new THREE.Vector3(), elbowAt = new THREE.Vector3();
  const pose = (angles: ArmPose) => {
    const rotations = arm(side, angles[0], angles[1], angles[2], wrist, angles[3]) as Record<string, Vec3>;
    shoulder.rotation.set(...rotations[`${side}_shoulder`]); elbow.rotation.set(...rotations[`${side}_elbow`]);
    wristBone.rotation.set(...rotations[`${side}_wrist`]);
    model.updateMatrixWorld(true);
  };
  const cost = (angles: ArmPose) => {
    pose(angles);
    grip.getWorldPosition(at); elbow.getWorldPosition(elbowAt);
    const tucked = Math.max(0, 0.5 - Math.abs(elbowAt.x));
    return at.distanceToSquared(target) + tucked * tucked * 2 + 0.0005 * angles[3] * angles[3];
  };
  const best: ArmPose = [...guess];
  let score = cost(best);
  for (let step = 0.4; step > 0.0005; step /= 2) {
    for (let pass = 0; pass < 6; pass++) {
      let improved = false;
      for (let i = 0; i < 4; i++) for (const delta of [step, -step]) {
        const trial: ArmPose = [...best]; trial[i] += delta;
        trial[2] = THREE.MathUtils.clamp(trial[2], 0.05, 2.5);
        const trialScore = cost(trial);
        if (trialScore < score) { score = trialScore; best.splice(0, 4, ...trial); improved = true; }
      }
      if (!improved) break;
    }
  }
  pose([0, 0, 0, 0]); wristBone.rotation.set(0, 0, 0);
  return best;
}

const mix = (a: ArmPose, b: ArmPose, t: number): ArmPose => a.map((value, i) => value + (b[i] - value) * t) as ArmPose;
const smooth = (t: number) => t * t * (3 - 2 * t);

function createMusicianClips(model: THREE.Group, frame: GuitarFrame, bind: ReadonlyMap<string, THREE.Vector3>): THREE.AnimationClip[] {
  const legs = legsFromBind(bind); const k = legs.ankleY / RIG_ANKLE_Y;
  // Walking and jogging at the speeds the simulation moves her at.
  const walk: WalkStyle = { ...TOWNSFOLK_WALK, legs, speed: MUSICIAN_TUNING.walkSpeed, duration: TOWNSFOLK_STRIDE * k / MUSICIAN_TUNING.walkSpeed };
  const jog: WalkStyle = { ...TOWNSFOLK_RUN, legs, speed: MUSICIAN_TUNING.jogSpeed, duration: 0.72, stepHeight: 0.14, lean: 0.12, armSwing: 0.55 };
  // Fretting hand wrapped behind the neck; strumming hand over the strings between the sound hole and bridge.
  const fretWrist: Vec3 = [-0.25, 0.9, 0.2], strumWrist: Vec3 = [-0.35, -0.3, 0.1];
  const chordA = reach(model, "left", pointOn(frame, 0.36, -0.035), fretWrist, [0.9, 0.3, 1.4, 0]);
  const chordB = reach(model, "left", pointOn(frame, 0.43, -0.035), fretWrist, chordA);
  const strumUp = reach(model, "right", pointOn(frame, 1.04, 0.075, -0.06), strumWrist, [0.6, 0.2, 1.3, 0]);
  const strumDown = reach(model, "right", pointOn(frame, 1.04, 0.075, 0.07), strumWrist, strumUp);
  const strumRest = reach(model, "right", pointOn(frame, 1.08, 0.06, 0.04), strumWrist, strumUp);
  // A takeaway cup held low in front, then lifted to the lips.
  const sipWrist: Vec3 = [-0.3, 0, 0];
  const cupLow = reach(model, "right", new THREE.Vector3(0.3, 1.42 + LEG_LIFT, -0.45).multiplyScalar(k), sipWrist, [0.5, 0.1, 1.2, 0]);
  const cupUp = reach(model, "right", new THREE.Vector3(0.14, 2.0 + LEG_LIFT, -0.5).multiplyScalar(k), sipWrist, [1.2, 0.1, 2.0, 0]);
  const arms = (fret: ArmPose, strum: ArmPose): Rotations => ({
    ...arm("left", fret[0], fret[1], fret[2], fretWrist, fret[3]), ...arm("right", strum[0], strum[1], strum[2], strumWrist, strum[3]),
  });
  const beat = (p: number, beats: number) => 0.5 - 0.5 * Math.cos(Math.PI * 2 * p * beats);
  return [
    // Strumming four beats a bar, nodding along, changing chord halfway; tapping her right foot.
    cycleClip("play", 2.4, (p) => {
      const down = beat(p, 8); const nod = beat(p, 4);
      const chord = smooth(THREE.MathUtils.clamp(Math.abs(((p * 2) % 1) - 0.5) * 6 - 1, 0, 1));
      return full({
        ...arms(mix(chordA, chordB, chord), mix(strumUp, strumDown, down)),
        hips: [0, 0, 0.015 * Math.sin(Math.PI * 2 * p * 2)], spine: [0.02, 0, -0.01 * Math.sin(Math.PI * 2 * p * 2)],
        neck: [-0.02, 0.12, 0], head: [-0.03 - 0.05 * nod, 0.1, 0.06],
        right_hip: [0.05 * nod, 0, 0], right_knee: [-0.1 * nod, 0, 0], right_ankle: [0.05 * nod, 0, 0],
      }, [0, -0.004 * nod, 0]);
    }, bind),
    // Between songs: hands resting on the guitar, looking out at the square.
    cycleClip("rest", 4, (p) => full({
      ...arms(chordA, strumRest),
      chest: [0.015 * Math.sin(Math.PI * 2 * p), 0, 0], neck: [0, -0.06, 0], head: [0.03, 0.25 * Math.sin(Math.PI * 2 * p) - 0.05, 0.02],
    }), bind),
    // Walking or jogging with the guitar held across her, as between songs.
    cycleClip("carry-walk", walk.duration, (p) => withHips({ ...walkPose(walk, p), rot: { ...walkPose(walk, p).rot, ...arms(chordA, strumRest) } }), bind),
    cycleClip("carry-jog", jog.duration, (p) => withHips({ ...walkPose(jog, p), rot: { ...walkPose(jog, p).rot, ...arms(chordA, strumRest) } }), bind),
    // Without the guitar.
    cycleClip("walk", walk.duration, (p) => withHips(walkPose(walk, p)), bind),
    cycleClip("jog", jog.duration, (p) => withHips(walkPose(jog, p)), bind),
    cycleClip("sip", 4, (p) => {
      const lift = envelope(Math.min(1, Math.max(0, (p - 0.3) / 0.45)), 0.35, 0.35);
      const [forward, out, elbow, twist] = mix(cupLow, cupUp, lift);
      return full({ ...hang(), ...arm("right", forward, out, elbow, sipWrist, twist), head: [0.12 * lift, 0, 0], chest: [0.012 * Math.sin(Math.PI * 2 * p), 0, 0] });
    }, bind),
    ...standingClips(legs, MUSICIAN_TUNING.walkSpeed, bind).filter((clip) => ["idle", "look", "startle", "shrug", "shoo"].includes(clip.name)),
  ];
}
