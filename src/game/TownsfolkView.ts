import * as THREE from "three";
import { createDogModel, DOG_COLORS } from "./DogModel.ts";
import { PALETTE } from "./palette.ts";
import { RiggedCharacterView, type CharacterLoader } from "./RiggedCharacterView.ts";
import { toonMaterial } from "./toonMaterial.ts";
import { createTownsfolkModel, TOWNSFOLK_COLORS, type TownsfolkLook } from "./TownsfolkModel.ts";
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
function buildLater(key: string, build: () => THREE.Group): CharacterLoader {
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
  "sit-looking": "sit-look", "sit-phoning": "sit-phone", "sit-sipping": "sit-sip", "sit-relaxing": "sit-relax", "sit-petting": "sit-pet",
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
  private mouths?: { closed: THREE.Object3D[]; open: THREE.Object3D[] };

  constructor(look: TownsfolkLook, loader?: CharacterLoader) {
    super({ name: `townsperson ${look}`, errorLabel: `the ${look} townsperson`, palette: TOWNSFOLK_COLORS[look],
      loader: loader ?? (typeof window === "undefined" ? undefined : buildLater(look, () => createTownsfolkModel(look))), initialClip: "idle" });
    this.look = look;
    this.userData.characterVariant = look;
    this.phone.visible = false; this.cup.visible = false;
    void this.ready.then(() => {
      const hand = this.getHandSocket("right"); if (!hand) return;
      // Held flat in the palm, screen toward the face.
      this.phone.position.set(-0.03, -0.02, -0.03); this.phone.rotation.set(-0.3, 0, 0); hand.add(this.phone);
      this.cup.position.set(-0.07, -0.02, -0.02); hand.add(this.cup);
    }).catch(() => undefined);
  }

  /** Shows a prop in hand and opens the mouth for surprised or noisy moments. */
  private present(clip: string, open: boolean, hidden: boolean): void {
    this.visible = !hidden;
    this.playAnimation(clip, 0.25);
    this.phone.visible = clip === "phone" || clip === "film" || clip === "sit-phone";
    this.cup.visible = clip === "sit-sip" || clip === "carry" || (this.look === "beard-dad" && clip.startsWith("sit"));
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
    const clip = townClipFor(person);
    this.present(clip, /startle|shoo|call|clap/.test(clip), person.hidden);
  }

  setPatronState(person: CafePersonState): void {
    this.userData.gameplayState = person.activity;
    const clip = patronClipFor(person);
    this.present(clip, /startle|shoo/.test(clip), person.activity === "away");
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
