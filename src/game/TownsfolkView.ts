import * as THREE from "three";
import { CAFE_TABLE_HEIGHT } from "./CoffeeFurnitureView.ts";
import { createDogModel, DOG_COLORS } from "./DogModel.ts";
import { PALETTE } from "./palette.ts";
import { RiggedCharacterView, type CharacterLoader } from "./RiggedCharacterView.ts";
import { toonMaterial } from "./toonMaterial.ts";
import { createTownsfolkModel, TOWNSFOLK_COLORS, type TownsfolkLook } from "./TownsfolkModel.ts";
import { TOWNSFOLK_RUNNERS } from "./townsfolkTuning.ts";
import type { CafePersonState } from "./simulation/cafeCrew.ts";
import type { DogState, TownActivity, TownspersonState } from "./simulation/townsfolk.ts";

/**
 * Townsfolk and the dog are built from source at runtime instead of loading a
 * GLB per person (there are many of them and they share one rig). Each look is
 * built once, one per task so the frame never hitches, then cloned per instance.
 */
type Source = Awaited<ReturnType<CharacterLoader>>;
const sources = new Map<string, Promise<Source>>();
let queue: Promise<unknown> = Promise.resolve();
export function buildLater(key: string, build: () => THREE.Group): CharacterLoader {
  return () => {
    let source = sources.get(key);
    if (!source) {
      source = queue.then(() => new Promise<Source>((resolve) => setTimeout(() => {
        const model = build(); resolve({ scene: model, animations: model.animations });
      }, 0)));
      queue = source.catch(() => undefined);
      sources.set(key, source);
    }
    return source;
  };
}

const T = PALETTE.townsfolk;
const CUP_POINT = new THREE.Vector3();
function createPhone(): THREE.Group {
  const group = new THREE.Group(); group.name = "phone";
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.02), toonMaterial(T.phone));
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.17, 0.004), toonMaterial(T.phoneScreen));
  screen.position.z = -0.011;
  group.add(body, screen);
  return group;
}
/** A paper takeaway cup with a lid and a card sleeve. */
export function createTakeawayCup(): THREE.Group {
  const group = new THREE.Group(); group.name = "takeaway cup";
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.058, 0.22, 14), toonMaterial(T.takeawayCup));
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.066, 0.08, 14), toonMaterial(T.cupSleeve));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.079, 0.079, 0.025, 14), toonMaterial(T.takeawayCup));
  sleeve.position.y = -0.01; lid.position.y = 0.12;
  for (const mesh of [cup, sleeve, lid]) mesh.castShadow = true;
  group.add(cup, sleeve, lid);
  return group;
}

const SEATED_CLIPS: Partial<Record<TownActivity, string>> = {
  "sit-looking": "sit-look", "sit-phoning": "sit-phone", "sit-sipping": "bench-sip", "sit-relaxing": "sit-relax", "sit-petting": "sit-pet",
  startled: "sit-startle", shooing: "sit-shoo", eyeing: "sit-look",
};
const STANDING_CLIPS: Partial<Record<TownActivity, string>> = {
  walking: "walk", running: "run", "stepping-back": "walk", watching: "watch", clapping: "clap", calling: "call", filming: "film",
  phoning: "phone", waving: "greet", looking: "look", startled: "startle", eyeing: "look", shooing: "shoo",
};
/** Picks a clip from what the simulation says the person is doing. Presentation only. */
export function townClipFor(person: Pick<TownspersonState, "activity" | "seated">): string {
  return person.seated ? SEATED_CLIPS[person.activity] ?? "sit" : STANDING_CLIPS[person.activity] ?? "idle";
}

/** Café regulars reuse the café routine's activities; this maps them onto the townsfolk clips. */
export function patronClipFor(person: Pick<CafePersonState, "activity" | "seated" | "moving">): string {
  if (person.seated) {
    switch (person.activity) {
      case "sipping": return "sit-sip";
      case "looking-up": return "sit-look";
      case "working": return "sit-phone";
      case "startled": return "sit-startle";
      case "shooing": return "sit-shoo";
      default: return "sit";
    }
  }
  if (person.activity === "ordering") return "order";
  if (person.activity === "startled") return "startle";
  if (person.moving) return person.activity === "leaving" || person.activity === "walking-to-seat" ? "carry" : "walk";
  return "idle";
}

/** A parent, passer-by, or café regular: toon-shaded rig, a phone or a coffee in hand, and a surprised mouth. */
export class TownspersonView extends RiggedCharacterView {
  readonly look: TownsfolkLook;
  private readonly phone = createPhone();
  private readonly cup = createTakeawayCup();
  private hand?: THREE.Object3D;
  private cupInHand = true;
  private mouths?: { closed: THREE.Object3D[]; open: THREE.Object3D[] };

  constructor(look: TownsfolkLook, loader?: CharacterLoader) {
    super({ name: `townsperson ${look}`, errorLabel: `the ${look} townsperson`, palette: TOWNSFOLK_COLORS[look],
      loader: loader ?? (typeof window === "undefined" ? undefined : buildLater(look, () => createTownsfolkModel(look))), initialClip: "idle" });
    this.look = look;
    this.userData.characterVariant = look;
    this.phone.visible = false; this.cup.visible = false;
    void this.ready.then(() => {
      const hand = this.getHandSocket("right"); if (!hand) return;
      this.hand = hand;
      // Held flat in the palm, screen toward the face.
      this.phone.position.set(-0.03, -0.02, -0.03); this.phone.rotation.set(-0.3, 0, 0); hand.add(this.phone);
      this.holdCup(true);
    }).catch(() => undefined);
  }

  /** The coffee rides in the right hand, or stands on the café table in front of them between sips. */
  private holdCup(inHand: boolean): void {
    if (this.cup.parent !== this) this.add(this.cup);
    this.cupInHand = inHand;
    if (!inHand) { this.cup.position.set(0.22, CAFE_TABLE_HEIGHT + 0.11, -0.72); this.cup.rotation.set(0, 0, 0); }
  }

  /**
   * A held cup stays upright beside the palm (toward their middle) rather than
   * turning with the wrist, and tips toward the mouth as the hand comes up to sip.
   */
  private placeCupInHand(): void {
    if (!this.hand || !this.cupInHand || !this.cup.visible) return;
    this.updateMatrixWorld(true);
    const palm = this.worldToLocal(this.hand.getWorldPosition(CUP_POINT));
    // How far the hand has come up from the lap toward the face (seated hips sit at the same height for everyone).
    const raised = this.activeClip === "sit-sip" || this.activeClip === "bench-sip" ? THREE.MathUtils.clamp((palm.y - 1.25) / 0.45, 0, 1) : 0;
    this.cup.position.set(palm.x - 0.075, palm.y + 0.02 * (1 - raised), palm.z);
    this.cup.rotation.set(raised * 1.05, 0, 0);
  }

  override update(delta: number): void {
    super.update(delta);
    this.placeCupInHand();
  }

  /** Shows a prop in hand and opens the mouth for surprised or noisy moments. */
  private present(clip: string, open: boolean, hidden: boolean, cupOnTable = false): void {
    this.visible = !hidden;
    this.playAnimation(clip, 0.25);
    this.phone.visible = clip === "phone" || clip === "film" || clip === "sit-phone";
    const sipping = clip === "sit-sip" || clip === "bench-sip" || clip === "carry";
    this.holdCup(sipping || !cupOnTable);
    this.cup.visible = sipping || cupOnTable || (this.look === "beard-dad" && (clip === "sit" || clip === "sit-look"));
    if (!this.mouths && this.activeClip) {
      const mouths = { closed: [] as THREE.Object3D[], open: [] as THREE.Object3D[] };
      this.traverse((object) => {
        if (object.name === "town-mouth-open") mouths.open.push(object);
        else if (object.name === "town-mouth") mouths.closed.push(object);
      });
      this.mouths = mouths;
    }
    for (const mouth of this.mouths?.open ?? []) mouth.visible = open;
    for (const mouth of this.mouths?.closed ?? []) mouth.visible = !open;
  }

  setState(person: TownspersonState): void {
    this.userData.gameplayState = person.activity;
    const walked = townClipFor(person);
    // Runners stay at a run when they swerve round the goose.
    const clip = walked === "walk" && TOWNSFOLK_RUNNERS.includes(this.look) ? "run" : walked;
    this.present(clip, /startle|shoo|call|clap/.test(clip), person.hidden);
  }

  setPatronState(person: CafePersonState): void {
    this.userData.gameplayState = person.activity;
    const clip = patronClipFor(person);
    this.present(clip, /startle|shoo/.test(clip), person.activity === "away", person.seated);
  }
}

const DOG_CLIPS: Readonly<Record<DogState["activity"], string>> = { lying: "lie", sitting: "sit", alert: "alert", barking: "bark", happy: "happy" };

/** The small white dog that keeps a parent company. */
export class DogView extends RiggedCharacterView {
  constructor(loader?: CharacterLoader) {
    super({ name: "small white dog", errorLabel: "the small white dog", palette: DOG_COLORS,
      loader: loader ?? (typeof window === "undefined" ? undefined : buildLater("dog", createDogModel)), initialClip: "lie" });
  }

  setState(dog: DogState): void {
    this.userData.gameplayState = dog.activity;
    this.playAnimation(DOG_CLIPS[dog.activity], 0.25);
  }
}
