import * as THREE from "three";
import { PALETTE } from "./palette.ts";
import { JANITOR_LEGS, type LegDimensions } from "./janitorGaits.ts";
import { createPersonRig, HEAD_CENTER, HEAD_RADII, type Point, type Weight } from "./personRig.ts";
import { createTownsfolkClips } from "./townsfolkMoves.ts";
import { TOWNSFOLK_LEG_SCALE, type TownsfolkLook } from "./townsfolkTuning.ts";

export type { TownsfolkLook } from "./townsfolkTuning.ts";
export { TOWNSFOLK_LOOKS } from "./townsfolkTuning.ts";

export type TownSlot =
  | "town-skin" | "town-hair" | "town-eyes" | "town-eye-shine" | "town-mouth" | "town-mouth-open" | "town-cheeks"
  | "town-top" | "town-accent" | "town-bottom" | "town-shoes" | "town-trim" | "town-hat" | "town-bag" | "town-glasses";

type Hair = "buzz" | "crop" | "bob" | "long" | "curly" | "balding" | "bald" | "braids" | "wavy" | "topknot";
type Hat = "sunhat" | "cap" | "flatcap" | "bucket" | "headband";
type Top = "tee" | "tank" | "sweater" | "shirt" | "hoodie" | "blazer" | "coat" | "raincoat" | "waistcoat" | "dress";
type Sleeves = "none" | "short" | "rolled" | "long";
type Bottom = "trousers" | "shorts" | "skirt";
type Extra = "sunglasses" | "glasses" | "beard" | "stubble" | "moustache" | "headphones" | "backpack" | "tote" | "scarf" | "bowtie" | "stripes";

/** What a townsperson-style character wears; the street musician is drawn from one too. */
export interface Look {
  readonly description: string;
  readonly height: number; readonly bulk: number;
  readonly hair: Hair; readonly hat?: Hat; readonly top: Top; readonly sleeves: Sleeves; readonly bottom: Bottom;
  readonly extras: readonly Extra[];
  /** Brow tilt: positive is worried, negative is cheerful-stern. */
  readonly brow: number;
  /** Skirt hem height (default just above the knee); lower for a long skirt. */
  readonly skirtHem?: number;
  /** Shoes rise up the shin as boots. */
  readonly boots?: boolean;
  readonly colors: Readonly<Record<"skin" | "hair" | "top" | "accent" | "bottom" | "shoes" | "trim" | "hat" | "bag" | "glasses", number>>;
}

const T = PALETTE.townsfolk;
const C = PALETTE.cafePeople;

/** Who they are and what they wear. Mesh material names match the slot keys so the toon loader can recolour them. */
export const TOWNSFOLK: Readonly<Record<TownsfolkLook, Look>> = {
  "sunhat-mom": { description: "Splash-pad mom: wide straw sun hat, sunglasses, coral sundress, sandals.", height: 0.95, bulk: 0,
    hair: "long", hat: "sunhat", top: "dress", sleeves: "none", bottom: "skirt", extras: ["sunglasses"], brow: -0.05,
    colors: { skin: T.skinBronze, hair: T.hairBlack, top: T.sundress, accent: T.sundress, bottom: T.sundress, shoes: T.sandals, trim: C.blouse, hat: T.strawHat, bag: T.hatBand, glasses: T.sunglasses } },
  "cap-dad": { description: "Splash-pad dad: red ball cap, navy tee, khaki shorts, stubble.", height: 1.02, bulk: 0.02,
    hair: "buzz", hat: "cap", top: "tee", sleeves: "short", bottom: "shorts", extras: ["stubble"], brow: -0.1,
    colors: { skin: T.skinUmber, hair: T.hairBlack, top: T.teeNavy, accent: T.teeNavy, bottom: T.khaki, shoes: T.sneakerWhite, trim: T.sneakerWhite, hat: T.capRed, bag: T.capRed, glasses: T.frames } },
  "phone-mom": { description: "Splash-pad mom filming the kids: long honey hair, lilac tee, light jeans, mustard tote.", height: 0.96, bulk: 0,
    hair: "wavy", top: "tee", sleeves: "short", bottom: "trousers", extras: ["tote"], brow: 0.08,
    colors: { skin: T.skinRose, hair: T.hairHoney, top: T.teeLilac, accent: T.teeLilac, bottom: T.denimLight, shoes: T.sneakerWhite, trim: T.sneakerWhite, hat: T.hatBand, bag: T.toteMustard, glasses: T.frames } },
  "beard-dad": { description: "Splash-pad dad with a coffee: chestnut hair, full beard, glasses, red flannel with rolled sleeves, dark jeans.", height: 1.03, bulk: 0.015,
    hair: "crop", top: "shirt", sleeves: "rolled", bottom: "trousers", extras: ["beard", "glasses"], brow: -0.08,
    colors: { skin: T.skinTan, hair: T.hairChestnut, top: T.flannelRed, accent: T.undershirtGrey, bottom: T.denimDark, shoes: T.bootBrown, trim: C.shoes, hat: T.hatBand, bag: T.bagBlack, glasses: T.frames } },
  jogger: { description: "Jogger: teal headband and running vest, black shorts, bright orange shoes.", height: 0.99, bulk: -0.02,
    hair: "crop", hat: "headband", top: "tank", sleeves: "none", bottom: "shorts", extras: [], brow: -0.12,
    colors: { skin: T.skinOlive, hair: T.hairBlack, top: T.sportTeal, accent: T.sportTeal, bottom: T.shortsBlack, shoes: T.sneakerOrange, trim: T.sneakerWhite, hat: T.sportTeal, bag: T.bagBlack, glasses: T.frames } },
  grandpa: { description: "Grandpa out for a stroll: tweed flat cap, white hair, moustache, glasses, mustard sweater over a white collar.", height: 0.93, bulk: 0.015,
    hair: "balding", hat: "flatcap", top: "sweater", sleeves: "long", bottom: "trousers", extras: ["glasses", "moustache"], brow: 0.1,
    colors: { skin: C.skinFair, hair: T.hairWhite, top: T.mustardKnit, accent: T.shirtWhite, bottom: T.slacksGrey, shoes: C.shoes, trim: T.shirtWhite, hat: T.tweed, bag: T.tweed, glasses: T.frames } },
  teen: { description: "Teen with headphones: curly hair, pink hoodie, black jeans, purple backpack.", height: 0.9, bulk: 0,
    hair: "curly", top: "hoodie", sleeves: "long", bottom: "trousers", extras: ["headphones", "backpack"], brow: 0.04,
    colors: { skin: T.skinUmber, hair: T.hairBlack, top: T.hoodiePink, accent: T.hoodiePink, bottom: T.jeansBlack, shoes: T.sneakerWhite, trim: T.headphones, hat: T.headphones, bag: T.backpackPurple, glasses: T.frames } },
  commuter: { description: "Commuter in a hurry: dark bob, navy blazer over a white blouse, grey skirt, black work bag.", height: 0.97, bulk: 0,
    hair: "bob", top: "blazer", sleeves: "long", bottom: "skirt", extras: ["tote"], brow: -0.04,
    colors: { skin: T.skinRose, hair: T.hairDarkBrown, top: T.blazerNavy, accent: T.shirtWhite, bottom: T.skirtGrey, shoes: T.shoeBlack, trim: T.shirtWhite, hat: T.hatBand, bag: T.bagBlack, glasses: T.frames } },
  artist: { description: "Sketcher: man bun, beard, mustard scarf, long olive coat, corduroy trousers.", height: 1.01, bulk: 0,
    hair: "topknot", top: "coat", sleeves: "long", bottom: "trousers", extras: ["beard", "scarf"], brow: 0.02,
    colors: { skin: T.skinBronze, hair: T.hairDarkBrown, top: T.coatOlive, accent: T.scarfMustard, bottom: T.corduroy, shoes: T.bootBrown, trim: T.bootBrown, hat: T.hatBand, bag: T.bagBlack, glasses: T.frames } },
  "red-coat": { description: "Café regular: grey waves, glasses, long red coat, black trousers.", height: 0.94, bulk: 0.01,
    hair: "wavy", top: "coat", sleeves: "long", bottom: "trousers", extras: ["glasses"], brow: 0.06,
    colors: { skin: T.skinTan, hair: T.hairGrey, top: T.coatRed, accent: T.shirtWhite, bottom: T.shortsBlack, shoes: T.shoeBlack, trim: T.toteMustard, hat: T.hatBand, bag: T.bagBlack, glasses: T.frames } },
  "bucket-hat": { description: "Café regular: sage bucket hat, striped tee, jeans, white sneakers.", height: 1.0, bulk: 0,
    hair: "buzz", hat: "bucket", top: "tee", sleeves: "short", bottom: "trousers", extras: ["stripes"], brow: -0.04,
    colors: { skin: T.skinUmber, hair: T.hairBlack, top: T.stripeCream, accent: T.stripeBlue, bottom: C.jeans, shoes: T.sneakerWhite, trim: T.sneakerWhite, hat: T.sage, bag: T.bagBlack, glasses: T.frames } },
  raincoat: { description: "Café regular: long braids, yellow raincoat, navy trousers, brown boots.", height: 0.95, bulk: 0.01,
    hair: "braids", top: "raincoat", sleeves: "long", bottom: "trousers", extras: [], brow: 0.05,
    colors: { skin: T.skinOlive, hair: T.hairDarkBrown, top: T.raincoatYellow, accent: T.raincoatYellow, bottom: T.trousersNavy, shoes: T.bootBrown, trim: T.charcoal, hat: T.hatBand, bag: T.bagBlack, glasses: T.frames } },
  "bow-tie": { description: "Café regular: bald with a big moustache, brown waistcoat, red bow tie, charcoal trousers.", height: 0.98, bulk: 0.03,
    hair: "bald", top: "waistcoat", sleeves: "long", bottom: "trousers", extras: ["moustache", "bowtie"], brow: -0.12,
    colors: { skin: C.skinRuddy, hair: T.hairGrey, top: T.waistcoatBrown, accent: T.shirtWhite, bottom: T.charcoal, shoes: T.shoeBlack, trim: T.toteMustard, hat: T.hatBand, bag: T.bowTieRed, glasses: T.frames } },
};

/** Palette slots per look, for the toon loader. */
export function townsfolkColors(look: TownsfolkLook): Readonly<Record<TownSlot, number>> { return lookColors(TOWNSFOLK[look]); }
export function lookColors(spec: Look): Readonly<Record<TownSlot, number>> {
  const c = spec.colors;
  return { "town-skin": c.skin, "town-hair": c.hair, "town-eyes": C.eyes, "town-eye-shine": C.eyeShine, "town-mouth": C.mouth,
    "town-mouth-open": C.mouthOpen, "town-cheeks": C.cheeks, "town-top": c.top, "town-accent": c.accent, "town-bottom": c.bottom,
    "town-shoes": c.shoes, "town-trim": c.trim, "town-hat": c.hat, "town-bag": c.bag, "town-glasses": c.glasses };
}
export const TOWNSFOLK_COLORS: Readonly<Record<TownsfolkLook, Readonly<Record<TownSlot, number>>>> =
  Object.fromEntries(Object.keys(TOWNSFOLK).map((look) => [look, townsfolkColors(look as TownsfolkLook)])) as Record<TownsfolkLook, Record<TownSlot, number>>;

export function townsfolkScale(look: TownsfolkLook): number { return TOWNSFOLK[look].height; }
export function townsfolkLegs(look: TownsfolkLook): LegDimensions {
  const k = TOWNSFOLK[look].height; const stretch = TOWNSFOLK_LEG_SCALE;
  return { thigh: JANITOR_LEGS.thigh * stretch * k, shin: JANITOR_LEGS.shin * stretch * k,
    hipJointY: (JANITOR_LEGS.ankleY + (JANITOR_LEGS.hipJointY - JANITOR_LEGS.ankleY) * stretch) * k, ankleY: JANITOR_LEGS.ankleY * k };
}

/**
 * An even-width strap lying on a lathe-shaped body (`profile` as [height, radius],
 * squashed front to back by `depth`): straight up the chest at `x`, over the
 * shoulder, and down the back, `lift` metres off the surface.
 */
function shoulderStrap(profile: [number, number][], depth: number, x: number, width: number, lift: number): THREE.BufferGeometry {
  const curve = new THREE.SplineCurve(profile.map(([y, radius]) => new THREE.Vector2(radius, y))).getPoints(48);
  const radiusAt = (y: number) => {
    for (let i = 1; i < curve.length; i++) if ((curve[i - 1].y - y) * (curve[i].y - y) <= 0) {
      const t = (y - curve[i - 1].y) / ((curve[i].y - curve[i - 1].y) || 1); return curve[i - 1].x + (curve[i].x - curve[i - 1].x) * t;
    }
    return curve[curve.length - 1].x;
  };
  const bottom = profile[0][0] + 0.02;
  // Each edge runs at a fixed sideways offset: up the chest, over the top of the shoulder, and down the back.
  const edge = (offset: number) => {
    const across = x + offset;
    let peak = bottom;
    for (const point of curve) if (point.y > peak && point.x + lift >= Math.abs(across)) peak = point.y;
    const at = (t: number, back: boolean) => {
      const y = bottom + (peak - bottom) * (1 - (1 - t) ** 2);
      const z = Math.sqrt(Math.max(0, (radiusAt(y) + lift) ** 2 - across * across)) * depth;
      return new THREE.Vector3(across, y, back ? z : -z);
    };
    const steps = 16;
    return [...Array.from({ length: steps + 1 }, (_, i) => at(i / steps, false)), ...Array.from({ length: steps }, (_, i) => at(1 - (i + 1) / steps, true))];
  };
  const inner = edge(-width / 2); const outer = edge(width / 2);
  const rows = inner.map((point, i): [THREE.Vector3, THREE.Vector3] => [point, outer[i]]);
  const positions: number[] = []; const index: number[] = [];
  rows.forEach(([a, b], i) => {
    positions.push(...a.toArray(), ...b.toArray());
    if (i > 0) { const p = (i - 1) * 2; index.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index); geometry.computeVertexNormals();
  // Make sure the strap faces outward from the body.
  const normal = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute("normal") as THREE.BufferAttribute, 0);
  const outward = new THREE.Vector3(positions[0], 0, positions[2]);
  if (normal.dot(outward) < 0) { for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]]; geometry.setIndex(index); geometry.computeVertexNormals(); }
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  return geometry;
}

/**
 * A townsperson on the janitor's rig, drawn with the same kit as the café people
 * at a lighter facet count (there are many of them on screen at once).
 */
export function createTownsfolkModel(look: TownsfolkLook): THREE.Group {
  const { rig } = drawTownsperson(`townsfolk-${look}`, TOWNSFOLK[look]);
  rig.model.userData = { assetRole: "rigged-character", visualDetailTier: 3, forward: "-Z", look };
  rig.finish(townsfolkColors(look), ["town-mouth-open"]);
  rig.model.animations = createTownsfolkClips(look, rig.bindPose());
  return rig.model;
}

/** Draws a townsperson's body and clothes onto a fresh rig, ready for extra pieces before `rig.finish`. */
export function drawTownsperson(name: string, spec: Look) {
  const k = spec.height;
  const rig = createPersonRig<TownSlot>(name, k, 0.62, TOWNSFOLK_LEG_SCALE);
  const { hips, chest, neck, head, joint, rigid, blendY, torsoWeight, add, oval, garment, tube, onFace } = rig;
  const has = (extra: Extra) => spec.extras.includes(extra);

  // Limb joints first, so skirts and coat tails can follow the thighs.
  const limbs = (["left", "right"] as const).map((side) => {
    const sign = side === "left" ? -1 : 1;
    const shoulder = joint(`${side}_shoulder`, [sign * 0.355, 1.745, 0], chest);
    const elbow = joint(`${side}_elbow`, [sign * 0.535, 1.38, -0.015], shoulder);
    const wrist = joint(`${side}_wrist`, [sign * 0.585, 1.095, -0.075], elbow);
    const grip = new THREE.Object3D();
    grip.name = `${side}_hand_socket`;
    grip.position.set(0, -0.08 * k, -0.04 * k);
    grip.userData.attachmentRole = "hand-prop";
    wrist.add(grip);
    const thigh = joint(`${side}_hip`, [sign * 0.208, 0.97, 0.015], hips);
    const knee = joint(`${side}_knee`, [sign * 0.217, 0.59, 0.012], thigh);
    const ankle = joint(`${side}_ankle`, [sign * 0.22, 0.19, 0.015], knee);
    return { side, sign, shoulder, elbow, wrist, thigh, knee, ankle };
  });
  const [left, right] = limbs;
  /** Hangs from the hips and follows each thigh toward the hem, so it drapes over a lap when seated. */
  const skirtWeight = (top: number, hem: number): Weight => (p) => {
    const down = 1 - THREE.MathUtils.smoothstep(p.y, hem, top);
    const sideways = THREE.MathUtils.smoothstep(Math.abs(p.x), 0.02, 0.17);
    const legBone = p.x < 0 ? left.thigh : right.thigh;
    return [rig.bones.indexOf(hips), rig.bones.indexOf(legBone), down * sideways];
  };
  /** Wide enough at the hips to cover trouser tops and thighs. */
  const skirt = (slot: TownSlot, top: number, hem: number, flare: number) =>
    garment(slot, [[hem, 0.45 + flare], [hem + 0.12, 0.45 + flare * 0.6], [(hem + top) / 2, 0.445 + flare * 0.25], [top, 0.425]], 0.78, [0, 0, 0.01], skirtWeight(top, hem));

  // --- Torso -------------------------------------------------------------------------------------
  const bulky = spec.bulk;
  const longTop = spec.top === "coat" || spec.top === "raincoat";
  const hem = spec.top === "tank" || spec.top === "dress" ? 0.98 : spec.top === "hoodie" ? 0.92 : spec.top === "waistcoat" ? 1.02 : 0.95;
  const sleeveless = spec.top === "tank" || spec.top === "dress";
  if (sleeveless) {
    // The top stops at the chest; skin follows the same body shape up to the neck, with a strap over each shoulder.
    garment("town-top", [[hem, 0], [hem + 0.03, 0.33 + bulky], [1.12, 0.41 + bulky], [1.38, 0.43 + bulky], [1.6, 0.395 + bulky], [1.68, 0.372 + bulky]],
      0.73, [0, 0, 0], torsoWeight);
    // Bare shoulders, and straps: narrow stripes of the same shape lifted just clear of the skin, rising over each shoulder.
    const shoulders = (lift: number): [number, number][] => [[1.58, 0.39 + bulky + lift], [1.65, 0.38 + bulky + lift], [1.79, 0.326 + bulky * 0.6 + lift], [1.86, 0.215 + lift]];
    garment("town-skin", [...shoulders(0), [1.89, 0]], 0.722, [0, 0, 0], torsoWeight);
    for (const side of [-1, 1]) add(shoulderStrap(shoulders(0), 0.722, side * 0.19, 0.075, 0.018), "town-top", torsoWeight);
  } else {
    garment("town-top", [[hem, 0], [hem + 0.03, 0.33 + bulky], [1.12, 0.41 + bulky], [1.38, 0.43 + bulky], [1.65, 0.385 + bulky],
      [1.79, 0.33 + bulky * 0.6], [1.86, 0.22], [1.89, 0]], 0.73, [0, 0, 0], torsoWeight);
  }
  if (spec.top === "dress") {
    oval("town-trim", [0, 1.24, -0.04], [0.42 + bulky, 0.03, 0.31], torsoWeight); // tie belt
  } else if (spec.top === "tank") {
    for (const side of [-1, 1]) oval("town-trim", [side * 0.2, 1.4, -0.31], [0.015, 0.25, 0.015], torsoWeight); // piping
  } else if (spec.top === "tee" && has("stripes")) {
    for (let band = 0; band < 4; band += 1) {
      const y = 1.1 + band * 0.16;
      garment("town-accent", [[y, 0.418 + bulky], [y + 0.02, 0.425 + bulky], [y + 0.05, 0.425 + bulky], [y + 0.07, 0.418 + bulky]], 0.745, [0, 0, 0], torsoWeight);
    }
  } else if (spec.top === "sweater") {
    // A shirt collar peeking out at the neck, and a ribbed hem.
    for (const side of [-1, 1]) oval("town-accent", [side * 0.09, 1.86, -0.16], [0.1, 0.035, 0.07], torsoWeight, [0.3, side * 0.5, side * -0.35]);
    garment("town-top", [[0.94, 0.345 + bulky], [0.97, 0.35 + bulky], [1.03, 0.36 + bulky]], 0.75, [0, 0, 0], torsoWeight);
  } else if (spec.top === "shirt") {
    // A grey undershirt at the open collar, a button placket, and two chest pockets.
    oval("town-accent", [0, 1.8, -0.24], [0.11, 0.07, 0.06], torsoWeight);
    for (const side of [-1, 1]) oval("town-top", [side * 0.08, 1.83, -0.22], [0.09, 0.035, 0.07], torsoWeight, [0.3, side * 0.5, side * -0.35]);
    for (let index = 0; index < 4; index += 1) oval("town-trim", [0, 1.24 + index * 0.14, -0.338 + index * 0.003], [0.016, 0.016, 0.01], torsoWeight);
    for (const side of [-1, 1]) oval("town-top", [side * 0.17, 1.56, -0.36], [0.09, 0.075, 0.03], torsoWeight);
  } else if (spec.top === "hoodie") {
    oval("town-top", [0, 1.86, 0.2], [0.27, 0.14, 0.15], blendY(chest, neck, 1.8, 1.95)); // hood
    for (const side of [-1, 1]) tube("town-trim", [side * 0.07, 1.82, -0.31], [side * 0.08, 1.64, -0.34], 0.012, torsoWeight);
    oval("town-top", [0, 1.16, -0.33], [0.26, 0.12, 0.06], torsoWeight); // pocket
  } else if (spec.top === "blazer") {
    // A white blouse in the open V of the jacket, with lapels folding back either side, and one button.
    oval("town-accent", [0, 1.68, -0.29], [0.15, 0.2, 0.08], torsoWeight);
    for (const side of [-1, 1]) tube("town-top", [side * 0.035, 1.42, -0.37], [side * 0.17, 1.84, -0.26], 0.04, torsoWeight);
    oval("town-shoes", [0, 1.36, -0.37], [0.02, 0.02, 0.012], torsoWeight);
  } else if (longTop) {
    // Coat tails to the knee, a double row of buttons, and a collar (a hood for the raincoat).
    skirt("town-top", 1.06, 0.6, 0.02 + bulky);
    for (const x of [-0.11, 0.11]) for (let index = 0; index < 4; index += 1) oval("town-trim", [x, 1.66 - index * 0.15, -0.34 + index * 0.004], [0.02, 0.02, 0.012], torsoWeight);
    if (spec.top === "raincoat") oval("town-top", [0, 1.86, 0.2], [0.28, 0.15, 0.16], blendY(chest, neck, 1.8, 1.95));
    else for (const side of [-1, 1]) oval("town-top", [side * 0.15, 1.82, -0.18], [0.14, 0.06, 0.1], torsoWeight, [0.4, side * 0.6, side * -0.4]);
  } else if (spec.top === "waistcoat") {
    // White shirt front and collar above a buttoned brown waistcoat.
    oval("town-accent", [0, 1.7, -0.27], [0.12, 0.17, 0.07], torsoWeight);
    for (const side of [-1, 1]) oval("town-accent", [side * 0.09, 1.86, -0.17], [0.1, 0.035, 0.07], torsoWeight, [0.3, side * 0.5, side * -0.35]);
    for (let index = 0; index < 4; index += 1) oval("town-trim", [0, 1.12 + index * 0.12, -0.34 + index * 0.003], [0.018, 0.018, 0.01], torsoWeight);
    oval("town-trim", [0.19, 1.3, -0.35], [0.03, 0.03, 0.01], torsoWeight); // watch-chain button
  }
  if (has("scarf")) {
    const ring = new THREE.TorusGeometry(0.2, 0.075, 8, 18); ring.rotateX(Math.PI / 2).scale(1, 1, 0.95).translate(0, 1.86, -0.02);
    add(ring, "town-accent", blendY(chest, neck, 1.8, 1.95));
    tube("town-accent", [0.12, 1.82, -0.28], [0.15, 1.42, -0.37], 0.06, torsoWeight);
  }
  if (has("bowtie")) {
    for (const side of [-1, 1]) oval("town-bag", [side * 0.055, 1.83, -0.25], [0.055, 0.035, 0.025], torsoWeight, [0, 0, side * 0.2]);
    oval("town-bag", [0, 1.83, -0.255], [0.02, 0.022, 0.02], torsoWeight);
  }
  if (has("backpack")) {
    oval("town-bag", [0, 1.42, 0.43], [0.3, 0.34, 0.15], torsoWeight);
    oval("town-bag", [0, 1.26, 0.55], [0.2, 0.12, 0.06], torsoWeight); // front pocket
    for (const side of [-1, 1]) tube("town-bag", [side * 0.2, 1.8, 0.1], [side * 0.22, 1.25, -0.08], 0.03, torsoWeight);
  }
  if (has("tote")) {
    // Hangs from the left shoulder, against the hip.
    oval("town-bag", [-0.44, 1.12, 0.12], [0.08, 0.2, 0.22], torsoWeight);
    tube("town-bag", [-0.3, 1.8, -0.08], [-0.42, 1.3, 0.0], 0.02, torsoWeight);
    tube("town-bag", [-0.3, 1.8, 0.14], [-0.42, 1.3, 0.24], 0.02, torsoWeight);
  }

  // --- Hips, neck, and head ---------------------------------------------------------------------
  oval(spec.bottom === "skirt" ? "town-skin" : "town-bottom", [0, 0.985, 0.012], [0.35, 0.21, 0.245], rigid(hips));
  if (spec.bottom === "skirt") {
    const hem = spec.skirtHem ?? (spec.top === "dress" ? 0.58 : 0.64);
    skirt(spec.top === "dress" ? "town-top" : "town-bottom", 1.12, hem, spec.top === "dress" ? 0.06 : 0.04 * (0.64 - hem) / 0.3);
  }
  oval("town-skin", [0, 1.94, -0.015], [0.13, 0.145, 0.125], blendY(chest, neck, 1.87, 1.99));
  oval("town-skin", HEAD_CENTER, HEAD_RADII, rigid(head));
  for (const side of [-1, 1]) {
    oval("town-skin", [side * 0.266, 2.18, -0.012], [0.058, 0.084, 0.058], rigid(head)); // ears
    const eye = onFace(side * 0.095, 2.235, 0.006);
    oval("town-eyes", eye, [0.018, 0.026, 0.012], rigid(head), [0, side * 0.3, 0]);
    oval("town-eye-shine", [eye[0] + side * 0.004 - 0.004, eye[1] + 0.009, eye[2] - 0.009], [0.006, 0.007, 0.004], rigid(head));
    const brow = onFace(side * 0.1, 2.3, -0.004);
    oval("town-hair", brow, [0.052, 0.013, 0.014], rigid(head), [0, side * 0.3, side * spec.brow]);
    if (!has("beard")) oval("town-cheeks", onFace(side * 0.155, 2.13, 0.008), [0.04, 0.024, 0.012], rigid(head), [0, side * 0.5, 0]);
  }
  oval("town-skin", onFace(0, 2.165, -0.02), [0.05, 0.052, 0.06], rigid(head)); // nose
  const smile = new THREE.CatmullRomCurve3([-1, -0.5, 0, 0.5, 1].map((t) => new THREE.Vector3(...onFace(t * 0.05, 2.085 + 0.012 * t * t, -0.002))));
  add(new THREE.TubeGeometry(smile, 8, 0.008, 4, false), "town-mouth", rigid(head));
  oval("town-mouth-open", onFace(0, 2.075, 0.006), [0.036, 0.042, 0.016], rigid(head));
  if (has("glasses") || has("sunglasses")) {
    for (const side of [-1, 1]) {
      const [x, y, z] = onFace(side * 0.1, 2.232, -0.03);
      if (has("sunglasses")) oval("town-glasses", [x, y, z - 0.004], [0.062, 0.045, 0.012], rigid(head), [0, side * 0.25, 0]);
      else { const ring = new THREE.TorusGeometry(0.052, 0.008, 5, 14); ring.rotateY(side * 0.25).translate(x, y, z); add(ring, "town-glasses", rigid(head)); }
      tube("town-glasses", [side * 0.15, 2.24, z + 0.01], [side * 0.26, 2.24, -0.03], 0.006, rigid(head));
    }
    const bridge = onFace(0, 2.245, -0.045);
    tube("town-glasses", [-0.045, bridge[1], bridge[2]], [0.045, bridge[1], bridge[2]], 0.006, rigid(head));
  }
  if (has("beard")) {
    oval("town-hair", [0, 2.04, -0.13], [0.23, 0.13, 0.17], rigid(head));
    oval("town-hair", onFace(0, 2.115, 0.0), [0.08, 0.02, 0.025], rigid(head));
    for (const side of [-1, 1]) oval("town-hair", [side * 0.235, 2.12, -0.05], [0.05, 0.12, 0.12], rigid(head));
  } else if (has("stubble")) {
    // A short chin beard.
    oval("town-hair", onFace(0, 2.0, 0.035), [0.085, 0.06, 0.05], rigid(head));
  }
  if (has("moustache")) for (const side of [-1, 1]) oval("town-hair", onFace(side * 0.055, 2.118, 0.004), [0.07, 0.03, 0.03], rigid(head), [0, side * 0.35, side * -0.25]);

  // --- Hair and hats ----------------------------------------------------------------------------
  const shell = (scale: number, front: number, back: number) => rig.hairShell("town-hair", scale, front, back);
  switch (spec.hair) {
    case "buzz": shell(1.02, 0.17, -0.2); break;
    case "crop":
      shell(1.04, 0.19, -0.22);
      oval("town-hair", [0.03, 2.44, -0.17], [0.19, 0.06, 0.1], rigid(head), [-0.4, 0, -0.15]); // a little quiff
      break;
    case "bob":
      shell(1.07, 0.2, -0.28);
      for (const side of [-1, 1]) oval("town-hair", [side * 0.245, 2.13, 0.02], [0.085, 0.19, 0.2], rigid(head));
      oval("town-hair", [-0.06, 2.42, -0.2], [0.2, 0.06, 0.09], rigid(head), [-0.45, 0, 0.2]); // side-swept fringe
      break;
    case "long": case "wavy": {
      shell(1.06, 0.2, -0.3);
      // Hair falls past the shoulders at the back and frames the face at the sides.
      oval("town-hair", [0, 1.98, 0.17], [0.28, 0.34, 0.12], blendY(chest, head, 1.85, 2.15));
      for (const side of [-1, 1]) {
        oval("town-hair", [side * 0.255, 2.08, 0.04], [0.08, 0.24, 0.15], rigid(head));
        if (spec.hair === "wavy") for (const y of [1.98, 2.16]) oval("town-hair", [side * 0.29, y, 0.08], [0.07, 0.07, 0.1], rigid(head));
      }
      break;
    }
    case "curly":
      shell(1.08, 0.16, -0.26);
      for (let index = 0; index < 14; index += 1) {
        const angle = (index / 14) * Math.PI * 2; const ring = index % 2 === 0 ? 0.27 : 0.2;
        oval("town-hair", [Math.cos(angle) * ring, 2.42 + (index % 2) * 0.07, -0.03 + Math.sin(angle) * ring * 0.9], [0.1, 0.09, 0.1], rigid(head));
      }
      break;
    case "balding":
      // A horseshoe of hair around the back and over the ears.
      for (const side of [-1, 1]) oval("town-hair", [side * 0.25, 2.24, 0.06], [0.06, 0.09, 0.16], rigid(head));
      oval("town-hair", [0, 2.2, 0.2], [0.22, 0.1, 0.08], rigid(head));
      break;
    case "bald": break;
    case "braids":
      shell(1.04, 0.2, -0.26);
      for (const side of [-1, 1]) {
        for (let index = 0; index < 5; index += 1) oval("town-hair", [side * 0.14, 2.06 - index * 0.11, 0.25 + index * 0.012], [0.055, 0.065, 0.055], blendY(chest, head, 1.8, 2.1));
        oval("town-trim", [side * 0.14, 1.53, 0.31], [0.04, 0.03, 0.04], rigid(chest));
      }
      break;
    case "topknot":
      shell(1.04, 0.2, -0.26);
      oval("town-hair", [0, 2.5, 0.1], [0.11, 0.1, 0.11], rigid(head));
      break;
  }
  switch (spec.hat) {
    case "sunhat": {
      const crown = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); crown.scale(0.3, 0.24, 0.29).translate(0, 2.36, 0.0);
      add(crown, "town-hat", rigid(head));
      const brim = new THREE.CylinderGeometry(0.62, 0.66, 0.03, 28); brim.rotateX(-0.08).translate(0, 2.38, 0.0);
      add(brim, "town-hat", rigid(head));
      const band = new THREE.CylinderGeometry(0.305, 0.305, 0.06, 24, 1, true); band.translate(0, 2.42, 0);
      add(band, "town-bag", rigid(head));
      break;
    }
    case "cap": {
      const crown = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); crown.scale(0.29, 0.22, 0.28).translate(0, 2.33, 0.01);
      add(crown, "town-hat", rigid(head));
      oval("town-hat", [0, 2.36, -0.33], [0.2, 0.025, 0.16], rigid(head), [0.12, 0, 0]); // bill
      oval("town-hat", [0, 2.55, 0.01], [0.03, 0.02, 0.03], rigid(head)); // button
      break;
    }
    case "flatcap":
      oval("town-hat", [0, 2.42, -0.03], [0.3, 0.1, 0.31], rigid(head), [0.15, 0, 0]);
      oval("town-hat", [0, 2.36, -0.27], [0.22, 0.03, 0.1], rigid(head), [0.1, 0, 0]);
      break;
    case "bucket": {
      const crown = new THREE.CylinderGeometry(0.24, 0.3, 0.2, 22); crown.translate(0, 2.47, 0);
      add(crown, "town-hat", rigid(head));
      const brim = new THREE.CylinderGeometry(0.31, 0.42, 0.09, 22, 1, true); brim.translate(0, 2.34, 0);
      add(brim, "town-hat", rigid(head));
      break;
    }
    case "headband": {
      // Hugs the head over the hair: high across the forehead, dipping to the nape.
      const around = Array.from({ length: 32 }, (_, i) => {
        const angle = (i / 32) * Math.PI * 2;
        const y = 2.31 - 0.085 * Math.cos(angle); // front (cos = -1) sits highest, on the forehead
        const ring = Math.sqrt(Math.max(0, 1 - ((y - HEAD_CENTER[1]) / HEAD_RADII[1]) ** 2)) * 1.08;
        return new THREE.Vector3(HEAD_RADII[0] * ring * Math.sin(angle), y, HEAD_CENTER[2] + HEAD_RADII[2] * ring * Math.cos(angle));
      });
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(around, true), 48, 0.03, 6, true), "town-hat", rigid(head));
      break;
    }
    default: break;
  }
  if (has("headphones")) {
    const arc = new THREE.TorusGeometry(0.31, 0.025, 6, 22, Math.PI); arc.translate(0, 2.19, -0.015);
    add(arc, "town-hat", rigid(head));
    for (const side of [-1, 1]) oval("town-hat", [side * 0.3, 2.18, -0.015], [0.05, 0.085, 0.08], rigid(head));
  }

  // --- Limbs ------------------------------------------------------------------------------------
  for (const { sign, shoulder, elbow, wrist, thigh, knee, ankle } of limbs) {
    const armWeight: Weight = (p) => p.y > 1.23 ? blendY(elbow, shoulder, 1.29, 1.51)(p) : blendY(wrist, elbow, 1.075, 1.21)(p);
    const shoulderCap: Point = [sign * 0.35, 1.72, 0];
    const elbowPoint: Point = [sign * 0.525, 1.4, -0.012];
    const sleeveSlot: TownSlot = spec.top === "waistcoat" ? "town-accent" : "town-top";
    if (spec.sleeves === "long") {
      tube(sleeveSlot, shoulderCap, elbowPoint, 0.1 + bulky, armWeight);
      tube(sleeveSlot, elbowPoint, [sign * 0.578, 1.16, -0.066], 0.088 + bulky, armWeight);
      oval(sleeveSlot, [sign * 0.58, 1.15, -0.07], [0.095, 0.035, 0.095], rigid(wrist));
    } else if (spec.sleeves === "rolled") {
      tube(sleeveSlot, shoulderCap, [sign * 0.52, 1.41, -0.01], 0.098, armWeight);
      oval(sleeveSlot, [sign * 0.52, 1.415, -0.01], [0.11, 0.045, 0.112], armWeight, sign * 0.5);
      oval("town-skin", [sign * 0.56, 1.251, -0.047], [0.09, 0.2, 0.092], armWeight, sign * -0.13);
    } else {
      const sleeveEnd: Point = [sign * 0.45, 1.56, -0.006];
      if (spec.sleeves === "short") {
        tube("town-top", shoulderCap, sleeveEnd, 0.105, armWeight);
        tube("town-skin", sleeveEnd, elbowPoint, 0.082, armWeight);
      } else tube("town-skin", [sign * 0.34, 1.72, 0], elbowPoint, 0.084, armWeight);
      oval("town-skin", [sign * 0.56, 1.251, -0.047], [0.085, 0.2, 0.088], armWeight, sign * -0.13);
    }
    oval("town-skin", [sign * 0.591, 1.045, -0.081], [0.088, 0.12, 0.075], rigid(wrist));
    oval("town-skin", [sign * 0.531, 1.065, -0.13], [0.035, 0.06, 0.038], rigid(wrist));

    const legWeight: Weight = (p) => p.y > 0.78 ? blendY(thigh, hips, 0.82, 1.08)(p) : blendY(knee, thigh, 0.48, 0.7)(p);
    const lowerLeg: Weight = (p) => p.y < 0.4 ? blendY(ankle, knee, 0.2, 0.4)(p) : legWeight(p);
    const center: Point = [sign * 0.213, 0, 0.016];
    if (spec.bottom === "trousers") {
      garment("town-bottom", [[0.2, 0.11], [0.3, 0.14], [0.53, 0.165], [0.75, 0.19], [0.92, 0.2], [1.03, 0.15], [1.06, 0]], 0.94, center, lowerLeg);
    } else {
      // Bare legs below shorts or a skirt; under a long skirt they wear its colour, so a stride doesn't flash bare knee.
      garment(spec.skirtHem !== undefined ? "town-bottom" : "town-skin", [[0.2, 0.085], [0.32, 0.115], [0.5, 0.125], [0.62, 0.14], [0.8, 0.165], [0.95, 0.17], [1.02, 0]], 0.94, center, lowerLeg);
      if (spec.bottom === "shorts") garment("town-bottom", [[0.58, 0.185], [0.72, 0.2], [0.92, 0.205], [1.03, 0.15], [1.06, 0]], 0.94, center, legWeight);
    }
    const shoeWeight = rigid(ankle);
    if (spec.colors.shoes === T.sandals) {
      // Sandals: a sole and two straps over a bare foot.
      oval("town-skin", [sign * 0.22, 0.09, -0.08], [0.11, 0.06, 0.21], shoeWeight);
      oval("town-shoes", [sign * 0.22, 0.025, -0.085], [0.125, 0.025, 0.235], shoeWeight);
      for (const z of [-0.17, 0.0]) oval("town-shoes", [sign * 0.22, 0.1, z], [0.12, 0.025, 0.04], shoeWeight);
    } else {
      if (spec.boots) garment("town-shoes", [[0.15, 0.118], [0.3, 0.13], [0.42, 0.135], [0.45, 0.12]], 0.94, [sign * 0.22, 0, 0.015], lowerLeg);
      garment("town-shoes", [[0.03, 0.11], [0.1, 0.12], [0.2, 0.118], [0.23, 0.1]], 0.9, [sign * 0.22, 0, 0.015], shoeWeight);
      oval("town-shoes", [sign * 0.22, 0.075, -0.09], [0.13, 0.075, 0.23], shoeWeight);
      if (spec.colors.trim !== spec.colors.shoes && (spec.colors.shoes === T.sneakerWhite || spec.colors.shoes === T.sneakerOrange)) {
        oval("town-trim", [sign * 0.22, 0.03, -0.085], [0.135, 0.03, 0.24], shoeWeight); // sole stripe
      }
    }
  }

  return { rig, limbs };
}
