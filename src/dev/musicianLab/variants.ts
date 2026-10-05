import type * as THREE from "three";
import { createMusicianModel } from "../../game/MusicianModel.ts";
import { MUSICIAN_TUNING } from "../../game/musicianTuning.ts";
import type { LabVariant } from "../animLab/lab.ts";

/** Edit freely: the lab page hot-reloads on save. Poses live in src/game/MusicianModel.ts. */

export interface Variant extends LabVariant {
  group: "musician" | "moves";
  /** Whether she is holding the guitar (and wearing its strap). */
  guitar: boolean;
}

const clips = createMusicianModel().animations;
function clip(name: string): THREE.AnimationClip {
  const found = clips.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No musician clip named ${name}`);
  return found;
}

export const VARIANTS: Variant[] = [
  { name: "Folk singer · playing", group: "musician", guitar: true, clip: clip("play"), notes: "Strumming on the stage, nodding along and tapping a foot." },
  { name: "Folk singer · between songs", group: "musician", guitar: true, clip: clip("rest"), notes: "Hands resting on the guitar, looking round the square." },
  { name: "Folk singer · no guitar", group: "musician", guitar: false, clip: clip("idle"), notes: "Guitar on its stand: strap off, standing idle." },
  { name: "Folk singer · sip", group: "moves", guitar: false, clip: clip("sip"), notes: "Coffee on her break (the game adds the cup beside her hand)." },
  { name: "Folk singer · walk", group: "moves", guitar: false, clip: clip("walk"), travelSpeed: MUSICIAN_TUNING.walkSpeed, notes: "Walking to her break, or to look around." },
  { name: "Folk singer · jog", group: "moves", guitar: false, clip: clip("jog"), travelSpeed: MUSICIAN_TUNING.jogSpeed, notes: "Chasing the goose, or hurrying to fetch the guitar." },
  { name: "Folk singer · carry walk", group: "moves", guitar: true, clip: clip("carry-walk"), travelSpeed: MUSICIAN_TUNING.walkSpeed, notes: "Walking with the guitar held across her." },
  { name: "Folk singer · carry jog", group: "moves", guitar: true, clip: clip("carry-jog"), travelSpeed: MUSICIAN_TUNING.jogSpeed, notes: "Hurrying the guitar back to the stage." },
];
