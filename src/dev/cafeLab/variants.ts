import type * as THREE from "three";
import { CAFE_VARIANTS, createCafePersonModel, type CafeVariant } from "../../game/CafePersonModel.ts";
import { BARISTA_JOG_SPEED, BARISTA_WALK_SPEED, CUSTOMER_WALK_SPEED } from "../../game/cafeTuning.ts";
import type { LabVariant } from "../animLab/lab.ts";

/**
 * Edit freely: the lab page hot-reloads on save. Poses live in
 * src/game/cafeMoves.ts; every card here shows the clip the game ships.
 */

export interface Variant extends LabVariant {
  group: "people" | "seated" | "barista" | "walk" | "react";
  model: CafeVariant;
}

const NAMES: Record<CafeVariant, string> = { barista: "Barista", laptop: "Laptop worker", reader: "Newspaper reader", student: "Student", baker: "Baker" };
const clips = new Map<CafeVariant, THREE.AnimationClip[]>();
function clip(model: CafeVariant, name: string): THREE.AnimationClip {
  let list = clips.get(model);
  if (!list) { list = createCafePersonModel(model).animations; clips.set(model, list); }
  const found = list.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No ${model} clip named ${name}`);
  return found;
}
const card = (group: Variant["group"], model: CafeVariant, name: string, notes: string, travelSpeed?: number): Variant =>
  ({ name: `${NAMES[model]} · ${name}`, group, model, clip: clip(model, name), notes, travelSpeed });

export const VARIANTS: Variant[] = [
  ...CAFE_VARIANTS.map((model) => card("people", model, "idle", {
    barista: "Apron over a cream shirt, rolled sleeves, auburn hair in a bun.",
    laptop: "Hoodie, beanie, beard and glasses, jeans and white sneakers.",
    reader: "Silver bob, round glasses, plum cardigan over a blouse.",
    student: "Green sweater with a cream band, high ponytail, jeans.",
    baker: "Double-breasted chef's jacket, baker's toque, work apron, ginger moustache.",
  }[model])),
  card("seated", "laptop", "sit-type", "Typing: in game while working at the laptop."),
  card("seated", "reader", "sit-read", "Reading the paper: absorbed, ignores the goose."),
  card("seated", "reader", "sit-look", "Looking up from the paper: now she notices a goose at her table."),
  card("seated", "student", "sit-sip", "Sipping: honk now and the drink spills."),
  card("seated", "student", "sit-startle", "Startled in the chair by a honk or flapping wings."),
  card("seated", "student", "sit-dab", "Dabbing at a spill with a napkin."),
  card("seated", "laptop", "sit-wait", "Waiting for an order, drumming fingers and glancing around."),
  card("seated", "reader", "sit-shoo", "Waving the goose off without getting up."),
  card("barista", "barista", "brew", "Working the espresso machine."),
  card("barista", "barista", "greet", "Calling out an order / answering the bell."),
  card("barista", "barista", "wipe", "Wiping a table after a spill."),
  card("barista", "barista", "fiddle", "Switching the radio back on."),
  card("barista", "barista", "shoo", "Shooing the goose away from the counter."),
  card("barista", "baker", "knead", "Kneading dough at the kitchen prep table."),
  card("walk", "barista", "walk", "Everyday walk at the barista's pace.", BARISTA_WALK_SPEED),
  card("walk", "barista", "carry", "Walking an order to the pickup end.", BARISTA_WALK_SPEED),
  card("walk", "barista", "jog", "Chasing a goose with the tip jar.", BARISTA_JOG_SPEED),
  card("walk", "laptop", "walk", "Customer walk to the pickup counter.", CUSTOMER_WALK_SPEED),
  card("walk", "laptop", "carry", "Carrying an order back to the table.", CUSTOMER_WALK_SPEED),
  card("react", "barista", "startle", "Fumbling a drink when honked at."),
  card("react", "laptop", "shrug", "Order's gone: a puzzled shrug at the pickup counter."),
  card("react", "reader", "look", "Standing look-around."),
];
