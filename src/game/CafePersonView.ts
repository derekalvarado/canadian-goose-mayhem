import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { CAFE_PERSON_COLORS, type CafeVariant } from "./CafePersonModel.ts";
import { createNewspaper, createWipingCloth } from "./CafePropsView.ts";
import { CAFE_TABLE_HEIGHT } from "./CoffeeFurnitureView.ts";
import { PALETTE } from "./palette.ts";
import { RiggedCharacterView, type CharacterLoader } from "./RiggedCharacterView.ts";
import { toonMaterial } from "./toonMaterial.ts";
import type { CafePersonState } from "./simulation/cafeCrew.ts";

const MODEL_URLS: Readonly<Record<CafeVariant, string>> = {
  barista: new URL("../../assets/characters/cafe/models/cafe-barista.glb", import.meta.url).href,
  laptop: new URL("../../assets/characters/cafe/models/cafe-laptop.glb", import.meta.url).href,
  reader: new URL("../../assets/characters/cafe/models/cafe-reader.glb", import.meta.url).href,
  student: new URL("../../assets/characters/cafe/models/cafe-student.glb", import.meta.url).href,
  baker: new URL("../../assets/characters/cafe/models/cafe-baker.glb", import.meta.url).href,
};
const sources = new Map<CafeVariant, Promise<GLTF>>();
function loaderFor(variant: CafeVariant): CharacterLoader {
  return () => {
    let source = sources.get(variant);
    if (!source) {
      source = new GLTFLoader().loadAsync(MODEL_URLS[variant]).catch((error: unknown) => { sources.delete(variant); throw error; });
      sources.set(variant, source);
    }
    return source;
  };
}

function createBook(): THREE.Group {
  const group = new THREE.Group(); group.name = "paperback";
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.035), toonMaterial(PALETTE.cafePeople.book));
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.037), toonMaterial(PALETTE.cafe.newspaper));
  pages.position.x = 0.012; group.add(cover, pages);
  return group;
}

/** Picks a clip from what the simulation says the person is doing. Presentation only. */
export function cafeClipFor(person: Pick<CafePersonState, "activity" | "seated" | "heldEntityId" | "variant">, moving: boolean): string {
  if (person.seated) {
    switch (person.activity) {
      case "working": return person.variant === "laptop" ? "sit-type" : "sit-read";
      case "sipping": return "sit-sip";
      case "looking-up": return "sit-look";
      case "startled": return "sit-startle";
      case "dabbing": return "sit-dab";
      case "waiting": return "sit-wait";
      case "shooing": return "sit-shoo";
      default: return "sit";
    }
  }
  if (person.activity === "chasing") return "jog";
  if (moving) return person.heldEntityId ? "carry" : "walk";
  switch (person.activity) {
    case "kneading": return "knead";
    case "baking": case "stocking": return "brew";
    case "washing": return "wipe";
    case "brewing": return "brew";
    case "calling": case "greeting": return "greet";
    case "fixing-radio": return "fiddle";
    case "wiping": return "wipe";
    case "shooing": return "shoo";
    case "startled": return "startle";
    case "puzzled": return "shrug";
    default: return "idle";
  }
}

/** A coffee-shop person: toon-shaded rig, a hand prop for reading or wiping, and a surprised mouth. */
export class CafePersonView extends RiggedCharacterView {
  readonly variant: CafeVariant;
  private readonly handProp?: THREE.Group;

  constructor(variant: CafeVariant, loader?: CharacterLoader) {
    super({ name: `café ${variant}`, errorLabel: `the café ${variant}`, palette: CAFE_PERSON_COLORS[variant],
      loader: loader ?? (typeof window === "undefined" ? undefined : loaderFor(variant)),
      initialClip: variant === "barista" ? "idle" : "sit" });
    this.variant = variant;
    this.handProp = variant === "reader" ? createNewspaper() : variant === "student" ? createBook() : variant === "barista" ? createWipingCloth() : undefined;
    void this.ready.then(() => {
      const prop = this.handProp; if (!prop) return;
      prop.visible = false;
      if (variant === "barista") this.getHandSocket("right")?.add(prop);
      else this.putReadingDown();
    });
  }

  private readingHeld = false;
  /** Reading matter is held in both hands, so it rides the chest between them. */
  private holdReading(): void {
    const prop = this.handProp; const chest = this.getObjectByName("chest");
    if (!prop || !chest || this.readingHeld) return;
    chest.add(prop); this.readingHeld = true;
    prop.scale.setScalar(1);
    if (this.variant === "reader") { prop.position.set(0, -0.06, -0.52); prop.rotation.set(0, 0, 0); }
    else { prop.position.set(0, -0.2, -0.46); prop.rotation.set(-0.7, 0, 0); }
  }
  /** Between reads it lies folded on the table in front of them instead of vanishing. */
  private putReadingDown(): void {
    const prop = this.handProp; if (!prop || (!this.readingHeld && prop.parent === this)) return;
    this.add(prop); this.readingHeld = false;
    const folded = this.variant === "reader" ? 0.6 : 1;
    prop.scale.set(folded, folded, 1);
    prop.position.set(-0.2, CAFE_TABLE_HEIGHT + 0.02, -0.72);
    prop.rotation.set(-Math.PI / 2, 0, this.variant === "reader" ? 0.3 : -0.25);
  }

  private mouths?: { closed: THREE.Object3D[]; open: THREE.Object3D[] };

  setState(person: CafePersonState): void {
    this.userData.gameplayState = person.activity;
    this.playAnimation(cafeClipFor(person, person.moving), 0.2);
    if (this.handProp && this.variant === "barista") this.handProp.visible = person.activity === "wiping";
    else if (this.handProp) {
      this.handProp.visible = person.seated;
      if (person.seated && person.activity === "working") this.holdReading(); else this.putReadingDown();
    }
    const open = person.activity === "startled" || person.activity === "shooing" || person.activity === "calling"
      || person.activity === "greeting" || person.activity === "chasing";
    if (!this.mouths && this.activeClip) {
      const mouths = { closed: [] as THREE.Object3D[], open: [] as THREE.Object3D[] };
      this.traverse((object) => {
        if (object.name === "cafe-mouth-open") mouths.open.push(object);
        else if (object.name === "cafe-mouth") mouths.closed.push(object);
      });
      this.mouths = mouths;
    }
    for (const mouth of this.mouths?.open ?? []) mouth.visible = open;
    for (const mouth of this.mouths?.closed ?? []) mouth.visible = !open;
  }
}
