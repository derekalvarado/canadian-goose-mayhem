import { SHIPPED_WALK, type GooseGait } from "./gait.ts";

/**
 * Edit freely: the lab page hot-reloads on save. Each variant is a set of knobs
 * on the walk recipe (see GooseGait in ./gait.ts), e.g.
 * `{ ...SHIPPED_WALK, tailYaw: 0.2 }`. The "In game" card plays the walk clip
 * exported in canada-goose.glb.
 */

export interface Variant {
  /** Short label shown on the card. */
  name: string;
  /** What this variant is trying, so feedback can reference it. */
  notes: string;
  group: "walk";
  /** Omit to play the exported clip of this name from the GLB. */
  style?: GooseGait;
  clip?: string;
  /** Plays the clip over this many seconds instead of at the walk's step rate (for one-shots and held poses). */
  loopSeconds?: number;
}

export const VARIANTS: Variant[] = [
  {
    name: "In game: walk", group: "walk", clip: "walk",
    notes: "The exported waddle, matched to Untitled Goose Game footage: the rump swivels and rocks deeply under an upright neck, with long steps and a high back-kick that flashes the sole.",
  },
  {
    name: "Before: first waddle", group: "walk",
    style: { ...SHIPPED_WALK, bob: 0.013, bodyRoll: 0.07, bodySway: 0.02, chestCounterRoll: 0.014, reach: 0.2, lift: 0.075, toeFlick: 0.3 },
    notes: "The waddle before it was matched to Untitled Goose Game footage: a shallower rock, shorter steps, and a low foot lift.",
  },
  {
    name: "Before: subtle walk", group: "walk",
    style: {
      ...SHIPPED_WALK, bodyYaw: 0.015, bodyRoll: 0.045, bodySway: 0.012, yawPivot: 0, chestCounterYaw: 0,
      tailYaw: 0.04, tailLag: 0.5, tailRoll: 0, tailFlick: 0,
    },
    notes: "The walk before the waddle, for reference: a slight body rock with a small tail swing.",
  },
  { name: "In game: hurry", group: "walk", clip: "hurry", notes: "The exported hurry, at the walk's step rate." },
  { name: "In game: sneak", group: "walk", clip: "sneak", notes: "The exported sneak, at the walk's step rate." },
  { name: "In game: honk", group: "walk", clip: "honk", loopSeconds: 1.2, notes: "The exported honk, repeated." },
  { name: "In game: spread wings", group: "walk", clip: "wings_spread", loopSeconds: 1.4, notes: "Opening the wings, repeated." },
  { name: "In game: wing flap", group: "walk", clip: "wing_flap", loopSeconds: 0.8, notes: "The flap layered over spread wings." },
  { name: "In game: threaten", group: "walk", clip: "aggressive", loopSeconds: 1.2, notes: "Lowering the head to threaten, repeated." },
];
