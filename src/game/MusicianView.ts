import * as THREE from "three";
import { PALETTE } from "./palette.ts";
import { toonMaterial } from "./toonMaterial.ts";
import { MUSICIAN_TUNING } from "./musicianTuning.ts";
import { ACOUSTIC_GUITAR_LENGTH, createAcousticGuitar, createMusicianModel, GUITAR_COLORS, MUSICIAN_COLORS, type GuitarSlot } from "./MusicianModel.ts";
import { RiggedCharacterView, type CharacterLoader } from "./RiggedCharacterView.ts";
import { buildLater, createTakeawayCup } from "./TownsfolkView.ts";
import type { MusicianState } from "./simulation/musician.ts";

/**
 * The street musician (a folk singer on the townsfolk rig), her acoustic guitar,
 * and its stand. Presentation only: clips follow what the simulation says she is doing.
 */
const C = PALETTE.musicianGraybox;
function box(w: number, h: number, d: number, color: number, x = 0, y = h / 2, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}

/** Guitar length from the end of the headstock (the origin, where the goose bites) to the bottom of the body. */
export const GUITAR_LENGTH = ACOUSTIC_GUITAR_LENGTH;

/** The musician's guitar: headstock at the origin, the neck and body running along +z, the strings facing +y. */
export function createGuitar(): THREE.Group {
  const guitar = createAcousticGuitar();
  guitar.traverse((object) => {
    if (object instanceof THREE.Mesh) object.material = toonMaterial(GUITAR_COLORS[(object.material as THREE.Material).name as GuitarSlot]);
  });
  return guitar;
}

/** A low A-frame stand the guitar leans in, sized to the guitar. */
export function createGuitarStand(): THREE.Group {
  const group = new THREE.Group();
  const frame = new THREE.Group(); frame.scale.setScalar(GUITAR_LENGTH / 1.02);
  frame.add(box(0.36, 0.04, 0.3, C.stand, 0, 0.02, 0));
  const back = box(0.05, 0.62, 0.05, C.stand, 0, 0.31, 0.1); back.rotation.x = -0.18; frame.add(back);
  frame.add(box(0.34, 0.05, 0.08, C.stand, 0, 0.1, -0.06));
  group.add(frame);
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

/** Picks a clip from what the simulation says she is doing. Presentation only. */
export function musicianClipFor(state: Pick<MusicianState, "activity" | "moving" | "heldEntityId">): string {
  const holding = state.heldEntityId !== undefined;
  const hurrying = state.activity === "chasing" || state.activity === "retrieving" || state.activity === "carrying";
  if (state.moving) return `${holding ? "carry-" : ""}${hurrying ? "jog" : "walk"}`;
  if (holding) return state.activity === "playing" ? "play" : "rest";
  switch (state.activity) {
    case "sipping": return "sip";
    case "reacting": return "startle";
    case "shooing": return "shoo";
    case "puzzled": case "missing": return "shrug";
    case "eyeing": case "investigating": case "searching": case "looking-around": case "chasing": return "look";
    default: return "idle";
  }
}

const MARKER_HEIGHT = 2.95;
const CUP_POINT = new THREE.Vector3();

export class MusicianView extends RiggedCharacterView {
  private readonly cup = createTakeawayCup();
  /** Follows the rig's chest once it loads; a held guitar's wrapper is parented here. */
  private readonly guitarSocket = new THREE.Object3D();
  private readonly marker: THREE.Sprite;
  private readonly markerTextures: Record<"!" | "?", THREE.Texture | undefined>;
  private readonly wideSight: THREE.Mesh;
  private readonly focusedSight: THREE.Mesh;
  private readonly sight = new THREE.Group();
  private strap?: THREE.Object3D;
  private hand?: THREE.Object3D;
  private mouths: { closed: THREE.Object3D[]; open: THREE.Object3D[] } = { closed: [], open: [] };
  private state?: MusicianState;
  private time = 0;

  constructor(loader?: CharacterLoader) {
    super({ name: "street musician", errorLabel: "the street musician", palette: MUSICIAN_COLORS,
      loader: loader ?? (typeof window === "undefined" ? undefined : buildLater("street-musician", createMusicianModel)), initialClip: "play" });
    // Until the rig loads the guitar hangs roughly where she holds it.
    this.guitarSocket.position.set(-0.6, 1.85, -0.5);
    this.add(this.guitarSocket);
    this.cup.visible = false;
    void this.ready.then(() => {
      const socket = this.getObjectByName("guitar_socket");
      if (socket) { socket.add(this.guitarSocket); this.guitarSocket.position.set(0, 0, 0); }
      this.hand = this.getHandSocket("right");
      this.add(this.cup);
      this.strap = this.getObjectByName("town-bag");
      this.traverse((object) => {
        if (object.name === "town-mouth-open") this.mouths.open.push(object);
        else if (object.name === "town-mouth") this.mouths.closed.push(object);
      });
      if (this.state) this.setState(this.state);
    }).catch(() => undefined);

    this.markerTextures = { "!": markerTexture("!", C.alert), "?": markerTexture("?", C.puzzled) };
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    this.marker.scale.set(0.5, 0.5, 1); this.marker.position.set(0, MARKER_HEIGHT, 0); this.marker.visible = false; this.marker.renderOrder = 3;
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
    this.userData.gameplayState = state.activity;
    const focused = state.sightHalfAngle < MUSICIAN_TUNING.sightHalfAngle - 0.01;
    this.wideSight.visible = !focused; this.focusedSight.visible = focused;
    const texture = state.alert ? this.markerTextures[state.alert] : undefined;
    this.marker.visible = texture !== undefined;
    if (texture && this.marker.material.map !== texture) { this.marker.material.map = texture; this.marker.material.needsUpdate = true; }
    const clip = musicianClipFor(state);
    this.playAnimation(clip, 0.25);
    // The strap goes with the guitar; a coffee only while sipping on her break.
    if (this.strap) this.strap.visible = state.heldEntityId !== undefined;
    this.cup.visible = clip === "sip";
    const open = clip === "startle" || clip === "shoo";
    for (const mouth of this.mouths.open) mouth.visible = open;
    for (const mouth of this.mouths.closed) mouth.visible = !open;
  }

  override update(delta: number): void {
    if (!Number.isFinite(delta)) return;
    super.update(delta);
    this.time += Math.min(delta, 0.1);
    this.marker.position.y = MARKER_HEIGHT + Math.sin(this.time * 5) * 0.05;
    this.placeCup();
  }

  /** The coffee stays upright beside her palm rather than turning with the wrist, tipping toward her lips as she sips. */
  private placeCup(): void {
    if (!this.hand || !this.cup.visible) return;
    this.updateMatrixWorld(true);
    const palm = this.worldToLocal(this.hand.getWorldPosition(CUP_POINT));
    const raised = THREE.MathUtils.clamp((palm.y - 1.55) / 0.45, 0, 1);
    this.cup.position.set(palm.x - 0.075, palm.y + 0.02 * (1 - raised), palm.z);
    this.cup.rotation.set(raised * 1.05, 0, 0);
  }
}
