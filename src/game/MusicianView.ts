import * as THREE from "three";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";
import { MUSICIAN_TUNING } from "./musicianTuning.ts";
import type { MusicianState } from "./simulation/musician.ts";

/**
 * Gray-box stand-ins for the street musician, the guitar, and its stand, so the
 * stealing game can be tuned before real models exist. Presentation only.
 */
const C = PALETTE.musicianGraybox;
function box(w: number, h: number, d: number, color: number, x = 0, y = h / 2, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}

/** Guitar length from the end of the headstock (the origin, where the goose bites) to the bottom of the body. */
export const GUITAR_LENGTH = 1.02;

/** A flat guitar: headstock at the origin, the neck and body running along +z, the strings facing +y. */
export function createGuitar(): THREE.Group {
  const group = new THREE.Group();
  group.add(box(0.09, 0.03, 0.16, C.guitarDark, 0, 0, 0.08));
  group.add(box(0.055, 0.035, 0.46, C.guitarDark, 0, 0, 0.39));
  group.add(box(0.3, 0.09, 0.2, C.guitar, 0, 0, 0.66));
  group.add(box(0.38, 0.09, 0.26, C.guitar, 0, 0, 0.88));
  group.add(box(0.09, 0.012, 0.09, C.guitarDark, 0, 0.05, 0.72));
  return group;
}

/** A low A-frame stand the guitar leans in. */
export function createGuitarStand(): THREE.Group {
  const group = new THREE.Group();
  group.add(box(0.36, 0.04, 0.3, C.stand, 0, 0.02, 0));
  const back = box(0.05, 0.62, 0.05, C.stand, 0, 0.31, 0.1); back.rotation.x = -0.18; group.add(back);
  group.add(box(0.34, 0.05, 0.08, C.stand, 0, 0.1, -0.06));
  return group;
}

function markerTexture(text: string, color: number): THREE.Texture | undefined {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.font = "bold 104px Georgia"; context.textAlign = "center"; context.textBaseline = "middle";
  context.lineWidth = 12; context.strokeStyle = "#2b2a28"; context.strokeText(text, 64, 70);
  context.fillStyle = `#${color.toString(16).padStart(6, "0")}`; context.fillText(text, 64, 70);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function sightFan(halfAngle: number, opacity: number): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(MUSICIAN_TUNING.sightRange, 40, Math.PI / 2 - halfAngle, halfAngle * 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: C.sightCone, transparent: true, opacity, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.04; mesh.renderOrder = 2;
  return mesh;
}

export class MusicianView extends THREE.Group {
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly strumArm = new THREE.Group();
  private readonly cup: THREE.Mesh;
  private readonly guitarSocket = new THREE.Object3D();
  private readonly marker: THREE.Sprite;
  private readonly markerTextures: Record<"!" | "?", THREE.Texture | undefined>;
  private readonly wideSight: THREE.Mesh;
  private readonly focusedSight: THREE.Mesh;
  private readonly sight = new THREE.Group();
  private state?: MusicianState;
  private time = 0;

  constructor() {
    super();
    // Faces local -z, like the other people in town.
    this.body.add(box(0.15, 0.85, 0.2, C.bodyShade, -0.1, 0.425), box(0.15, 0.85, 0.2, C.bodyShade, 0.1, 0.425));
    this.body.add(box(0.46, 0.62, 0.26, C.body, 0, 1.16));
    this.body.add(box(0.11, 0.56, 0.12, C.bodyShade, -0.3, 1.17));
    this.strumArm.position.set(0.3, 1.42, 0);
    this.strumArm.add(box(0.11, 0.56, 0.12, C.bodyShade, 0, -0.27));
    this.cup = box(0.09, 0.13, 0.09, C.cup, 0, -0.58, -0.04); this.cup.visible = false; this.strumArm.add(this.cup);
    this.body.add(this.strumArm);
    this.head.position.set(0, 1.52, 0);
    this.head.add(box(0.26, 0.28, 0.26, C.body, 0, 0.14));
    // A dark visor marks which way they are looking.
    this.head.add(box(0.2, 0.07, 0.06, C.face, 0, 0.17, -0.15));
    this.body.add(this.head);
    // Held guitar: headstock up at their left shoulder, body across the right hip, strings facing out.
    this.guitarSocket.position.set(-0.36, 1.38, -0.2);
    const along = new THREE.Vector3(0.62, -0.5, 0).normalize(); const face = new THREE.Vector3(0, 0, -1);
    this.guitarSocket.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(face.clone().cross(along), face, along));
    this.body.add(this.guitarSocket);
    this.add(this.body);

    this.markerTextures = { "!": markerTexture("!", C.alert), "?": markerTexture("?", C.puzzled) };
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    this.marker.scale.set(0.5, 0.5, 1); this.marker.position.set(0, 2.15, 0); this.marker.visible = false; this.marker.renderOrder = 3;
    // Markers and the sight overlay are not part of the world: line-of-sight checks pass straight through them.
    this.marker.raycast = () => {};
    this.add(this.marker);

    this.wideSight = sightFan(MUSICIAN_TUNING.sightHalfAngle, 0.16);
    this.focusedSight = sightFan(MUSICIAN_TUNING.focusedHalfAngle, 0.22);
    const near = new THREE.Mesh(new THREE.RingGeometry(MUSICIAN_TUNING.nearSenseRadius - 0.04, MUSICIAN_TUNING.nearSenseRadius, 32),
      new THREE.MeshBasicMaterial({ color: C.sightCone, transparent: true, opacity: 0.35, depthWrite: false }));
    near.rotation.x = -Math.PI / 2; near.position.y = 0.05;
    this.sight.add(this.wideSight, this.focusedSight, near); this.sight.visible = false;
    for (const mesh of [this.wideSight, this.focusedSight, near]) mesh.raycast = () => {};
    this.add(this.sight);
  }

  /** Where a held guitar's headstock sits; the guitar's own axes line up with this socket. */
  getGuitarSocket(): THREE.Object3D { return this.guitarSocket; }

  /** The view cone and near-sense ring, for tuning sight in developer mode. */
  setSightVisible(visible: boolean): void { this.sight.visible = visible; }

  setState(state: MusicianState): void {
    this.state = state;
    const focused = state.sightHalfAngle < MUSICIAN_TUNING.sightHalfAngle - 0.01;
    this.wideSight.visible = !focused; this.focusedSight.visible = focused;
    const texture = state.alert ? this.markerTextures[state.alert] : undefined;
    this.marker.visible = texture !== undefined;
    if (texture && this.marker.material.map !== texture) { this.marker.material.map = texture; this.marker.material.needsUpdate = true; }
  }

  update(delta: number): void {
    const state = this.state; if (!state || !Number.isFinite(delta)) return;
    this.time += Math.min(delta, 0.1);
    const running = state.activity === "chasing" || state.activity === "retrieving" || state.activity === "carrying";
    const bob = state.moving ? Math.abs(Math.sin(this.time * (running ? 14 : 9))) * (running ? 0.07 : 0.04) : 0;
    this.body.position.y = bob;
    this.body.rotation.x = running && state.moving ? -0.22 : state.activity === "missing" ? 0.08 : 0;
    this.head.rotation.x = state.activity === "missing" ? 0.45 : state.activity === "sipping" ? -0.25 : 0;
    // Strumming while playing, a raised cup while sipping, a wave while shooing; otherwise hanging.
    this.cup.visible = state.activity === "sipping";
    this.strumArm.rotation.x = state.activity === "playing" ? 0.9 + Math.sin(this.time * 11) * 0.35
      : state.activity === "sipping" ? 2.2 : state.activity === "shooing" ? 2.6 + Math.sin(this.time * 18) * 0.4 : 0;
    this.marker.position.y = 2.15 + Math.sin(this.time * 5) * 0.05;
  }
}
