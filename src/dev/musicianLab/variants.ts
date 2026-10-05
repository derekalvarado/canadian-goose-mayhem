import type * as THREE from "three";
import { createMusicianModel } from "../../game/MusicianModel.ts";
import type { LabVariant } from "../animLab/lab.ts";

/** Edit freely: the lab page hot-reloads on save. Poses live in src/game/MusicianModel.ts. */

export interface Variant extends LabVariant {
  group: "musician";
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
];
