import type { MusicianTuning } from "./simulation/musician.ts";

/**
 * Street musician numbers shared by gameplay (`worldLevel.ts`) and presentation
 * (the developer sight overlay). Renderer-free.
 */
export const MUSICIAN_TUNING: MusicianTuning = {
  walkSpeed: 1.35, jogSpeed: 2.5,
  sightRange: 15, sightHalfAngle: 0.85, focusedHalfAngle: 0.35,
  nearSenseRadius: 1.4,
  honkHearingRadius: 14, catchReach: 1.05,
  setSeconds: { min: 18, max: 26 }, breakSeconds: 32,
  watchSeconds: { min: 3, max: 5.5 }, sipSeconds: { min: 4, max: 7 },
  setDownSeconds: 1.2, reactSeconds: 0.7, shooSeconds: 0.9,
  eyeSeconds: 3.5, lookSeconds: 3, puzzledSeconds: 2.5,
};

/**
 * The musician's places, in the stage's own frame (+z toward the audience,
 * steps at the front): where they stand to play beside the stand, the way down
 * the steps, where they take a break, and where they look for a lost guitar.
 */
export const MUSICIAN_STAGE_PLACES = {
  stageTop: 0.61,
  stepsTop: 2.45,
  stepsFoot: 4.05,
  breakSpot: { x: -6, z: 12 },
  searchSpots: [{ x: -5.5, z: 5 }, { x: 5.5, z: 5 }, { x: 0, z: 7.5 }],
} as const;
