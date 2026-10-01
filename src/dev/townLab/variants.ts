import type * as THREE from "three";
import { createDogModel } from "../../game/DogModel.ts";
import { createTownsfolkModel, TOWNSFOLK, TOWNSFOLK_LOOKS, type TownsfolkLook } from "../../game/TownsfolkModel.ts";
import { TOWNSFOLK_WALK_SPEEDS } from "../../game/townsfolkTuning.ts";
import type { LabVariant } from "../animLab/lab.ts";

/**
 * Edit freely: the lab page hot-reloads on save. Poses live in
 * src/game/townsfolkMoves.ts and src/game/DogModel.ts; every card here shows the
 * clip the game plays.
 */

export interface Variant extends LabVariant {
  group: "people" | "parents" | "bench" | "walk" | "react" | "dog";
  model: TownsfolkLook | "dog";
}

const NAMES: Record<TownsfolkLook | "dog", string> = {
  "sunhat-mom": "Sun-hat mom", "cap-dad": "Cap dad", "phone-mom": "Phone mom", "beard-dad": "Beard dad",
  jogger: "Jogger", grandpa: "Grandpa", teen: "Teen", commuter: "Commuter", artist: "Sketcher",
  "red-coat": "Red-coat regular", "bucket-hat": "Bucket-hat regular", raincoat: "Raincoat regular", "bow-tie": "Bow-tie regular",
  dog: "Small white dog",
};
const clips = new Map<string, THREE.AnimationClip[]>();
function clip(model: TownsfolkLook | "dog", name: string): THREE.AnimationClip {
  let list = clips.get(model);
  if (!list) { list = (model === "dog" ? createDogModel() : createTownsfolkModel(model)).animations; clips.set(model, list); }
  const found = list.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No ${model} clip named ${name}`);
  return found;
}
const card = (group: Variant["group"], model: TownsfolkLook | "dog", name: string, notes: string, travelSpeed?: number): Variant =>
  ({ name: `${NAMES[model]} · ${name}`, group, model, clip: clip(model, name), notes, travelSpeed });

export const VARIANTS: Variant[] = [
  ...TOWNSFOLK_LOOKS.map((model) => card("people", model, "idle", TOWNSFOLK[model].description)),
  card("parents", "sunhat-mom", "watch", "Hands on hips, watching the kids splash."),
  card("parents", "cap-dad", "clap", "Cheering a kid on."),
  card("parents", "cap-dad", "call", "Calling across the splash pad, hands cupped."),
  card("parents", "phone-mom", "film", "Filming the kids on her phone."),
  card("parents", "phone-mom", "phone", "Checking her phone."),
  card("parents", "beard-dad", "greet", "Waving to a kid."),
  card("bench", "beard-dad", "sit-sip", "Coffee on the bench."),
  card("bench", "sunhat-mom", "sit-pet", "Stroking the dog sitting beside her on the bench."),
  card("bench", "grandpa", "sit-relax", "Arms along the bench back, face to the sun."),
  card("bench", "teen", "sit-phone", "Head down over a phone."),
  card("bench", "sunhat-mom", "sit-look", "Watching the splash pad from the bench."),
  card("bench", "red-coat", "sit-sip", "Café regular with a takeaway cup."),
  card("walk", "commuter", "walk", "Brisk commuter walk.", TOWNSFOLK_WALK_SPEEDS.commuter),
  card("walk", "grandpa", "walk", "Slow stroll.", TOWNSFOLK_WALK_SPEEDS.grandpa),
  card("walk", "teen", "walk", "Teen's walk.", TOWNSFOLK_WALK_SPEEDS.teen),
  card("walk", "jogger", "run", "Jogging laps of the square.", TOWNSFOLK_WALK_SPEEDS.jogger),
  card("walk", "bucket-hat", "carry", "Walking to a table with a coffee.", TOWNSFOLK_WALK_SPEEDS["bucket-hat"]),
  card("walk", "raincoat", "order", "Ordering at the counter."),
  card("react", "artist", "startle", "Honked at."),
  card("react", "sunhat-mom", "sit-startle", "Honked at on the bench."),
  card("react", "beard-dad", "sit-shoo", "Waving off a goose that comes too close to the bench."),
  card("react", "cap-dad", "look", "Eyeing the goose after stepping back."),
  card("dog", "dog", "lie", "Lying on the bench, chin on paws."),
  card("dog", "dog", "sit", "Sitting up beside its person."),
  card("dog", "dog", "alert", "Spotted the goose: ears up, head cocked."),
  card("dog", "dog", "bark", "Standing up barking at a goose that comes close or honks."),
  card("dog", "dog", "happy", "Being stroked."),
  card("dog", "dog", "stand", "Standing, tail wagging."),
];
