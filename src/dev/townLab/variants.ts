import type * as THREE from "three";
import { createDogModel } from "../../game/DogModel.ts";
import { createTownsfolkModel, TOWNSFOLK, TOWNSFOLK_LOOKS, type TownsfolkLook } from "../../game/TownsfolkModel.ts";
import { TOWNSFOLK_WALK_SPEEDS } from "../../game/townsfolkTuning.ts";
import type { LabVariant } from "../animLab/lab.ts";
import { easyJog, purposefulWalk, strollWalk, watchBehind, watchClasped } from "./options.ts";

/**
 * Edit freely: the lab page hot-reloads on save. Poses live in
 * src/game/townsfolkMoves.ts and src/game/DogModel.ts; every card here shows the
 * clip the game plays.
 */

export interface Variant extends LabVariant {
  group: "people" | "parents" | "bench" | "walk" | "react" | "dog" | "options";
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
  card("bench", "beard-dad", "bench-sip", "Coffee on the bench: from the lap to the lips and back."),
  card("bench", "sunhat-mom", "sit-pet", "Stroking the dog sitting beside her on the bench."),
  card("bench", "grandpa", "sit-relax", "Arms along the bench back, face to the sun."),
  card("bench", "teen", "sit-phone", "Head down over a phone."),
  card("bench", "sunhat-mom", "sit-look", "Watching the splash pad from the bench."),
  card("bench", "red-coat", "sit-sip", "Café regular sipping at a table."),
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
  card("dog", "dog", "bark", "Barking at a goose that comes close or honks, front paws bouncing with each yap."),
  card("dog", "dog", "happy", "Being stroked."),
  card("dog", "dog", "stand", "Standing, tail wagging."),
  // Alternatives to pick from: "A" is what the game plays today.
  { ...card("options", "sunhat-mom", "watch", "A (in game): hands on hips."), name: "Sun-hat mom · watch A (in game)" },
  { name: "Sun-hat mom · watch B", group: "options", model: "sunhat-mom", clip: watchClasped("sunhat-mom"), notes: "B: hands clasped in front, rocking gently." },
  { name: "Sun-hat mom · watch C", group: "options", model: "sunhat-mom", clip: watchBehind("sunhat-mom"), notes: "C: hands behind the back, rocking heel to toe." },
  { ...card("options", "cap-dad", "walk", "A (in game): the café walk at his pace.", TOWNSFOLK_WALK_SPEEDS["cap-dad"]), name: "Cap dad · walk A (in game)" },
  { name: "Cap dad · walk B", group: "options", model: "cap-dad", clip: strollWalk("cap-dad"), travelSpeed: TOWNSFOLK_WALK_SPEEDS["cap-dad"], notes: "B: relaxed stroll — more hip sway, floppier arms." },
  { name: "Cap dad · walk C", group: "options", model: "cap-dad", clip: purposefulWalk("cap-dad"), travelSpeed: TOWNSFOLK_WALK_SPEEDS["cap-dad"], notes: "C: purposeful — leaning in, bigger arm swing, springier." },
  { ...card("options", "jogger", "run", "A (in game): long springy stride.", TOWNSFOLK_WALK_SPEEDS.jogger), name: "Jogger · run A (in game)" },
  { name: "Jogger · run B", group: "options", model: "jogger", clip: easyJog(), travelSpeed: TOWNSFOLK_WALK_SPEEDS.jogger, notes: "B: easy jog — shorter, quicker steps, relaxed arms." },
];
