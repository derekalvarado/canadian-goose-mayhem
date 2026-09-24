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
  clip?: "walk";
}

export const VARIANTS: Variant[] = [
  {
    name: "In game: walk", group: "walk", clip: "walk",
    notes: "The exported waddle: the rump swivels around the chest under a steady head, with a deep rock and a wide, flicking tail.",
  },
  {
    name: "Before: subtle walk", group: "walk",
    style: {
      ...SHIPPED_WALK, bodyYaw: 0.015, bodyRoll: 0.045, bodySway: 0.012, yawPivot: 0, chestCounterYaw: 0,
      tailYaw: 0.04, tailLag: 0.5, tailRoll: 0, tailFlick: 0,
    },
    notes: "The walk before the waddle, for reference: a slight body rock with a small tail swing.",
  },
];
